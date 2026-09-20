import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import { buscarDadosRelatorioSimulacao } from "@/lib/ferias-relatorio";
import { formatarReais } from "@/lib/formatadores";

const MARGEM = 40;
const LARGURA = 841.89; // A4 paisagem
const ALTURA = 595.28;
const LARGURA_UTIL = LARGURA - MARGEM * 2;

const COR_TITULO = rgb(0.06, 0.09, 0.19);
const COR_TEXTO = rgb(0.15, 0.18, 0.25);
const COR_LABEL = rgb(0.45, 0.48, 0.55);
const COR_LINHA = rgb(0.85, 0.86, 0.9);

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

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([LARGURA, ALTURA]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = ALTURA - MARGEM;
  page.drawText(`Simulação de férias — ${cabecalho.cenarioNome}`, { x: MARGEM, y, size: 16, font: bold, color: COR_TITULO });
  y -= 14;
  page.drawText(
    `${cabecalho.empresaNome} · ${cabecalho.unidadeNome} · ${cabecalho.ano ?? "—"} · ${cabecalho.status === "aprovado" ? "Aprovado" : "Rascunho"} — gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    { x: MARGEM, y, size: 8, font, color: COR_LABEL }
  );
  y -= 24;

  const colunas = [
    { titulo: "Colaborador", largura: 0.26 },
    { titulo: "Início", largura: 0.14 },
    { titulo: "Fim", largura: 0.14 },
    { titulo: "Dias", largura: 0.08 },
    { titulo: "Origem", largura: 0.16 },
    { titulo: "Valor estimado", largura: 0.22 },
  ];
  const larguras = colunas.map((c) => c.largura * LARGURA_UTIL);
  const alturaLinha = 18;

  function cabecalhoTabela(p: PDFPage, yInicio: number): number {
    p.drawRectangle({ x: MARGEM, y: yInicio - alturaLinha, width: LARGURA_UTIL, height: alturaLinha, color: rgb(0.93, 0.94, 0.97) });
    let x = MARGEM;
    colunas.forEach((c, i) => {
      p.drawText(c.titulo, { x: x + 4, y: yInicio - alturaLinha + 5, size: 8, font: bold, color: COR_LABEL });
      x += larguras[i];
    });
    return yInicio - alturaLinha;
  }

  y = cabecalhoTabela(page, y);

  for (const linha of linhas) {
    if (y - alturaLinha < MARGEM) {
      page = pdfDoc.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
      y = cabecalhoTabela(page, y);
    }
    let x = MARGEM;
    const valores = [
      linha.colaboradorNome,
      dataBR(linha.periodoInicio),
      dataBR(linha.periodoFim),
      String(linha.dias),
      linha.origemSimulacao ? ORIGEM_LABEL[linha.origemSimulacao] ?? linha.origemSimulacao : "—",
      linha.valorEstimado != null ? formatarReais(linha.valorEstimado) : "—",
    ];
    valores.forEach((v, i) => {
      page.drawText(v, { x: x + 4, y: y - alturaLinha + 5, size: 8, font, color: COR_TEXTO });
      x += larguras[i];
    });
    page.drawLine({
      start: { x: MARGEM, y: y - alturaLinha },
      end: { x: MARGEM + LARGURA_UTIL, y: y - alturaLinha },
      thickness: 0.4,
      color: COR_LINHA,
    });
    y -= alturaLinha;
  }

  if (linhas.length === 0) {
    page.drawText("Nenhum período simulado nesse cenário ainda.", { x: MARGEM, y: y - 20, size: 9, font, color: COR_LABEL });
  }

  const bytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="simulacao-ferias.pdf"`,
    },
  });
}
