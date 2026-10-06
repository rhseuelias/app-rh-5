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

/**
 * Regra do bloco "Contrato e remuneração (CLT)" e da "Ficha de admissão" para o
 * perfil "assistente": só fica liberado enquanto o colaborador está no Processo
 * de Integração e ainda existe alguma etapa ANTES da etapa "Contrato" sem
 * concluir. Assim que o Contrato vira a etapa atual (e nas etapas seguintes), ou
 * fora do processo, o bloco fica totalmente oculto pra ela.
 * Para os demais perfis (RH, gestor, admin) sempre devolve true.
 */
export async function contratoCLTLiberadoParaUsuario(colaboradorId: string): Promise<boolean> {
  const papel = await obterPapelUsuarioLogado();
  if (papel !== "assistente") return true;

  const supabase = createClient();
  const { data: processo } = await supabase
    .from("processos_integracao")
    .select("id")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (!processo) return false;

  const { data: etapas } = await supabase
    .from("etapas_processo")
    .select("chave, status, ordem")
    .eq("processo_id", processo.id)
    .order("ordem", { ascending: true });
  if (!etapas || etapas.length === 0) return false;

  const indiceContrato = etapas.findIndex((e) => e.chave === "contrato");
  if (indiceContrato < 0) return false;

  // liberado só se ainda falta concluir alguma etapa antes do Contrato
  return etapas
    .slice(0, indiceContrato)
    .some((e) => e.status !== "realizado" && e.status !== "em_experiencia");
}
