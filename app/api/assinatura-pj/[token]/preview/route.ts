import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { gerarContratoPjDocx } from "@/lib/contrato-pj";
import type { Colaborador, ConfigAssinaturasPJ, Unidade } from "@/types/db";

/** Baixa o contrato (Word) pelo token do link de assinatura — sem precisar
 * de login, é o que o profissional PJ usa pra ler o contrato antes (ou
 * depois) de assinar. Usa sempre o cliente admin. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();

  const { data: colaboradorData } = await admin
    .from("colaboradores")
    .select("*")
    .eq("assinatura_pj_link_token", params.token)
    .maybeSingle();
  if (!colaboradorData) return NextResponse.json({ error: "link inválido" }, { status: 404 });
  const colaborador = colaboradorData as Colaborador;

  let unidade: Unidade | null = null;
  if (colaborador.unidade_id) {
    const { data } = await admin.from("unidades").select("*").eq("id", colaborador.unidade_id).maybeSingle();
    unidade = (data as Unidade) ?? null;
  }

  const { data: configData } = await admin.from("config_assinaturas_pj").select("*").limit(1).maybeSingle();
  const config = (configData as ConfigAssinaturasPJ) ?? null;

  const resultado = await gerarContratoPjDocx(colaborador, unidade?.nome ?? null, config, admin);

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 400 });
  }

  return new NextResponse(new Uint8Array(resultado.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `inline; filename="${resultado.nomeArquivo}"`,
    },
  });
}
