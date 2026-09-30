"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export interface ObservacaoUnidade {
  id: string;
  grupo: string; // nome da unidade (o mesmo rótulo usado nos lançamentos)
  texto: string;
  created_at: string;
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

const LIMITE = 1000;

function traduzirErro(mensagem: string | undefined): string {
  const m = mensagem ?? "erro desconhecido";
  if (/does not exist|relation|schema cache/i.test(m)) {
    return "A tabela de observações ainda não foi criada no Supabase. Rode o arquivo de criação da tabela e tente de novo.";
  }
  return `Não foi possível salvar: ${m}`;
}

// As observações pertencem à UNIDADE (não ao mês): ficam salvas e continuam
// aparecendo nos meses seguintes até alguém excluir.
export async function adicionarObservacaoUnidade(grupo: string, texto: string): Promise<Resultado<ObservacaoUnidade>> {
  const limpo = texto.trim();
  if (!grupo) return { ok: false, erro: "Unidade não informada." };
  if (!limpo) return { ok: false, erro: "Escreva a observação antes de salvar." };
  if (limpo.length > LIMITE) return { ok: false, erro: `Texto muito longo (máximo ${LIMITE} caracteres).` };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("folha_observacoes_unidade")
    .insert({ grupo, texto: limpo })
    .select("*")
    .single();
  if (error || !data) return { ok: false, erro: traduzirErro(error?.message) };

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true, dados: data as ObservacaoUnidade };
}

export async function editarObservacaoUnidade(id: string, texto: string): Promise<Resultado<ObservacaoUnidade>> {
  const limpo = texto.trim();
  if (!id) return { ok: false, erro: "Observação não encontrada." };
  if (!limpo) return { ok: false, erro: "A observação não pode ficar vazia. Para apagar, use Excluir." };
  if (limpo.length > LIMITE) return { ok: false, erro: `Texto muito longo (máximo ${LIMITE} caracteres).` };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("folha_observacoes_unidade")
    .update({ texto: limpo, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  if (!data) return { ok: false, erro: "Observação não encontrada (talvez já tenha sido excluída)." };

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true, dados: data as ObservacaoUnidade };
}

export async function excluirObservacaoUnidade(id: string): Promise<Resultado<null>> {
  if (!id) return { ok: false, erro: "Observação não encontrada." };

  const supabase = createClient();
  const { data, error } = await supabase.from("folha_observacoes_unidade").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  if (!data || data.length === 0) return { ok: false, erro: "Observação não encontrada (talvez já tenha sido excluída)." };

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true, dados: null };
}
