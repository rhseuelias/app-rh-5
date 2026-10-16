"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export type RespostaAdiantamento = { ok: true } | { ok: false; erro: string };

/** Marca ou desmarca "recebe adiantamento" no cadastro dos colaboradores. A lista se repete todo mês. */
export async function definirAdiantamento(ids: string[], recebe: boolean): Promise<RespostaAdiantamento> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Entre no sistema para fazer isso." };

  const lista = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x.length > 0) : [];
  if (lista.length === 0 || lista.length > 500) return { ok: false, erro: "Escolha o colaborador." };

  const { error } = await supabase.from("colaboradores").update({ adiantamento_salario: recebe }).in("id", lista);
  if (error) {
    if (/row-level security|permission denied|policy/i.test(error.message)) {
      return { ok: false, erro: "O banco não permitiu salvar (falta permissão)." };
    }
    return { ok: false, erro: error.message };
  }
  revalidatePath("/departamento-pessoal/adiantamentos");
  revalidatePath("/departamento-pessoal/adiantamentos/relatorio");
  return { ok: true };
}
