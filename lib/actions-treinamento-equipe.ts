"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";

const EQUIPES = ["barbeiros", "atendimento", "limpeza", "lideranca"];

const numero = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Salva o treinamento de cada equipe no quadrimestre escolhido (lançamento manual).
// Dá para digitar a porcentagem ou "participaram" e "total" (o app calcula).
// Campo todo em branco apaga o lançamento daquela equipe.
// Se a migration_056 ainda não foi rodada, os comandos falham em silêncio.
export async function salvarTreinamentoEquipe(formData: FormData): Promise<void> {
  if (await souAssistente()) return;
  const ano = Number(formData.get("ano"));
  const quad = Number(formData.get("quad"));
  if (!(ano > 1990 && ano < 2200) || ![1, 2, 3].includes(quad)) return;

  const supabase = createClient();

  for (const equipe of EQUIPES) {
    const pctDigitado = numero(formData.get(`pct_${equipe}`));
    const part = numero(formData.get(`part_${equipe}`));
    const total = numero(formData.get(`total_${equipe}`));

    let pct = pctDigitado;
    if (pct === null && part !== null && total !== null && total > 0) pct = (part / total) * 100;

    if (pct === null) {
      await supabase.from("treinamento_equipe").delete().eq("ano", ano).eq("quadrimestre", quad).eq("equipe", equipe);
      continue;
    }

    pct = Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
    await supabase.from("treinamento_equipe").upsert(
      {
        ano,
        quadrimestre: quad,
        equipe,
        pct,
        participaram: part === null ? null : Math.max(0, Math.round(part)),
        total: total === null ? null : Math.max(0, Math.round(total)),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "ano,quadrimestre,equipe" }
    );
  }

  revalidatePath("/dashboard");
}
