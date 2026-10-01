"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

function inteiro(valor: FormDataEntryValue | null): number {
  const n = Math.floor(Number(String(valor ?? "0").replace(",", ".")));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Cria uma franquia nova (sem id) ou atualiza uma existente (com id).
export async function salvarFranquia(formData: FormData): Promise<void> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;

  const dados = {
    nome,
    qtd_clt: inteiro(formData.get("qtd_clt")),
    qtd_pj: inteiro(formData.get("qtd_pj")),
    atualizado_em: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("franquias_bse").update(dados).eq("id", id);
  } else {
    await supabase.from("franquias_bse").insert(dados);
  }

  revalidatePath("/projecao-custo");
  revalidatePath("/dashboard");
}

export async function removerFranquia(formData: FormData): Promise<void> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("franquias_bse").delete().eq("id", id);

  revalidatePath("/projecao-custo");
  revalidatePath("/dashboard");
}
