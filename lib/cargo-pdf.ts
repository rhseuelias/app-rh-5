/**
 * Leitura de PDF de "Descrição de Cargo" no modelo da empresa (Manobrista, Agente de Operações etc.).
 * Função pura: recebe os trechos de texto do PDF com posição e devolve os campos do cargo.
 * Posição: x = distância da esquerda, top = distância do topo da página (ambos em pontos).
 */
import type { Responsabilidade, ResultadoEsperado, Indicador } from "./cargos";

export interface TrechoPdf {
  str: string;
  x: number;
  x2: number;
  top: number;
  page: number;
}

export interface BlocoLido {
  nome: string;
  resumo: string;
  ok: boolean;
}

export interface CargoLido {
  cargo: string;
  departamento: string;
  cbo: string;
  identificador: string;
  missao: string;
  sumaria: string;
  resp: Responsabilidade[];
  sucesso: string[];
  resultados: ResultadoEsperado[];
  indicadores: Indicador[];
  escolaridade: string;
  experiencia: string;
  habilitacao: string;
  tecnicos: string[];
  comportamentais: string[];
  blocos: BlocoLido[];
  avisos: string[];
}

interface T extends TrechoPdf {
  gy: number; // posição vertical contínua entre páginas
}
interface Linha {
  texto: string;
  x: number;
  gy: number;
  page: number;
}

const PAGINA = 5000;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const limparEspacos = (s: string) => s.replace(/\s+/g, " ").trim();
const semPonto = (s: string) => limparEspacos(s).replace(/[;.]+$/, "").trim();

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

function ehMaiuscula(s: string): boolean {
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letras.length > 2 && letras === letras.toUpperCase();
}

