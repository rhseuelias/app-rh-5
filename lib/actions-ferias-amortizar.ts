"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { hojeEmBrasilia, validarAmortizacao, valorFeriasEstimado } from "@/lib/ferias-regras";

export interface RespostaAmortizar {
  ok: boolean;
  mensagem: string;
}

export interface EntradaAmortizar {
  colaboradorId: string;
  periodoId: string;
  /** preenchido ao editar um registro que já existe */
  feriasId?: string | null;
  inicio: string;
  fim: string;
  abono: boolean;
}

function atualizarTelas(colaboradorId: string) {
  revalidatePath("/ferias");
  revalidatePath("/previsao-ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  revalidatePath("/colaboradores");
  revalidatePath(`/colaboradores/${colaboradorId}`);
}

/**
 * Fecha o período aquisitivo ("gozado") quando não sobra saldo nem férias
 * pendentes nele; e reabre quando uma edição/exclusão devolveu saldo.
 */
async function ajustarStatusPeriodo(supabase: ReturnType<typeof createClient>, periodoId: string) {
  const [{ data: per }, { data: fs }] = await Promise.all([
    supabase.from("periodos_aquisitivos").select("id, status, fim").eq("id", periodoId).single(),
    supabase
      .from("ferias")
      .select("dias, status, vendeu_abono")
      .eq("periodo_aquisitivo_id", periodoId)
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);
  if (!per) return;
  const lista = (fs ?? []) as { dias: number; status: string; vendeu_abono: boolean }[];
  const saldo = 30 - lista.reduce((s, f) => s + f.dias, 0) - (lista.some((f) => f.vendeu_abono) ? 10 : 0);
  const pendentes = lista.filter((f) => f.status !== "concluido").length;
  if (saldo <= 0 && pendentes === 0) {
    if (per.status !== "gozado") await supabase.from("periodos_aquisitivos").update({ status: "gozado" }).eq("id", periodoId);
  } else if (per.status === "gozado") {
    const novo = String(per.fim).slice(0, 10) < hojeEmBrasilia() ? "vencido" : "aberto";
    await supabase.from("periodos_aquisitivos").update({ status: novo }).eq("id", periodoId);
  }
}

/** Registra (ou corrige) férias antigas que já foram tiradas, descontando do período aquisitivo escolhido. */
export async function amortizarFerias(e: EntradaAmortizar): Promise<RespostaAmortizar> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Você precisa entrar no sistema de novo." };
  if (!e.colaboradorId || !e.periodoId) return { ok: false, mensagem: "Escolha o colaborador e o período aquisitivo." };

  const [{ data: periodo }, { data: colaborador }, { data: feriasData }] = await Promise.all([
    supabase.from("periodos_aquisitivos").select("id, colaborador_id").eq("id", e.periodoId).single(),
    supabase.from("colaboradores").select("id, nome, salario_base, empresa_id").eq("id", e.colaboradorId).single(),
    supabase
      .from("ferias")
      .select("id, periodo_aquisitivo_id, dias, data_inicio, data_fim")
      .eq("colaborador_id", e.colaboradorId)
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);
  if (!periodo || periodo.colaborador_id !== e.colaboradorId || !colaborador) {
    return { ok: false, mensagem: "Período aquisitivo não encontrado para esse colaborador." };
  }

  const todas = (feriasData ?? []) as {
    id: string;
    periodo_aquisitivo_id: string | null;
    dias: number;
    data_inicio: string;
    data_fim: string;
  }[];
  const antigo = e.feriasId ? todas.find((f) => f.id === e.feriasId) : undefined;
  if (e.feriasId && !antigo) return { ok: false, mensagem: "Esse registro de férias não existe mais." };

  const v = validarAmortizacao({
    hoje: hojeEmBrasilia(),
    inicio: e.inicio,
    fim: e.fim,
    outrosDias: todas.filter((f) => f.periodo_aquisitivo_id === e.periodoId && f.id !== e.feriasId).map((f) => f.dias),
    abono: !!e.abono,
    outros: todas
      .filter((f) => f.id !== e.feriasId)
      .map((f) => ({ i: String(f.data_inicio).slice(0, 10), f: String(f.data_fim).slice(0, 10) })),
  });
  if (v.erros.length > 0) return { ok: false, mensagem: v.erros[0] };

  const valor = valorFeriasEstimado(Number(colaborador.salario_base) || 0, v.dias);
  let idSalvo = e.feriasId ?? null;
  if (e.feriasId) {
    const { error } = await supabase
      .from("ferias")
      .update({
        periodo_aquisitivo_id: e.periodoId,
        data_inicio: e.inicio,
        data_fim: e.fim,
        dias: v.dias,
        status: "concluido",
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
        data_fim: e.fim,
        dias: v.dias,
        vendeu_abono: false,
        status: "concluido",
        simulacao: false,
        origem: "manual",
        valor_estimado: valor,
      })
      .select("id")
      .single();
    if (error || !novo) return { ok: false, mensagem: "Não consegui registrar as férias. Tente de novo." };
    idSalvo = novo.id as string;
  }

  // abono pecuniário vale pro período aquisitivo inteiro: só uma linha carrega a marca
  await supabase.from("ferias").update({ vendeu_abono: false }).eq("periodo_aquisitivo_id", e.periodoId);
  if (e.abono && idSalvo) await supabase.from("ferias").update({ vendeu_abono: true }).eq("id", idSalvo);

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
    titulo: `Férias — ${colaborador.nome}`,
    categoria: "ferias",
    data_inicio: e.inicio,
    data_fim: e.fim,
    colaborador_id: e.colaboradorId,
    empresa_id: colaborador.empresa_id ?? null,
  });

  await ajustarStatusPeriodo(supabase, e.periodoId);
  if (antigo?.periodo_aquisitivo_id && antigo.periodo_aquisitivo_id !== e.periodoId) {
    await ajustarStatusPeriodo(supabase, antigo.periodo_aquisitivo_id);
  }

  atualizarTelas(e.colaboradorId);
  return {
    ok: true,
    mensagem: `Férias de ${String(colaborador.nome).split(" ")[0]} ${e.feriasId ? "corrigidas" : "registradas"}: ${v.dias} dia${v.dias !== 1 ? "s" : ""}`,
  };
}

