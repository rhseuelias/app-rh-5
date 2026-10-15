"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";

const inteiro = (v: FormDataEntryValue | null) => Math.max(0, Math.round(Number(v) || 0));

// Salva os números dos anos anteriores do gráfico "Crescimento de colaboradores por ano".
// Só grava o ano que foi mudado (ou que já era ajustado à mão). "Voltar ao automático" apaga o ajuste.
// Se a migration_037 ainda não foi rodada, os comandos falham em silêncio.
export async function salvarHistoricoColaboradores(formData: FormData): Promise<void> {
  if (await souAssistente()) return;
  const escopo = String(formData.get("escopo") ?? "");
  if (!escopo) return;

  const supabase = createClient();
  const anos = formData.getAll("anos").map(Number).filter((a) => a > 1990 && a < 2200);

  for (const ano of anos) {
    if (formData.get(`auto_${ano}`) === "on") {
      await supabase.from("historico_colaboradores").delete().eq("escopo", escopo).eq("ano", ano);
      continue;
    }
    const clt = inteiro(formData.get(`clt_${ano}`));
    const pj = inteiro(formData.get(`pj_${ano}`));
    const estagio = inteiro(formData.get(`est_${ano}`));
    const franquias = inteiro(formData.get(`fr_${ano}`));
    const jaManual = formData.get(`manual_${ano}`) === "1";
    const mudou =
      clt !== inteiro(formData.get(`orig_clt_${ano}`)) ||
      pj !== inteiro(formData.get(`orig_pj_${ano}`)) ||
      estagio !== inteiro(formData.get(`orig_est_${ano}`)) ||
      franquias !== inteiro(formData.get(`orig_fr_${ano}`));
    if (!jaManual && !mudou) continue;

    await supabase
      .from("historico_colaboradores")
      .upsert({ escopo, ano, clt, pj, estagio, franquias, atualizado_em: new Date().toISOString() }, { onConflict: "escopo,ano" });
  }

  revalidatePath("/dashboard");
}
