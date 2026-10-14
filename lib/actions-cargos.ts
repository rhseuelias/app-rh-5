"use server";

import { createClient } from "@/lib/supabase-server";
import { EMPRESAS_SEL } from "@/lib/entrevistas";
import { CAMPOS_CARGO } from "@/lib/cargos";

export type RespostaCargo = { ok: true; id?: string } | { ok: false; erro: string };

async function logado(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

function limpar(campos: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const col of CAMPOS_CARGO) {
    if (!(col in campos)) continue;
    const v = campos[col];
    saida[col] = typeof v === "string" && v.trim() === "" && col !== "cargo" ? null : v;
  }
  return saida;
}

function mensagem(m: string): string {
  if (/does not exist|schema cache/i.test(m)) return "Falta criar a tabela no banco. Rode o arquivo migration_030_cargos.sql no Supabase (SQL Editor).";
  if (/row-level security|permission denied|policy/i.test(m)) return "O banco não permitiu salvar (falta permissão).";
  return m;
}

export async function criarCargo(campos: Record<string, unknown>): Promise<RespostaCargo> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  const dados = limpar(campos);
  if (!dados.cargo) return { ok: false, erro: "Informe o nome do cargo." };
  if (!(EMPRESAS_SEL as readonly string[]).includes(String(dados.empresa))) return { ok: false, erro: "Escolha a empresa." };
  const supabase = createClient();
  const { data, error } = await supabase.from("cargos_desc").insert(dados).select("id").single();
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true, id: data.id as string };
}

export async function salvarCargo(id: string, campos: Record<string, unknown>): Promise<RespostaCargo> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!id) return { ok: false, erro: "Cargo inválido." };
  const dados = limpar(campos);
  if (dados.cargo === null || dados.cargo === "") return { ok: false, erro: "Informe o nome do cargo." };
  const supabase = createClient();
  const { error } = await supabase.from("cargos_desc").update({ ...dados, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true };
}

export async function excluirCargo(id: string): Promise<RespostaCargo> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!id) return { ok: false, erro: "Cargo inválido." };
  const supabase = createClient();
  const { error } = await supabase.from("cargos_desc").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true };
}
