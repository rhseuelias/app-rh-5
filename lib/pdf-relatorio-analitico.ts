import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ColunaRel, GrupoRel, RelatorioAnalitico } from "@/lib/relatorio-analitico-tipos";

// Gera o PDF (A4 deitado) do Relatório Analítico da Folha.

const LARG = 841.89;
const ALT = 595.28;
const MARGEM = 28;
const TOPO = ALT - 68; // abaixo do cabeçalho de cada página
const BASE = 34; // acima do rodapé

const COR_TEXTO = rgb(0.11, 0.11, 0.1);
const COR_CINZA = rgb(0.42, 0.4, 0.37);
const COR_LINHA = rgb(0.84, 0.82, 0.79);
const COR_PROV = rgb(0.18, 0.38, 0.69);
const COR_DESC = rgb(0.69, 0.29, 0.23);
const COR_DESTAQUE = rgb(0.78, 0.16, 0.16);
const FUNDO_PROV = rgb(0.87, 0.94, 0.85);
const FUNDO_DESC = rgb(0.99, 0.89, 0.84);
const FUNDO_CAB = rgb(0.94, 0.93, 0.91);
const FUNDO_ZEBRA = rgb(0.98, 0.97, 0.95);

// A fonte padrão do PDF só entende letras do português e alguns símbolos.
const EXTRAS = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac]);
function ansi(s: string): string {
  let r = "";
  for (const ch of s.replace(/\s+/g, " ")) {
    const c = ch.codePointAt(0) ?? 63;
    r += (c >= 32 && c <= 255) || EXTRAS.has(c) ? ch : "?";
  }
  return r;
}

function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number): string[] {
  const palavras = ansi(texto).split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(tentativa, tam) <= largura) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);
      // palavra maior que a coluna: corta
      let resto = p;
      while (fonte.widthOfTextAtSize(resto, tam) > largura && resto.length > 1) {
        let n = resto.length - 1;
        while (n > 1 && fonte.widthOfTextAtSize(resto.slice(0, n), tam) > largura) n--;
        linhas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      atual = resto;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

function cortar(texto: string, fonte: PDFFont, tam: number, largura: number): string {
  let t = ansi(texto);
  if (fonte.widthOfTextAtSize(t, tam) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + "…", tam) > largura) t = t.slice(0, -1);
  return t + "…";
}

