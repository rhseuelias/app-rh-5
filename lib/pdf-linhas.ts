/**
 * Lê um PDF (que tenha texto, não foto/escaneado) no próprio navegador e devolve
 * as linhas da página como "células": cada pedaço de texto separado por um
 * espaço grande vira uma célula. Assim uma tabela do PDF vira linhas e colunas.
 *
 * O leitor de PDF (pdf.js) fica na pasta public/pdfjs — carrega só quando o
 * usuário escolhe um PDF, sem passar pelo build do Next.
 */

import { ehCabecalhoDeNome, norm } from "./leitura-folha";

interface ItemTexto {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const URL_PDFJS = "/pdfjs/pdf.min.mjs";
const URL_WORKER = "/pdfjs/pdf.worker.min.mjs";

export async function linhasDoPdf(arquivo: File | ArrayBuffer): Promise<string[][]> {
  const dados = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  const url = URL_PDFJS;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import(/* webpackIgnore: true */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = URL_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;

  const todas: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    const itens: ItemTexto[] = [];
    for (const it of conteudo.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      const str = (it.str ?? "").replace(/\s+/g, " ");
      if (!str.trim() || !it.transform) continue;
      itens.push({ str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: Math.abs(it.height ?? it.transform[3] ?? 8) || 8 });
    }
    todas.push(...alinharPeloCabecalho(linhasDosItens(itens)));
  }
  return todas;
}

export interface CelulaPdf {
  t: string;
  x0: number;
  x1: number;
}

/**
 * Em tabela de PDF, célula vazia não tem texto — sem isso os valores "andam"
 * para a coluna errada. Aqui cada pedaço é encaixado na coluna do cabeçalho
 * que fica na mesma posição (quando a página tem um cabeçalho de tabela).
 */
export function alinharPeloCabecalho(linhas: CelulaPdf[][]): string[][] {
  // recibos de pagamento têm vários blocos pequenos — não são uma tabela só
  if (linhas.some((l) => norm(l.map((c) => c.t).join(" ")).includes("recibo de pagamento"))) {
    return linhas.map((l) => l.map((c) => c.t));
  }
  const idx = linhas.findIndex((l) => ehCabecalhoDeNome(l.map((c) => c.t)));
  if (idx < 0) return linhas.map((l) => l.map((c) => c.t));
  const cab = linhas[idx];
  const colunaDe = (c: CelulaPdf): number => {
    let melhor = -1;
    let melhorSobra = 0;
    cab.forEach((h, k) => {
      const sobra = Math.min(h.x1, c.x1) - Math.max(h.x0, c.x0);
      if (sobra > melhorSobra) {
        melhorSobra = sobra;
        melhor = k;
      }
    });
    if (melhor >= 0) return melhor;
    let menor = Infinity;
    cab.forEach((h, k) => {
      const d = Math.min(Math.abs(c.x0 - h.x0), Math.abs(c.x1 - h.x1));
      if (d < menor) {
        menor = d;
        melhor = k;
      }
    });
    return melhor;
  };
  return linhas.map((l, i) => {
    if (i <= idx) return l.map((c) => c.t);
    const saida: string[] = new Array(cab.length).fill("");
    for (const c of l) {
      const k = colunaDe(c);
      saida[k] = saida[k] ? `${saida[k]} ${c.t}` : c.t;
    }
    return saida;
  });
}

export function linhasDosItens(itens: ItemTexto[]): CelulaPdf[][] {
  // 1. agrupa por altura (y) — de cima para baixo
  const ordenados = itens.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: ItemTexto[][] = [];
  for (const it of ordenados) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo[0].y - it.y) <= Math.max(2.5, it.h * 0.45)) ultimo.push(it);
    else grupos.push([it]);
  }
  // 2. dentro de cada linha, da esquerda para a direita; espaço grande = nova célula
  return grupos
    .map((g) => {
      g.sort((a, b) => a.x - b.x);
      const celulas: CelulaPdf[] = [];
      let atual = "";
      let inicioAtual = 0;
      let fimAnterior = -Infinity;
      for (const it of g) {
        const folga = it.x - fimAnterior;
        const limite = Math.max(5, it.h * 0.9);
        if (atual === "") {
          atual = it.str.trim();
          inicioAtual = it.x;
        } else if (folga > limite) {
          celulas.push({ t: atual, x0: inicioAtual, x1: fimAnterior });
          atual = it.str.trim();
          inicioAtual = it.x;
        } else {
          atual += (folga > it.h * 0.12 && !atual.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str.trim();
        }
        fimAnterior = it.x + it.w;
      }
      if (atual !== "") celulas.push({ t: atual, x0: inicioAtual, x1: fimAnterior });
      return celulas;
    })
    .filter((l) => l.length > 0);
}
