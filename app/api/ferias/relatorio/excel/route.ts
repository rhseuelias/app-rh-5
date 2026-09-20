import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import { buscarLinhasRelatorioFerias } from "@/lib/ferias-relatorio";
import { FERIAS_STATUS_LABEL } from "@/lib/calculos";

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const linhas = await buscarLinhasRelatorioFerias({
    empresa: url.searchParams.get("empresa") ?? undefined,
    unidade: url.searchParams.get("unidade") ?? undefined,
    ano: url.searchParams.get("ano") ?? undefined,
    mes: url.searchParams.get("mes") ?? undefined,
    colaborador: url.searchParams.get("colaborador") ?? undefined,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppliQ RH";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Relatório de férias", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { header: "Colaborador", key: "colaborador", width: 32 },
    { header: "Início", key: "inicio", width: 14 },
    { header: "Fim", key: "fim", width: 14 },
    { header: "Dias", key: "dias", width: 8 },
    { header: "Status", key: "status", width: 16 },
    { header: "Valor estimado", key: "valor", width: 18 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1330" } };
  });

  for (const linha of linhas) {
    sheet.addRow({
      colaborador: linha.colaboradorNome,
      inicio: dataBR(linha.periodoInicio),
      fim: dataBR(linha.periodoFim),
      dias: linha.dias,
      status: FERIAS_STATUS_LABEL[linha.status] ?? linha.status,
      valor: linha.valorEstimado != null ? linha.valorEstimado : "",
    });
  }

  sheet.getColumn("valor").numFmt = '"R$" #,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-ferias.xlsx"`,
    },
  });
}