const moeda = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function gerarPdfRelatorio(rel: RelatorioAnalitico): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Relatório analítico da folha — ${rel.rotuloMes}`);
  doc.setCreator("AppliQ RH");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina: PDFPage = doc.addPage([LARG, ALT]);
  let y = TOPO;

  const texto = (p: PDFPage, t: string, x: number, yy: number, tam: number, f: PDFFont, cor = COR_TEXTO) =>
    p.drawText(ansi(t), { x, y: yy, size: tam, font: f, color: cor });
  const textoDireita = (p: PDFPage, t: string, xDir: number, yy: number, tam: number, f: PDFFont, cor = COR_TEXTO) => {
    const s = ansi(t);
    p.drawText(s, { x: xDir - f.widthOfTextAtSize(s, tam), y: yy, size: tam, font: f, color: cor });
  };

  function cabecalhoPagina(p: PDFPage) {
    texto(p, "Relatório Analítico da Folha", MARGEM, ALT - 30, 13, negrito);
    texto(p, `${rel.rotuloMes}  ·  período ${rel.periodo}  ·  ${rel.escopoRotulo}`, MARGEM, ALT - 44, 8.5, normal, COR_CINZA);
    p.drawLine({ start: { x: MARGEM, y: ALT - 49 }, end: { x: LARG - MARGEM, y: ALT - 49 }, thickness: 0.6, color: COR_LINHA });
  }

  function novaPagina() {
    pagina = doc.addPage([LARG, ALT]);
    y = TOPO;
    cabecalhoPagina(pagina);
  }
  cabecalhoPagina(pagina);

  function garantir(altura: number) {
    if (y - altura < BASE) novaPagina();
  }

  // ---------------------------------------------------------------- resumo geral
  texto(pagina, `Funcionários: ${rel.totalFuncionarios}`, MARGEM, y, 9, normal, COR_CINZA);
  textoDireita(pagina, `Total proventos: ${moeda(rel.totalP)}`, LARG - MARGEM - 170, y, 9.5, negrito, COR_PROV);
  textoDireita(pagina, `Total descontos: ${moeda(rel.totalD)}`, LARG - MARGEM, y, 9.5, negrito, COR_DESC);
  y -= 8;
  texto(pagina, "Valores em R$; colunas de horas (Referência) aparecem em horas e não entram nos totais.", MARGEM, y - 6, 7, normal, COR_CINZA);
  y -= 22;

  // ---------------------------------------------------------------- uma tabela por unidade
  const LARG_NOME = 150;
  const LARG_TOTAL = 56;

  function tabelaGrupo(g: GrupoRel) {
    const cols = g.colunas;
    const disponivel = LARG - 2 * MARGEM - LARG_NOME - 2 * LARG_TOTAL;
    const n = Math.max(cols.length, 1);
    const lc = Math.min(82, Math.max(34, disponivel / n));
    const tam = lc < 44 ? 6.2 : 7;
    const tamCab = lc < 44 ? 5.8 : 6.6;

    // altura do cabeçalho conforme o texto das colunas
    const cabLinhas = cols.map((c) => {
      const l = quebrar(c.rotulo, negrito, tamCab, lc - 4);
      return l.slice(0, 4);
    });
    const alturaCab = 12 + Math.max(1, ...cabLinhas.map((l) => l.length)) * (tamCab + 1.6) + 4;
    const alturaLinha = 12.5;

    function desenharCabecalho() {
      garantir(alturaCab + alturaLinha * 2 + 18);
      let x = MARGEM;
      const topo = y;
      pagina.drawRectangle({ x: MARGEM, y: topo - alturaCab, width: LARG - 2 * MARGEM, height: alturaCab, color: FUNDO_CAB });
      texto(pagina, "Funcionário", x + 3, topo - 12, 7.5, negrito);
      x += LARG_NOME;
      cols.forEach((c, i) => {
        const fundo = c.grupo === "provento" ? FUNDO_PROV : FUNDO_DESC;
        pagina.drawRectangle({ x, y: topo - alturaCab, width: lc, height: alturaCab, color: fundo });
        const corCab = c.destaque ? COR_DESTAQUE : c.grupo === "provento" ? COR_PROV : COR_DESC;
        texto(pagina, c.codigo ? `cód. ${c.codigo}` : c.grupo === "provento" ? "provento" : "desconto", x + 2, topo - 8.5, 5.6, negrito, corCab);
        cabLinhas[i].forEach((linha, k) => texto(pagina, linha, x + 2, topo - 8.5 - (k + 1) * (tamCab + 1.6), tamCab, negrito, c.destaque ? COR_DESTAQUE : COR_TEXTO));
        x += lc;
      });
      pagina.drawRectangle({ x, y: topo - alturaCab, width: LARG_TOTAL, height: alturaCab, color: FUNDO_PROV });
      textoDireita(pagina, "Total", x + LARG_TOTAL - 3, topo - 9, 6.6, negrito, COR_PROV);
      textoDireita(pagina, "proventos", x + LARG_TOTAL - 3, topo - 17, 6.6, negrito, COR_PROV);
      x += LARG_TOTAL;
      pagina.drawRectangle({ x, y: topo - alturaCab, width: LARG_TOTAL, height: alturaCab, color: FUNDO_DESC });
      textoDireita(pagina, "Total", x + LARG_TOTAL - 3, topo - 9, 6.6, negrito, COR_DESC);
      textoDireita(pagina, "descontos", x + LARG_TOTAL - 3, topo - 17, 6.6, negrito, COR_DESC);
      y = topo - alturaCab;
    }

    // título da unidade
    garantir(alturaCab + alturaLinha * 3 + 30);
    texto(pagina, g.rotulo, MARGEM, y, 11, negrito);
    texto(pagina, `${g.linhas.length} funcionário${g.linhas.length === 1 ? "" : "s"}`, MARGEM + negrito.widthOfTextAtSize(ansi(g.rotulo), 11) + 8, y, 8, normal, COR_CINZA);
    y -= 7;

    if (cols.length === 0) {
      texto(pagina, "Nenhum valor lançado nesta unidade no mês.", MARGEM, y - 9, 8.5, normal, COR_CINZA);
      y -= 24;
    } else {
      desenharCabecalho();
      g.linhas.forEach((l, idx) => {
        if (y - alturaLinha < BASE) {
          novaPagina();
          desenharCabecalho();
        }
        if (idx % 2 === 1) pagina.drawRectangle({ x: MARGEM, y: y - alturaLinha, width: LARG - 2 * MARGEM, height: alturaLinha, color: FUNDO_ZEBRA });
        const yy = y - alturaLinha + 3.6;
        texto(pagina, cortar(l.nome, normal, tam + 0.4, LARG_NOME - 6), MARGEM + 3, yy, tam + 0.4, normal);
        let x = MARGEM + LARG_NOME;
        cols.forEach((c) => {
          const v = l.valores[c.id];
          if (v) {
            const cor = c.destaque ? COR_DESTAQUE : COR_TEXTO;
            const f = c.destaque ? negrito : normal;
            if (c.formato === "moeda") textoDireita(pagina, v, x + lc - 3, yy, tam, f, cor);
            else texto(pagina, cortar(v, f, tam, lc - 5), x + 2, yy, tam, f, cor);
          }
          x += lc;
        });
        if (l.totalP) textoDireita(pagina, moeda(l.totalP), x + LARG_TOTAL - 3, yy, tam, normal, COR_PROV);
        x += LARG_TOTAL;
        if (l.totalD) textoDireita(pagina, moeda(l.totalD), x + LARG_TOTAL - 3, yy, tam, normal, COR_DESC);
        pagina.drawLine({ start: { x: MARGEM, y: y - alturaLinha }, end: { x: LARG - MARGEM, y: y - alturaLinha }, thickness: 0.3, color: COR_LINHA });
        y -= alturaLinha;
      });

      // linha de totais
      if (y - alturaLinha - 2 < BASE) {
        novaPagina();
        desenharCabecalho();
      }
      pagina.drawRectangle({ x: MARGEM, y: y - alturaLinha - 2, width: LARG - 2 * MARGEM, height: alturaLinha + 2, color: FUNDO_CAB });
      const yt = y - alturaLinha + 2;
      texto(pagina, "TOTAL", MARGEM + 3, yt, tam + 0.6, negrito);
      let x = MARGEM + LARG_NOME;
      cols.forEach((c) => {
        if (c.formato === "moeda") {
          const t = g.totaisColuna[c.id] ?? 0;
          textoDireita(pagina, moeda(t), x + lc - 3, yt, tam, negrito, c.destaque ? COR_DESTAQUE : COR_TEXTO);
        }
        x += lc;
      });
      textoDireita(pagina, moeda(g.totalP), x + LARG_TOTAL - 3, yt, tam + 0.2, negrito, COR_PROV);
      x += LARG_TOTAL;
      textoDireita(pagina, moeda(g.totalD), x + LARG_TOTAL - 3, yt, tam + 0.2, negrito, COR_DESC);
      y -= alturaLinha + 8;
    }

    // observações de ponto da unidade
    const comPonto = g.linhas.filter((l) => l.ponto.trim() !== "");
    if (comPonto.length > 0) {
      garantir(24);
      texto(pagina, "Observações de ponto", MARGEM, y, 8, negrito, COR_CINZA);
      y -= 10;
      for (const l of comPonto) {
        const linhas = quebrar(`${l.nome}: ${l.ponto}`, normal, 7, LARG - 2 * MARGEM - 8);
        for (const ln of linhas) {
          garantir(10);
          texto(pagina, ln, MARGEM + 6, y, 7, normal);
          y -= 8.6;
        }
      }
      y -= 6;
    }
    y -= 10;
  }

  for (const g of rel.grupos) tabelaGrupo(g);

  if (rel.grupos.length === 0) {
    texto(pagina, "Nenhum funcionário encontrado para este filtro.", MARGEM, y, 10, normal, COR_CINZA);
  }

  // ---------------------------------------------------------------- resumos (quando há mais de uma unidade)
  if (rel.grupos.length > 1) {
    garantir(60 + rel.resumoUnidades.length * 13);
    texto(pagina, "Resumo por unidade", MARGEM, y, 11, negrito);
    y -= 8;
    const colA = 220;
    const colB = 90;
    const colC = 110;
    const larguraTab = colA + colB + 2 * colC;
    pagina.drawRectangle({ x: MARGEM, y: y - 14, width: larguraTab, height: 14, color: FUNDO_CAB });
    texto(pagina, "Unidade", MARGEM + 4, y - 10, 8, negrito);
    textoDireita(pagina, "Funcionários", MARGEM + colA + colB, y - 10, 8, negrito);
    textoDireita(pagina, "Proventos", MARGEM + colA + colB + colC, y - 10, 8, negrito, COR_PROV);
    textoDireita(pagina, "Descontos", MARGEM + larguraTab - 4, y - 10, 8, negrito, COR_DESC);
    y -= 14;
    for (const r of rel.resumoUnidades) {
      garantir(14);
      texto(pagina, cortar(r.rotulo, normal, 8, colA - 8), MARGEM + 4, y - 10, 8, normal);
      textoDireita(pagina, String(r.funcionarios), MARGEM + colA + colB, y - 10, 8, normal);
      textoDireita(pagina, moeda(r.totalP), MARGEM + colA + colB + colC, y - 10, 8, normal, COR_PROV);
      textoDireita(pagina, moeda(r.totalD), MARGEM + larguraTab - 4, y - 10, 8, normal, COR_DESC);
      pagina.drawLine({ start: { x: MARGEM, y: y - 13 }, end: { x: MARGEM + larguraTab, y: y - 13 }, thickness: 0.3, color: COR_LINHA });
      y -= 13;
    }
    garantir(18);
    pagina.drawRectangle({ x: MARGEM, y: y - 15, width: larguraTab, height: 15, color: FUNDO_CAB });
    texto(pagina, "TOTAL GERAL", MARGEM + 4, y - 10.5, 8.5, negrito);
    textoDireita(pagina, String(rel.totalFuncionarios), MARGEM + colA + colB, y - 10.5, 8.5, negrito);
    textoDireita(pagina, moeda(rel.totalP), MARGEM + colA + colB + colC, y - 10.5, 8.5, negrito, COR_PROV);
    textoDireita(pagina, moeda(rel.totalD), MARGEM + larguraTab - 4, y - 10.5, 8.5, negrito, COR_DESC);
    y -= 28;

    if (rel.resumoColunas.length > 0) {
      garantir(40 + rel.resumoColunas.length * 12);
      texto(pagina, "Resumo por coluna (todas as unidades somadas)", MARGEM, y, 11, negrito);
      y -= 8;
      const larg2 = 360;
      for (const r of rel.resumoColunas) {
        garantir(13);
        const fundo = r.coluna.grupo === "provento" ? FUNDO_PROV : FUNDO_DESC;
        pagina.drawRectangle({ x: MARGEM, y: y - 12, width: larg2, height: 12, color: fundo });
        const nomeCol: ColunaRel = r.coluna;
        const rotulo = `${nomeCol.codigo ? nomeCol.codigo + " - " : ""}${nomeCol.rotulo}`;
        texto(pagina, cortar(rotulo, normal, 7.5, larg2 - 90), MARGEM + 4, y - 9, 7.5, nomeCol.destaque ? negrito : normal, nomeCol.destaque ? COR_DESTAQUE : COR_TEXTO);
        textoDireita(pagina, r.coluna.horas ? `${moeda(r.total)} h` : moeda(r.total), MARGEM + larg2 - 4, y - 9, 7.5, negrito, nomeCol.destaque ? COR_DESTAQUE : COR_TEXTO);
        y -= 12.6;
      }
    }
  }

  // ---------------------------------------------------------------- rodapé com número das páginas
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: MARGEM, y: 26 }, end: { x: LARG - MARGEM, y: 26 }, thickness: 0.4, color: COR_LINHA });
    texto(p, `Gerado em ${rel.geradoEm} (horário de Brasília)  ·  AppliQ RH${rel.mesFechado ? "  ·  mês fechado" : ""}`, MARGEM, 15, 7, normal, COR_CINZA);
    textoDireita(p, `Página ${i + 1} de ${paginas.length}`, LARG - MARGEM, 15, 7, normal, COR_CINZA);
  });

  return doc.save();
}
