import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  dataHoraBrasilia,
  dm,
  dma,
  origemDoColaborador,
  ROTULO_STATUS,
  totaisExportacao,
  type ColaboradorExportacao,
  type DadosExportacaoSimulacao,
  type StatusExportacao,
} from "./exportacao-simulacao-util";

/**
 * PDF da simulação de férias (modelo 5a): A4 paisagem.
 * Página 1: lista (uma linha por colaborador). Página 2 em diante: calendário do ano.
 */

const LARGURA = 841.89;
const ALTURA = 595.28;
const M = 30;
const LARG_UTIL = LARGURA - M * 2;

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  texto: hex("#262626"),
  suave: hex("#3d3d3d"),
  cinza: hex("#737373"),
  contexto: hex("#5c5c5c"),
  manual: hex("#3d3d3d"),
  auto: hex("#fbb26e"),
  unidade: hex("#93440c"),
  vermelho: hex("#d92d20"),
  borda: hex("#e7ddd2"),
  linha: hex("#f0e8df"),
  zebra: hex("#fbf9f6"),
  branco: rgb(1, 1, 1),
  ok: { fundo: hex("#e6f4ec"), texto: hex("#1f7a52") },
  parcial: { fundo: hex("#ffe9d2"), texto: hex("#93440c") },
  sem: { fundo: hex("#f4ebe1"), texto: hex("#737373") },
  rascunho: { fundo: hex("#f0e8df"), texto: hex("#5c5c5c") },
};

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  cache: Map<string, string>;
}

/** Troca por "?" qualquer caractere que a fonte padrão do PDF não sabe desenhar. */
function seguro(ctx: Ctx, fonte: PDFFont, texto: string): string {
  let r = "";
  for (const ch of texto) {
    const chave = `${fonte.name}|${ch}`;
    let ok = ctx.cache.get(chave);
    if (ok === undefined) {
      try {
        fonte.encodeText(ch);
        ok = ch;
      } catch {
        ok = "?";
      }
      ctx.cache.set(chave, ok);
    }
    r += ok;
  }
  return r;
}

function larg(ctx: Ctx, fonte: PDFFont, tam: number, t: string): number {
  return fonte.widthOfTextAtSize(seguro(ctx, fonte, t), tam);
}

function escrever(
  ctx: Ctx,
  page: PDFPage,
  texto: string,
  x: number,
  y: number,
  tam: number,
  opts: { bold?: boolean; cor?: ReturnType<typeof rgb>; alinhar?: "esq" | "dir" | "centro"; espaco?: number } = {}
) {
  const fonte = opts.bold ? ctx.bold : ctx.font;
  const t = seguro(ctx, fonte, texto);
  const esp = opts.espaco ?? 0;
  const w = fonte.widthOfTextAtSize(t, tam) + esp * Math.max(0, t.length - 1);
  let xi = x;
  if (opts.alinhar === "dir") xi = x - w;
  else if (opts.alinhar === "centro") xi = x - w / 2;
  if (esp === 0) {
    page.drawText(t, { x: xi, y, size: tam, font: fonte, color: opts.cor ?? C.texto });
  } else {
    let cx = xi;
    for (const ch of t) {
      page.drawText(ch, { x: cx, y, size: tam, font: fonte, color: opts.cor ?? C.texto });
      cx += fonte.widthOfTextAtSize(ch, tam) + esp;
    }
  }
  return w;
}

