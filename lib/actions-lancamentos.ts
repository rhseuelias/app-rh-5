"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

type Resultado = { ok: true; aviso?: string } | { ok: false; erro: string };
type ResultadoId = { ok: true; id: string } | { ok: false; erro: string };

const CATEGORIAS = ["provento", "desconto"];
const FORMATOS = ["moeda", "texto", "sim_nao"];

function mensagem(m: string): string {
  if (/row-level security|permission denied|policy/i.test(m)) return "O banco não permitiu salvar (falta permissão na tabela).";
  if (/does not exist|schema cache/i.test(m)) return "Falta criar uma tabela no banco de dados (erro: " + m + ").";
  return m;
}

// "1.446,33" ou "1446.33" -> 1446.33 (null = texto inválido)
function lerValor(texto: string): number | null {
  const t = texto.replace(/[R$\s]/g, "");
  if (t === "") return 0;
  if (!/^-?[\d.,]+$/.test(t)) return null;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

async function competenciaAberta(competencia: string): Promise<{ id: string } | { erro: string }> {
  const supabase = createClient();
  const { data: comp, error } = await supabase
    .from("folha_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .maybeSingle();
  if (error) return { erro: mensagem(error.message) };
  if (comp?.fechado) return { erro: "Esse mês está fechado — reabra o mês pra poder editar." };
  if (comp) return { id: comp.id as string };

  const { data: nova, error: erroNova } = await supabase
    .from("folha_competencias")
    .insert({ competencia })
    .select("id")
    .single();
  if (erroNova || !nova) return { erro: mensagem(erroNova?.message ?? "não foi possível criar o mês") };
  return { id: nova.id as string };
}

// ---------------------------------------------------------------------------
// Lançamentos (uma célula por vez)
// ---------------------------------------------------------------------------
export async function salvarCelulaLancamento(
  competencia: string,
  colaboradorId: string,
  tipoId: string,
  formato: string,
  texto: string
): Promise<Resultado> {
  if (!FORMATOS.includes(formato)) return { ok: false, erro: "Formato de coluna inválido." };

  let valor = 0;
  let valorTexto: string | null = null;
  if (formato === "moeda") {
    const n = lerValor(texto);
    if (n === null) return { ok: false, erro: "Valor inválido. Use números, como 1.250,00." };
    valor = n;
  } else if (formato === "sim_nao") {
    valorTexto = texto.trim().toUpperCase() === "SIM" ? "SIM" : null;
  } else {
    valorTexto = texto.trim() === "" ? null : texto.trim();
  }
  const vazio = formato === "moeda" ? valor === 0 : valorTexto === null;

  const comp = await competenciaAberta(competencia);
  if ("erro" in comp) return { ok: false, erro: comp.erro };

  const supabase = createClient();
  const { data: existente, error: erroBusca } = await supabase
    .from("folha_lancamentos")
    .select("id")
    .eq("competencia_id", comp.id)
    .eq("colaborador_id", colaboradorId)
    .eq("tipo_id", tipoId)
    .limit(1);
  if (erroBusca) return { ok: false, erro: mensagem(erroBusca.message) };
  const id = existente && existente.length > 0 ? (existente[0].id as string) : null;

  if (vazio) {
    if (id) {
      const { error } = await supabase.from("folha_lancamentos").delete().eq("id", id);
      if (error) return { ok: false, erro: mensagem(error.message) };
    }
    return { ok: true };
  }

  if (id) {
    const { error } = await supabase
      .from("folha_lancamentos")
      .update({ valor, valor_texto: valorTexto, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, erro: mensagem(error.message) };
  } else {
    const { error } = await supabase.from("folha_lancamentos").insert({
      competencia_id: comp.id,
      colaborador_id: colaboradorId,
      tipo_id: tipoId,
      valor,
      valor_texto: valorTexto,
    });
    if (error) return { ok: false, erro: mensagem(error.message) };
  }
  return { ok: true };
}

// Observação de ponto: por funcionário e por mês (a antiga coluna PONTO).
export async function salvarPontoLancamento(competencia: string, colaboradorId: string, texto: string): Promise<Resultado> {
  const comp = await competenciaAberta(competencia);
  if ("erro" in comp) return { ok: false, erro: comp.erro };

  const supabase = createClient();
  const nota = texto.trim() === "" ? null : texto.trim();
  const { data: existente, error: erroBusca } = await supabase
    .from("folha_notas")
    .select("id")
    .eq("competencia_id", comp.id)
    .eq("colaborador_id", colaboradorId)
    .limit(1);
  if (erroBusca) return { ok: false, erro: mensagem(erroBusca.message) };

  if (existente && existente.length > 0) {
    const { error } = await supabase
      .from("folha_notas")
      .update({ nota, updated_at: new Date().toISOString() })
      .eq("id", existente[0].id);
    if (error) return { ok: false, erro: mensagem(error.message) };
  } else {
    // sem linha no mês: grava mesmo se vier vazio — é assim que "apagar" uma observação herdada
    // de um mês anterior interrompe a herança nos meses seguintes
    const { error } = await supabase
      .from("folha_notas")
      .insert({ competencia_id: comp.id, colaborador_id: colaboradorId, nota });
    if (error) return { ok: false, erro: mensagem(error.message) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Colunas (rubricas)
// ---------------------------------------------------------------------------
function atualizarTelas() {
  revalidatePath("/departamento-pessoal/lancamentos");
  revalidatePath("/departamento-pessoal/folha");
}

export async function criarColunaFolha(dados: {
  nome: string;
  codigo: string;
  categoria: string;
  formato: string;
}): Promise<ResultadoId> {
  const nome = dados.nome.trim().toUpperCase();
  if (!nome) return { ok: false, erro: "Dê um nome para a coluna." };
  if (!CATEGORIAS.includes(dados.categoria)) return { ok: false, erro: "Grupo inválido." };
  if (!FORMATOS.includes(dados.formato)) return { ok: false, erro: "Forma de preenchimento inválida." };

  const supabase = createClient();
  const { data: ultimo } = await supabase.from("folha_tipos").select("ordem").order("ordem", { ascending: false }).limit(1);
  const ordem = ((ultimo && ultimo[0]?.ordem) as number | undefined) ?? 0;

  const { data, error } = await supabase
    .from("folha_tipos")
    .insert({
      nome,
      codigo: dados.codigo.trim() || null,
      categoria: dados.categoria,
      formato: dados.formato,
      ordem: ordem + 1,
      ativo: true,
      calculo_automatico: false,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: mensagem(error?.message ?? "não foi possível criar a coluna") };

  atualizarTelas();
  return { ok: true, id: data.id as string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function colunaEditavel(tipoId: string): Promise<{ erro: string | null; tipo: any }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("folha_tipos").select("*").eq("id", tipoId).maybeSingle();
  if (error) return { erro: mensagem(error.message), tipo: null };
  if (!data) return { erro: "Coluna não encontrada (talvez já tenha sido excluída).", tipo: null };
  if (data.calculo_automatico === true) {
    return {
      erro: "Coluna calculada automaticamente pelo sistema: não dá para editar nem excluir, só ligar ou desligar.",
      tipo: null,
    };
  }
  return { erro: null, tipo: data };
}

export async function editarColunaFolha(
  tipoId: string,
  dados: { nome: string; codigo: string; categoria: string; formato: string }
): Promise<Resultado> {
  const nome = dados.nome.trim().toUpperCase();
  if (!nome) return { ok: false, erro: "Dê um nome para a coluna." };
  if (!CATEGORIAS.includes(dados.categoria)) return { ok: false, erro: "Grupo inválido." };
  if (!FORMATOS.includes(dados.formato)) return { ok: false, erro: "Forma de preenchimento inválida." };

  const achado = await colunaEditavel(tipoId);
  if (achado.erro) return { ok: false, erro: achado.erro };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("folha_tipos")
    .update({ nome, codigo: dados.codigo.trim() || null, categoria: dados.categoria, formato: dados.formato })
    .eq("id", tipoId)
    .select("id");
  if (error) return { ok: false, erro: mensagem(error.message) };
  if (!data || data.length === 0) return { ok: false, erro: "O banco não permitiu alterar esta coluna (sem permissão)." };

  atualizarTelas();
  const mudouFormato = achado.tipo.formato !== dados.formato;
  return {
    ok: true,
    aviso: mudouFormato
      ? "A forma de preenchimento mudou: valores já lançados continuam salvos, mas podem aparecer vazios."
      : undefined,
  };
}

export async function contarUsoColunaFolha(tipoId: string): Promise<{ lancamentos: number; meses: number; erro?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("folha_lancamentos")
    .select("competencia_id, valor, valor_texto")
    .eq("tipo_id", tipoId);
  if (error) return { lancamentos: 0, meses: 0, erro: mensagem(error.message) };
  const comValor = (data ?? []).filter(
    (l: { valor: number | null; valor_texto: string | null }) => (l.valor ?? 0) !== 0 || (l.valor_texto ?? "").trim() !== ""
  );
  const meses = new Set(comValor.map((l: { competencia_id: string }) => l.competencia_id));
  return { lancamentos: comValor.length, meses: meses.size };
}

export async function excluirColunaFolha(tipoId: string): Promise<Resultado> {
  const achado = await colunaEditavel(tipoId);
  if (achado.erro) return { ok: false, erro: achado.erro };

  const supabase = createClient();
  for (const tabela of ["folha_lancamentos", "folha_tipos_grupos", "folha_eventos_concluidos"]) {
    const { error } = await supabase.from(tabela).delete().eq("tipo_id", tipoId);
    if (error) return { ok: false, erro: `Não foi possível limpar a coluna (${tabela}): ${mensagem(error.message)}` };
  }
  const { data, error } = await supabase.from("folha_tipos").delete().eq("id", tipoId).select("id");
  if (error) return { ok: false, erro: mensagem(error.message) };
  if (!data || data.length === 0) return { ok: false, erro: "O banco não permitiu apagar esta coluna (sem permissão)." };

  atualizarTelas();
  return { ok: true };
}

// Troca a posição da coluna com a vizinha do mesmo grupo (-1 = sobe, 1 = desce).
export async function moverColunaFolha(tipoId: string, direcao: number): Promise<Resultado> {
  const supabase = createClient();
  const { data, error } = await supabase.from("folha_tipos").select("id, categoria, ordem, created_at");
  if (error || !data) return { ok: false, erro: mensagem(error?.message ?? "não foi possível ler as colunas") };

  type Linha = { id: string; categoria: string; ordem: number; created_at: string };
  const todas = (data as Linha[]).slice().sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const alvo = todas.find((t) => t.id === tipoId);
  if (!alvo) return { ok: false, erro: "Coluna não encontrada." };

  const doGrupo = todas.filter((t) => t.categoria === alvo.categoria);
  const pos = doGrupo.findIndex((t) => t.id === tipoId);
  const vizinha = doGrupo[pos + direcao];
  if (!vizinha) return { ok: true }; // já está na ponta

  const i1 = todas.findIndex((t) => t.id === alvo.id);
  const i2 = todas.findIndex((t) => t.id === vizinha.id);
  [todas[i1], todas[i2]] = [todas[i2], todas[i1]];

  for (let i = 0; i < todas.length; i++) {
    const nova = i + 1;
    if (todas[i].ordem !== nova) {
      const { error: e } = await supabase.from("folha_tipos").update({ ordem: nova }).eq("id", todas[i].id);
      if (e) return { ok: false, erro: mensagem(e.message) };
    }
  }
  atualizarTelas();
  return { ok: true };
}

// Liga ou desliga uma coluna: desligada, ela some da planilha, mas os valores
// já lançados continuam guardados.
export async function alternarColunaFolha(tipoId: string, ativar: boolean): Promise<Resultado> {
  const supabase = createClient();
  const { data, error } = await supabase.from("folha_tipos").update({ ativo: ativar }).eq("id", tipoId).select("id");
  if (error) return { ok: false, erro: mensagem(error.message) };
  if (!data || data.length === 0) return { ok: false, erro: "O banco não permitiu alterar esta coluna (sem permissão)." };
  atualizarTelas();
  return { ok: true };
}
