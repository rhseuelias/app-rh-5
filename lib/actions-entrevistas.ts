"use server";

import { createClient } from "@/lib/supabase-server";
import { EMPRESAS_SEL, type ChaveTabela } from "@/lib/entrevistas";

export type RespostaEnt = { ok: true; id?: string } | { ok: false; erro: string };

const TABELAS: Record<ChaveTabela, { tabela: string; colunas: string[] }> = {
  vagas: {
    tabela: "sel_vagas",
    colunas: ["cargo", "empresa", "unidade", "gestor", "status", "data_abertura", "observacoes"],
  },
  candidatos: {
    tabela: "sel_candidatos",
    colunas: [
      "vaga_id", "nome", "email", "telefone", "fonte", "etapa", "pretensao", "disponibilidade", "link_curriculo",
      "pontos_fortes", "pontos_atencao", "proxima_acao", "proxima_data", "responsavel", "consentimento",
    ],
  },
  entrevistas: {
    tabela: "sel_entrevistas",
    colunas: [
      "candidato_id", "etapa", "data", "hora", "tipo", "entrevistador", "status", "link_local", "resumo",
      "aprofundar", "recomendacao", "proxima_acao", "proxima_data",
    ],
  },
};

function mensagem(m: string): string {
  if (/does not exist|schema cache/i.test(m)) {
    return "Falta criar as tabelas no banco. Rode o arquivo migration_027_entrevistas.sql no Supabase (SQL Editor).";
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

/** Mantém só as colunas permitidas e troca texto vazio por null. */
function limpar(chave: ChaveTabela, campos: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const col of TABELAS[chave].colunas) {
    if (!(col in campos)) continue;
    const v = campos[col];
    saida[col] = typeof v === "string" && v.trim() === "" && col !== "etapa" && col !== "status" ? null : v;
  }
  return saida;
}

export async function criarRegistro(chave: ChaveTabela, campos: Record<string, unknown>): Promise<RespostaEnt> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!TABELAS[chave]) return { ok: false, erro: "Tabela inválida." };
  const dados = limpar(chave, campos);
  if (chave === "vagas") {
    if (!dados.cargo) return { ok: false, erro: "Informe o cargo." };
    if (!(EMPRESAS_SEL as readonly string[]).includes(String(dados.empresa))) return { ok: false, erro: "Escolha a empresa." };
    if (dados.empresa !== "BSE") dados.unidade = null;
  }
  if (chave === "candidatos" && (!dados.nome || !dados.vaga_id)) return { ok: false, erro: "Informe o nome e a vaga." };
  if (chave === "entrevistas" && (!dados.candidato_id || !dados.data)) return { ok: false, erro: "Escolha o candidato e a data." };

  const supabase = createClient();
  const { data, error } = await supabase.from(TABELAS[chave].tabela).insert(dados).select("id").single();
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true, id: data.id as string };
}

export async function atualizarRegistro(chave: ChaveTabela, id: string, campos: Record<string, unknown>): Promise<RespostaEnt> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!TABELAS[chave] || !id) return { ok: false, erro: "Registro inválido." };
  const dados = limpar(chave, campos);
  if (chave === "vagas" && dados.empresa && dados.empresa !== "BSE") dados.unidade = null;
  if (Object.keys(dados).length === 0) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase.from(TABELAS[chave].tabela).update(dados).eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true };
}

export async function excluirRegistro(chave: ChaveTabela, id: string): Promise<RespostaEnt> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!TABELAS[chave] || !id) return { ok: false, erro: "Registro inválido." };
  const supabase = createClient();
  const { error } = await supabase.from(TABELAS[chave].tabela).delete().eq("id", id);
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true };
}

export interface CamposAvaliacao {
  notas?: Record<string, number | null>;
  recomendacao?: string | null;
  evidencias?: string | null;
  risco?: string | null;
}

/** Cria ou atualiza a avaliação do candidato (uma por candidato). */
export async function salvarAvaliacao(candidatoId: string, campos: CamposAvaliacao): Promise<RespostaEnt> {
  if (!(await logado())) return { ok: false, erro: "Entre no sistema para fazer isso." };
  if (!candidatoId) return { ok: false, erro: "Candidato inválido." };
  const dados: Record<string, unknown> = { candidato_id: candidatoId, updated_at: new Date().toISOString() };
  if (campos.notas) {
    const notas: Record<string, number> = {};
    for (const [k, v] of Object.entries(campos.notas)) {
      if (typeof v === "number" && v >= 1 && v <= 5) notas[k] = Math.round(v);
    }
    dados.notas = notas;
  }
  for (const k of ["recomendacao", "evidencias", "risco"] as const) {
    if (k in campos) dados[k] = campos[k] && String(campos[k]).trim() !== "" ? campos[k] : null;
  }
  const supabase = createClient();
  const { error } = await supabase.from("sel_avaliacoes").upsert(dados, { onConflict: "candidato_id" });
  if (error) return { ok: false, erro: mensagem(error.message) };
  return { ok: true };
}
