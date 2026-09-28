import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { gerarContratoPjDocx } from "@/lib/contrato-pj";
import type { Colaborador, ConfigAssinaturasPJ, Unidade } from "@/types/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: colaboradorData } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!colaboradorData) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });
  const colaborador = colaboradorData as Colaborador;

  let unidade: Unidade | null = null;
  if (colaborador.unidade_id) {
    const { data } = await supabase.from("unidades").select("*").eq("id", colaborador.unidade_id).single();
    unidade = (data as Unidade) ?? null;
  }

  const { data: configData } = await supabase.from("config_assinaturas_pj").select("*").limit(1).maybeSingle();
  const config = (configData as ConfigAssinaturasPJ) ?? null;

  const resultado = await gerarContratoPjDocx(colaborador, unidade?.nome ?? null, config);

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 400 });
  }

  return new NextResponse(new Uint8Array(resultado.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${resultado.nomeArquivo}"`,
    },
  });
}
