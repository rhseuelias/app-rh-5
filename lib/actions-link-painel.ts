"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export interface RespostaLinkPainel {
  ok: boolean;
  token: string | null;
  /** null = o link mostra todos os colaboradores. */
  selecionados: string[] | null;
  mensagem: string;
}

async function exigirLogin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

const SEM_LOGIN: RespostaLinkPainel = { ok: false, token: null, selecionados: null, mensagem: "Entre no sistema para fazer isso." };
const ERRO_TABELA: RespostaLinkPainel = {
  ok: false,
  token: null,
  selecionados: null,
  mensagem: "Não consegui. Rode o arquivo migration_020_link_painel_integracao.sql no Supabase e tente de novo.",
};

function limpar(ids: string[] | null): string[] | null {
  if (!ids) return null;
  return Array.from(new Set(ids.filter((x) => typeof x === "string" && x.length > 0 && x.length < 80)));
}

/** Devolve o link ativo (se existir). */
export async function obterLinkPainel(): Promise<RespostaLinkPainel> {
  if (!(await exigirLogin())) return SEM_LOGIN;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("links_painel_integracao")
      .select("token, colaboradores_ids")
      .eq("ativo", true)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return ERRO_TABELA;
    return { ok: true, token: data?.token ?? null, selecionados: data?.colaboradores_ids ?? null, mensagem: "" };
  } catch {
    return ERRO_TABELA;
  }
}

/** Cria um link novo. O anterior (se houver) deixa de funcionar. */
export async function gerarLinkPainel(ids: string[] | null = null): Promise<RespostaLinkPainel> {
  const email = await exigirLogin();
  if (!email) return SEM_LOGIN;
  try {
    const admin = createAdminClient();
    const off = await admin.from("links_painel_integracao").update({ ativo: false }).eq("ativo", true);
    if (off.error) return ERRO_TABELA;
    const token = randomBytes(24).toString("hex");
    const { error } = await admin.from("links_painel_integracao").insert({ token, criado_por: email, colaboradores_ids: limpar(ids) });
    if (error) return ERRO_TABELA;
    return { ok: true, token, selecionados: limpar(ids), mensagem: "Link criado." };
  } catch {
    return ERRO_TABELA;
  }
}

/** Desliga o link: quem tiver o endereço deixa de conseguir abrir. */
export async function desativarLinkPainel(): Promise<RespostaLinkPainel> {
  if (!(await exigirLogin())) return SEM_LOGIN;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("links_painel_integracao").update({ ativo: false }).eq("ativo", true);
    if (error) return ERRO_TABELA;
    return { ok: true, token: null, selecionados: null, mensagem: "Link desativado." };
  } catch {
    return ERRO_TABELA;
  }
}

/** Muda quais colaboradores o link atual mostra (null = todos). O endereço continua o mesmo. */
export async function salvarSelecaoLinkPainel(ids: string[] | null): Promise<RespostaLinkPainel> {
  if (!(await exigirLogin())) return SEM_LOGIN;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("links_painel_integracao")
      .update({ colaboradores_ids: limpar(ids) })
      .eq("ativo", true);
    if (error)
      return { ...ERRO_TABELA, mensagem: "Não consegui salvar. Rode o arquivo migration_021_link_painel_selecao.sql no Supabase." };
    const atual = await obterLinkPainel();
    return { ...atual, mensagem: "Seleção salva." };
  } catch {
    return ERRO_TABELA;
  }
}
