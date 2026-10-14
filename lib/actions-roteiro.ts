"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { montarRoteiro, normalizarResp, resumir, type RespRoteiro } from "@/lib/roteiro";
import { acharCargo, normalizarCargo, TOKEN_OK } from "@/lib/roteiro-dados";
import { RECOMENDACOES } from "@/lib/entrevistas";
import type { CargoDesc } from "@/lib/cargos";

export interface RespostaLinkSupervisor {
  ok: boolean;
  token?: string;
  expira?: string;
  mensagem: string;
}

const FALTA_MIGRATION = "Não consegui. Rode o arquivo migration_031_roteiro_entrevista.sql no Supabase (SQL Editor) e tente de novo.";

async function exigirLogin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

/** Cria (ou renova) o link do supervisor para uma entrevista. Vale por 7 dias. */
export async function gerarLinkSupervisor(entrevistaId: string): Promise<RespostaLinkSupervisor> {
  if (!(await exigirLogin())) return { ok: false, mensagem: "Entre no sistema para fazer isso." };
  if (!entrevistaId) return { ok: false, mensagem: "Entrevista inválida." };
  try {
    const admin = createAdminClient();
    const token = randomBytes(24).toString("hex");
    const expira = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error } = await admin
      .from("sel_entrevistas")
      .update({ token, token_expira: expira, respondida_em: null, respondida_por: null })
      .eq("id", entrevistaId);
    if (error) return { ok: false, mensagem: FALTA_MIGRATION };
    return { ok: true, token, expira, mensagem: "Link criado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível criar o link agora." };
  }
}

/** Desliga o link: quem tiver o endereço deixa de conseguir abrir. */
export async function desativarLinkSupervisor(entrevistaId: string): Promise<RespostaLinkSupervisor> {
  if (!(await exigirLogin())) return { ok: false, mensagem: "Entre no sistema para fazer isso." };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("sel_entrevistas").update({ token: null, token_expira: null }).eq("id", entrevistaId);
    if (error) return { ok: false, mensagem: FALTA_MIGRATION };
    return { ok: true, mensagem: "Link desativado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível desativar agora." };
  }
}

export interface EstadoEntrevista {
  ok: boolean;
  mensagem: string;
  dados?: {
    roteiro: unknown;
    nota_media: number | null;
    recomendacao: string | null;
    resumo: string | null;
    entrevistador: string | null;
    status: string;
    respondida_em: string | null;
    respondida_por: string | null;
    token: string | null;
    token_expira: string | null;
  };
}

/** Busca de novo a entrevista (para ver a resposta que o supervisor enviou). */
export async function atualizarEstadoEntrevista(entrevistaId: string): Promise<EstadoEntrevista> {
  if (!(await exigirLogin())) return { ok: false, mensagem: "Entre no sistema para fazer isso." };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sel_entrevistas")
    .select("roteiro, nota_media, recomendacao, resumo, entrevistador, status, respondida_em, respondida_por, token, token_expira")
    .eq("id", entrevistaId)
    .maybeSingle();
  if (error || !data) return { ok: false, mensagem: "Não consegui atualizar." };
  return { ok: true, mensagem: "", dados: data as NonNullable<EstadoEntrevista["dados"]> };
}

/** Chamada pelo supervisor, sem login: o token do link é a chave. */
export async function enviarRoteiroSupervisor(
  token: string,
  nome: string,
  roteiroEnviado: RespRoteiro,
  recomendacao: string | null,
): Promise<{ ok: boolean; mensagem: string }> {
  if (!TOKEN_OK.test(token)) return { ok: false, mensagem: "Link inválido." };
  const quem = (nome ?? "").trim().slice(0, 80);
  if (!quem) return { ok: false, mensagem: "Informe o seu nome para enviar." };
  const texto = JSON.stringify(roteiroEnviado ?? {});
  if (texto.length > 200000) return { ok: false, mensagem: "O conteúdo ficou grande demais." };
  const rec = recomendacao && (RECOMENDACOES as readonly string[]).includes(recomendacao) ? recomendacao : null;

  try {
    const admin = createAdminClient();
    const { data: ent } = await admin
      .from("sel_entrevistas")
      .select("id, candidato_id, etapa, token_expira, respondida_em, resumo, entrevistador")
      .eq("token", token)
      .maybeSingle();
    if (!ent) return { ok: false, mensagem: "Este link não funciona mais. Peça ao RH um link novo." };
    if (ent.respondida_em) return { ok: false, mensagem: "Esta entrevista já foi enviada ao RH." };
    if (!ent.token_expira || new Date(ent.token_expira).getTime() < Date.now()) return { ok: false, mensagem: "O link expirou. Peça ao RH um link novo." };

    // Recalcula a nota no servidor com o roteiro do cargo.
    const { data: cand } = await admin.from("sel_candidatos").select("vaga_id").eq("id", ent.candidato_id).maybeSingle();
    const { data: vaga } = cand ? await admin.from("sel_vagas").select("cargo, empresa").eq("id", cand.vaga_id).maybeSingle() : { data: null };
    let cargo: CargoDesc | null = null;
    if (vaga) {
      const { data: lista } = await admin.from("cargos_desc").select("*");
      cargo = acharCargo(((lista ?? []) as CargoDesc[]).map(normalizarCargo), vaga.cargo, vaga.empresa);
    }
    const resp = normalizarResp(roteiroEnviado);
    const nota = resumir(montarRoteiro(ent.etapa, cargo), resp).geral;

    const { error } = await admin
      .from("sel_entrevistas")
      .update({
        roteiro: resp,
        nota_media: nota,
        recomendacao: rec,
        resumo: ent.resumo ?? (resp.parecer ? resp.parecer : null),
        entrevistador: ent.entrevistador ?? quem,
        status: "Realizada",
        respondida_em: new Date().toISOString(),
        respondida_por: quem,
      })
      .eq("id", ent.id);
    if (error) return { ok: false, mensagem: "Não foi possível enviar agora. Tente de novo." };
    return { ok: true, mensagem: "Enviado ao RH." };
  } catch {
    return { ok: false, mensagem: "Não foi possível enviar agora. Tente de novo." };
  }
}

/** Salva rascunho do supervisor (sem encerrar o link). */
export async function salvarRascunhoSupervisor(token: string, roteiroEnviado: RespRoteiro): Promise<{ ok: boolean }> {
  if (!TOKEN_OK.test(token)) return { ok: false };
  const texto = JSON.stringify(roteiroEnviado ?? {});
  if (texto.length > 200000) return { ok: false };
  try {
    const admin = createAdminClient();
    const { data: ent } = await admin.from("sel_entrevistas").select("id, token_expira, respondida_em").eq("token", token).maybeSingle();
    if (!ent || ent.respondida_em || !ent.token_expira || new Date(ent.token_expira).getTime() < Date.now()) return { ok: false };
    const { error } = await admin.from("sel_entrevistas").update({ roteiro: normalizarResp(roteiroEnviado) }).eq("id", ent.id);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
