import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { EMPRESAS_VT } from "@/lib/vale-transporte";
import { montarLinhasAdiantamento, type LinhaAdiantamento } from "@/lib/adiantamentos";

export const dynamic = "force-dynamic";

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
  const soNomes = sp.get("modo") === "nomes";

  const [empRes, uniRes, colRes, salvosRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("adiantamentos_mensais").select("*").eq("competencia", competencia),
  ]);
  if (colRes.error) return NextResponse.json({ error: colRes.error.message }, { status: 500 });

  const empresaPorId = new Map(((empRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((uniRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));

  const salvos = salvosRes.error ? [] : ((salvosRes.data ?? []) as Record<string, unknown>[]);
  const todas: LinhaAdiantamento[] =
    salvos.length > 0
      ? salvos.map((s) => ({
          id: String(s.colaborador_id ?? s.id),
          nome: String(s.nome ?? ""),
          cargo: String(s.cargo ?? ""),
          matricula: String(s.matricula ?? ""),
          empresa: String(s.empresa ?? ""),
          unidade: String(s.unidade ?? ""),
          pct: s.pct === null || s.pct === undefined ? null : Number(s.pct),
          valor: s.valor === null || s.valor === undefined ? null : Number(s.valor),
        }))
      : montarLinhasAdiantamento((colRes.data ?? []) as Colaborador[], empresaPorId, unidadePorId);

  const linhas = empresaFiltro ? todas.filter((l) => l.empresa === empresaFiltro) : todas;
  const empresas = Array.from(new Set(linhas.map((l) => l.empresa)));
  const ordem = [
    ...EMPRESAS_VT.filter((e) => empresas.includes(e)),
    ...empresas.filter((e) => !(EMPRESAS_VT as readonly string[]).includes(e)).sort((a, b) => a.localeCompare(b, "pt-BR")),
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppliQ RH";
  wb.created = new Date();
  const ws = wb.addWorksheet("Adiantamentos");
  const ncols = soNomes ? 2 : 6;
  ws.columns = soNomes
    ? [{ width: 44 }, { width: 28 }]
    : [{ width: 40 }, { width: 28 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 28 }];

  const titulo = ws.getRow(1);
  titulo.getCell(1).value = `Adiantamentos · ${rotuloCompetencia(competencia)} · ${empresaFiltro || "Todas as empresas"}${soNomes ? " · Só nomes" : ""}`;
  titulo.getCell(1).font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, ncols);

  const cab = ws.getRow(3);
  const rotulos = soNomes ? ["Colaborador", "Unidade"] : ["Colaborador", "Cargo", "Matrícula", "%", "Valor (R$)", "Unidade"];
  rotulos.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE7FF" } };
  });
  ws.views = [{ state: "frozen", ySplit: 3 }];

  let r = 4;
  let totalGeral = 0;
  for (const emp of ordem) {
    const da = linhas.filter((l) => l.empresa === emp).sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
    const sep = ws.getRow(r++);
    sep.getCell(1).value = `${emp} · ${da.length}`;
    sep.eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4EEE6" } };
    });
    for (let i = 2; i <= ncols; i++) sep.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4EEE6" } };
    const primeira = r;
    for (const l of da) {
      const row = ws.getRow(r++);
      row.getCell(1).value = l.nome.toUpperCase();
      if (soNomes) {
        row.getCell(2).value = l.unidade;
      } else {
        row.getCell(2).value = (l.cargo || "").toUpperCase();
        row.getCell(3).value = l.matricula || "";
        row.getCell(4).value = l.pct ?? "";
        row.getCell(5).value = l.valor ?? "";
        row.getCell(5).numFmt = "#,##0.00";
        row.getCell(6).value = l.unidade;
      }
    }
    if (!soNomes) {
      const soma = da.reduce((s, l) => s + (l.valor ?? 0), 0);
      totalGeral += soma;
      const tot = ws.getRow(r++);
      tot.getCell(1).value = `TOTAL — ${emp}`;
      tot.getCell(5).value = { formula: `SUM(E${primeira}:E${r - 2})`, result: Math.round(soma * 100) / 100 };
      tot.getCell(5).numFmt = "#,##0.00";
      tot.eachCell((c) => (c.font = { bold: true }));
    }
    r++;
  }
  if (!soNomes && ordem.length > 1) {
    const g = ws.getRow(r);
    g.getCell(1).value = "TOTAL GERAL";
    g.getCell(5).value = Math.round(totalGeral * 100) / 100;
    g.getCell(5).numFmt = "#,##0.00";
    g.eachCell((c) => (c.font = { bold: true }));
  } else if (soNomes) {
    ws.getRow(r).getCell(1).value = `Total: ${linhas.length} colaboradores`;
    ws.getRow(r).getCell(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const slug = empresaFiltro ? `-${empresaFiltro.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
  const nome = `adiantamentos-${competencia}${slug}${soNomes ? "-nomes" : ""}.xlsx`;
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
