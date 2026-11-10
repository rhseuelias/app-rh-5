import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { disposicaoPdf } from "@/lib/pdf-disposicao";
import {
  OPERADORAS,
  transporteVT,
  ROTULO_OPERADORA,
  cargaVT,
  OPERADORAS_DA_EMPRESA,
  EMPRESAS_VT,
  empresaVT,
  grupoVT,
  saldoNaRecargaVT,
  numeroVT,
  somaVT,
  totalVT,
  valorDiarioVT,
  type LinhaVT,
  type AjusteVT,
  type OperadoraVT,
  dividirIgualVT,
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
  { t: "Nome", w: 0.21, a: "l" },
  { t: "Unidade", w: 0.1, a: "l" },
  { t: "Cartão", w: 0.14, a: "l" },
  { t: "Diária", w: 0.06, a: "c" },
  { t: "Valor unit.", w: 0.08, a: "r" },
  { t: "Valor diário", w: 0.08, a: "r" },
  { t: "Dias úteis", w: 0.06, a: "c" },
  { t: "Total", w: 0.09, a: "r" },
  { t: "Saldo recarga", w: 0.09, a: "r" },
  { t: "Carga", w: 0.09, a: "r" },
];
const COLS_CAJU: Col[] = [
  { t: "Nome", w: 0.17, a: "l" },
  { t: "Unidade", w: 0.09, a: "l" },
  { t: "Cartão", w: 0.12, a: "l" },
  { t: "Diária", w: 0.05, a: "c" },
  { t: "Valor unit.", w: 0.07, a: "r" },
  { t: "Valor diário", w: 0.07, a: "r" },
  { t: "Dias úteis", w: 0.05, a: "c" },
  { t: "Alimentação", w: 0.07, a: "r" },
  { t: "Prêmio", w: 0.06, a: "r" },
  { t: "Multi", w: 0.06, a: "r" },
  { t: "Total", w: 0.07, a: "r" },
  { t: "Saldo recarga", w: 0.06, a: "r" },
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
  const empresaFiltro = sp.get("empresa") || "";
  // separar=1: dentro de cada empresa com mais de uma unidade, uma parte (e uma página) para cada unidade
  const separar = sp.get("separar") === "1";
  // resumo=1: só a página de resumo (carga a recarregar), sem as tabelas de cartões
  const somenteResumo = sp.get("resumo") === "1";
  // ops=CAJU,BHBUS: só as concessionárias escolhidas (sem o parâmetro, todas)
  const opsParam = sp.get("ops");
  const opsSel: OperadoraVT[] = opsParam ? OPERADORAS.filter((o) => opsParam.split(",").includes(o)) : [...OPERADORAS];
  if (opsSel.length === 0) return NextResponse.json({ error: "escolha ao menos uma concessionária" }, { status: 400 });

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
  const lancamentos = ((lancRes.data ?? []) as LinhaVT[]).filter((l) => opsSel.includes(l.operadora));

  // Desconto de cargas não realizadas e taxa administrativa (BHBUS, ÓTIMO e SEMPARAR): um valor por empresa, mês e concessionária.
  // Se a tabela ainda não existe no banco, o relatório sai sem esses valores.
  const ajRes = await supabase.from("vt_ajustes_operadora").select("empresa, operadora, desconto, taxa").eq("competencia", competencia);
  const ajustes: AjusteVT[] = ajRes.error
    ? []
    : ((ajRes.data ?? []) as { empresa: string; operadora: OperadoraVT; desconto: number | string; taxa: number | string }[])
        .map((a) => ({ empresa: a.empresa, operadora: a.operadora, desconto: Number(a.desconto) || 0, taxa: Number(a.taxa) || 0 }))
        .filter((a) => opsSel.includes(a.operadora) && a.operadora !== "CAJU");

  // empresa -> operadora -> linhas
  type Item = { nome: string; unidade: string; uni: string; l: LinhaVT; repetido: boolean };
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
    const g = empresaVT(c, empresaPorId, unidadePorId);
    if (empresaFiltro && g !== empresaFiltro) continue;
    const unidade = grupoVT(c, empresaPorId, unidadePorId);
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const m = porGrupo.get(g)!;
    if (!m.has(l.operadora)) m.set(l.operadora, []);
    const num = (l.cartao ?? "").replace(/\D/g, "");
    m.get(l.operadora)!.push({ nome: c.nome, unidade: unidade === g ? "" : unidade, uni: unidade, l, repetido: !!num && (donos.get(`${l.operadora}|${num}`)?.size ?? 0) > 1 });
  }
  const ordemEmpresa = (e: string) => {
    const i = (EMPRESAS_VT as readonly string[]).indexOf(e);
    return i < 0 ? 99 : i;
  };
  const grupos = Array.from(porGrupo.keys()).sort((a, b) => ordemEmpresa(a) - ordemEmpresa(b) || a.localeCompare(b, "pt-BR"));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let page = pdf.addPage([LARG, ALT]);
  paginas.push(page);
  let y = ALT - M - 36;

  const escopo = (empresaFiltro ? `Empresa: ${empresaFiltro}` : "Todas as empresas") + (separar ? " · separado por unidade" : "") + (opsSel.length < OPERADORAS.length ? ` · ${opsSel.map((o) => ROTULO_OPERADORA[o]).join(", ")}` : "");
  const cabecalhoPagina = (p: PDFPage) => {
    p.drawText(somenteResumo ? "Vale Transporte — resumo da carga a recarregar" : "Vale Transporte — relatório para conferência", { x: M, y: ALT - M, size: 15, font: bold, color: COR_TIT });
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

  const pontos: string[] = [];
  const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");

  // ---- Valores por empresa e por unidade (usados no resumo e nos totais do relatório)
  type ValOp = { n: number; carga: number; desc: number; taxa: number; vt: number; alim: number; premio: number; multi: number; total: number; base: number };
  type Parte = { ops: Record<OperadoraVT, ValOp>; total: number; saldo: number; carga: number; desc: number; taxa: number; base: number; pagar: number };
  type LinhaResumo = { grupo: string } & Parte & { unidades: ({ nome: string } & Parte)[] };
  const unidadesDaOp = (g: string, op: OperadoraVT) => Array.from(new Set((porGrupo.get(g)?.get(op) ?? []).map((i) => i.uni))).sort(porNome);
  /** Desconto e taxa da empresa; por unidade, o valor é dividido igualmente entre as unidades que têm cartão da concessionária. */
  const ajusteOp = (g: string, op: OperadoraVT, un: string | null) => {
    const a = ajustes.find((x) => x.empresa === g && x.operadora === op);
    if (!a || op === "CAJU") return { desc: 0, taxa: 0 };
    if (un === null) return { desc: a.desconto, taxa: a.taxa };
    const lista = unidadesDaOp(g, op);
    const i = lista.indexOf(un);
    if (i < 0) return { desc: 0, taxa: 0 };
    return { desc: dividirIgualVT(a.desconto, lista.length)[i], taxa: dividirIgualVT(a.taxa, lista.length)[i] };
  };
  const parte = (g: string, un: string | null): Parte => {
    const ops = {} as Record<OperadoraVT, ValOp>;
    const todas: LinhaVT[] = [];
    let desc = 0, taxa = 0, base = 0;
    const r2p = (n: number) => Math.round(n * 100) / 100;
    for (const op of OPERADORAS) {
      const ls = (porGrupo.get(g)?.get(op) ?? []).filter((i) => un === null || i.uni === un).map((i) => i.l);
      const aj = ajusteOp(g, op, un);
      const so = somaVT(ls);
      // CAJU: o valor a pagar é o total (transporte + alimentação + prêmio + multi); nas demais, é a carga a recarregar
      const baseOp = op === "CAJU" ? so.total : so.carga;
      ops[op] = {
        n: ls.length, carga: so.carga, desc: aj.desc, taxa: aj.taxa,
        vt: r2p(ls.reduce((a, l) => a + transporteVT(l), 0)),
        alim: r2p(ls.reduce((a, l) => a + (l.operadora === "CAJU" ? l.alimentacao ?? 0 : 0), 0)),
        premio: r2p(ls.reduce((a, l) => a + (l.operadora === "CAJU" ? l.premio ?? 0 : 0), 0)),
        multi: r2p(ls.reduce((a, l) => a + (l.operadora === "CAJU" ? l.multi ?? 0 : 0), 0)),
        total: so.total, base: baseOp,
      };
      desc += aj.desc; taxa += aj.taxa; base += baseOp;
      todas.push(...ls);
    }
    const t = somaVT(todas);
    return { ops, total: t.total, saldo: t.saldo, carga: t.carga, desc, taxa, base, pagar: Math.round((base - desc + taxa) * 100) / 100 };
  };
  const resumo: LinhaResumo[] = [];
  for (const g of grupos) {
    const nomes = Array.from(new Set(Array.from(porGrupo.get(g)!.values()).flat().map((i) => i.uni))).sort(porNome);
    resumo.push({ grupo: g, ...parte(g, null), unidades: separar && nomes.length > 1 ? nomes.map((n) => ({ nome: n, ...parte(g, n) })) : [] });
  }
  const mais = (n: number) => `${n < 0 ? "-" : "+"}${numeroVT(Math.abs(n))}`;
  const textoTotal = (rot: string, p: Parte, completo: boolean) =>
    `${rot}:   ` +
    (completo ? `Total ${numeroVT(p.total)}   ·   Saldo ${numeroVT(p.saldo)}   ·   ` : "") +
    `Carga a recarregar ${numeroVT(p.carga)}` +
    (p.desc || p.taxa ? `   ·   Descontos ${mais(-p.desc)}   ·   Taxa adm. ${mais(p.taxa)}   ·   A pagar ${numeroVT(p.pagar)}` : "");

  for (const g of somenteResumo ? [] : grupos) {
    const ops = porGrupo.get(g)!;
    const rg = resumo.find((r) => r.grupo === g)!;

    // unidades da empresa (só separa se houver mais de uma)
    const nomesUnidade = rg.unidades.map((u) => u.nome);
    const dividir = nomesUnidade.length > 1;
    const blocos: (string | null)[] = dividir ? nomesUnidade : [null];

    if (!dividir) {
      garantir(16 + 14 + 16 * 4);
      page.drawRectangle({ x: M, y: y - 18, width: UTIL, height: 18, color: rgb(0.17, 0.15, 0.13) });
      page.drawText(limpar(g), { x: M + 6, y: y - 13, size: 10.5, font: bold, color: rgb(1, 1, 1) });
      y -= 26;
    }

    const opsBase = OPERADORAS_DA_EMPRESA[g] ?? [...OPERADORAS];
    const ordemOps = [...opsBase, ...OPERADORAS.filter((o) => !opsBase.includes(o))];

    for (const bloco of blocos) {
      if (bloco !== null) {
        // cada unidade começa numa página nova, para poder ser entregue separada
        if (y < ALT - M - 36) novaPagina();
        page.drawRectangle({ x: M, y: y - 18, width: UTIL, height: 18, color: rgb(0.17, 0.15, 0.13) });
        page.drawText(limpar(`${g} · ${bloco}`), { x: M + 6, y: y - 13, size: 10.5, font: bold, color: rgb(1, 1, 1) });
        y -= 26;
      }
      for (const op of ordemOps) {
        const itens = (ops.get(op) ?? [])
          .filter((i) => bloco === null || i.uni === bloco)
          .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
        if (itens.length === 0) continue;
        const caju = op === "CAJU";
        const cols = caju ? COLS_CAJU : COLS_BASE;
        const rotuloGrupo = bloco === null ? g : `${g} · ${bloco}`;

        garantir(14 + 16 + 16 * 2);
        page.drawText(limpar(`${ROTULO_OPERADORA[op]} · ${itens.length} cartão(ões)`), { x: M, y: y - 9, size: 9.5, font: bold, color: COR_TIT });
        y -= 14;
        linhaTabela(cols, cols.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);

        for (const { nome, unidade, l, repetido } of itens) {
          if (y - 34 < M + 16) {
            novaPagina();
            linhaTabela(cols, cols.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);
          }
          const semCartao = !(l.cartao ?? "").trim();
          const semDias = l.dias_uteis === 0;
          if (semCartao) pontos.push(`${rotuloGrupo} · ${ROTULO_OPERADORA[op]} · ${nome}: cartão sem número`);
          if (semDias) pontos.push(`${rotuloGrupo} · ${ROTULO_OPERADORA[op]} · ${nome}: dias úteis zerados`);
          if (repetido) pontos.push(`${rotuloGrupo} · ${ROTULO_OPERADORA[op]} · ${nome}: número de cartão repetido`);
          const base: Cel[] = [
            { t: nome },
            { t: unidade },
            semCartao ? { t: "sem número", cor: COR_ALERTA } : { t: `${l.cartao}${repetido ? " (repetido)" : ""}`, cor: repetido ? COR_ALERTA : undefined },
            { t: numeroVT(l.diaria) },
            { t: numeroVT(l.valor_unit) },
            { t: numeroVT(valorDiarioVT(l)) },
            { t: String(l.dias_uteis), cor: semDias ? COR_ALERTA : undefined },
          ];
          const fim: Cel[] = [
            { t: numeroVT(totalVT(l)), b: true },
            { t: numeroVT(saldoNaRecargaVT(l)) },
            { t: numeroVT(cargaVT(l)), b: true, cor: COR_ALERTA },
          ];
          linhaTabela(cols, caju ? [...base, { t: numeroVT(l.alimentacao ?? 0) }, { t: numeroVT(l.premio ?? 0) }, { t: numeroVT(l.multi ?? 0) }, ...fim] : [...base, ...fim], 16);
          page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
        }

        const s = somaVT(itens.map((i) => i.l));
        const vazias: Cel[] = cols.map(() => ({ t: "" }));
        const iTotal = cols.findIndex((c) => c.t === "Total");
        vazias[iTotal] = { t: numeroVT(s.total), b: true };
        vazias[iTotal + 1] = { t: numeroVT(s.saldo), b: true };
        vazias[iTotal + 2] = { t: numeroVT(s.carga), b: true, cor: COR_ALERTA };
        linhaTabela(cols, vazias, 16, COR_FAIXA, `TOTAL — ${ROTULO_OPERADORA[op]} · ${rotuloGrupo}`);

        // desconto de cargas não realizadas e taxa administrativa (BHBUS, ÓTIMO, SEMPARAR)
        const aj = ajusteOp(g, op, bloco);
        if (aj.desc || aj.taxa) {
          const n = nomesUnidade.length > 1 && bloco !== null ? unidadesDaOp(g, op).length : 0;
          const parteTxt = (v: number) => (n > 1 ? ` · 1/${n} de ${numeroVT(Math.abs(v) === 0 ? 0 : v)}` : "");
          const full = ajustes.find((x) => x.empresa === g && x.operadora === op);
          const linhaAj = (rot: string, valor: string, cor?: RGB, b?: boolean, fundo?: RGB) => {
            const v: Cel[] = cols.map(() => ({ t: "" }));
            v[iTotal + 2] = { t: valor, b, cor };
            linhaTabela(cols, v, 16, fundo, rot);
          };
          if (aj.desc) linhaAj(`(-) Desconto de cargas não realizadas${parteTxt(full?.desconto ?? 0)}`, mais(-aj.desc));
          if (aj.taxa) linhaAj(`(+) Taxa administrativa${parteTxt(full?.taxa ?? 0)}`, mais(aj.taxa));
          const pagar = Math.round((s.carga - aj.desc + aj.taxa) * 100) / 100;
          linhaAj(`VALOR A PAGAR — ${ROTULO_OPERADORA[op]} · ${rotuloGrupo}`, numeroVT(pagar), COR_ALERTA, true, COR_FAIXA);
        }
        y -= 12;
      }

      if (bloco !== null) {
        const su = rg.unidades.find((u) => u.nome === bloco)!;
        garantir(24);
        page.drawText(limpar(textoTotal(`TOTAL DA UNIDADE ${bloco}`, su, true)), { x: M, y: y - 10, size: 9, font: bold, color: COR_TIT });
        y -= 30;
      }
    }

    garantir(24);
    page.drawText(limpar(textoTotal(`TOTAL DA EMPRESA ${g}`, rg, true)), { x: M, y: y - 10, size: 9, font: bold, color: COR_TIT });
    y -= 30;
  }

  // ---- Resumo: cada concessionária com carga, desconto, taxa e valor a pagar (+ pontos de atenção)
  if (resumo.length > 0) {
    if (!somenteResumo) novaPagina();
    page.drawText("Resumo — carga a recarregar", { x: M, y: y - 4, size: 12, font: bold, color: COR_TIT });
    y -= 26;

    const colsOp: Col[] = [
      { t: "Empresa / unidade", w: 0.34, a: "l" },
      { t: "Carga", w: 0.16, a: "r" },
      { t: "(-) Desc. cargas não realizadas", w: 0.22, a: "r" },
      { t: "(+) Taxa adm.", w: 0.14, a: "r" },
      { t: "A pagar", w: 0.14, a: "r" },
    ];
    // CAJU: Total VT, Total alimentação, Total prêmio (e Total multi, só se houver) e Total a pagar
    const temMulti = resumo.some((r) => r.ops.CAJU.multi > 0);
    const colsCaju: Col[] = temMulti
      ? [
          { t: "Empresa / unidade", w: 0.26, a: "l" },
          { t: "Total VT", w: 0.15, a: "r" },
          { t: "Total alimentação", w: 0.17, a: "r" },
          { t: "Total prêmio", w: 0.14, a: "r" },
          { t: "Total multi", w: 0.12, a: "r" },
          { t: "Total a pagar", w: 0.16, a: "r" },
        ]
      : [
          { t: "Empresa / unidade", w: 0.32, a: "l" },
          { t: "Total VT", w: 0.17, a: "r" },
          { t: "Total alimentação", w: 0.19, a: "r" },
          { t: "Total prêmio", w: 0.15, a: "r" },
          { t: "Total a pagar", w: 0.17, a: "r" },
        ];
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const faixa = (txt: string, cor = rgb(0.17, 0.15, 0.13)) => {
      garantir(18 + 16 * 3);
      page.drawRectangle({ x: M, y: y - 18, width: UTIL, height: 18, color: cor });
      page.drawText(limpar(txt), { x: M + 6, y: y - 13, size: 10, font: bold, color: rgb(1, 1, 1) });
      y -= 18;
    };

    for (const op of opsSel) {
      const caju = op === "CAJU";
      const cols = caju ? colsCaju : colsOp;
      const doOp = resumo.filter((r) => r.ops[op].n > 0 || r.ops[op].desc || r.ops[op].taxa);
      if (doOp.length === 0) continue;
      faixa(ROTULO_OPERADORA[op]);
      linhaTabela(cols, cols.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);
      const celulasOp = (nome: string, v: ValOp, cinza: boolean): Cel[] => {
        const pagar = r2(v.base - v.desc + v.taxa);
        const cor = cinza ? COR_LAB : undefined;
        return caju
          ? [
              { t: nome, b: !cinza, cor },
              { t: numeroVT(v.vt), cor },
              { t: numeroVT(v.alim), cor },
              { t: numeroVT(v.premio), cor },
              ...(temMulti ? [{ t: numeroVT(v.multi), cor }] : []),
              { t: numeroVT(pagar), b: !cinza, cor: cinza ? COR_LAB : COR_ALERTA },
            ]
          : [
              { t: nome, b: !cinza, cor },
              { t: numeroVT(v.carga), cor },
              { t: v.desc ? mais(-v.desc) : numeroVT(0), cor },
              { t: v.taxa ? mais(v.taxa) : numeroVT(0), cor },
              { t: numeroVT(pagar), b: !cinza, cor: cinza ? COR_LAB : COR_ALERTA },
            ];
      };
      for (const r of doOp) {
        garantir(18);
        linhaTabela(cols, celulasOp(r.grupo, r.ops[op], false), 16);
        page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
        for (const u of r.unidades.filter((x) => x.ops[op].n > 0)) {
          garantir(18);
          linhaTabela(cols, celulasOp(`    ${u.nome}`, u.ops[op], true), 16);
          page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
        }
      }
      y -= 10;
    }

    faixa("TOTAL GERAL — todas as concessionárias", rgb(0.06, 0.36, 0.33));
    const colsTot: Col[] = [
      { t: "Empresa", w: 0.34, a: "l" },
      { t: "Valor das cargas", w: 0.16, a: "r" },
      { t: "(-) Descontos", w: 0.22, a: "r" },
      { t: "(+) Taxas", w: 0.14, a: "r" },
      { t: "A pagar", w: 0.14, a: "r" },
    ];
    linhaTabela(colsTot, colsTot.map((c) => ({ t: c.t, b: true, cor: COR_LAB })), 16, COR_CAB);
    let tc = 0, td = 0, tx = 0, tp = 0;
    for (const r of resumo) {
      garantir(18);
      linhaTabela(colsTot, [{ t: r.grupo }, { t: numeroVT(r.base) }, { t: r.desc ? mais(-r.desc) : numeroVT(0) }, { t: r.taxa ? mais(r.taxa) : numeroVT(0) }, { t: numeroVT(r.pagar), b: true, cor: COR_ALERTA }], 16);
      page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
      tc += r.base; td += r.desc; tx += r.taxa; tp += r.pagar;
    }
    garantir(20);
    linhaTabela(colsTot, [{ t: "TOTAL GERAL", b: true }, { t: numeroVT(tc), b: true }, { t: td ? mais(-td) : numeroVT(0), b: true }, { t: tx ? mais(tx) : numeroVT(0), b: true }, { t: numeroVT(r2(tp)), b: true, cor: COR_ALERTA }], 18, COR_FAIXA);
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
  const nome = empresaFiltro
    ? `vale-transporte-${somenteResumo ? "resumo-" : ""}${competencia}-${empresaFiltro.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${separar ? "-por-unidade" : ""}.pdf`
    : `vale-transporte-${competencia}-todas-as-empresas.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposicaoPdf(req, nome),
    },
  });
}
