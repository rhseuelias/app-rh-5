"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { calcularPrazos, dataValida, diasDeAviso, hojeBrasilia, type TipoAviso } from "@/lib/desligamento";

export type RespostaDesligamento = { ok: true } | { ok: false; erro: string };

function mensagem(m: string): string {
  if (/does not exist|schema cache/i.test(m)) {
    return "Falta criar a tabela no banco. Rode o arquivo migration_025_desligamento_avisos.sql no Supabase.";
  }
  if (/row-level security|permission denied|policy/i.test(m)) return "O banco não permitiu salvar (falta permissão).";
  return m;
}

async function podeUsar(): Promise<RespostaDesligamento | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (await souAssistente()) return { ok: false, erro: "Esta parte é só para o RH." };
  return null;
}

function atualizarTelas(colaboradorId: string) {
  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/dashboard");
}

export interface EntradaDesligamento {
  colaboradorId: string;
  tipoAviso: TipoAviso;
  dataComunicacao: string;
  diasAviso: number | null;
  homologacaoNecessaria: boolean;
  homologacaoData: string | null;
  homologacaoHora: string | null;
  homologacaoLocal: string | null;
  observacao: string | null;
}

export async function salvarDesligamento(e: EntradaDesligamento): Promise<RespostaDesligamento> {
  const bloqueio = await podeUsar();
  if (bloqueio) return bloqueio;

  if (!["trabalhado", "indenizado", "acordo"].includes(e.tipoAviso)) return { ok: false, erro: "Escolha o tipo." };
  if (!dataValida(e.dataComunicacao)) return { ok: false, erro: "Confira a data da comunicação." };
  if (e.homologacaoNecessaria && e.homologacaoData && !dataValida(e.homologacaoData)) {
    return { ok: false, erro: "Confira a data da homologação." };
  }

  const supabase = createClient();
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("data_admissao")
    .eq("id", e.colaboradorId)
    .maybeSingle();
  if (!colab) return { ok: false, erro: "Colaborador não encontrado." };

  let dias: number | null = null;
  if (e.tipoAviso === "trabalhado") {
    dias = e.diasAviso ?? diasDeAviso((colab as { data_admissao: string | null }).data_admissao, e.dataComunicacao);
    if (!Number.isInteger(dias) || dias < 1 || dias > 90) {
      return { ok: false, erro: "Os dias do aviso devem ficar entre 1 e 90." };
    }
  }
  const { ultimoDia, prazoPagamento } = calcularPrazos(e.tipoAviso, e.dataComunicacao, dias);

  const { error } = await supabase.from("desligamentos").upsert(
    {
      colaborador_id: e.colaboradorId,
      tipo_aviso: e.tipoAviso,
      data_comunicacao: e.dataComunicacao,
      dias_aviso: dias,
      ultimo_dia: ultimoDia,
      prazo_pagamento: prazoPagamento,
      homologacao_necessaria: e.homologacaoNecessaria,
      homologacao_data: e.homologacaoNecessaria ? e.homologacaoData || null : null,
      homologacao_hora: e.homologacaoNecessaria ? e.homologacaoHora?.trim() || null : null,
      homologacao_local: e.homologacaoNecessaria ? e.homologacaoLocal?.trim() || null : null,
      observacao: e.observacao?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "colaborador_id" }
  );
  if (error) return { ok: false, erro: mensagem(error.message) };
  atualizarTelas(e.colaboradorId);
  return { ok: true };
}

/** Marca (ou desmarca) o pagamento das verbas. */
export async function marcarPagamento(colaboradorId: string, pago: boolean): Promise<RespostaDesligamento> {
  const bloqueio = await podeUsar();
  if (bloqueio) return bloqueio;
  const supabase = createClient();
  const { error } = await supabase
    .from("desligamentos")
    .update({ pago_em: pago ? hojeBrasilia() : null, updated_at: new Date().toISOString() })
    .eq("colaborador_id", colaboradorId);
  if (error) return { ok: false, erro: mensagem(error.message) };
  atualizarTelas(colaboradorId);
  return { ok: true };
}

/** Marca (ou desmarca) a homologação como realizada. */
export async function marcarHomologacao(colaboradorId: string, feita: boolean): Promise<RespostaDesligamento> {
  const bloqueio = await podeUsar();
  if (bloqueio) return bloqueio;
  const supabase = createClient();
  const { error } = await supabase
    .from("desligamentos")
    .update({ homologacao_feita_em: feita ? hojeBrasilia() : null, updated_at: new Date().toISOString() })
    .eq("colaborador_id", colaboradorId);
  if (error) return { ok: false, erro: mensagem(error.message) };
  atualizarTelas(colaboradorId);
  return { ok: true };
}

export async function removerDesligamento(colaboradorId: string): Promise<RespostaDesligamento> {
  const bloqueio = await podeUsar();
  if (bloqueio) return bloqueio;
  const supabase = createClient();
  const { error } = await supabase.from("desligamentos").delete().eq("colaborador_id", colaboradorId);
  if (error) return { ok: false, erro: mensagem(error.message) };
  atualizarTelas(colaboradorId);
  return { ok: true };
}
