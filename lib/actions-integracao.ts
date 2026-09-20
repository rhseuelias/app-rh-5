"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { createClient } from "@/lib/supabase-server";

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

function numOuNull(formData: FormData, campo: string): number | null {
  const v = formData.get(campo);
  if (!v || v === "") return null;
  return Number(v);
}

async function usuarioAtual(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? "RH";
}

// ------------------------------------------------------------
// Criação automática — chamada a partir de converterCandidatoEmColaborador
// ------------------------------------------------------------

/**
 * Cria o processo de integração de um colaborador novo, com todas as etapas
 * configuradas já instanciadas. A etapa "Pré-cadastro" nasce Realizada; a
 * segunda etapa (Exame admissional) é desbloqueada automaticamente. Não faz
 * nada se o colaborador já tiver um processo (evita duplicar).
 */
export async function criarProcessoIntegracao(colaboradorId: string, candidatoId: string | null) {
  const supabase = createClient();

  const { data: existente } = await supabase
    .from("processos_integracao")
    .select("id")
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();
  if (existente) return existente.id as string;

  const { data: config } = await supabase
    .from("config_integracao")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const { data: etapasConfig } = await supabase
    .from("etapas_config")
    .select("*")
    .eq("ativa", true)
    .order("ordem", { ascending: true });

  const { data: processo, error } = await supabase
    .from("processos_integracao")
    .insert({
      colaborador_id: colaboradorId,
      candidato_id: candidatoId,
      prazo_integracao_dias: config?.prazo_integracao_dias ?? 5,
      prazo_experiencia_dias: config?.prazo_experiencia_dias ?? 90,
    })
    .select("id")
    .single();
  if (error || !processo) throw error ?? new Error("Falha ao criar processo de integração.");

  const lista = etapasConfig ?? [];
  const agora = new Date().toISOString();

  const { data: etapasInseridas, error: erroEtapas } = await supabase
    .from("etapas_processo")
    .insert(
      lista.map((e) => ({
        processo_id: processo.id,
        chave: e.chave,
        ordem: e.ordem,
        nome: e.nome,
        responsavel: e.responsavel,
        status: e.chave === "pre_cadastro" ? "realizado" : "nao_iniciado",
        bloqueada: e.chave !== "pre_cadastro",
        data_inicio: e.chave === "pre_cadastro" ? agora : null,
        data_conclusao: e.chave === "pre_cadastro" ? agora : null,
        concluido_por: e.chave === "pre_cadastro" ? "Sistema" : null,
      }))
    )
    .select("id, chave, ordem");
  if (erroEtapas) throw erroEtapas;

  const ordenadas = [...(etapasInseridas ?? [])].sort((a, b) => a.ordem - b.ordem);
  const indicePreCadastro = ordenadas.findIndex((e) => e.chave === "pre_cadastro");
  const preCadastro = ordenadas[indicePreCadastro];
  const segunda = indicePreCadastro >= 0 ? ordenadas[indicePreCadastro + 1] : undefined;

  if (segunda) {
    await supabase
      .from("etapas_processo")
      .update({ bloqueada: false, status: "pendente" })
      .eq("id", segunda.id);
  }

  if (preCadastro) {
    await supabase.from("historico_etapas").insert({
      etapa_processo_id: preCadastro.id,
      usuario: "Sistema",
      status_anterior: null,
      status_novo: "realizado",
      observacao: "Processo de integração criado automaticamente a partir do pré-cadastro confirmado.",
    });
  }

  revalidatePath("/onboarding");
  return processo.id as string;
}

/**
 * Botão "Incluir no processo de integração" — para um colaborador cadastrado
 * manualmente (sem passar pelo pré-cadastro), cria o processo do zero, do
 * mesmo jeito que a conversão de candidato faz.
 */
export async function incluirNoProcessoIntegracao(formData: FormData) {
  const colaboradorId = str(formData, "colaborador_id")!;
  await criarProcessoIntegracao(colaboradorId, null);
  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/onboarding");
}

// ------------------------------------------------------------
// Efeitos automáticos ao concluir uma etapa
// ------------------------------------------------------------

async function desbloquearProximaEtapa(supabase: ReturnType<typeof createClient>, etapaAtual: any) {
  const { data: todas } = await supabase
    .from("etapas_processo")
    .select("id, status")
    .eq("processo_id", etapaAtual.processo_id)
    .order("ordem", { ascending: true });

  if (!todas) return;
  const indice = todas.findIndex((e) => e.id === etapaAtual.id);
  const proxima = indice >= 0 ? todas[indice + 1] : undefined;

  if (proxima && proxima.status === "nao_iniciado") {
    await supabase
      .from("etapas_processo")
      .update({ bloqueada: false, status: "pendente" })
      .eq("id", proxima.id);
  }
}

