"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { Colaborador, Unidade } from "@/types/db";

// ------------------------------------------------------------
// Área do RH (autenticado) — gera/renova o link que vai pro profissional PJ
// ------------------------------------------------------------

/** Gera (ou substitui, se já existir) o link de assinatura digital do
 * contrato de um colaborador PJ. Gerar um novo link invalida o antigo
 * automaticamente (o token antigo deixa de bater com nenhum colaborador) e
 * também zera uma assinatura anterior feita por esse link, caso precise
 * mandar de novo (ex.: depois de uma renovação de contrato). */
export async function gerarLinkAssinaturaPJ(colaboradorId: string) {
  const supabase = createClient();
  await supabase
    .from("colaboradores")
    .update({
      assinatura_pj_link_token: randomUUID(),
      assinatura_pj_link_criado_em: new Date().toISOString(),
      assinatura_pj_assinado_em: null,
    })
    .eq("id", colaboradorId);

  revalidatePath(`/colaboradores/${colaboradorId}`);
}

// ------------------------------------------------------------
// Fluxo público (sem login) — o token do link é a credencial, igual ao
// pré-cadastro de candidatos. Usa sempre o cliente admin, nunca o
// autenticado (o profissional PJ não tem conta no sistema).
// ------------------------------------------------------------

/** Busca o colaborador (e a unidade dele) pelo token do link de assinatura,
 * para a página pública que o profissional PJ abre. */
export async function buscarContratoParaAssinarPorToken(token: string) {
  const admin = createAdminClient();
  const { data: colaborador } = await admin
    .from("colaboradores")
    .select("*")
    .eq("assinatura_pj_link_token", token)
    .maybeSingle();
  if (!colaborador) return null;

  let unidade: Unidade | null = null;
  const c = colaborador as Colaborador;
  if (c.unidade_id) {
    const { data } = await admin.from("unidades").select("*").eq("id", c.unidade_id).maybeSingle();
    unidade = (data as Unidade) ?? null;
  }

  return { colaborador: c, unidade };
}

/** Recebido da página pública de assinatura — salva a assinatura desenhada
 * pelo profissional PJ (entra automaticamente em todas as páginas do
 * contrato) e marca o contrato como assinado, com data e hora. */
export async function assinarContratoPJ(formData: FormData) {
  const token = formData.get("token");
  if (!token || typeof token !== "string") throw new Error("Link inválido.");

  const admin = createAdminClient();
  const { data: colaborador } = await admin
    .from("colaboradores")
    .select("id, assinatura_pj_assinado_em")
    .eq("assinatura_pj_link_token", token)
    .maybeSingle();
  if (!colaborador) throw new Error("Link inválido ou expirado.");
  if (colaborador.assinatura_pj_assinado_em) {
    throw new Error("Este contrato já foi assinado. Peça um novo link ao RH se precisar assinar de novo.");
  }

  const arquivo = formData.get("assinatura") as File | null;
  if (!arquivo || arquivo.size === 0) {
    throw new Error("Desenhe sua assinatura antes de confirmar.");
  }

  const caminho = `assinaturas/colaboradores/${colaborador.id}/${Date.now()}-assinatura-digital.png`;
  const { error: erroUpload } = await admin.storage.from("documentos").upload(caminho, arquivo, {
    contentType: arquivo.type || "image/png",
    upsert: false,
  });
  if (erroUpload) throw new Error("Não foi possível salvar a assinatura. Tente novamente.");

  await admin
    .from("colaboradores")
    .update({
      assinatura_pj_path: caminho,
      assinatura_pj_assinado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", colaborador.id);

  redirect(`/assinar-contrato/${token}/assinado`);
}
