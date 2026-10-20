"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";

export interface RespostaConfirmacao {
  ok: boolean;
  mensagem: string;
}

const TOKEN_OK = /^[a-f0-9]{32,64}$/;

/**
 * Chamada pelo supervisor a partir do link do Painel de Integração (sem login:
 * o token do link é a chave). Marca a etapa "Onboarding" do colaborador como
 * realizada, libera a etapa seguinte e registra no histórico quem confirmou.
 */
export async function confirmarOnboardingSupervisor(
  token: string,
  colaboradorId: string,
  nomeSupervisor: string
): Promise<RespostaConfirmacao> {
  if (!TOKEN_OK.test(token ?? "")) return { ok: false, mensagem: "Link inválido. Peça ao RH um link novo." };
  const quem = (nomeSupervisor ?? "").trim().slice(0, 80);
  if (!quem) return { ok: false, mensagem: "Escreva o seu nome para confirmar." };
  if (!colaboradorId || colaboradorId.length > 80) return { ok: false, mensagem: "Colaborador inválido." };

  try {
    const admin = createAdminClient();

    // 1) o link precisa estar ativo e o colaborador precisa estar na seleção do link
    const { data: link } = await admin
      .from("links_painel_integracao")
      .select("id, ativo, colaboradores_ids")
      .eq("token", token)
      .maybeSingle();
    if (!link || !link.ativo) return { ok: false, mensagem: "Este link não funciona mais. Peça ao RH um link novo." };
    if (Array.isArray(link.colaboradores_ids) && !link.colaboradores_ids.includes(colaboradorId)) {
      return { ok: false, mensagem: "Este colaborador não está liberado neste link." };
    }

    // 2) processo ainda em andamento
    const { data: processo } = await admin
      .from("processos_integracao")
      .select("id, status_geral, arquivado")
      .eq("colaborador_id", colaboradorId)
      .maybeSingle();
    if (!processo || processo.arquivado || !["integracao", "experiencia"].includes(processo.status_geral)) {
      return { ok: false, mensagem: "Não encontrei o processo de integração deste colaborador." };
    }

    // 3) etapa de onboarding
    const { data: etapas } = await admin
      .from("etapas_processo")
      .select("id, processo_id, chave, ordem, status, bloqueada, data_inicio")
      .eq("processo_id", processo.id)
      .order("ordem", { ascending: true });
    const lista = (etapas ?? []) as {
      id: string;
      processo_id: string;
      chave: string;
      ordem: number;
      status: string;
      bloqueada: boolean;
      data_inicio: string | null;
    }[];
    const onboarding = lista.find((e) => e.chave === "onboarding");
    if (!onboarding) return { ok: false, mensagem: "Este colaborador não tem a etapa de onboarding." };
    if (onboarding.status === "realizado" || onboarding.status === "em_experiencia") {
      return { ok: true, mensagem: "O onboarding já estava confirmado." };
    }
    if (onboarding.bloqueada) {
      return { ok: false, mensagem: "O onboarding ainda não foi liberado: o RH precisa terminar as etapas anteriores." };
    }

    // 4) marca como feito
    const agora = new Date().toISOString();
    const { error } = await admin
      .from("etapas_processo")
      .update({
        status: "realizado",
        bloqueada: false,
        data_conclusao: agora,
        concluido_por: `${quem} (supervisor)`,
        ...(onboarding.data_inicio ? {} : { data_inicio: agora }),
      })
      .eq("id", onboarding.id);
    if (error) return { ok: false, mensagem: "Não consegui confirmar agora. Tente de novo." };

    await admin.from("historico_etapas").insert({
      etapa_processo_id: onboarding.id,
      usuario: `${quem} (supervisor)`,
      status_anterior: onboarding.status,
      status_novo: "realizado",
      observacao: "Onboarding confirmado pelo supervisor, pelo link do Painel de Integração.",
    });

    // 5) libera a etapa seguinte (mesma regra do restante do sistema)
    const proxima = lista.find((e) => e.ordem > onboarding.ordem);
    if (proxima && proxima.status === "nao_iniciado") {
      await admin.from("etapas_processo").update({ bloqueada: false, status: "pendente" }).eq("id", proxima.id);
    }

    revalidatePath(`/painel-integracao/${token}`);
    revalidatePath("/onboarding");
    revalidatePath(`/onboarding/${colaboradorId}`);
    return { ok: true, mensagem: "Onboarding confirmado. O RH já vê como feito no sistema." };
  } catch {
    return { ok: false, mensagem: "Não consegui confirmar agora. Tente de novo." };
  }
}
