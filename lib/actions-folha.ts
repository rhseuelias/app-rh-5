"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const ROTA = "/departamento-pessoal/folha";

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

/** Garante que o mês (competência) existe na tabela da Folha — cria
 * sozinho, na hora, se ainda não existir (não precisa cadastrar o mês
 * antes de lançar nada). Retorna o id e se está fechado (histórico). */
async function garantirCompetencia(
  supabase: ReturnType<typeof createClient>,
  competencia: string
): Promise<{ id: string; fechado: boolean }> {
  const existente = await supabase
    .from("folha_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .maybeSingle();

  if (existente.data) return existente.data;

  const criado = await supabase
    .from("folha_competencias")
    .insert({ competencia })
    .select("id, fechado")
    .single();

  if (criado.data) return criado.data;

  // corrida rara (2 abas criando ao mesmo tempo) — tenta buscar de novo
  const retry = await supabase
    .from("folha_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .single();
  return retry.data!;
}

// ------------------------------------------------------------
// COMPETÊNCIA (mês) — fechar / reabrir
// ------------------------------------------------------------

export async function fecharCompetenciaFolha(competencia: string) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  await supabase.from("folha_competencias").update({ fechado: true }).eq("id", comp.id);
  revalidatePath(ROTA);
}

export async function reabrirCompetenciaFolha(competencia: string) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  await supabase.from("folha_competencias").update({ fechado: false }).eq("id", comp.id);
  revalidatePath(ROTA);
}

// ------------------------------------------------------------
// TIPOS (colunas da grade) — cadastro global
// ------------------------------------------------------------

export async function cadastrarTipoFolha(formData: FormData) {
  const supabase = createClient();
  const nome = str(formData, "nome")?.trim();
  const categoria = str(formData, "categoria");
  const formato = str(formData, "formato") === "texto" ? "texto" : "moeda";
  if (!nome) return;
  if (categoria !== "provento" && categoria !== "desconto" && categoria !== "espelhamento") return;

  const { data: maxOrdemData } = await supabase
    .from("folha_tipos")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const proximaOrdem = (maxOrdemData?.ordem ?? 0) + 1;

  await supabase.from("folha_tipos").insert({
    nome,
    categoria,
    formato,
    codigo: str(formData, "codigo"),
    ordem: proximaOrdem,
  });
  revalidatePath(ROTA);
}

export async function removerTipoFolha(id: string) {
  const supabase = createClient();
  // não apaga os lançamentos já feitos com essa coluna (ficam no
  // histórico) — só desativa, pra sumir da grade de novos lançamentos
  await supabase.from("folha_tipos").update({ ativo: false }).eq("id", id);
  revalidatePath(ROTA);
}

// ------------------------------------------------------------
// SALVAR TUDO — grava de uma vez todos os lançamentos e anotações que
// foram alterados na tela (um único botão "Salvar" no final da grade).
// ------------------------------------------------------------

export interface LancamentoFolhaInput {
  colaborador_id: string;
  tipo_id: string;
  valor: number;
  valor_texto: string | null;
}

export interface NotaFolhaInput {
  colaborador_id: string;
  nota: string | null;
}

export async function salvarFolhaLote(
  competencia: string,
  lancamentos: LancamentoFolhaInput[],
  notas: NotaFolhaInput[]
) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return { ok: false as const, motivo: "mes_fechado" as const };

  const agora = new Date().toISOString();

  if (lancamentos.length > 0) {
    const linhas = lancamentos.map((l) => ({
      competencia_id: comp.id,
      colaborador_id: l.colaborador_id,
      tipo_id: l.tipo_id,
      valor: l.valor,
      valor_texto: l.valor_texto,
      updated_at: agora,
    }));
    await supabase
      .from("folha_lancamentos")
      .upsert(linhas, { onConflict: "competencia_id,colaborador_id,tipo_id" });
  }

  if (notas.length > 0) {
    const linhasNotas = notas.map((n) => ({
      competencia_id: comp.id,
      colaborador_id: n.colaborador_id,
      nota: n.nota,
      updated_at: agora,
    }));
    await supabase
      .from("folha_notas")
      .upsert(linhasNotas, { onConflict: "competencia_id,colaborador_id" });
  }

  revalidatePath(ROTA);
  return { ok: true as const };
}
