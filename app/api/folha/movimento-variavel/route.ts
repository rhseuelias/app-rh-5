import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { competenciaAtualSP, montarMovimentoVariavel } from "@/lib/relatorio-analitico";
import { gerarXlsxMovimentoVariavel } from "@/lib/xlsx-movimento-variavel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function erro(mensagem: string, status: number) {
  return new NextResponse(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// Excel "Movimento Variável" no modelo da contabilidade, do mês e da unidade escolhidos no relatório.
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

  const r = await montarMovimentoVariavel(competencia, escopo);
  if ("erro" in r) return erro(r.erro, 404);
  const { linhas, verbas, escopoRotulo, avisos } = r.dados;

  const arquivo = gerarXlsxMovimentoVariavel(linhas, verbas);
  const nome = `MovVariavel ${competencia} ${escopoRotulo.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()}.xlsx`;
  const nomeAscii = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "X-Nome-Arquivo": encodeURIComponent(nome),
      "X-Avisos": encodeURIComponent(JSON.stringify(avisos)),
      "Cache-Control": "no-store",
    },
  });
}
