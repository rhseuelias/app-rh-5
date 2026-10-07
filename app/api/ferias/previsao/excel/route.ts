import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import { buscarPrevisaoVencimento } from "@/lib/previsao-ferias";
import { fDMA } from "@/lib/ferias-regras";
import { formatarCNPJ } from "@/lib/formatadores";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const empresa = sp.get("empresa") ?? undefined;
  const unidade = sp.get("unidade") ?? undefined;
  const dados = await buscarPrevisaoVencimento(empresa || undefined, unidade || undefined);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppliQ RH";
  wb.created = new Date();
  const ws = wb.addWorksheet("Previsão de férias", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.columns = [
    { key: "empresa", width: 34 },
    { key: "cnpj", width: 20 },
    { key: "unidade", width: 24 },
    { key: "nome", width: 40 },
    { key: "codigo", width: 9 },
    { key: "adm", width: 13 },
    { key: "per", width: 14 },
    { key: "venc", width: 14 },
    { key: "dias", width: 7 },
    { key: "prev", width: 14 },
    { key: "limite", width: 14 },
  ];

  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = "Previsão de Vencimento de Férias";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = `Posição em ${fDMA(dados.hoje)} — ${dados.total} registro(s)`;
  ws.getCell("A2").font = { size: 9, color: { argb: "FF6B7280" } };

  const cab = ws.getRow(3);
  cab.values = ["Empresa", "CNPJ", "Unidade", "Empregado", "Código", "Admissão", "Pér. Aquisit.", "Venc. Férias", "Dias", "Prev. Férias", "Data Limite"];
  cab.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1330" } };
  });

  for (const g of dados.grupos) {
    const blocos = g.unidades.length > 0 ? g.unidades : [{ unidadeNome: "", linhas: g.linhas }];
    for (const bl of blocos) {
      for (const l of bl.linhas) {
        const r = ws.addRow([
          g.empresaNome,
          g.cnpj ? formatarCNPJ(g.cnpj) : "",
          bl.unidadeNome,
          l.nome,
          l.codigo,
          fDMA(l.admissao),
          fDMA(l.periodoInicio),
          fDMA(l.vencimento),
          l.dias,
          fDMA(l.previsao),
          fDMA(l.limite),
        ]);
        r.getCell(9).alignment = { horizontal: "center" };
      }
    }
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 11 } };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="previsao-vencimento-ferias.xlsx"`,
    },
  });
}
