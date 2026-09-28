import { createClient } from "@/lib/supabase-server";

export type Papel = "rh" | "gestor" | "admin" | "assistente";

/**
 * Papel do usuário logado, lido da tabela `perfis`. `null` se não estiver
 * logado ou não tiver perfil cadastrado (nesse caso trata como acesso total,
 * pra não travar os usuários "originais" que não têm linha em `perfis`).
 */
export async function obterPapelUsuarioLogado(): Promise<Papel | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("perfis").select("papel").eq("id", user.id).single();
  return (data?.papel as Papel | undefined) ?? null;
}

/** true = usuário logado é o perfil "assistente" (sem acesso a salário/custos/projeção de custo). */
export async function souAssistente(): Promise<boolean> {
  const papel = await obterPapelUsuarioLogado();
  return papel === "assistente";
}
