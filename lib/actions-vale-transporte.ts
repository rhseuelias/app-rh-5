"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { OPERADORAS, type OperadoraVT } from "@/lib/vale-transporte";
import { copiarDoMesAnteriorVT } from "@/lib/vt-copia-mes-anterior";

export type RespostaVT = { ok: true; aviso?: string } | { ok: false; erro: string };

const CAMINHO = "/departamento-pessoal/vale-transporte";

function mensagem(m: string): string {
  if (/does not exist|schema cache/i.test(m)) {
    return "Falta criar a tabela no banco. Rode o arquivo migration_022_vale_transporte.sql no Supabase.";
  }
  if (/row-level security|permission denied|policy/i.test(m)) return "O banco não permitiu salvar (falta permissão).";
  return m;
}

async function logado(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
const numeroValido = (n: unknown, max: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;

export interface NovaLinhaVT {
  competencia: string;
  colaboradorId: string;
  operadora: OperadoraVT;
  cartao: string;
  diaria: number;
  valorUnit: number;
  diasUteis: number;
  alimentacao?: number;
  premio?: number;
}

export async function criarLinhaVT(n: NovaLinhaVT): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!competenciaValida(n.competencia)) return { ok: false, erro: "Mês inválido." };
  if (!OPERADORAS.includes(n.operadora)) return { ok: false, erro: "Operadora inválida." };
  if (!n.colaboradorId) return { ok: false, erro: "Escolha o colaborador." };
  if (!numeroValido(n.diaria, 20) || !numeroValido(n.valorUnit, 1000) || !numeroValido(n.diasUteis, 31)) {
    return { ok: false, erro: "Confira os números (diária, valor e dias úteis)." };
  }
  const alimentacao = n.alimentacao ?? 0;
  const premio = n.premio ?? 0;
  if (!numeroValido(alimentacao, 100000) || !numeroValido(premio, 100000)) {
    return { ok: false, erro: "Confira os valores de alimentação e prêmio." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("vt_lancamentos").insert({
    competencia: n.competencia,
    colaborador_id: n.colaboradorId,
    operadora: n.operadora,
    cartao: n.cartao.trim() || null,
    diaria: n.diaria,
    valor_unit: n.valorUnit,
    dias_uteis: Math.round(n.diasUteis),
    alimentacao: n.operadora === "CAJU" ? alimentacao : 0,
    premio: n.operadora === "CAJU" ? premio : 0,
  });
  if (error) return { ok: false, erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export interface CamposLinhaVT {
  cartao?: string;
  diaria?: number;
  valor_unit?: number;
  dias_uteis?: number;
  saldo?: number;
  alimentacao?: number;
  premio?: number;
}

export async function salvarLinhaVT(id: string, campos: CamposLinhaVT): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  const atualizar: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (campos.cartao !== undefined) atualizar.cartao = campos.cartao.trim() || null;
  if (campos.diaria !== undefined) {
    if (!numeroValido(campos.diaria, 20)) return { ok: false, erro: "Diária inválida." };
    atualizar.diaria = campos.diaria;
  }
  if (campos.valor_unit !== undefined) {
    if (!numeroValido(campos.valor_unit, 1000)) return { ok: false, erro: "Valor inválido." };
    atualizar.valor_unit = campos.valor_unit;
  }
  if (campos.dias_uteis !== undefined) {
    if (!numeroValido(campos.dias_uteis, 31)) return { ok: false, erro: "Dias úteis inválidos." };
    atualizar.dias_uteis = Math.round(campos.dias_uteis);
  }
  if (campos.saldo !== undefined) {
    if (!numeroValido(campos.saldo, 100000)) return { ok: false, erro: "Saldo inválido." };
    atualizar.saldo = campos.saldo;
  }
  if (campos.alimentacao !== undefined) {
    if (!numeroValido(campos.alimentacao, 100000)) return { ok: false, erro: "Alimentação inválida." };
    atualizar.alimentacao = campos.alimentacao;
  }
  if (campos.premio !== undefined) {
    if (!numeroValido(campos.premio, 100000)) return { ok: false, erro: "Prêmio inválido." };
    atualizar.premio = campos.premio;
  }

  const supabase = createClient();
  const { error } = await supabase.from("vt_lancamentos").update(atualizar).eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function excluirLinhaVT(id: string): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  const supabase = createClient();
  const { error } = await supabase.from("vt_lancamentos").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Define os dias úteis de várias linhas de uma vez (todas as da unidade). */
export async function aplicarDiasUteisVT(ids: string[], dias: number): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!numeroValido(dias, 31)) return { ok: false, erro: "Dias úteis inválidos." };
  if (ids.length === 0) return { ok: false, erro: "Não há cartões para atualizar." };
  const supabase = createClient();
  const { error } = await supabase
    .from("vt_lancamentos")
    .update({ dias_uteis: Math.round(dias), updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, erro: mensagem(error.message) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Copia os cartões do mês anterior (sem o saldo) dos colaboradores da unidade, só os que faltam. */
export async function copiarMesAnteriorVT(competencia: string, colaboradorIds: string[]): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!competenciaValida(competencia)) return { ok: false, erro: "Mês inválido." };
  if (colaboradorIds.length === 0) return { ok: false, erro: "Não há colaboradores nesta unidade." };

  const r = await copiarDoMesAnteriorVT(createClient(), competencia, colaboradorIds);
  if (!r.ok) return { ok: false, erro: mensagem(r.erro) };
  if (r.copiados === 0) return { ok: true, aviso: "Não havia nada novo para copiar do mês anterior." };
  revalidatePath(CAMINHO);
  return { ok: true, aviso: `${r.copiados} cartão(ões) copiado(s). Atualize só os saldos.` };
}

/** Guarda os dias úteis do mês (um valor por mês, vale para todas as unidades). */
export async function salvarDiasMesVT(competencia: string, dias: number): Promise<RespostaVT> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!competenciaValida(competencia)) return { ok: false, erro: "Mês inválido." };
  if (!numeroValido(dias, 31) || dias <= 0) return { ok: false, erro: "Dias úteis inválidos." };
  const supabase = createClient();
  const { error } = await supabase
    .from("vt_config_mes")
    .upsert({ competencia, dias_uteis: Math.round(dias), updated_at: new Date().toISOString() }, { onConflict: "competencia" });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ok: false, erro: "Falta criar a tabela dos dias úteis no banco (migration 024)." };
    }
    return { ok: false, erro: mensagem(error.message) };
  }
  return { ok: true };
}
