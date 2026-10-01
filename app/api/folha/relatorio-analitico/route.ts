import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { competenciaAtualSP, montarRelatorioAnalitico } from "@/lib/relatorio-analitico";
import { gerarPdfRelatorio } from "@/lib/pdf-relatorio-analitico";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function erro(mensagem: string, status: number) {
  return new NextResponse(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro("Sessão expirada. Entre no sistema de novo.", 401);

  const { searchParams } = new URL(req.url);
  const pedida = searchParams.get("competencia") ?? "";
  const competencia = /^\d{4}-\d{2}$/.test(pedida) ? pedida : competenciaAtualSP();
  const escopo = searchParams.get("escopo") ?? "todas";

  const r = await montarRelatorioAnalitico(competencia, escopo);
  if ("erro" in r) return erro(r.erro, 500);

  const pdf = await gerarPdfRelatorio(r.relatorio);
  const nome = `Relatorio Analitico Folha ${competencia} ${r.relatorio.escopoRotulo.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()}.pdf`;
  const nomeAscii = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "X-Nome-Arquivo": encodeURIComponent(nome),
      "Cache-Control": "no-store",
    },
  });
}