/** Exclui um registro de férias antigas (já tiradas) e devolve os dias ao saldo do período. */
export async function excluirFeriasAmortizada(feriasId: string): Promise<RespostaAmortizar> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Você precisa entrar no sistema de novo." };

  const { data: f } = await supabase
    .from("ferias")
    .select("id, colaborador_id, periodo_aquisitivo_id, data_inicio, data_fim")
    .eq("id", feriasId)
    .single();
  if (!f) return { ok: false, mensagem: "Esse registro de férias não existe mais." };
  if (String(f.data_fim).slice(0, 10) >= hojeEmBrasilia()) {
    return { ok: false, mensagem: "Só dá para excluir aqui férias que já passaram. As futuras são removidas pelo mapa." };
  }

  const { error } = await supabase.from("ferias").delete().eq("id", feriasId);
  if (error) return { ok: false, mensagem: "Não consegui excluir. Tente de novo." };

  await supabase
    .from("eventos_calendario")
    .delete()
    .eq("colaborador_id", f.colaborador_id)
    .eq("categoria", "ferias")
    .eq("data_inicio", String(f.data_inicio).slice(0, 10))
    .eq("data_fim", String(f.data_fim).slice(0, 10));

  if (f.periodo_aquisitivo_id) await ajustarStatusPeriodo(supabase, f.periodo_aquisitivo_id as string);

  atualizarTelas(f.colaborador_id as string);
  return { ok: true, mensagem: "Registro excluído. Os dias voltaram para o saldo." };
}