/** Corta o texto com reticências para caber na largura. */
function caber(ctx: Ctx, texto: string, tam: number, max: number, bold = false): string {
  const fonte = bold ? ctx.bold : ctx.font;
  if (larg(ctx, fonte, tam, texto) <= max) return texto;
  let t = texto;
  while (t.length > 1 && larg(ctx, fonte, tam, t + "…") > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/** Quebra em até `maxLinhas` linhas. */
function quebrar(ctx: Ctx, texto: string, tam: number, max: number, maxLinhas: number, bold = false): string[] {
  const fonte = bold ? ctx.bold : ctx.font;
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (larg(ctx, fonte, tam, tentativa) <= max || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const resto = linhas.slice(maxLinhas - 1).join(" ");
    return [...linhas.slice(0, maxLinhas - 1), caber(ctx, resto, tam, max, bold)];
  }
  return linhas.map((l) => caber(ctx, l, tam, max, bold));
}

function retRedondo(
  page: PDFPage,
  x: number,
  yBase: number,
  w: number,
  h: number,
  r: number,
  cor: ReturnType<typeof rgb>,
  borda?: ReturnType<typeof rgb>
) {
  const rr = Math.min(r, h / 2, w / 2);
  const caminho = `M ${rr},0 H ${w - rr} A ${rr},${rr} 0 0 1 ${w},${rr} V ${h - rr} A ${rr},${rr} 0 0 1 ${w - rr},${h} H ${rr} A ${rr},${rr} 0 0 1 0,${h - rr} V ${rr} A ${rr},${rr} 0 0 1 ${rr},0 Z`;
  page.drawSvgPath(caminho, {
    x,
    y: yBase + h,
    color: cor,
    borderColor: borda,
    borderWidth: borda ? 0.8 : 0,
  });
}

function pilulaStatus(ctx: Ctx, page: PDFPage, status: StatusExportacao, x: number, yBase: number) {
  const cores = status === "completo" ? C.ok : status === "parcial" ? C.parcial : C.sem;
  const texto = ROTULO_STATUS[status];
  const w = larg(ctx, ctx.bold, 8, texto) + 14;
  retRedondo(page, x, yBase, w, 12, 6, cores.fundo);
  escrever(ctx, page, texto, x + 7, yBase + 3.4, 8, { bold: true, cor: cores.texto });
}

function periodoTexto(p: { inicio: string; fim: string; dias: number }): string {
  return `${dm(p.inicio)} a ${dm(p.fim)} (${p.dias})`;
}

function reais0(v: number): string {
  return "R$ " + Math.round(v).toLocaleString("pt-BR");
}

/* ------------------------------------------------------------------ */

export async function gerarPdfSimulacao(dados: DadosExportacaoSimulacao): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Simulação de férias — ${dados.cabecalho.cenarioNome}`);
  doc.setCreator("AppliQ RH");
  const ctx: Ctx = {
    doc,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    cache: new Map(),
  };

  const { cabecalho, colaboradores } = dados;
  const tot = totaisExportacao(colaboradores);
  const rodapes: { page: PDFPage; esquerda: string }[] = [];

  /* ======================= PÁGINA 1: LISTA ======================= */
  let page = doc.addPage([LARGURA, ALTURA]);
  rodapes.push({
    page,
    esquerda: "Simulação: não altera o mapa oficial até ser aprovada. Custo estimado = salário ÷ 30 × dias + 1/3.",
  });

  let y = ALTURA - M;
  // marca
  page.drawRectangle({ x: M, y: y - 7, width: 7, height: 7, color: C.auto });
  escrever(ctx, page, "APPLIQ RH", M + 13, y - 7, 10, { bold: true, espaco: 1.1 });

  // status + data (direita)
  const aprovado = cabecalho.status === "aprovado";
  const rotuloStatus = aprovado ? "Aprovado" : "Rascunho";
  const corStatus = aprovado ? C.ok : C.rascunho;
  const wPil = larg(ctx, ctx.bold, 8.5, rotuloStatus) + 20;
  retRedondo(page, M + LARG_UTIL - wPil, y - 12, wPil, 15, 7.5, corStatus.fundo);
  escrever(ctx, page, rotuloStatus, M + LARG_UTIL - wPil / 2, y - 8.3, 8.5, { bold: true, cor: corStatus.texto, alinhar: "centro" });
  const quando = dataHoraBrasilia(dados.geradoEm);
  escrever(ctx, page, `Gerado em ${quando.data} às ${quando.hora}`, M + LARG_UTIL, y - 26, 8, { cor: C.cinza, alinhar: "dir" });

  // título
  y -= 36;
  const titulo = `SIMULAÇÃO DE FÉRIAS · ${cabecalho.cenarioNome.toUpperCase()}`;
  escrever(ctx, page, caber(ctx, titulo, 20, LARG_UTIL - 190, true), M, y, 20, { bold: true });

  // contexto
  y -= 16;
  const partes = [
    cabecalho.empresaNome === "Todas" ? "todas as empresas" : cabecalho.empresaNome,
    cabecalho.unidadeNome === "Todas" ? "todas as unidades" : cabecalho.unidadeNome,
    `divisão ${cabecalho.divisaoTexto}`,
    `prioridade ${cabecalho.prioridadeTexto}`,
    cabecalho.maxUnidadeTexto,
  ].filter(Boolean) as string[];
  escrever(ctx, page, caber(ctx, partes.join(" · "), 8.5, LARG_UTIL), M, y, 8.5, { cor: C.contexto });

  // linha grossa
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: M + LARG_UTIL, y }, thickness: 1.5, color: C.texto });

  // resumo
  y -= 16;
  const hRes = 42;
  retRedondo(page, M, y - hRes, LARG_UTIL, hRes, 5, C.branco, C.borda);
  const resumo: [string, string][] = [
    ["Programados", `${tot.completos} de ${tot.total}`],
    ["Parciais", String(tot.parciais)],
    ["Dias sem data", String(tot.semData)],
    ["Custo estimado", dados.mostrarValores ? reais0(tot.custo) : "—"],
  ];
  const wCol = LARG_UTIL / 4;
  resumo.forEach(([rot, val], i) => {
    const x = M + i * wCol;
    if (i > 0) page.drawLine({ start: { x, y: y - 4 }, end: { x, y: y - hRes + 4 }, thickness: 0.6, color: C.linha });
    escrever(ctx, page, rot.toUpperCase(), x + 14, y - 14, 7.5, { cor: C.cinza, espaco: 0.5 });
    escrever(ctx, page, val, x + 14, y - 33, 15, { bold: true });
  });
  y -= hRes + 14;

  // tabela
  const props = [1.7, 1, 0.7, 1.15, 1.15, 0.9, 0.5, 0.8, 0.9];
  const soma = props.reduce((a, b) => a + b, 0);
  const larguras = props.map((p) => (p / soma) * LARG_UTIL);
  const titulos = ["Colaborador", "Unidade", "Limite", "1º período", "2º período", "3º período", "Dias", "Origem", "Status"];
  const PAD = 8;
  const X: number[] = [];
  larguras.reduce((acc, w) => {
    X.push(acc);
    return acc + w;
  }, M);

  const LIMITE_INFERIOR = M + 28;

  function cabecalhoTabela(p: PDFPage, yTopo: number): number {
    p.drawRectangle({ x: M, y: yTopo - 18, width: LARG_UTIL, height: 18, color: C.texto });
    titulos.forEach((t, i) => {
      const dir = i === 6;
      escrever(ctx, p, t.toUpperCase(), dir ? X[i] + larguras[i] - PAD : X[i] + PAD, yTopo - 12, 7.5, {
        bold: true,
        cor: C.branco,
        alinhar: dir ? "dir" : "esq",
        espaco: 0.3,
      });
    });
    return yTopo - 18;
  }

  y = cabecalhoTabela(page, y);

  colaboradores.forEach((c, idx) => {
    const linhasNome = quebrar(ctx, c.nome, 9, larguras[0] - PAD * 2, 2, true);
    const altura = linhasNome.length > 1 ? 28 : 18;
    if (y - altura < LIMITE_INFERIOR) {
      page = doc.addPage([LARGURA, ALTURA]);
      rodapes.push({
        page,
        esquerda: "Simulação: não altera o mapa oficial até ser aprovada. Custo estimado = salário ÷ 30 × dias + 1/3.",
      });
      y = cabecalhoTabela(page, ALTURA - M);
    }
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - altura, width: LARG_UTIL, height: altura, color: C.zebra });
    page.drawLine({ start: { x: M, y: y - altura }, end: { x: M + LARG_UTIL, y: y - altura }, thickness: 0.5, color: C.linha });

    const baseUma = y - altura / 2 - 3;
    // nome (1 ou 2 linhas)
    if (linhasNome.length > 1) {
      escrever(ctx, page, linhasNome[0], X[0] + PAD, y - 11.5, 9, { bold: true });
      escrever(ctx, page, linhasNome[1], X[0] + PAD, y - 21.5, 9, { bold: true });
    } else {
      escrever(ctx, page, linhasNome[0] ?? c.nome, X[0] + PAD, baseUma, 9, { bold: true });
    }
    escrever(ctx, page, caber(ctx, c.unidadeNome, 9, larguras[1] - PAD * 2), X[1] + PAD, baseUma, 9, { cor: C.cinza });
    escrever(ctx, page, `${dm(c.limiteConcessao)}/${c.limiteConcessao.slice(2, 4)}`, X[2] + PAD, baseUma, 9, { cor: C.suave });
    for (let k = 0; k < 3; k++) {
      const p = c.periodos[k];
      const colX = X[3 + k] + PAD;
      if (p) {
        escrever(ctx, page, caber(ctx, periodoTexto(p), 9, larguras[3 + k] - PAD * 2), colX, baseUma, 9, { cor: C.suave });
      } else {
        escrever(ctx, page, "—", colX, baseUma, 9, { cor: k === 2 ? hex("#c9c2ba") : C.suave });
      }
    }
    escrever(ctx, page, String(c.totalDias), X[6] + larguras[6] - PAD, baseUma, 9, { bold: true, alinhar: "dir" });
    escrever(ctx, page, origemDoColaborador(c), X[7] + PAD, baseUma, 9, { cor: C.cinza });
    pilulaStatus(ctx, page, c.status, X[8] + PAD, y - altura / 2 - 6);
    y -= altura;
  });

  if (colaboradores.length === 0) {
    escrever(ctx, page, "Nenhum colaborador com período aquisitivo aberto neste escopo.", M, y - 22, 9, { cor: C.cinza });
  }

  /* ======================= CALENDÁRIO ======================= */
  const ano = cabecalho.ano;
  const inicioAno = Date.UTC(ano, 0, 1);
  const diasNoAno = (Date.UTC(ano + 1, 0, 1) - inicioAno) / 86400000;
  const LARG_NOME = 140;
  const gridX = M + LARG_NOME;
  const gridW = LARG_UTIL - LARG_NOME;
  const diaDoAno = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return (Date.UTC(yy, mm - 1, dd) - inicioAno) / 86400000;
  };
  const diasDoMes = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(ano, m + 1, 0)).getUTCDate());
  const iniMes: number[] = [];
  diasDoMes.reduce((acc, d) => {
    iniMes.push(acc);
    return acc + d;
  }, 0);
  const xDia = (d: number) => gridX + (Math.max(0, Math.min(diasNoAno, d)) / diasNoAno) * gridW;

  const RODAPE_CAL = cabecalho.cenarioNome.includes(String(ano)) ? cabecalho.cenarioNome : `Planejamento ${ano} · ${cabecalho.cenarioNome}`;

  function novaPaginaCalendario(primeira: boolean): { p: PDFPage; yAtual: number } {
    const p = doc.addPage([LARGURA, ALTURA]);
    rodapes.push({ page: p, esquerda: RODAPE_CAL });
    let yy = ALTURA - M;
    if (primeira) {
      escrever(ctx, p, `CALENDÁRIO ${ano}`, M, yy - 14, 15, { bold: true });
      // legenda (direita)
      let lx = M + LARG_UTIL;
      const itens: { rot: string; tipo: "manual" | "auto" | "limite" }[] = [
        { rot: "Limite de concessão", tipo: "limite" },
        { rot: "Automática", tipo: "auto" },
        { rot: "Manual", tipo: "manual" },
      ];
      for (const it of itens) {
        const w = larg(ctx, ctx.font, 8, it.rot);
        escrever(ctx, p, it.rot, lx, yy - 11, 8, { cor: C.contexto, alinhar: "dir" });
        lx -= w + 5;
        if (it.tipo === "limite") {
          p.drawLine({ start: { x: lx - 1, y: yy - 3 }, end: { x: lx - 1, y: yy - 12 }, thickness: 1.5, color: C.vermelho });
          lx -= 14;
        } else {
          p.drawRectangle({
            x: lx - 14,
            y: yy - 11,
            width: 14,
            height: 6,
            color: it.tipo === "manual" ? C.manual : C.auto,
          });
          lx -= 22;
        }
      }
      yy -= 24;
      p.drawLine({ start: { x: M, y: yy }, end: { x: M + LARG_UTIL, y: yy }, thickness: 1.5, color: C.texto });
      yy -= 12;
    }
    // cabeçalho dos meses
    escrever(ctx, p, "COLABORADOR", M, yy - 8, 7.5, { cor: C.cinza, espaco: 0.4 });
    MESES.forEach((m, i) => {
      const cx = xDia(iniMes[i] + diasDoMes[i] / 2);
      escrever(ctx, p, m, cx, yy - 8, 7.5, { cor: C.cinza, alinhar: "centro", espaco: 0.4 });
    });
    yy -= 14;
    p.drawLine({ start: { x: M, y: yy }, end: { x: M + LARG_UTIL, y: yy }, thickness: 0.6, color: C.borda });
    return { p, yAtual: yy };
  }

  let cal = novaPaginaCalendario(true);
  let pc = cal.p;
  let yc = cal.yAtual;

  const ALTURA_LINHA = 14;
  const ALTURA_UNIDADE = 16;
  const ALTURA_FORA = 22;
  const LIMITE_CAL = M + 22;

  function linhasVerticais(p: PDFPage, yTopo: number, h: number) {
    for (let i = 0; i < 12; i++) {
      const x = xDia(iniMes[i]);
      p.drawLine({ start: { x, y: yTopo }, end: { x, y: yTopo - h }, thickness: 0.4, color: C.linha });
    }
  }

  // agrupa por unidade
  const grupos = new Map<string, ColaboradorExportacao[]>();
  for (const c of colaboradores) {
    if (!grupos.has(c.unidadeNome)) grupos.set(c.unidadeNome, []);
    grupos.get(c.unidadeNome)!.push(c);
  }

  const foraPorMes = new Array(12).fill(0) as number[];
  for (const c of colaboradores) {
    const meses = new Set<number>();
    for (const p of c.periodos) {
      const a = diaDoAno(p.inicio);
      const b = diaDoAno(p.fim);
      for (let m = 0; m < 12; m++) {
        const ini = iniMes[m];
        const fim = iniMes[m] + diasDoMes[m] - 1;
        if (a <= fim && b >= ini) meses.add(m);
      }
    }
    meses.forEach((m) => (foraPorMes[m] += 1));
  }

  let primeiroGrupo = true;
  for (const [unidade, lista] of grupos) {
    // o rótulo da unidade precisa de pelo menos 1 colaborador junto
    if (yc - ALTURA_UNIDADE - ALTURA_LINHA < LIMITE_CAL) {
      cal = novaPaginaCalendario(false);
      pc = cal.p;
      yc = cal.yAtual;
    }
    void primeiroGrupo;
    primeiroGrupo = false;
    linhasVerticais(pc, yc, ALTURA_UNIDADE);
    escrever(ctx, pc, unidade, M, yc - 11, 8.5, { bold: true, cor: C.unidade });
    yc -= ALTURA_UNIDADE;

    for (const c of lista) {
      if (yc - ALTURA_LINHA < LIMITE_CAL) {
        cal = novaPaginaCalendario(false);
        pc = cal.p;
        yc = cal.yAtual;
        // repete o rótulo da unidade na página nova
        linhasVerticais(pc, yc, ALTURA_UNIDADE);
        escrever(ctx, pc, `${unidade} (cont.)`, M, yc - 11, 8.5, { bold: true, cor: C.unidade });
        yc -= ALTURA_UNIDADE;
      }
      linhasVerticais(pc, yc, ALTURA_LINHA);
      pc.drawLine({ start: { x: M, y: yc - ALTURA_LINHA }, end: { x: M + LARG_UTIL, y: yc - ALTURA_LINHA }, thickness: 0.4, color: C.linha });
      escrever(ctx, pc, caber(ctx, c.nome, 8.5, LARG_NOME - 8), M, yc - 10, 8.5, { cor: C.texto });

      for (const p of c.periodos) {
        const a = diaDoAno(p.inicio);
        const b = diaDoAno(p.fim);
        if (b < 0 || a > diasNoAno - 1) continue;
        const x1 = xDia(a);
        const x2 = xDia(b + 1);
        const w = Math.max(x2 - x1, 3);
        const manual = p.origem === "manual";
        pc.drawRectangle({ x: x1, y: yc - 12, width: w, height: 10, color: manual ? C.manual : C.auto });
        const rot = `${p.dias}d`;
        if (larg(ctx, ctx.bold, 6.5, rot) + 4 <= w) {
          escrever(ctx, pc, rot, x1 + 2.5, yc - 9.3, 6.5, { bold: true, cor: manual ? C.branco : C.texto });
        }
      }

      const dl = diaDoAno(c.limiteConcessao);
      if (dl >= 0 && dl <= diasNoAno) {
        const xl = xDia(dl);
        pc.drawLine({ start: { x: xl, y: yc - 0.5 }, end: { x: xl, y: yc - ALTURA_LINHA + 0.5 }, thickness: 1.5, color: C.vermelho });
      }
      yc -= ALTURA_LINHA;
    }
  }

  if (colaboradores.length === 0) {
    escrever(ctx, pc, "Nenhum colaborador com período aquisitivo aberto neste escopo.", M, yc - 18, 9, { cor: C.cinza });
  } else {
    // linha "Pessoas fora no mês"
    if (yc - ALTURA_FORA < LIMITE_CAL - 6) {
      cal = novaPaginaCalendario(false);
      pc = cal.p;
      yc = cal.yAtual;
    }
    yc -= 4;
    pc.drawLine({ start: { x: M, y: yc }, end: { x: M + LARG_UTIL, y: yc }, thickness: 0.6, color: C.borda });
    escrever(ctx, pc, "Pessoas fora no mês", M, yc - 14, 7.5, { bold: true, cor: C.cinza });
    foraPorMes.forEach((n, i) => {
      escrever(ctx, pc, String(n), xDia(iniMes[i] + diasDoMes[i] / 2), yc - 14, 8.5, { bold: true, alinhar: "centro" });
    });
  }

  /* ======================= RODAPÉS ======================= */
  const totalPaginas = rodapes.length;
  rodapes.forEach((r, i) => {
    r.page.drawLine({
      start: { x: M, y: M + 14 },
      end: { x: M + LARG_UTIL, y: M + 14 },
      thickness: 0.5,
      color: C.borda,
    });
    escrever(ctx, r.page, r.esquerda, M, M, 7.5, { cor: C.cinza });
    escrever(ctx, r.page, `Página ${i + 1} de ${totalPaginas}`, M + LARG_UTIL, M, 7.5, { cor: C.cinza, alinhar: "dir" });
  });

  // evita aviso de "dma" não usado em builds estritos
  void dma;

  return doc.save();
}
