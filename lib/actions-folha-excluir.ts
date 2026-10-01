"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

export interface UsoTipoFolha {
  lancamentos: number; // quantos valores já foram lançados nessa coluna
  meses: number; // em quantos meses
  erro?: string;
}

type Resultado = { ok: boolean; erro?: string };

// Quantos valores lançados existem nessa coluna (mostrado antes de excluir).
export async function contarUsoTipoFolha(tipoId: string): Promise<UsoTipoFolha> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("folha_lancamentos")
    .select("competencia_id, valor, valor_texto")
    .eq("tipo_id", tipoId);

  if (error) return { lancamentos: 0, meses: 0, erro: error.message };

  const comValor = (data ?? []).filter(
    (l: { valor: number | null; valor_texto: string | null }) =>
      (l.valor ?? 0) !== 0 || (l.valor_texto ?? "").trim() !== ""
  );
  const meses = new Set(comValor.map((l: { competencia_id: string }) => l.competencia_id));
  return { lancamentos: comValor.length, meses: meses.size };
}

// Busca a coluna e confere se ela pode ser mexida.
async function buscarTipoEditavel(tipoId: string) {
  const supabase = createClient();
  const { data: tipo, error } = await supabase.from("folha_tipos").select("*").eq("id", tipoId).maybeSingle();

  if (error) return { erro: `Não foi possível ler a coluna: ${error.message}` } as const;
  if (!tipo) return { erro: "Coluna não encontrada (talvez já tenha sido excluída)." } as const;
  if (tipo.calculo_automatico === true) {
    return { erro: "Coluna calculada automaticamente pelo sistema: só dá para desligar." } as const;
  }
  return { tipo } as const;
}

// Exclui a coluna e tudo que depende dela (valores lançados, unidades
// escolhidas e marcações de evento concluído). Não dá para desfazer.
export async function excluirTipoFolha(tipoId: string): Promise<Resultado> {
  const achado = await buscarTipoEditavel(tipoId);
  if ("erro" in achado) return { ok: false, erro: achado.erro };

  const supabase = createClient();
  const etapas = [
    supabase.from("folha_lancamentos").delete().eq("tipo_id", tipoId),
    supabase.from("folha_tipos_grupos").delete().eq("tipo_id", tipoId),
    supabase.from("folha_eventos_concluidos").delete().eq("tipo_id", tipoId),
  ];
  for (const etapa of etapas) {
    const { error } = await etapa;
    if (error) return { ok: false, erro: `Não foi possível limpar os dados da coluna: ${error.message}` };
  }

  const { data: apagadas, error } = await supabase.from("folha_tipos").delete().eq("id", tipoId).select("id");
  if (error) return { ok: false, erro: `Não foi possível excluir a coluna: ${error.message}` };
  if (!apagadas || apagadas.length === 0) {
    return { ok: false, erro: "O banco não permitiu apagar esta coluna (sem permissão de exclusão)." };
  }

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true };
}

// Muda nome, categoria, código ou formato de uma coluna já cadastrada.
export async function editarTipoFolha(
  tipoId: string,
  dados: { nome: string; codigo: string; categoria: string; formato: string }
): Promise<Resultado> {
  const nome = dados.nome.trim();
  if (!nome) return { ok: false, erro: "Informe o nome da coluna." };
  if (!["provento", "desconto"].includes(dados.categoria)) return { ok: false, erro: "Categoria inválida." };
  if (!["moeda", "texto", "sim_nao"].includes(dados.formato)) return { ok: false, erro: "Formato inválido." };

  const achado = await buscarTipoEditavel(tipoId);
  if ("erro" in achado) return { ok: false, erro: achado.erro };

  const supabase = createClient();
  const { data: alteradas, error } = await supabase
    .from("folha_tipos")
    .update({
      nome,
      codigo: dados.codigo.trim() || null,
      categoria: dados.categoria,
      formato: dados.formato,
    })
    .eq("id", tipoId)
    .select("id");

  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
  if (!alteradas || alteradas.length === 0) {
    return { ok: false, erro: "O banco não permitiu alterar esta coluna (sem permissão)." };
  }

  revalidatePath("/departamento-pessoal/folha");
  return { ok: true };
}
