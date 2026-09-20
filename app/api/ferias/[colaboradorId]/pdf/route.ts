import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import { buscarPrevisaoFerias } from "@/lib/ferias-relatorio";
import { formatarReais } from "@/lib/formatadores";

const MARGEM = 48;
const LARGURA = 595.28; // A4 retrato
const ALTURA = 841.89;
const LARGURA_UTIL = LARGURA - MARGEM * 2;

const COR_TITULO = rgb(0.06, 0.09, 0.19);
const COR_FAIXA = rgb(0.251, 0.376, 0.557);
const COR_TEXTO = rgb(0.15, 0.18, 0.25);
const COR_LABEL = rgb(0.45, 0.48, 0.55);

function limpar(texto: string): string {
  return texto.normalize("NFC");
}

function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export async function GET(req: Request, { params }: { params: { colaboradorId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const diasParam = new URL(req.url).searchParams.get("dias");
  const dias1 = diasParam ? Math.min(Math.max(Math.round(Number(diasParam)), 5), 30) : 15;

  const dados = await buscarPrevisaoFerias(params.colaboradorId, dias1);
  if (!dados) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });
  if (dados.origem === "indisponivel") {
    return NextResponse.json(
      { error: "Não há período aquisitivo aberto (ou datas válidas) pra gerar uma previsão." },
      { status: 422 }
    );
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([LARGURA, ALTURA]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = ALTURA - MARGEM;

  // Cabeçalho
  page.drawRectangle({ x: 0, y: y - 10, width: LARGURA, height: 50, color: COR_TITULO });
  page.drawText("PREVISÃO DE FÉRIAS", { x: MARGEM, y: y + 14, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(limpar(dados.colaboradorNome), { x: MARGEM, y: y - 4, size: 10, font, color: rgb(1, 1, 1) });
  y -= 62;

  // Empresa / Unidade
  page.drawText(limpar(`Empresa: ${dados.empresaNome}`), { x: MARGEM, y, size: 9, font: bold, color: COR_TEXTO });
  page.drawText(limpar(`Unidade: ${dados.unidadeNome}`), { x: MARGEM + LARGURA_UTIL / 2, y, size: 9, font: bold, color: COR_TEXTO });
  y -= 30;

  function desenharPeriodo(titulo: string, periodo: { inicio: string; fim: string; dias: number; valor: number } | null) {
    page.drawRectangle({ x: MARGEM, y: y - 14, width: LARGURA_UTIL, height: 16, color: COR_FAIXA });
    page.drawText(limpar(titulo), { x: MARGEM + 6, y: y - 11, size: 9, font: bold, color: rgb(1, 1, 1) });
    y -= 34;

    if (!periodo) {
      page.drawText("Não foi possível encontrar uma data válida dentro do prazo legal.", {
        x: MARGEM, y, size: 9, font, color: COR_LABEL,
      });
      y -= 24;
      return;
    }

    page.drawText(limpar(`${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)}  (${periodo.dias} dias)`), {
      x: MARGEM, y, size: 11, font: bold, color: COR_TEXTO,
    });
    page.drawText(limpar(`Valor estimado: ${formatarReais(periodo.valor)}`), {
      x: MARGEM, y: y - 15, size: 9, font, color: COR_LABEL,
    });
    y -= 36;
  }

  desenharPeriodo(dados.periodo2Necessario ? "1º PERÍODO" : "PERÍODO ÚNICO", dados.periodo1);
  if (dados.periodo2Necessario) {
    desenharPeriodo("2º PERÍODO", dados.periodo2);
  }

  y -= 6;
  page.drawRectangle({ x: MARGEM, y: y - 22, width: LARGURA_UTIL, height: 24, color: rgb(0.93, 0.97, 0.96) });
  page.drawText(limpar(`Valor total estimado: ${formatarReais(dados.valorTotal)}`), {
    x: MARGEM + 6, y: y - 15, size: 10, font: bold, color: COR_TITULO,
  });
  y -= 46;

  if (dados.origem === "calculada_agora") {
    page.drawText(
      limpar("Estas datas ainda não foram salvas — é uma prévia calculada agora com base nas regras da CLT."),
      { x: MARGEM, y, size: 8, font, color: COR_LABEL }
    );
    page.drawText(
      limpar('Pra confirmar, use "Sugerir férias" ou "Gerar previsão do próximo ano" na tela de Férias.'),
      { x: MARGEM, y: y - 12, size: 8, font, color: COR_LABEL }
    );
    y -= 30;
  }

  page.drawText(
    limpar("O valor mostrado é uma estimativa (salário ÷ 30 × dias + 1/3 constitucional) — não substitui o cálculo definitivo da folha."),
    { x: MARGEM, y: MARGEM - 4, size: 7, font, color: COR_LABEL }
  );

  const bytes = await pdfDoc.save();
  const nomeArquivo = `previsao-ferias-${dados.nomeArquivoBase}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
