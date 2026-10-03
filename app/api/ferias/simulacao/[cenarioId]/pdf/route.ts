import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { buscarDadosExportacaoSimulacao } from "@/lib/exportacao-simulacao";
import { gerarPdfSimulacao } from "@/lib/exportacao-simulacao-pdf";
import { nomeArquivoExportacao } from "@/lib/exportacao-simulacao-util";

export async function GET(_req: Request, { params }: { params: { cenarioId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const dados = await buscarDadosExportacaoSimulacao(params.cenarioId);
  if (!dados) return NextResponse.json({ error: "cenário não encontrado" }, { status: 404 });

  const bytes = await gerarPdfSimulacao(dados);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivoExportacao(dados.cabecalho, "pdf")}"`,
    },
  });
}