const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "para", "com"]);
/** Texto todo em maiúsculas vira "Título De Cargo" (palavras pequenas em minúscula). */
function tituloCaso(s: string): string {
  if (!s || !ehMaiuscula(s)) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
/** Texto todo em maiúsculas vira "Frase normal". */
function fraseCaso(s: string): string {
  if (!s || !ehMaiuscula(s)) return s;
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Junta trechos da mesma linha (mesma altura) e devolve linhas de cima para baixo. */
function montarLinhas(itens: T[]): Linha[] {
  const ord = [...itens].filter((i) => i.str.trim() !== "").sort((a, b) => a.gy - b.gy || a.x - b.x);
  const grupos: T[][] = [];
  for (const it of ord) {
    const g = grupos.find((gr) => Math.abs(gr[0].gy - it.gy) <= 3 && gr[0].page === it.page);
    if (g) g.push(it);
    else grupos.push([it]);
  }
  return grupos
    .map((g) => {
      const s = [...g].sort((a, b) => a.x - b.x);
      let texto = "";
      let fim = -1;
      for (const it of s) {
        const t = it.str.trim();
        if (!texto) texto = t;
        else {
          const colado = it.x - fim < 1 && !/^\s/.test(it.str) && !/\s$/.test(texto);
          texto += (colado ? "" : " ") + t;
        }
        fim = it.x2;
      }
      return { texto: limparEspacos(texto), x: s[0].x, gy: g.reduce((a, b) => a + b.gy, 0) / g.length, page: s[0].page };
    })
    .sort((a, b) => a.gy - b.gy);
}

/** Divide linhas consecutivas em blocos quando há um espaço vertical maior que o normal. */
function blocosPorEspaco(linhas: Linha[], fator = 1.35): Linha[][] {
  if (!linhas.length) return [];
  const gaps: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const d = linhas[i].gy - linhas[i - 1].gy;
    if (linhas[i].page === linhas[i - 1].page && d < 40) gaps.push(d);
  }
  const med = mediana(gaps) || 12;
  const saida: Linha[][] = [[linhas[0]]];
  for (let i = 1; i < linhas.length; i++) {
    const d = linhas[i].gy - linhas[i - 1].gy;
    if (linhas[i].page !== linhas[i - 1].page || d > med * fator) saida.push([linhas[i]]);
    else saida[saida.length - 1].push(linhas[i]);
  }
  return saida;
}

/** Cada linha terminada em ; ou . fecha um item da lista. */
function itensDeLista(linhas: Linha[]): string[] {
  const itens: string[] = [];
  let atual = "";
  for (const l of linhas) {
    atual = atual ? `${atual} ${l.texto}` : l.texto;
    if (/[;.]$/.test(l.texto)) {
      itens.push(semPonto(atual));
      atual = "";
    }
  }
  if (atual.trim()) itens.push(semPonto(atual));
  return itens.filter(Boolean);
}

function paragrafo(linhas: Linha[]): string {
  return limparEspacos(linhas.map((l) => l.texto).join(" "));
}

const TITULOS: { chave: string; re: RegExp }[] = [
  { chave: "identificacao", re: /^IDENTIFICACAO DO CARGO/ },
  { chave: "missao", re: /^MISSAO DO CARGO/ },
  { chave: "sumaria", re: /^DESCRICAO SUMARIA/ },
  { chave: "resp", re: /^DESCRICAO DAS RESPONSABILIDADES/ },
  { chave: "limites", re: /^LIMITES DE ATUACAO/ },
  { chave: "resultados", re: /^RESULTADOS ESPERADOS/ },
  { chave: "indicadores", re: /^INDICADORES DE DESEMPENHO/ },
  { chave: "requisitos", re: /^REQUISITOS DO CARGO/ },
  { chave: "termo", re: /^TERMO DE CIENCIA/ },
];

/** Junta palavras soltas que estão lado a lado na mesma linha (alguns PDFs entregam uma palavra por trecho). */
function fundirTrechos(trechos: TrechoPdf[]): TrechoPdf[] {
  const ord = trechos
    .filter((t) => t.str.trim() !== "")
    .map((t) => ({ ...t, str: t.str.trim() }))
    .sort((a, b) => a.page - b.page || a.top - b.top || a.x - b.x);
  const saida: TrechoPdf[] = [];
  for (const t of ord) {
    const ult = saida[saida.length - 1];
    if (ult && ult.page === t.page && Math.abs(ult.top - t.top) <= 1.5 && t.x - ult.x2 < 8 && t.x >= ult.x2 - 1) {
      ult.str = `${ult.str} ${t.str}`;
      ult.x2 = t.x2;
    } else saida.push({ ...t });
  }
  return saida;
}

export function lerDescricaoCargo(trechosBrutos: TrechoPdf[]): CargoLido {
  const trechos = fundirTrechos(trechosBrutos);
  const itens: T[] = trechos.map((t) => ({ ...t, gy: t.page * PAGINA + t.top }));
  const avisos: string[] = [];

  // 1) onde começa cada bloco
  const marcas: { chave: string; gy: number }[] = [];
  for (const it of itens) {
    const n = norm(it.str);
    for (const t of TITULOS) {
      if (t.re.test(n) && !marcas.some((m) => m.chave === t.chave)) marcas.push({ chave: t.chave, gy: it.gy });
    }
  }
  marcas.sort((a, b) => a.gy - b.gy);
  const secao = (chave: string): T[] => {
    const i = marcas.findIndex((m) => m.chave === chave);
    if (i < 0) return [];
    const ini = marcas[i].gy;
    const fim = i + 1 < marcas.length ? marcas[i + 1].gy : Infinity;
    // o próprio título (mesma altura que o início) fica de fora
    return itens.filter((t) => t.gy > ini + 3 && t.gy < fim - 3);
  };

  const saida: CargoLido = {
    cargo: "", departamento: "", cbo: "", identificador: "", missao: "", sumaria: "", resp: [], sucesso: [], resultados: [],
    indicadores: [], escolaridade: "", experiencia: "", habilitacao: "", tecnicos: [], comportamentais: [], blocos: [], avisos,
  };

  // 2) identificação
  {
    const txt = montarLinhas(secao("identificacao")).map((l) => l.texto).join("\n");
    const pega = (re: RegExp) => limparEspacos(txt.match(re)?.[1] ?? "");
    saida.cargo = tituloCaso(pega(/CARGO:\s*(.*?)(?=\s+DEPARTAMENTO:|\n|$)/i));
    saida.departamento = tituloCaso(pega(/DEPARTAMENTO:\s*(.*?)(?=\n|$)/i));
    saida.cbo = pega(/CBO:\s*(.*?)(?=\s+IDENTIFICADOR|\n|$)/i);
    saida.identificador = pega(/IDENTIFICADOR(?: INTERNO)?:\s*(.*?)(?=\n|$)/i);
    if (/^a definir$/i.test(saida.identificador)) saida.identificador = "";
  }

  // 3) missão e descrição sumária
  saida.missao = paragrafo(montarLinhas(secao("missao")));
  saida.sumaria = paragrafo(montarLinhas(secao("sumaria")));

  // 4) responsabilidades: títulos à esquerda, atividades à direita
  {
    const sec = secao("resp");
    if (sec.length) {
      const longos = sec.filter((t) => t.str.trim().length > 20).map((t) => Math.round(t.x));
      const cont = new Map<number, number>();
      for (const x of longos) cont.set(x, (cont.get(x) ?? 0) + 1);
      const colunaAtividades = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      const corte = colunaAtividades - 8;
      const esq = montarLinhas(sec.filter((t) => t.x < corte));
      const dir = montarLinhas(sec.filter((t) => t.x >= corte));
      const titulos = blocosPorEspaco(esq, 1.6).map((b) => ({
        texto: fraseCaso(limparEspacos(b.map((l) => l.texto).join(" "))),
        centro: b.reduce((a, l) => a + l.gy, 0) / b.length,
      }));
      // grupos de atividades: espaço maior que o normal, ou troca de página depois de um ponto final
      const gaps: number[] = [];
      for (let i = 1; i < dir.length; i++) {
        const d = dir[i].gy - dir[i - 1].gy;
        if (dir[i].page === dir[i - 1].page && d < 40) gaps.push(d);
      }
      const med = mediana(gaps) || 11;
      const grupos: Linha[][] = dir.length ? [[dir[0]]] : [];
      for (let i = 1; i < dir.length; i++) {
        const d = dir[i].gy - dir[i - 1].gy;
        const novaPagina = dir[i].page !== dir[i - 1].page && /\.$/.test(dir[i - 1].texto);
        if (novaPagina || (dir[i].page === dir[i - 1].page && d > med * 1.35)) grupos.push([dir[i]]);
        else grupos[grupos.length - 1].push(dir[i]);
      }
      const centro = (g: Linha[]) => g.reduce((a, l) => a + l.gy, 0) / g.length;
      if (titulos.length && grupos.length === titulos.length) {
        saida.resp = grupos.map((g, i) => ({ titulo: titulos[i].texto, itens: itensDeLista(g) }));
      } else if (titulos.length) {
        const mapa = new Map<number, Linha[]>();
        for (const g of grupos) {
          let melhor = 0;
          titulos.forEach((t, i) => {
            if (Math.abs(t.centro - centro(g)) < Math.abs(titulos[melhor].centro - centro(g))) melhor = i;
          });
          mapa.set(melhor, [...(mapa.get(melhor) ?? []), ...g]);
        }
        saida.resp = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([i, ls]) => ({ titulo: titulos[i].texto, itens: itensDeLista(ls) }));
        avisos.push("Conferi as responsabilidades com atenção: a separação por grupo não ficou 100% certa.");
      } else if (grupos.length) {
        saida.resp = [{ titulo: "Responsabilidades", itens: itensDeLista(dir) }];
        avisos.push("Não achei os títulos dos grupos de responsabilidades; juntei tudo em um só grupo.");
      }
    }
  }

  // 5) limites de atuação: não existe no modelo do app
  const temLimites = marcas.some((m) => m.chave === "limites");
  if (temLimites) avisos.push("O bloco “Limites de atuação e relacionamento hierárquico” não existe no modelo do app e não foi importado.");

  // 6) resultados esperados: 3 colunas
  {
    const sec = secao("resultados");
    const hCrit = sec.find((t) => /^CRITERIOS DE SUCESSO/.test(norm(t.str)));
    const hResp = sec.find((t) => /^RESPONSABILIDADE$/.test(norm(t.str)));
    const hRes = sec.find((t) => /^RESULTADO ESPERADO/.test(norm(t.str)));
    if (hCrit && hResp && hRes) {
      const b1 = hCrit.x2 + (hResp.x - hCrit.x2) * 0.5;
      const b2 = hResp.x2 + (hRes.x - hResp.x2) * 0.4;
      const corpo = sec.filter((t) => t.gy > hResp.gy + 3);
      const c1 = montarLinhas(corpo.filter((t) => t.x < b1));
      const c2 = montarLinhas(corpo.filter((t) => t.x >= b1 && t.x < b2));
      const c3 = montarLinhas(corpo.filter((t) => t.x >= b2));
      // critérios: pula a frase de abertura (termina com ":")
      const iAbertura = c1.findIndex((l) => /:$/.test(l.texto));
      saida.sucesso = itensDeLista(iAbertura >= 0 ? c1.slice(iAbertura + 1) : c1);
      const rotulos = blocosPorEspaco(c2, 1.2).map((b) => ({ texto: limparEspacos(b.map((l) => l.texto).join(" ")), centro: b.reduce((a, l) => a + l.gy, 0) / b.length }));
      const celulas = blocosPorEspaco(c3, 1.35).map((b) => ({ texto: limparEspacos(b.map((l) => l.texto).join(" ")), centro: b.reduce((a, l) => a + l.gy, 0) / b.length }));
      saida.resultados = celulas.map((c) => {
        let melhor = rotulos[0];
        for (const r of rotulos) if (Math.abs(r.centro - c.centro) < Math.abs(melhor.centro - c.centro)) melhor = r;
        return { resp: melhor ? melhor.texto : "", res: c.texto };
      });
      if (rotulos.length !== celulas.length) avisos.push("Em “Resultados esperados”, a quantidade de linhas não bate com a de responsabilidades. Confira esse quadro.");
    } else if (sec.length) {
      avisos.push("Não consegui ler o quadro de “Resultados esperados”. Preencha esse bloco depois, em Editar.");
    }
  }

  // 7) indicadores: 3 colunas
  {
    const sec = secao("indicadores");
    const hInd = sec.find((t) => /^INDICADOR$/.test(norm(t.str)));
    const hMeta = sec.find((t) => /^META/.test(norm(t.str)));
    const hFreq = sec.find((t) => /^FREQUENCIA/.test(norm(t.str)));
    if (hInd && hMeta && hFreq) {
      const b1 = hInd.x2 + (hMeta.x - hInd.x2) * 0.5;
      const b2 = hMeta.x2 + (hFreq.x - hMeta.x2) * 0.5;
      const corpo = sec.filter((t) => t.gy > hInd.gy + 3);
      const nomes = montarLinhas(corpo.filter((t) => t.x < b1));
      const metas = montarLinhas(corpo.filter((t) => t.x >= b1 && t.x < b2));
      const freqs = montarLinhas(corpo.filter((t) => t.x >= b2));
      const ancoras = metas.length >= freqs.length ? metas : freqs;
      const proximo = (arr: Linha[], gy: number) => arr.filter((l) => ancoras.reduce((m, a) => (Math.abs(a.gy - l.gy) < Math.abs(m.gy - l.gy) ? a : m), ancoras[0]).gy === gy);
      saida.indicadores = ancoras.map((a) => ({
        nome: limparEspacos(proximo(nomes, a.gy).map((l) => l.texto).join(" ")),
        meta: limparEspacos(proximo(metas, a.gy).map((l) => l.texto).join(" ")),
        freq: limparEspacos(proximo(freqs, a.gy).map((l) => l.texto).join(" ")),
      }));
      saida.indicadores = saida.indicadores.filter((i) => i.nome);
    } else if (sec.length) {
      avisos.push("Não consegui ler a tabela de “Indicadores de desempenho”. Preencha esse bloco depois, em Editar.");
    }
  }

  // 8) requisitos: coluna da esquerda (escolaridade, experiência, habilitação) e da direita (técnicos, comportamentais)
  {
    const sec = secao("requisitos");
    const rotuloDir = sec.find((t) => /^(CONHECIMENTOS TECNICOS|COMPETENCIAS COMPORTAMENTAIS)/.test(norm(t.str)));
    if (sec.length) {
      const corte = rotuloDir ? rotuloDir.x - 5 : Infinity;
      const esq = montarLinhas(sec.filter((t) => t.x < corte));
      const dir = montarLinhas(sec.filter((t) => t.x >= corte));
      const dividir = (linhas: Linha[], rotulos: { chave: string; re: RegExp }[]) => {
        const r: Record<string, Linha[]> = {};
        let atual = "";
        for (const l of linhas) {
          const n = norm(l.texto);
          const achou = rotulos.find((x) => x.re.test(n));
          if (achou) {
            atual = achou.chave;
            r[atual] = [];
            const resto = l.texto.replace(/^[^:]*:\s*/, "");
            if (resto && resto !== l.texto) r[atual].push({ ...l, texto: resto });
          } else if (atual) r[atual].push(l);
        }
        return r;
      };
      const e = dividir(esq, [
        { chave: "escolaridade", re: /^ESCOLARIDADE/ },
        { chave: "experiencia", re: /^EXPERIENCIA/ },
        { chave: "habilitacao", re: /^HABILITACAO/ },
      ]);
      saida.escolaridade = paragrafo(e.escolaridade ?? []);
      saida.experiencia = paragrafo(e.experiencia ?? []);
      saida.habilitacao = paragrafo(e.habilitacao ?? []);
      const d = dividir(dir, [
        { chave: "tecnicos", re: /^CONHECIMENTOS TECNICOS/ },
        { chave: "comportamentais", re: /^COMPETENCIAS COMPORTAMENTAIS/ },
      ]);
      saida.tecnicos = itensDeLista(d.tecnicos ?? []);
      saida.comportamentais = itensDeLista(d.comportamentais ?? []);
    }
  }

  if (!saida.cargo) avisos.push("Não achei o nome do cargo no PDF. Digite o nome na conferência.");

  const n = (a: unknown[]) => a.length;
  saida.blocos = [
    { nome: "Identificação do cargo", resumo: `Cargo: ${saida.cargo || "—"} · Departamento: ${saida.departamento || "—"}${saida.cbo ? ` · CBO ${saida.cbo}` : ""}`, ok: !!saida.cargo },
    { nome: "Missão do cargo", resumo: saida.missao || "Não encontrada", ok: !!saida.missao },
    { nome: "Descrição sumária", resumo: saida.sumaria || "Não encontrada", ok: !!saida.sumaria },
    { nome: "Responsabilidades", resumo: `${n(saida.resp)} grupos · ${saida.resp.reduce((a, r) => a + r.itens.length, 0)} atividades`, ok: n(saida.resp) > 0 },
    { nome: "Resultados esperados", resumo: `${n(saida.sucesso)} critérios · ${n(saida.resultados)} resultados`, ok: n(saida.resultados) > 0 },
    { nome: "Indicadores de desempenho", resumo: `${n(saida.indicadores)} indicadores com meta e frequência`, ok: n(saida.indicadores) > 0 },
    { nome: "Requisitos do cargo", resumo: `Escolaridade, experiência, ${n(saida.tecnicos)} conhecimentos e ${n(saida.comportamentais)} competências`, ok: !!(saida.escolaridade || saida.tecnicos.length || saida.comportamentais.length) },
  ];
  return saida;
}
