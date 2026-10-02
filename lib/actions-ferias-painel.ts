"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  hojeEmBrasilia,
  mapaDeFeriados,
  somarDias,
  validarLancamento,
  valorFeriasEstimado,
} from "@/lib/ferias-regras";

export interface RespostaFerias {
  ok: boolean;
  mensagem: string;
}

export interface EntradaLancamento {
  colaboradorId: string;
  periodoId: string;
  /** preenchido ao remarcar um período que já existe */
  feriasId?: string | null;
  inicio: string;
  dias: number;
  abono: boolean;
  status: "planejada" | "aprovado";
}

function atualizarTelas() {
  revalidatePath("/ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
}

/** Lança (ou remarca) um período de férias. Valida as regras da CLT de novo no servidor. */
export async function lancarFeriasPainel(e: EntradaLancamento): Promise<RespostaFerias> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Você precisa entrar no sistema de novo." };

  if (!e.colaboradorId || !e.periodoId) {
    return { ok: false, mensagem: "Esse colaborador não tem período aquisitivo aberto." };
  }

  const [{ data: periodo }, { data: colaborador }, { data: feriadosBanco }, { data: existentes }] = await Promise.all([
    supabase.from("periodos_aquisitivos").select("id, colaborador_id, limite_concessao").eq("id", e.periodoId).single(),
    supabase.from("colaboradores").select("id, nome, salario_base, empresa_id").eq("id", e.colaboradorId).single(),
    supabase.from("feriados").select("data, nome"),
    supabase
      .from("ferias")
      .select("id, dias, data_inicio, data_fim")
      .eq("periodo_aquisitivo_id", e.periodoId)
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);

  if (!periodo || periodo.colaborador_id !== e.colaboradorId || !colaborador) {
    return { ok: false, mensagem: "Período aquisitivo não encontrado para esse colaborador." };
  }

  const lista = (existentes ?? []) as { id: string; dias: number; data_inicio: string; data_fim: string }[];
  const antigo = e.feriasId ? lista.find((f) => f.id === e.feriasId) : undefined;
  if (e.feriasId && !antigo) return { ok: false, mensagem: "Esse período de férias não existe mais." };

  const dias = Math.round(Number(e.dias) || 0);
  const v = validarLancamento({
    hoje: hojeEmBrasilia(),
    limite: periodo.limite_concessao ? String(periodo.limite_concessao).slice(0, 10) : null,
    feriados: mapaDeFeriados((feriadosBanco ?? []) as { data: string; nome: string }[]),
    outrosDias: lista.filter((f) => f.id !== e.feriasId).map((f) => f.dias),
    abono: !!e.abono,
    inicio: e.inicio,
    dias,
  });
  if (v.erros.length > 0) return { ok: false, mensagem: v.erros[0] };

  const dataFim = somarDias(e.inicio, dias - 1);
  const valor = valorFeriasEstimado(Number(colaborador.salario_base) || 0, dias);
  const primeiroNome = String(colaborador.nome).split(" ")[0];

  let idSalvo = e.feriasId ?? null;
  if (e.feriasId) {
    const { error } = await supabase
      .from("ferias")
      .update({
        data_inicio: e.inicio,
        data_fim: dataFim,
        dias,
        status: e.status,
        valor_estimado: valor,
      })
      .eq("id", e.feriasId);
    if (error) return { ok: false, mensagem: "Não consegui salvar a alteração. Tente de novo." };
  } else {
    const { data: novo, error } = await supabase
      .from("ferias")
      .insert({
        colaborador_id: e.colaboradorId,
        periodo_aquisitivo_id: e.periodoId,
        data_inicio: e.inicio,
        data_fim: dataFim,
        dias,
        vendeu_abono: false,
        status: e.status,
        simulacao: false,
        origem: "manual",
        valor_estimado: valor,
      })
      .select("id")
      .single();
    if (error || !novo) return { ok: false, mensagem: "Não consegui lançar as férias. Tente de novo." };
    idSalvo = novo.id as string;
  }

  // abono pecuniário: vale pro período aquisitivo inteiro, então só uma linha carrega a marca
  await supabase.from("ferias").update({ vendeu_abono: false }).eq("periodo_aquisitivo_id", e.periodoId);
  if (e.abono && idSalvo) await supabase.from("ferias").update({ vendeu_abono: true }).eq("id", idSalvo);

  // calendário geral: troca o evento antigo (se remarcou) pelo novo
  if (antigo) {
    await supabase
      .from("eventos_calendario")
      .delete()
      .eq("colaborador_id", e.colaboradorId)
      .eq("categoria", "ferias")
      .eq("data_inicio", String(antigo.data_inicio).slice(0, 10))
      .eq("data_fim", String(antigo.data_fim).slice(0, 10));
  }
  await supabase.from("eventos_calendario").insert({
    titulo: `Férias${e.status === "planejada" ? " (planejada)" : ""} — ${colaborador.nome}`,
    categoria: "ferias",
    data_inicio: e.inicio,
    data_fim: dataFim,
    colaborador_id: e.colaboradorId,
    empresa_id: colaborador.empresa_id ?? null,
  });

  atualizarTelas();
  return {
    ok: true,
    mensagem: `Férias de ${primeiroNome} ${e.feriasId ? "remarcadas" : "lançadas"}: ${e.inicio.slice(8, 10)}/${e.inicio.slice(5, 7)} a ${dataFim.slice(8, 10)}/${dataFim.slice(5, 7)}`,
  };
}

/** Exclui um período de férias (o calendário também é limpo). */
export async function excluirPeriodoFerias(feriasId: string): Promise<RespostaFerias> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Você precisa entrar no sistema de novo." };

  const { data: f } = await supabase
    .from("ferias")
    .select("id, colaborador_id, data_inicio, data_fim, status")
    .eq("id", feriasId)
    .single();
  if (!f) return { ok: false, mensagem: "Esse período de férias não existe mais." };
  if (f.status === "concluido") return { ok: false, mensagem: "Férias já concluídas não podem ser excluídas aqui." };

  const { error } = await supabase.from("ferias").delete().eq("id", feriasId);
  if (error) return { ok: false, mensagem: "Não consegui excluir. Tente de novo." };

  await supabase
    .from("eventos_calendario")
    .delete()
    .eq("colaborador_id", f.colaborador_id)
    .eq("categoria", "ferias")
    .eq("data_inicio", String(f.data_inicio).slice(0, 10))
    .eq("data_fim", String(f.data_fim).slice(0, 10));

  atualizarTelas();
  return { ok: true, mensagem: "Período excluído" };
}

/** Aprova todas as férias planejadas/solicitadas que ainda não terminaram. */
export async function aprovarFeriasColaborador(colaboradorId: string): Promise<RespostaFerias> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Você precisa entrar no sistema de novo." };

  const hoje = hojeEmBrasilia();
  const { data, error } = await supabase
    .from("ferias")
    .update({ status: "aprovado" })
    .eq("colaborador_id", colaboradorId)
    .in("status", ["planejada", "solicitado"])
    .eq("simulacao", false)
    .gte("data_fim", hoje)
    .select("id");
  if (error) return { ok: false, mensagem: "Não consegui aprovar. Tente de novo." };

  atualizarTelas();
  return { ok: true, mensagem: (data ?? []).length > 0 ? "Férias aprovadas" : "Nada para aprovar" };
}