async function tratarEfeitoEspecial(
  supabase: ReturnType<typeof createClient>,
  etapa: any,
  dataAdmissaoInformada: string | null
) {
  const { data: processo } = await supabase
    .from("processos_integracao")
    .select("*")
    .eq("id", etapa.processo_id)
    .single();
  if (!processo) return;

  // Exame admissional realizado → inicia o cronômetro e calcula o prazo do Onboarding
  if (etapa.chave === "exame_admissional") {
    const inicio = new Date();
    await supabase
      .from("processos_integracao")
      .update({ cronometro_iniciado_em: inicio.toISOString() })
      .eq("id", processo.id);

    const { data: etapaOnboarding } = await supabase
      .from("etapas_processo")
      .select("id")
      .eq("processo_id", processo.id)
      .eq("chave", "onboarding")
      .maybeSingle();

    if (etapaOnboarding) {
      const prazo = addDays(inicio, processo.prazo_integracao_dias ?? 5);
      await supabase
        .from("etapas_processo")
        .update({ prazo: prazo.toISOString() })
        .eq("id", etapaOnboarding.id);
    }
  }

  // Admissão realizada → grava a data de admissão do colaborador (base pra experiência)
  if (etapa.chave === "admissao" && dataAdmissaoInformada) {
    await supabase
      .from("colaboradores")
      .update({ data_admissao: dataAdmissaoInformada })
      .eq("id", processo.colaborador_id);
  }

  // Pesquisa onboarding concluída → avança automaticamente pra Experiência
  // e já agenda o evento de Avaliação dos 90 dias no Calendário Geral.
  if (etapa.chave === "pesquisa_onboarding") {
    const { data: colaborador } = await supabase
      .from("colaboradores")
      .select("nome, data_admissao, empresa_id")
      .eq("id", processo.colaborador_id)
      .single();

    const dataBase = colaborador?.data_admissao ?? new Date().toISOString().slice(0, 10);
    const prazoExperiencia = processo.prazo_experiencia_dias ?? 90;
    const fim = addDays(new Date(dataBase), prazoExperiencia);
    const fimISO = fim.toISOString().slice(0, 10);

    await supabase
      .from("processos_integracao")
      .update({ status_geral: "experiencia", data_fim_experiencia: fimISO })
      .eq("id", processo.id);

    await supabase
      .from("etapas_processo")
      .update({ status: "em_experiencia", bloqueada: false, data_inicio: new Date().toISOString() })
      .eq("processo_id", processo.id)
      .eq("chave", "experiencia");

    const { data: config } = await supabase
      .from("config_integracao")
      .select("antecedencia_alerta_avaliacao_dias")
      .eq("id", "default")
      .maybeSingle();
    const antecedencia = config?.antecedencia_alerta_avaliacao_dias ?? 15;
    const dataAlerta = addDays(fim, -antecedencia).toISOString().slice(0, 10);

    await supabase
      .from("etapas_processo")
      .update({ prazo: fim.toISOString() })
      .eq("processo_id", processo.id)
      .eq("chave", "avaliacao_90_dias");

    if (colaborador) {
      await supabase.from("eventos_calendario").insert({
        titulo: `Avaliação dos 90 dias — ${colaborador.nome}`,
        categoria: "acao_rh",
        data_inicio: dataAlerta,
        colaborador_id: processo.colaborador_id,
        empresa_id: colaborador.empresa_id,
        descricao: `Fim do período de experiência em ${new Date(fimISO).toLocaleDateString("pt-BR")}.`,
      });
    }
  }
}

// ------------------------------------------------------------
// Ação principal — clicar numa etapa e mudar o status
// ------------------------------------------------------------

export async function atualizarStatusEtapa(formData: FormData) {
  const supabase = createClient();
  const etapaId = str(formData, "etapa_processo_id")!;
  const novoStatus = str(formData, "status") as string;
  const observacoes = str(formData, "observacoes");
  const dataAdmissaoInformada = str(formData, "data_admissao");
  const colaboradorId = str(formData, "colaborador_id")!;
  const arquivo = formData.get("documento") as File | null;

  const { data: etapa, error } = await supabase.from("etapas_processo").select("*").eq("id", etapaId).single();
  if (error || !etapa) throw error ?? new Error("Etapa não encontrada.");
  if (etapa.bloqueada) throw new Error("Esta etapa ainda está bloqueada pela etapa anterior.");

  const usuario = await usuarioAtual(supabase);
  const agora = new Date().toISOString();

  const patch: Record<string, unknown> = { status: novoStatus, observacoes };
  if (novoStatus === "realizado") {
    patch.data_conclusao = agora;
    patch.concluido_por = usuario;
    if (!etapa.data_inicio) patch.data_inicio = agora;
  } else if (novoStatus === "em_andamento" && !etapa.data_inicio) {
    patch.data_inicio = agora;
  }

  await supabase.from("etapas_processo").update(patch).eq("id", etapaId);

  await supabase.from("historico_etapas").insert({
    etapa_processo_id: etapaId,
    usuario,
    status_anterior: etapa.status,
    status_novo: novoStatus,
    observacao: observacoes,
  });

  if (arquivo && arquivo.size > 0) {
    const caminho = `etapas/${etapaId}/${Date.now()}-${arquivo.name}`;
    const { error: erroUpload } = await supabase.storage.from("documentos").upload(caminho, arquivo, {
      contentType: arquivo.type || undefined,
      upsert: false,
    });
    if (!erroUpload) {
      await supabase.from("documentos_etapa").insert({
        etapa_processo_id: etapaId,
        nome_arquivo: arquivo.name,
        storage_path: caminho,
      });
    }
  }

  if (novoStatus === "realizado") {
    await desbloquearProximaEtapa(supabase, etapa);
    await tratarEfeitoEspecial(supabase, etapa, dataAdmissaoInformada);
  }

  revalidatePath(`/onboarding/${colaboradorId}`);
  revalidatePath("/onboarding");
}

