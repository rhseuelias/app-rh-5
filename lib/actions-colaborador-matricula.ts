"use server";

import { createClient } from "@/lib/supabase-server";
import { salvarColaborador } from "@/lib/actions";

// Salva o colaborador do jeito de sempre (salvarColaborador) e, em seguida,
// grava a matrícula, que é um campo novo. Assim o arquivo lib/actions.ts não
// precisa ser alterado.
export async function salvarColaboradorComMatricula(formData: FormData): Promise<void> {
  const temCampoMatricula = formData.has("matricula");
  const matricula = String(formData.get("matricula") ?? "").trim();
  const id = String(formData.get("id") ?? "");
  const cpf = String(formData.get("cpf_cnpj") ?? "").trim();

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

  if (falhou) throw erro;
}
