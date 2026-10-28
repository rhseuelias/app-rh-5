"use server";

import { createClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { salvarColaborador } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";
import { exigirDentroDoPrazoDaAssistente } from "@/lib/acesso-assistente";

// Salva o colaborador do jeito de sempre (salvarColaborador) e, em seguida,
// grava a matrícula, que é um campo novo. Assim o arquivo lib/actions.ts não
// precisa ser alterado.
export async function salvarColaboradorComMatricula(formData: FormData): Promise<void> {
  const temCampoMatricula = formData.has("matricula");
  const matricula = String(formData.get("matricula") ?? "").trim();
  const id = String(formData.get("id") ?? "");
  const cpf = String(formData.get("cpf_cnpj") ?? "").trim();

  // assistente: depois de 10 dias da admissão não salva mais nada (nem a matrícula)
  await exigirDentroDoPrazoDaAssistente(id || null);

  let erro: unknown = null;
  let falhou = false;
  try {
    await salvarColaborador(formData);
  } catch (e) {
    falhou = true;
    erro = e;
  }

  // O redirecionamento do Next (depois de salvar) chega aqui como um "erro"
  // especial. Ele significa que salvou com sucesso.
  const digest =
    typeof erro === "object" && erro !== null && "digest" in erro
      ? String((erro as { digest?: unknown }).digest ?? "")
      : "";
  const salvouComSucesso = !falhou || digest.startsWith("NEXT_REDIRECT");

  if (salvouComSucesso && temCampoMatricula) {
    const supabase = createClient();
    const consulta = supabase.from("colaboradores").update({ matricula: matricula || null });
    if (id) {
      await consulta.eq("id", id);
    } else if (cpf) {
      // colaborador novo: ainda não tinha id, então acha pelo CPF recém-salvo
      await consulta.eq("cpf_cnpj", cpf);
    }
  }

  // "Recebe também em outra empresa": só grava se o formulário mandou a lista
  // (perfil assistente não vê esse bloco, então nunca apaga nada por engano).
  if (salvouComSucesso && formData.has("outras_empresas_json") && !(await souAssistente())) {
    await sincronizarOutrasEmpresas(formData, id, cpf);
  }

  if (falhou) throw erro;
}

async function sincronizarOutrasEmpresas(formData: FormData, id: string, cpf: string): Promise<void> {
  const supabase = createClient();

  let colaboradorId = id;
  if (!colaboradorId && cpf) {
    const { data } = await supabase.from("colaboradores").select("id").eq("cpf_cnpj", cpf).maybeSingle();
    colaboradorId = data?.id ?? "";
  }
  if (!colaboradorId) return;

  let lista: { empresa_id?: string; valor_mensal?: number | string }[] = [];
  try {
    const bruto = JSON.parse(String(formData.get("outras_empresas_json") ?? "[]"));
    if (Array.isArray(bruto)) lista = bruto;
  } catch {
    return;
  }

  const empresaPrincipal = String(formData.get("empresa_id") ?? "");
  const vistos = new Set<string>();
  const validas = lista
    .map((x) => ({ empresa_id: String(x.empresa_id ?? ""), valor_mensal: Number(x.valor_mensal) || 0 }))
    .filter((x) => {
      if (!x.empresa_id || x.empresa_id === empresaPrincipal || vistos.has(x.empresa_id)) return false;
      vistos.add(x.empresa_id);
      return true;
    });

  // Se a migration_036 ainda não foi rodada, os comandos abaixo só falham em silêncio.
  await supabase.from("colaborador_outras_empresas").delete().eq("colaborador_id", colaboradorId);
  if (validas.length > 0) {
    await supabase
      .from("colaborador_outras_empresas")
      .insert(validas.map((x) => ({ colaborador_id: colaboradorId, ...x })));
  }

  revalidatePath("/dashboard");
  revalidatePath("/colaboradores");
}
