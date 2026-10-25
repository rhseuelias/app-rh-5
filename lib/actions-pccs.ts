"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";

export async function salvarCargoPccs(input: {
  cargo_desc_id: string;
  categoria: string;
  faixa_min: number | null;
  faixa_max: number | null;
}): Promise<{ ok: boolean; erro?: string }> {
  if (await souAssistente()) return { ok: false, erro: "Sem permissão." };
  const supabase = createClient();
  const { error } = await supabase.from("pccs_cargos").upsert(
    {
      cargo_desc_id: input.cargo_desc_id,
      categoria: input.categoria,
      faixa_min: input.faixa_min,
      faixa_max: input.faixa_max,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cargo_desc_id" }
  );
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/pccs");
  return { ok: true };
}

export async function salvarAvaliacaoPccs(input: {
  colaborador_id: string;
  cargo_desc_id: string | null;
  momento: "mes6" | "mes12";
  ciclo_inicio: string;
  formacao: number;
  tecnicas: Record<string, number>;
  comportamentais: Record<string, number>;
  indicadores: unknown[];
  preparacao: number;
  evidencias: string;
  pdi_ok: boolean;
  rh_ok: boolean;
  alcada_ok: boolean;
  vaga_ok: boolean;
  nota_final: number;
  decisao: string;
}): Promise<{ ok: boolean; erro?: string }> {
  if (await souAssistente()) return { ok: false, erro: "Sem permissão." };
  const supabase = createClient();
  const { error } = await supabase.from("pccs_avaliacoes").insert(input);
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/pccs");
  return { ok: true };
}
