import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import { buscarDadosRelatorioSimulacao } from "@/lib/ferias-relatorio";

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", automatica: "Automática" };

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export async function GET(req: Request, { params }: { params: { cenarioId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const dados = await buscarDadosRelatorioSimulacao(params.cenarioId);
  if (!dados) return NextResponse.json({ error: "cenário não encontrado" }, { status: 404 });
  const { cabecalho, linhas } = dados;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppliQ RH";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Simulação de férias", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = `${cabecalho.cenarioNome} — ${cabecalho.empresaNome} · ${cabecalho.unidadeNome} · ${cabecalho.ano ?? "—"}`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.addRow([]);

  sheet.columns = [
    { key: "colaborador", width: 32 },
    { key: "inicio", width: 14 },
    { key: "fim", width: 14 },
    { key: "dias", width: 8 },
    { key: "origem", width: 16 },
    { key: "valor", width: 18 },
  ];

  const linhaCabecalho = sheet.getRow(3);
  linhaCabecalho.values = ["Colaborador", "Início", "Fim", "Dias", "Origem", "Valor estimado"];
  linhaCabecalho.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1330" } };
  });

  for (const linha of linhas) {
    sheet.addRow({
      colaborador: linha.colaboradorNome,
      inicio: dataBR(linha.periodoInicio),
      fim: dataBR(linha.periodoFim),
      dias: linha.dias,
      origem: linha.origemSimulacao ? ORIGEM_LABEL[linha.origemSimulacao] ?? linha.origemSimulacao : "—",
      valor: linha.valorEstimado != null ? linha.valorEstimado : "",
    });
  }

  sheet.getColumn("valor").numFmt = '"R$" #,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="simulacao-ferias.xlsx"`,
    },
  });
}
