import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";

type Supabase = ReturnType<typeof createClient>;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function etapaFeita(status: string): boolean {
  return status === "realizado" || status === "em_experiencia";
}

/**
 * Regra de acesso da assistente ao "Contrato e remuneração (CLT)" e à
 * "Ficha de admissão" de um colaborador:
 *
 *  - LIBERADO: o colaborador está no Processo de Integração e ainda existe
 *    alguma etapa ANTES da etapa Contrato que não foi concluída (ou seja, a
 *    etapa Contrato ainda não é a etapa atual).
 *  - OCULTO: assim que a etapa Contrato vira a etapa atual (todas as
 *    anteriores concluídas), nas etapas seguintes, e para todo colaborador
 *    que está fora do processo.
 *
 * Na dúvida (sem processo, sem etapas, sem etapa Contrato), fica OCULTO.
 */
export async function assistentePodeVerContratoRemuneracao(
  supabase: Supabase,
  colaboradorId: string
): Promise<boolean> {
  const { data: processo } = await supabase
    .from("processos_integracao")
    .select("id, arquivado")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();

  if (!processo || processo.arquivado) return false;

  const { data: etapas } = await supabase
    .from("etapas_processo")
    .select("chave, nome, ordem, status")
    .eq("processo_id", processo.id)
    .order("ordem", { ascending: true });

  if (!etapas || etapas.length === 0) return false;

  // acha a etapa Contrato: primeiro pela chave exata, depois pelo nome
  let indiceContrato = etapas.findIndex((e) => e.chave === "contrato");
  if (indiceContrato < 0) {
    indiceContrato = etapas.findIndex((e) => normalizar(`${e.chave} ${e.nome}`).includes("contrato"));
  }
  if (indiceContrato < 0) return false;

  // liberado só se ainda falta concluir alguma etapa antes do Contrato
  return etapas.slice(0, indiceContrato).some((e) => !etapaFeita(e.status));
}

/**
 * true = quem está logado é a assistente E ela não pode ver o contrato/ficha
 * desse colaborador agora. Usado para barrar os downloads da Ficha de admissão.
 */
export async function assistenteSemAcessoAoContrato(colaboradorId: string): Promise<boolean> {
  if (!(await souAssistente())) return false;
  const supabase = createClient();
  return !(await assistentePodeVerContratoRemuneracao(supabase, colaboradorId));
}

/**
 * Ficha de admissão: a assistente pode gerar (PDF/Excel) para qualquer colaborador que esteja
 * no Processo de Integração (em integração ou em experiência, não arquivado).
 * O "Salário base" continua sendo omitido da ficha dela depois da etapa Contrato
 * (regra em lib/ficha-admissao.ts), então só os dados cadastrais aparecem.
 */
export async function assistentePodeGerarFicha(supabase: Supabase, colaboradorId: string): Promise<boolean> {
  const { data: processo } = await supabase
    .from("processos_integracao")
    .select("id, arquivado, status_geral")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (!processo || processo.arquivado) return false;
  return processo.status_geral === "integracao" || processo.status_geral === "experiencia";
}

/** true = quem está logado é a assistente E ela não pode gerar a ficha desse colaborador (fora do processo). */
export async function assistenteSemAcessoAFicha(colaboradorId: string): Promise<boolean> {
  if (!(await souAssistente())) return false;
  const supabase = createClient();
  return !(await assistentePodeGerarFicha(supabase, colaboradorId));
}
