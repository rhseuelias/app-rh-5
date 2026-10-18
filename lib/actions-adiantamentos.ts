"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { montarLinhasAdiantamento } from "@/lib/adiantamentos";

export type RespostaAdiantamento = { ok: true } | { ok: false; erro: string };
export type RespostaGerarAdiantamentos = { ok: true; quantidade: number } | { ok: false; erro: string };

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

/**
 * Gera e SALVA os adiantamentos de um mês (competência "AAAA-MM").
 * Guarda nome, cargo, empresa, unidade, % e valor daquele momento. Se o mês já estava salvo, substitui.
 * Depois disso o relatório desse mês não muda mais, mesmo que o cadastro mude.
 */
export async function gerarAdiantamentosMes(competencia: string): Promise<RespostaGerarAdiantamentos> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { ok: false, erro: "Mês inválido." };

  const [empresasRes, unidadesRes, colaboradoresRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
  ]);
  if (colaboradoresRes.error) return { ok: false, erro: "Não foi possível carregar os colaboradores." };

  const empresaPorId = new Map(((empresasRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const linhas = montarLinhasAdiantamento((colaboradoresRes.data ?? []) as Colaborador[], empresaPorId, unidadePorId);
  if (linhas.length === 0) return { ok: false, erro: "Ninguém está marcado para receber adiantamento." };

  const apagar = await supabase.from("adiantamentos_mensais").delete().eq("competencia", competencia);
  if (apagar.error) {
    if (/does not exist|schema cache/i.test(apagar.error.message)) {
      return { ok: false, erro: "Falta rodar a migration_039_adiantamentos_mensais.sql no Supabase." };
    }
    return { ok: false, erro: apagar.error.message };
  }

  const registros = linhas.map((l) => ({
    competencia,
    colaborador_id: l.id,
    nome: l.nome,
    cargo: l.cargo,
    matricula: l.matricula,
    empresa: l.empresa,
    unidade: l.unidade,
    pct: l.pct,
    valor: l.valor,
  }));
  const inserir = await supabase.from("adiantamentos_mensais").insert(registros);
  if (inserir.error) return { ok: false, erro: inserir.error.message };

  revalidatePath("/departamento-pessoal/adiantamentos");
  revalidatePath("/departamento-pessoal/adiantamentos/relatorio");
  return { ok: true, quantidade: linhas.length };
}
