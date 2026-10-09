// Carta de aviso em PDF (A4). Layout igual ao modelo da empresa: faixa de
// título, dados da empresa e do empregado, texto, assinaturas.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { br } from "@/lib/desligamento";
import { TITULO_CARTA, assinaturasCarta, cidadeEData, paragrafosCarta, type DadosCarta } from "@/lib/carta-dados";

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 34;
const UTIL = LARGURA - MARGEM * 2;
const TEAL = rgb(0.1, 0.72, 0.58);
const AZUL = rgb(0.1, 0.22, 0.42);
const TEXTO = rgb(0.12, 0.15, 0.22);

/** Mantém só o que a fonte padrão do PDF (WinAnsi) consegue desenhar. */
function limpar(t: string): string {
  return t
    .normalize("NFC")
    .replace(/[^ -ÿ–—‘’“”•…€™]/g, "?");
}

function quebrar(texto: string, font: PDFFont, tamanho: number, larguraMax: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of limpar(texto).split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (font.widthOfTextAtSize(tentativa, tamanho) <= larguraMax || !atual) atual = tentativa;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function gerarCartaPdf(d: DadosCarta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage([LARGURA, ALTURA]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = ALTURA - MARGEM;

  // faixa do título
  const altTitulo = 22;
  page.drawRectangle({ x: MARGEM, y: y - altTitulo, width: UTIL, height: altTitulo, borderColor: TEAL, borderWidth: 1.2 });
  const titulo = limpar(TITULO_CARTA[d.tipo]);
  const tamTitulo = 11;
  page.drawText(titulo, {
    x: MARGEM + (UTIL - bold.widthOfTextAtSize(titulo, tamTitulo)) / 2,
    y: y - 15,
    size: tamTitulo,
    font: bold,
    color: AZUL,
  });
  y -= altTitulo;

  // linhas de campos (rótulo pequeno em cima, valor embaixo)
  const ALT_LINHA = 26;
  function linha(celulas: { rotulo: string; valor: string; w: number }[]) {
    let x = MARGEM;
    for (const c of celulas) {
      const largura = UTIL * c.w;
      page.drawText(limpar(c.rotulo), { x: x + 2, y: y - 9, size: 7, font: bold, color: AZUL });
      let valor = limpar(c.valor || "");
      const max = largura - 6;
      while (valor.length > 1 && font.widthOfTextAtSize(valor, 8.5) > max) valor = valor.slice(0, -1);
      page.drawText(valor, { x: x + 2, y: y - 20, size: 8.5, font, color: TEXTO });
      x += largura;
    }
    y -= ALT_LINHA;
    page.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + UTIL, y }, thickness: 0.8, color: TEAL });
  }

  const e = d.empresa;
  const c = d.colaborador;
  linha([
    { rotulo: "Empresa", valor: e.razao, w: 0.65 },
    { rotulo: "CNPJ/CPF", valor: e.cnpj, w: 0.35 },
  ]);
  linha([
    { rotulo: "Endereço", valor: e.endereco, w: 0.45 },
    { rotulo: "Número", valor: e.numero, w: 0.12 },
    { rotulo: "Complemento", valor: e.complemento, w: 0.43 },
  ]);
  linha([
    { rotulo: "Bairro", valor: e.bairro, w: 0.45 },
    { rotulo: "Cidade", valor: e.cidade, w: 0.43 },
    { rotulo: "UF", valor: e.uf, w: 0.12 },
  ]);
  linha([
    { rotulo: "Empregado", valor: c.nome, w: 0.55 },
    { rotulo: "Data Admissão", valor: br(c.admissao), w: 0.2 },
    { rotulo: "Ctps/Série ou CPF", valor: c.cpf, w: 0.25 },
  ]);
  linha([{ rotulo: "Endereço do empregado", valor: c.endereco, w: 1 }]);

  // corpo da carta (caixa com borda)
  const TAM = 9;
  const ENTRELINHA = 13;
  const PAD = 8;
  const paragrafos = paragrafosCarta(d);
  const linhasPorParagrafo = paragrafos.map((p) => quebrar(p, font, TAM, UTIL - PAD * 2));
  const nLinhasTexto = linhasPorParagrafo.reduce((s, l) => s + l.length, 0);

  const assinaturas = assinaturasCarta(d);

  const alturaTexto = nLinhasTexto * ENTRELINHA + (paragrafos.length - 1) * ENTRELINHA * 1.6;
  const alturaCorpo = PAD + alturaTexto + ENTRELINHA * 2 + ENTRELINHA + assinaturas.length * 50 + PAD + 14;
  const topoCorpo = y;
  page.drawRectangle({
    x: MARGEM,
    y: topoCorpo - alturaCorpo,
    width: UTIL,
    height: alturaCorpo,
    borderColor: TEAL,
    borderWidth: 1,
  });

  let ty = topoCorpo - PAD - TAM - 2;
  linhasPorParagrafo.forEach((linhas, i) => {
    for (const l of linhas) {
      page.drawText(l, { x: MARGEM + PAD, y: ty, size: TAM, font, color: TEXTO });
      ty -= ENTRELINHA;
    }
    if (i < linhasPorParagrafo.length - 1) ty -= ENTRELINHA * 1.6;
  });

  ty -= ENTRELINHA * 2;
  page.drawText(limpar(cidadeEData(d)), { x: MARGEM + PAD, y: ty, size: TAM, font, color: TEXTO });
  ty -= ENTRELINHA;

  for (const nome of assinaturas) {
    ty -= 34;
    page.drawLine({
      start: { x: MARGEM + PAD, y: ty },
      end: { x: MARGEM + PAD + 260, y: ty },
      thickness: 0.7,
      color: TEXTO,
    });
    ty -= 12;
    page.drawText(limpar(nome), { x: MARGEM + PAD, y: ty, size: 8, font, color: TEXTO });
    ty -= 4;
  }

  // rodapé
  page.drawLine({ start: { x: MARGEM, y: MARGEM + 14 }, end: { x: MARGEM + UTIL, y: MARGEM + 14 }, thickness: 0.6, color: TEXTO });
  page.drawText("Página: 1 de 1", { x: MARGEM + 4, y: MARGEM + 24, size: 7.5, font, color: TEXTO });

  return pdf.save();
}
