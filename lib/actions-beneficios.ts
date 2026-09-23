"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const ROTA = "/departamento-pessoal/beneficios";

function num(formData: FormData, campo: string): number {
  const v = formData.get(campo);
  if (!v || v === "") return 0;
  return Number(v);
}

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

/** Garante que o mês (competência) existe na tabela — cria sozinho, na hora,
 * se ainda não existir (não precisa cadastrar o mês antes de lançar nada).
 * Retorna o id e se está fechado (histórico). */
async function garantirCompetencia(
  supabase: ReturnType<typeof createClient>,
  competencia: string
): Promise<{ id: string; fechado: boolean }> {
  const existente = await supabase
    .from("beneficios_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .maybeSingle();

  if (existente.data) return existente.data;

  const criado = await supabase
    .from("beneficios_competencias")
    .insert({ competencia })
    .select("id, fechado")
    .single();

  if (criado.data) return criado.data;

  // corrida rara (2 abas criando ao mesmo tempo) — tenta buscar de novo
  const retry = await supabase
    .from("beneficios_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .single();
  return retry.data!;
}

// ------------------------------------------------------------
// TIPOS DE TRANSPORTE (cadastro por empresa)
// ------------------------------------------------------------

export async function cadastrarTipoTransporte(formData: FormData) {
  const supabase = createClient();
  const empresaId = str(formData, "empresa_id");
  const nome = str(formData, "nome")?.trim().toUpperCase();
  if (!empresaId || !nome) return;

  await supabase.from("beneficios_tipos_transporte").insert({ empresa_id: empresaId, nome, taxa_adm: 0 });
  revalidatePath(ROTA);
}

export async function atualizarTaxaTipoTransporte(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  if (!id) return;

  await supabase.from("beneficios_tipos_transporte").update({ taxa_adm: num(formData, "taxa_adm") }).eq("id", id);
  revalidatePath(ROTA);
}

export async function removerTipoTransporte(id: string) {
  const supabase = createClient();
  // não apaga os lançamentos já feitos com esse tipo (ficam como histórico,
  // só o cadastro do tipo some da lista de opções pra novos lançamentos)
  await supabase.from("beneficios_tipos_transporte").delete().eq("id", id);
  revalidatePath(ROTA);
}

// ------------------------------------------------------------
// COMPETÊNCIA (mês) — fechar / reabrir
// ------------------------------------------------------------

export async function fecharCompetencia(competencia: string) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  await supabase.from("beneficios_competencias").update({ fechado: true }).eq("id", comp.id);
  revalidatePath(ROTA);
}

export async function reabrirCompetencia(competencia: string) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  await supabase.from("beneficios_competencias").update({ fechado: false }).eq("id", comp.id);
  revalidatePath(ROTA);
}

// ------------------------------------------------------------
// LANÇAMENTOS DE TRANSPORTE
// ------------------------------------------------------------

/** Cria ou atualiza 1 linha de transporte de 1 colaborador. Se vier "id",
 * atualiza essa linha; senão cria uma linha nova (permite o mesmo
 * colaborador ter várias linhas, do mesmo tipo ou de tipos diferentes). */
export async function salvarTransporte(formData: FormData) {
  const supabase = createClient();
  const competencia = str(formData, "competencia");
  if (!competencia) return;

  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return; // mês fechado (histórico) — não deixa editar

  const id = str(formData, "id");
  const payload = {
    competencia_id: comp.id,
    colaborador_id: str(formData, "colaborador_id"),
    tipo: str(formData, "tipo"),
    modo: str(formData, "modo") === "viagens" ? "viagens" : "km",
    km: num(formData, "km"),
    valor_km: num(formData, "valor_km"),
    viagens_dia: num(formData, "viagens_dia"),
    valor_viagem: num(formData, "valor_viagem"),
    dias_uteis: num(formData, "dias_uteis"),
    numero_cartao: str(formData, "numero_cartao"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("beneficios_transporte").update(payload).eq("id", id);
  } else {
    await supabase.from("beneficios_transporte").insert(payload);
  }
  revalidatePath(ROTA);
}

export async function removerTransporte(id: string, competencia: string) {
  const supabase = createClient();
  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return;

  await supabase.from("beneficios_transporte").delete().eq("id", id);
  revalidatePath(ROTA);
}

// ------------------------------------------------------------
// ALIMENTAÇÃO, PRÊMIO E OUTROS (bloco CAJU)
// ------------------------------------------------------------

export async function salvarExtras(formData: FormData) {
  const supabase = createClient();
  const competencia = str(formData, "competencia");
  const colaboradorId = str(formData, "colaborador_id");
  if (!competencia || !colaboradorId) return;

  const comp = await garantirCompetencia(supabase, competencia);
  if (comp.fechado) return;

  await supabase.from("beneficios_extras").upsert(
    {
      competencia_id: comp.id,
      colaborador_id: colaboradorId,
      alimentacao: num(formData, "alimentacao"),
      premio: num(formData, "premio"),
      outros_descricao: str(formData, "outros_descricao"),
      outros_valor: num(formData, "outros_valor"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "competencia_id,colaborador_id" }
  );
  revalidatePath(ROTA);
}
