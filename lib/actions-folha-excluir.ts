"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export interface UsoTipoFolha {
  lancamentos: number; // quantos valores já foram lançados nessa coluna
  meses: number; // em quantos meses
}

// Quantos valores lançados existem nessa coluna (mostrado antes de excluir).
export async function contarUsoTipoFolha(tipoId: string): Promise<UsoTipoFolha> {
  const supabase = createClient();
  const { data } = await supabase
    .from("folha_lancamentos")
    .select("competencia_id, valor, valor_texto")
    .eq("tipo_id", tipoId);

  const comValor = (data ?? []).filter(
    (l: { valor: number | null; valor_texto: string | null }) =>
      (l.valor ?? 0) !== 0 || (l.valor_texto ?? "").trim() !== ""
  );
  const meses = new Set(comValor.map((l: { competencia_id: string }) => l.competencia_id));
  return { lancamentos: comValor.length, meses: meses.size };
}

// Exclui a coluna e tudo que depende dela (valores lançados, unidades
// escolhidas e marcações de evento concluído). Não dá para desfazer.
export async function excluirTipoFolha(tipoId: string): Promise<{ ok: boolean; erro?: string }> {
  const supabase = createClient();

  const { data: tipo } = await supabase
    .from("folha_tipos")
    .select("id, nome, calculo_automatico")
    .eq("id", tipoId)
    .maybeSingle();

  if (!tipo) return { ok: false, erro: "Coluna não encontrada (talvez já tenha sido excluída)." };
  if (tipo.calculo_automatico) {
    return { ok: false, erro: "Coluna calculada automaticamente pelo sistema: só dá para desligar, não excluir." };
  }

  const etapas = [
    supabase.from("folha_lancamentos").delete().eq("tipo_id", tipoId),
    supabase.from("folha_tipos_grupos").delete().eq("tipo_id", tipoId),
    supabase.from("folha_eventos_concluidos").delete().eq("tipo_id", tipoId),
  ];
  for (const etapa of etapas) {
    const { error } = await etapa;
    if (error) return { ok: false, erro: `Não foi possível limpar os dados da coluna: ${error.message}` };
  }

  const { error } = await supabase.from("folha_tipos").delete().eq("id", tipoId);
  if (error) return { ok: false, erro: `Não foi possível excluir a coluna: ${error.message}` };

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true };
}
