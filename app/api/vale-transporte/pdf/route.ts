import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { compararGrupos } from "@/lib/folha-calculos";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { disposicaoPdf } from "@/lib/pdf-disposicao";
import {
  OPERADORAS,
  ROTULO_OPERADORA,
  cargaVT,
  grupoVT,
  numeroVT,
  somaVT,
  totalVT,
  valorDiarioVT,
  type LinhaVT,
  type OperadoraVT,
} from "@/lib/vale-transporte";

export const dynamic = "force-dynamic";

const LARG = 841.89; // A4 paisagem
const ALT = 595.28;
const M = 36;
const UTIL = LARG - M * 2;
const COR_TIT = rgb(0.15, 0.13, 0.1);
const COR_TXT = rgb(0.15, 0.15, 0.15);
const COR_LAB = rgb(0.42, 0.4, 0.37);
const COR_LIN = rgb(0.88, 0.86, 0.83);
const COR_FAIXA = rgb(0.93, 0.9, 0.86);
const COR_CAB = rgb(0.96, 0.94, 0.91);
const COR_ALERTA = rgb(0.72, 0.15, 0.1);

type Col = { t: string; w: number; a: "l" | "r" | "c" };
type Cel = { t: string; cor?: RGB; b?: boolean };

const COLS_BASE: Col[] = [
  { t: "Nome", w: 0.26, a: "l" },
  { t: "Cartão", w: 0.17, a: "l" },
  { t: "Diária", w: 0.07, a: "c" },
  { t: "Valor unit.", w: 0.09, a: "r" },
  { t: "Valor diário", w: 0.09, a: "r" },
  { t: "Dias úteis", w: 0.07, a: "c" },
  { t: "Total", w: 0.09, a: "r" },
  { t: "Saldo atual", w: 0.08, a: "r" },
  { t: "Carga", w: 0.08, a: "r" },
];
const COLS_CAJU: Col[] = [
  { t: "Nome", w: 0.22, a: "l" },
  { t: "Cartão", w: 0.15, a: "l" },
  { t: "Diária", w: 0.06, a: "c" },
  { t: "Valor unit.", w: 0.08, a: "r" },
  { t: "Valor diário", w: 0.08, a: "r" },
  { t: "Dias úteis", w: 0.06, a: "c" },
  { t: "Alimentação", w: 0.08, a: "r" },
  { t: "Prêmio", w: 0.07, a: "r" },
  { t: "Total", w: 0.08, a: "r" },
  { t: "Saldo atual", w: 0.06, a: "r" },
  { t: "Carga", w: 0.06, a: "r" },
];

/** O PDF só aceita letras do alfabeto latino; qualquer outro símbolo vira "?". */
function limpar(s: string): string {
  return s.replace(/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u2122]/g, "?");
}