// ------------------------------------------------------------
// Avaliação dos 90 dias — encerra o processo
// ------------------------------------------------------------

export async function registrarAvaliacao90Dias(formData: FormData) {
  const supabase = createClient();
  const processoId = str(formData, "processo_id")!;
  const etapaId = str(formData, "etapa_processo_id")!;
  const colaboradorId = str(formData, "colaborador_id")!;
  const resultado = str(formData, "resultado") as "efetivado" | "nao_efetivado";
  if (!resultado) throw new Error("Selecione Efetivado(a) ou Não efetivado(a).");

  const usuario = await usuarioAtual(supabase);

  await supabase.from("avaliacoes_experiencia").insert({
    processo_id: processoId,
    avaliacao_tecnica: numOuNull(formData, "avaliacao_tecnica"),
    comportamento: numOuNull(formData, "comportamento"),
    cultura: numOuNull(formData, "cultura"),
    assiduidade: numOuNull(formData, "assiduidade"),
    pontualidade: numOuNull(formData, "pontualidade"),
    desempenho: numOuNull(formData, "desempenho"),
    observacoes: str(formData, "observacoes"),
    recomendacao: str(formData, "recomendacao"),
    resultado,
    avaliado_por: usuario,
  });

  const { data: etapaAntes } = await supabase
    .from("etapas_processo")
    .select("status")
    .eq("id", etapaId)
    .single();

  await supabase
    .from("etapas_processo")
    .update({ status: "realizado", data_conclusao: new Date().toISOString(), concluido_por: usuario })
    .eq("id", etapaId);

  await supabase.from("historico_etapas").insert({
    etapa_processo_id: etapaId,
    usuario,
    status_anterior: etapaAntes?.status ?? null,
    status_novo: "realizado",
    observacao: `Resultado da avaliação: ${resultado === "efetivado" ? "Efetivado(a)" : "Não efetivado(a)"}`,
  });

  await supabase
    .from("processos_integracao")
    .update({ status_geral: resultado, status_geral_definido_em: new Date().toISOString() })
    .eq("id", processoId);

  revalidatePath(`/onboarding/${colaboradorId}`);
  revalidatePath("/onboarding");
}

// ------------------------------------------------------------
// Retirar do painel — NÃO apaga nada, só tira o card do Kanban.
// Complementa a saída automática depois de N dias (config_integracao.prazo_saida_painel_dias).
// ------------------------------------------------------------

export async function arquivarProcessoIntegracao(processoId: string) {
  const supabase = createClient();
  const usuario = await usuarioAtual(supabase);

  await supabase
    .from("processos_integracao")
    .update({
      arquivado: true,
      arquivado_em: new Date().toISOString(),
      arquivado_por: usuario,
    })
    .eq("id", processoId);

  revalidatePath("/onboarding");
}

// ------------------------------------------------------------
// Configurações (Configurações → Processo de Integração)
// ------------------------------------------------------------

export async function atualizarEtapaConfig(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id")!;

  await supabase
    .from("etapas_config")
    .update({
      nome: str(formData, "nome"),
      responsavel: str(formData, "responsavel"),
      ordem: numOuNull(formData, "ordem") ?? 0,
      prazo_dias: numOuNull(formData, "prazo_dias"),
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id);

  revalidatePath("/configuracoes/integracao");
}

export async function criarEtapaConfig(formData: FormData) {
  const supabase = createClient();

  const { data: max } = await supabase
    .from("etapas_config")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("etapas_config").insert({
    chave: `etapa_${Date.now()}`,
    nome: str(formData, "nome") ?? "Nova etapa",
    responsavel: str(formData, "responsavel") ?? "RH",
    ordem: (max?.ordem ?? 0) + 1,
    prazo_dias: numOuNull(formData, "prazo_dias"),
  });

  revalidatePath("/configuracoes/integracao");
}

export async function atualizarConfigGeral(formData: FormData) {
  const supabase = createClient();

  await supabase
    .from("config_integracao")
    .update({
      prazo_integracao_dias: numOuNull(formData, "prazo_integracao_dias") ?? 5,
      prazo_experiencia_dias: numOuNull(formData, "prazo_experiencia_dias") ?? 90,
      antecedencia_alerta_avaliacao_dias: numOuNull(formData, "antecedencia_alerta_avaliacao_dias") ?? 15,
      prazo_saida_painel_dias: numOuNull(formData, "prazo_saida_painel_dias") ?? 7,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  revalidatePath("/configuracoes/integracao");
}
