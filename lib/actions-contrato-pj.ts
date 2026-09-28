"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

/**
 * Sobe a assinatura do PRÓPRIO profissional PJ — essa é a única das 4 que
 * muda de colaborador pra colaborador. Fica guardada nele e entra
 * automaticamente em todo contrato emitido pra ele, até o dia que for
 * trocada por uma nova (basta subir de novo, a antiga é substituída).
 */
export async function salvarAssinaturaProfissionalPJ(formData: FormData) {
  const supabase = createClient();
  const colaboradorId = str(formData, "colaborador_id");
  if (!colaboradorId) throw new Error("Colaborador inválido.");

  const arquivo = formData.get("assinatura") as File | null;
  if (!arquivo || arquivo.size === 0) {
    throw new Error("Selecione uma imagem da assinatura antes de salvar.");
  }

  const caminho = `assinaturas/colaboradores/${colaboradorId}/${Date.now()}-${arquivo.name}`;
  const { error: erroUpload } = await supabase.storage.from("documentos").upload(caminho, arquivo, {
    contentType: arquivo.type || undefined,
    upsert: false,
  });
  if (erroUpload) throw erroUpload;

  await supabase
    .from("colaboradores")
    .update({ assinatura_pj_path: caminho, updated_at: new Date().toISOString() })
    .eq("id", colaboradorId);

  revalidatePath(`/colaboradores/${colaboradorId}`);
}

/**
 * Salva (ou substitui) as 3 assinaturas FIXAS que entram automaticamente em
 * todo contrato PJ emitido: Salão Parceiro e as 2 testemunhas. Cadastradas
 * uma única vez aqui — só precisa mexer de novo se uma dessas 3 pessoas
 * mudar. Cada campo é opcional: só sobe (e troca) o que vier preenchido no
 * formulário, o que não for enviado continua como estava.
 */
export async function salvarConfigAssinaturasPJ(formData: FormData) {
  const supabase = createClient();

  const { data: atual } = await supabase
    .from("config_assinaturas_pj")
    .select("id")
    .limit(1)
    .maybeSingle();

  async function subir(campo: string): Promise<string | null> {
    const arquivo = formData.get(campo) as File | null;
    if (!arquivo || arquivo.size === 0) return null;
    const caminho = `assinaturas/config/${campo}-${Date.now()}-${arquivo.name}`;
    const { error } = await supabase.storage.from("documentos").upload(caminho, arquivo, {
      contentType: arquivo.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return caminho;
  }

  const salao = await subir("assinatura_salao");
  const testemunha1 = await subir("assinatura_testemunha1");
  const testemunha2 = await subir("assinatura_testemunha2");

  if (!salao && !testemunha1 && !testemunha2) return; // nada enviado, nada a salvar

  const payload = {
    ...(salao ? { assinatura_salao_path: salao } : {}),
    ...(testemunha1 ? { assinatura_testemunha1_path: testemunha1 } : {}),
    ...(testemunha2 ? { assinatura_testemunha2_path: testemunha2 } : {}),
    updated_at: new Date().toISOString(),
  };

  if (atual) {
    await supabase.from("config_assinaturas_pj").update(payload).eq("id", atual.id);
  } else {
    await supabase.from("config_assinaturas_pj").insert(payload);
  }

  revalidatePath("/configuracoes/contrato-pj");
}