function cortar(txt: string, fonte: PDFFont, tam: number, max: number): string {
  let s = txt;
  while (s.length > 1 && fonte.widthOfTextAtSize(s, tam) > max) s = s.slice(0, -1);
  return s === txt ? s : s.trimEnd() + "…";
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("competencia") ?? "") ? (sp.get("competencia") as string) : "";
  if (!competencia) return NextResponse.json({ error: "mês inválido" }, { status: 400 });
  const unidadeFiltro = sp.get("unidade") || "";

  const [empRes, uniRes, colRes, lancRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("vt_lancamentos").select("*").eq("competencia", competencia),
  ]);
  if (lancRes.error) return NextResponse.json({ error: lancRes.error.message }, { status: 500 });

  const empresaPorId = new Map(((empRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((uniRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colabPorId = new Map(((colRes.data ?? []) as Colaborador[]).map((c) => [c.id, c]));
  const lancamentos = (lancRes.data ?? []) as LinhaVT[];

  // grupo (unidade) -> operadora -> linhas
  type Item = { nome: string; l: LinhaVT; repetido: boolean };
  const donos = new Map<string, Set<string>>();
  for (const l of lancamentos) {
    const num = (l.cartao ?? "").replace(/\D/g, "");
    if (!num) continue;
    const k = `${l.operadora}|${num}`;
    if (!donos.has(k)) donos.set(k, new Set());
    donos.get(k)!.add(l.colaborador_id);
  }
  const porGrupo = new Map<string, Map<OperadoraVT, Item[]>>();
  for (const l of lancamentos) {
    const c = colabPorId.get(l.colaborador_id);
    if (!c) continue;
    const g = grupoVT(c, empresaPorId, unidadePorId);
    if (unidadeFiltro && g !== unidadeFiltro) continue;
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const m = porGrupo.get(g)!;
    if (!m.has(l.operadora)) m.set(l.operadora, []);
    const num = (l.cartao ?? "").replace(/\D/g, "");
    m.get(l.operadora)!.push({ nome: c.nome, l, repetido: !!num && (donos.get(`${l.operadora}|${num}`)?.size ?? 0) > 1 });
  }
  const grupos = Array.from(porGrupo.keys()).sort(compararGrupos);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let page = pdf.addPage([LARG, ALT]);
  paginas.push(page);
  let y = ALT - M - 36;

  const escopo = unidadeFiltro ? `Unidade: ${unidadeFiltro}` : "Todas as unidades";
  const cabecalhoPagina = (p: PDFPage) => {
    p.drawText("Vale Transporte — relatório para conferência", { x: M, y: ALT - M, size: 15, font: bold, color: COR_TIT });
    p.drawText(limpar(`${rotuloCompetencia(competencia)} · ${escopo}`), { x: M, y: ALT - M - 15, size: 9, font, color: COR_LAB });
  };
  cabecalhoPagina(page);

  const novaPagina = () => {
    page = pdf.addPage([LARG, ALT]);
    paginas.push(page);
    cabecalhoPagina(page);
    y = ALT - M - 36;
  };
  const garantir = (altura: number) => {
    if (y - altura < M + 16) novaPagina();
  };

  const linhaTabela = (cols: Col[], vals: Cel[], alt: number, fundo?: RGB, rotulo?: string) => {
    if (fundo) page.drawRectangle({ x: M, y: y - alt, width: UTIL, height: alt, color: fundo });
    let x = M;
    cols.forEach((c, i) => {
      const w = c.w * UTIL;
      const v = vals[i] ?? { t: "" };
      const f = v.b ? bold : font;
      if (i === 0 && rotulo) {
        page.drawText(limpar(rotulo), { x: x + 4, y: y - alt + 5, size: 8, font: bold, color: COR_TXT });
      } else {
        const s = cortar(limpar(v.t), f, 8, w - 8);
        const tw = f.widthOfTextAtSize(s, 8);
        const tx = c.a === "l" ? x + 4 : c.a === "r" ? x + w - 4 - tw : x + (w - tw) / 2;
        page.drawText(s, { x: tx, y: y - alt + 5, size: 8, font: f, color: v.cor ?? COR_TXT });
      }
      x += w;
    });
    y -= alt;
  };

  if (grupos.length === 0) {
    page.drawText("Nenhum cartão lançado neste mês.", { x: M, y: y - 10, size: 10, font, color: COR_LAB });
  }

  const resumo: { grupo: string; porOp: Record<OperadoraVT, number>; total: number; saldo: number; carga: number }[] = [];
  const pontos: string[] = [];

  for (const g of grupos) {
    const ops = porGrupo.get(g)!;
    garantir(16 + 14 + 16 * 4);
    page.drawRectangle({ x: M, y: y - 18, width: UTIL, height: 18, color: rgb(0.17, 0.15, 0.13) });
    page.drawText(limpar(g), { x: M + 6, y: y - 13, size: 10.5, font: bold, color: rgb(1, 1, 1) });
    y -= 26;

    const todas: LinhaVT[] = [];
    const porOp = { BHBUS: 0, SEMPARAR: 0, OTIMO: 0, CAJU: 0 } as Record<OperadoraVT, number>;

    for (const op of OPERADORAS) {
      const itens = (ops.get(op) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      if (itens.length === 0) continue;
      const caju = op === "CAJU";
      const cols = caju ? COLS_CAJU : COLS_BASE;

      garantir(14 + 16 + 16 * 2);
      page.drawText(limpar(`${ROTULO_OPERADORA[op]} · ${itens.length} cartão(ões)`), { x: M, y: y - 9, size: 9.5, font: bold, color: COR_TIT });
      y -= 14;
      linhaTabela(cols, cols.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);

      for (const { nome, l, repetido } of itens) {
        if (y - 34 < M + 16) {
          novaPagina();
          linhaTabela(cols, cols.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);
        }
        const semCartao = !(l.cartao ?? "").trim();
        const semDias = l.dias_uteis === 0;
        if (semCartao) pontos.push(`${g} · ${ROTULO_OPERADORA[op]} · ${nome}: cartão sem número`);
        if (semDias) pontos.push(`${g} · ${ROTULO_OPERADORA[op]} · ${nome}: dias úteis zerados`);
        if (repetido) pontos.push(`${g} · ${ROTULO_OPERADORA[op]} · ${nome}: número de cartão repetido`);
        const base: Cel[] = [
          { t: nome },
          semCartao ? { t: "sem número", cor: COR_ALERTA } : { t: `${l.cartao}${repetido ? " (repetido)" : ""}`, cor: repetido ? COR_ALERTA : undefined },
          { t: numeroVT(l.diaria) },
          { t: numeroVT(l.valor_unit) },
          { t: numeroVT(valorDiarioVT(l)) },
          { t: String(l.dias_uteis), cor: semDias ? COR_ALERTA : undefined },
        ];
        const fim: Cel[] = [
          { t: numeroVT(totalVT(l)), b: true },
          { t: numeroVT(l.saldo) },
          { t: numeroVT(cargaVT(l)), b: true, cor: COR_ALERTA },
        ];
        linhaTabela(cols, caju ? [...base, { t: numeroVT(l.alimentacao ?? 0) }, { t: numeroVT(l.premio ?? 0) }, ...fim] : [...base, ...fim], 16);
        page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
      }

      const linhasOp = itens.map((i) => i.l);
      const s = somaVT(linhasOp);
      porOp[op] = s.carga;
      todas.push(...linhasOp);
      const vazias: Cel[] = cols.map(() => ({ t: "" }));
      const iTotal = cols.findIndex((c) => c.t === "Total");
      vazias[iTotal] = { t: numeroVT(s.total), b: true };
      vazias[iTotal + 1] = { t: numeroVT(s.saldo), b: true };
      vazias[iTotal + 2] = { t: numeroVT(s.carga), b: true, cor: COR_ALERTA };
      linhaTabela(cols, vazias, 16, COR_FAIXA, `TOTAL — ${ROTULO_OPERADORA[op]} · ${g}`);
      y -= 12;
    }

    const sg = somaVT(todas);
    resumo.push({ grupo: g, porOp, total: sg.total, saldo: sg.saldo, carga: sg.carga });
    garantir(24);
    const txt = `TOTAL DA UNIDADE ${g}:   Total ${numeroVT(sg.total)}   ·   Saldo ${numeroVT(sg.saldo)}   ·   Carga a recarregar ${numeroVT(sg.carga)}`;
    page.drawText(limpar(txt), { x: M, y: y - 10, size: 9.5, font: bold, color: COR_TIT });
    y -= 30;
  }

  // ---- Resumo geral (carga por unidade e operadora) + pontos de atenção
  if (resumo.length > 0) {
    novaPagina();
    page.drawText("Resumo — carga a recarregar", { x: M, y: y - 4, size: 12, font: bold, color: COR_TIT });
    y -= 22;
    const colsRes: Col[] = [
      { t: "Unidade", w: 0.28, a: "l" },
      { t: "BHBUS", w: 0.11, a: "r" },
      { t: "SEMPARAR", w: 0.11, a: "r" },
      { t: "ÓTIMO", w: 0.11, a: "r" },
      { t: "CAJU", w: 0.11, a: "r" },
      { t: "Total", w: 0.09, a: "r" },
      { t: "Saldo", w: 0.09, a: "r" },
      { t: "Carga", w: 0.1, a: "r" },
    ];
    linhaTabela(colsRes, colsRes.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);
    let tt = 0, ts = 0, tc = 0;
    const topOp = { BHBUS: 0, SEMPARAR: 0, OTIMO: 0, CAJU: 0 } as Record<OperadoraVT, number>;
    for (const r of resumo) {
      garantir(18);
      linhaTabela(
        colsRes,
        [
          { t: r.grupo },
          { t: numeroVT(r.porOp.BHBUS) },
          { t: numeroVT(r.porOp.SEMPARAR) },
          { t: numeroVT(r.porOp.OTIMO) },
          { t: numeroVT(r.porOp.CAJU) },
          { t: numeroVT(r.total) },
          { t: numeroVT(r.saldo) },
          { t: numeroVT(r.carga), b: true, cor: COR_ALERTA },
        ],
        16
      );
      page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
      tt += r.total; ts += r.saldo; tc += r.carga;
      for (const op of OPERADORAS) topOp[op] += r.porOp[op];
    }
    garantir(20);
    linhaTabela(
      colsRes,
      [
        { t: "TOTAL GERAL", b: true },
        { t: numeroVT(topOp.BHBUS), b: true },
        { t: numeroVT(topOp.SEMPARAR), b: true },
        { t: numeroVT(topOp.OTIMO), b: true },
        { t: numeroVT(topOp.CAJU), b: true },
        { t: numeroVT(tt), b: true },
        { t: numeroVT(ts), b: true },
        { t: numeroVT(tc), b: true, cor: COR_ALERTA },
      ],
      18,
      COR_FAIXA
    );
    y -= 20;

    if (pontos.length > 0) {
      garantir(30);
      page.drawText("Pontos para conferir", { x: M, y: y - 4, size: 10.5, font: bold, color: COR_ALERTA });
      y -= 18;
      for (const p of pontos) {
        garantir(14);
        page.drawText(limpar(`•  ${p}`), { x: M + 4, y: y - 8, size: 8.5, font, color: COR_TXT });
        y -= 13;
      }
      y -= 8;
    }

    garantir(50);
    y -= 24;
    page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: COR_LAB });
    page.drawText("Conferido por", { x: M, y: y - 11, size: 8, font, color: COR_LAB });
    page.drawLine({ start: { x: M + 290, y }, end: { x: M + 400, y }, thickness: 0.6, color: COR_LAB });
    page.drawText("Data", { x: M + 290, y: y - 11, size: 8, font, color: COR_LAB });
  }

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  paginas.forEach((p, i) => {
    p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: M, y: M - 14, size: 8, font, color: COR_LAB });
    const t = `Gerado em ${agora}`;
    p.drawText(t, { x: LARG - M - font.widthOfTextAtSize(t, 8), y: M - 14, size: 8, font, color: COR_LAB });
  });

  const bytes = await pdf.save();
  const nome = unidadeFiltro
    ? `vale-transporte-${competencia}-${unidadeFiltro.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`
    : `vale-transporte-${competencia}-todas-as-unidades.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposicaoPdf(req, nome),
    },
  });
}
