import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { compararGrupos } from "@/lib/folha-calculos";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import {
  OPERADORAS,
  ROTULO_OPERADORA,
  cargaVT,
  grupoVT,
  totalVT,
  valorDiarioVT,
  type LinhaVT,
} from "@/lib/vale-transporte";

export const dynamic = "force-dynamic";

const COR_TITULO: Record<string, string> = {
  BHBUS: "FFEDE7FF",
  SEMPARAR: "FFFFE8CC",
  OTIMO: "FFDFF3E6",
  CAJU: "FFE3EBFF",
};

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

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppliQ RH";
  wb.created = new Date();

  for (const op of OPERADORAS) {
    const doOp = lancamentos.filter((l) => l.operadora === op);
    const porGrupo = new Map<string, { nome: string; l: LinhaVT }[]>();
    for (const l of doOp) {
      const c = colabPorId.get(l.colaborador_id);
      if (!c) continue;
      const g = grupoVT(c, empresaPorId, unidadePorId);
      if (unidadeFiltro && g !== unidadeFiltro) continue;
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g)!.push({ nome: c.nome, l });
    }

    const ws = wb.addWorksheet(ROTULO_OPERADORA[op], {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [
      { width: 30 },
      { width: 24 },
      { width: 14 },
      { width: 12 },
      { width: 13 },
      { width: 11 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
    ];

    ws.mergeCells("A1:I1");
    ws.getCell("A1").value = `${ROTULO_OPERADORA[op]} — ${rotuloCompetencia(competencia)}`;
    ws.getCell("A1").font = { bold: true, size: 16 };

    let linha = 3;
    const grupos = Array.from(porGrupo.keys()).sort(compararGrupos);
    if (grupos.length === 0) {
      ws.getCell(`A${linha}`).value = "Nenhum cartão lançado neste mês.";
      ws.getCell(`A${linha}`).font = { italic: true, color: { argb: "FF6B7280" } };
    }

    for (const g of grupos) {
      const lista = porGrupo.get(g)!.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      ws.mergeCells(`A${linha}:I${linha}`);
      ws.getCell(`A${linha}`).value = g;
      ws.getCell(`A${linha}`).font = { bold: true, size: 13 };
      ws.getCell(`A${linha}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO[op] } };
      linha++;

      const cab = ws.getRow(linha);
      cab.values = ["NOME", "CARTÃO", "DIÁRIA (IDA E VOLTA)", "VALOR UNIT.", "VALOR DIÁRIO", "DIAS ÚTEIS", "TOTAL", "SALDO ATUAL", "CARGA"];
      cab.eachCell((cell) => {
        cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF262626" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      linha++;
      const primeira = linha;

      for (const { nome, l } of lista) {
        const r = ws.getRow(linha);
        r.getCell(1).value = nome;
        r.getCell(2).value = l.cartao ?? "";
        r.getCell(3).value = l.diaria;
        r.getCell(4).value = l.valor_unit;
        r.getCell(5).value = { formula: `C${linha}*D${linha}`, result: valorDiarioVT(l) };
        r.getCell(6).value = l.dias_uteis;
        r.getCell(7).value = { formula: `E${linha}*F${linha}`, result: totalVT(l) };
        r.getCell(8).value = l.saldo;
        r.getCell(9).value = { formula: `MAX(0,G${linha}-H${linha})`, result: cargaVT(l) };
        for (const col of [4, 5, 7, 8, 9]) r.getCell(col).numFmt = "#,##0.00";
        r.getCell(9).font = { bold: true, color: { argb: "FFB42318" } };
        r.getCell(7).font = { bold: true };
        for (const col of [3, 6]) r.getCell(col).alignment = { horizontal: "center" };
        linha++;
      }

      const ultima = linha - 1;
      const tot = ws.getRow(linha);
      tot.getCell(1).value = `TOTAL — ${g}`;
      const soma = (col: string, f: (x: LinhaVT) => number) => ({
        formula: `SUM(${col}${primeira}:${col}${ultima})`,
        result: Math.round(lista.reduce((s, { l }) => s + f(l), 0) * 100) / 100,
      });
      tot.getCell(7).value = soma("G", totalVT);
      tot.getCell(8).value = soma("H", (x) => x.saldo);
      tot.getCell(9).value = soma("I", cargaVT);
      tot.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4EEE6" } };
      });
      for (const col of [7, 8, 9]) tot.getCell(col).numFmt = "#,##0.00";
      linha += 3;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nome = unidadeFiltro ? `vale-transporte-${competencia}-${unidadeFiltro.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx` : `vale-transporte-${competencia}.xlsx`;
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
