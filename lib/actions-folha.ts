"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { calcularQuebraCaixa } from "@/lib/folha-calculos";

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
  const formatoBruto = str(formData, "formato");
  const formato = formatoBruto === "texto" || formatoBruto === "sim_nao" ? formatoBruto : "moeda";
  if (!nome) return;
  // Espelhamento saiu de uso — colunas novas só entram como provento ou desconto.
  if (categoria !== "provento" && categoria !== "desconto") return;

  const { data: maxOrdemData } = await supabase
    .from("folha_tipos")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const proximaOrdem = (maxOrdemData?.ordem ?? 0) + 1;

  const { data: novoTipo } = await supabase
    .from("folha_tipos")
    .insert({
      nome,
      categoria,
      formato,
      codigo: str(formData, "codigo"),
      ordem: proximaOrdem,
    })
    .select("id")
    .single();

  // se marcou unidades específicas na hora de cadastrar, já salva a
  // restrição; sem marcação nenhuma, a coluna vale pra todo mundo (padrão)
  const grupos = formData.getAll("grupos").map(String).filter(Boolean);
  if (novoTipo && grupos.length > 0) {
    await supabase.from("folha_tipos_grupos").insert(grupos.map((g) => ({ tipo_id: novoTipo.id, grupo: g })));
  }

  revalidatePath(ROTA);
}

export async function removerTipoFolha(id: string) {
  const supabase = createClient();
  // não apaga os lançamentos já feitos com essa coluna (ficam no
  // histórico) — só desativa, pra sumir da grade de novos lançamentos
  await supabase.from("folha_tipos").update({ ativo: false }).eq("id", id);
  revalidatePath(ROTA);
}

/** Define quais unidades/empresas usam uma coluna (tipo). Lista vazia =
 * volta a valer pra todo mundo (comportamento padrão). */
export async function salvarGruposTipo(tipoId: string, grupos: string[]) {
  const supabase = createClient();
  await supabase.from("folha_tipos_grupos").delete().eq("tipo_id", tipoId);
  if (grupos.length > 0) {
    await supabase.from("folha_tipos_grupos").insert(grupos.map((g) => ({ tipo_id: tipoId, grupo: g })));
  }
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

export interface LancamentoEventoInput {
  colaborador_id: string;
  valor: number;
  valor_texto: string | null;
}

export async function salvarEventoFolha(
  competencia: string,
  grupo: string,
  tipoId: string,
  lancamentos: LancamentoEventoInput[]
) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return { ok: false as const, motivo: "mes_fechado" as const };

  const { data: tipoRow } = await supabase
    .from("folha_tipos")
    .select("calculo_automatico")
    .eq("id", tipoId)
    .single();

  let linhas = lancamentos;

  if (tipoRow?.calculo_automatico) {
    const ids = lancamentos.map((l) => l.colaborador_id);
    const { data: colaboradoresData } = await supabase
      .from("colaboradores")
      .select("id, cargo, salario_base")
      .in("id", ids);
    const porId = new Map((colaboradoresData ?? []).map((c) => [c.id, c]));
    linhas = lancamentos.map((l) => {
      const c = porId.get(l.colaborador_id);
      return { ...l, valor: c ? calcularQuebraCaixa(c) : 0, valor_texto: null };
    });
  }

  const agora = new Date().toISOString();

  if (linhas.length > 0) {
    const rows = linhas.map((l) => ({
      competencia_id: comp.id,
      colaborador_id: l.colaborador_id,
      tipo_id: tipoId,
      valor: l.valor,
      valor_texto: l.valor_texto,
      updated_at: agora,
    }));
    await supabase
      .from("folha_lancamentos")
      .upsert(rows, { onConflict: "competencia_id,colaborador_id,tipo_id" });
  }

  await supabase.from("folha_eventos_concluidos").upsert(
    { competencia_id: comp.id, grupo, tipo_id: tipoId, concluido_em: agora },
    { onConflict: "competencia_id,grupo,tipo_id" }
  );

  revalidatePath(ROTA);
  return { ok: true as const, linhas };
}

/** Apaga o que foi lançado num evento (coluna) pra um grupo (unidade) —
 * some com os valores salvos dos colaboradores dele nesse evento e tira
 * a "concluído" de cima, pra poder lançar tudo de novo do zero. Usado
 * pelo botão "Limpar evento" quando alguém digitou algo errado e quer
 * refazer, em vez de corrigir célula por célula. */
export async function limparEventoFolha(competencia: string, grupo: string, tipoId: string, colaboradorIds: string[]) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return { ok: false as const, motivo: "mes_fechado" as const };

  if (colaboradorIds.length > 0) {
    await supabase
      .from("folha_lancamentos")
      .delete()
      .eq("competencia_id", comp.id)
      .eq("tipo_id", tipoId)
      .in("colaborador_id", colaboradorIds);
  }

  await supabase
    .from("folha_eventos_concluidos")
    .delete()
    .eq("competencia_id", comp.id)
    .eq("grupo", grupo)
    .eq("tipo_id", tipoId);

  revalidatePath(ROTA);
  return { ok: true as const };
}
