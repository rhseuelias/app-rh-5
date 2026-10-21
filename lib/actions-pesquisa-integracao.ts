"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  ALFABETO_TOKEN,
  HORAS_VALIDADE_PESQUISA,
  TOKEN_PESQUISA_OK,
  TOTAL_PERGUNTAS,
  respostaValida,
} from "@/lib/pesquisa-integracao";

export interface EstadoPesquisa {
  token: string | null;
  status: "sem_link" | "aguardando" | "respondida" | "expirada";
  expira_em: string | null;
  respondida_em: string | null;
  nao_participou: boolean;
  respostas: (string | null)[];
  observacoes: string | null;
}

export interface RespostaPesquisaRH {
  ok: boolean;
  mensagem: string;
  estado?: EstadoPesquisa;
}

const FALTA_MIGRATION = "Não consegui. Rode o arquivo migration_042_pesquisa_integracao.sql no Supabase (SQL Editor) e tente de novo.";
const SEM_LOGIN: RespostaPesquisaRH = { ok: false, mensagem: "Entre no sistema para fazer isso." };

const VAZIO: EstadoPesquisa = {
  token: null,
  status: "sem_link",
  expira_em: null,
  respondida_em: null,
  nao_participou: false,
  respostas: [],
  observacoes: null,
};

type Linha = {
  token: string;
  expira_em: string;
  respondida_em: string | null;
  nao_participou: boolean;
  respostas: unknown;
  observacoes: string | null;
};

const COLUNAS = "token, expira_em, respondida_em, nao_participou, respostas, observacoes";

function paraEstado(l: Linha | null): EstadoPesquisa {
  if (!l) return VAZIO;
  const expirou = new Date(l.expira_em).getTime() < Date.now();
  return {
    token: l.token,
    status: l.respondida_em ? "respondida" : expirou ? "expirada" : "aguardando",
    expira_em: l.expira_em,
    respondida_em: l.respondida_em,
    nao_participou: l.nao_participou,
    respostas: Array.isArray(l.respostas) ? (l.respostas as (string | null)[]) : [],
    observacoes: l.observacoes,
  };
}

async function exigirLogin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

/** 12 letras e números sorteados pelo servidor (60 bits: impossível de adivinhar). */
function novoToken(): string {
  let t = "";
  for (const b of randomBytes(12)) t += ALFABETO_TOKEN[b % ALFABETO_TOKEN.length];
  return t;
}

const idOk = (id: string) => typeof id === "string" && id.length > 0 && id.length < 80;

// ---------------------------------------------------------------
// Lado do RH (precisa estar logado)
// ---------------------------------------------------------------

/** Mostra a situação da pesquisa de um colaborador (e as respostas, se já respondeu). */
export async function obterPesquisa(colaboradorId: string): Promise<RespostaPesquisaRH> {
  if (!(await exigirLogin())) return SEM_LOGIN;
  if (!idOk(colaboradorId)) return { ok: false, mensagem: "Colaborador inválido." };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("pesquisas_integracao").select(COLUNAS).eq("colaborador_id", colaboradorId).maybeSingle();
    if (error) return { ok: false, mensagem: FALTA_MIGRATION };
    return { ok: true, mensagem: "", estado: paraEstado(data as Linha | null) };
  } catch {
    return { ok: false, mensagem: "Não consegui abrir a pesquisa agora." };
  }
}

/**
 * Cria o link da pesquisa. Se já existe e não foi respondido, troca por um link novo (o antigo deixa de funcionar).
 * Se já foi respondido, só recomeça quando `refazer` for verdadeiro (apaga as respostas anteriores).
 */
export async function gerarLinkPesquisa(colaboradorId: string, refazer = false): Promise<RespostaPesquisaRH> {
  const email = await exigirLogin();
  if (!email) return SEM_LOGIN;
  if (!idOk(colaboradorId)) return { ok: false, mensagem: "Colaborador inválido." };
  try {
    const admin = createAdminClient();
    const { data: colab } = await admin.from("colaboradores").select("id").eq("id", colaboradorId).maybeSingle();
    if (!colab) return { ok: false, mensagem: "Colaborador não encontrado." };

    const { data: atual, error: erroLeitura } = await admin
      .from("pesquisas_integracao")
      .select(COLUNAS)
      .eq("colaborador_id", colaboradorId)
      .maybeSingle();
    if (erroLeitura) return { ok: false, mensagem: FALTA_MIGRATION };

    if (atual && (atual as Linha).respondida_em && !refazer) {
      return { ok: true, mensagem: "Esta pesquisa já foi respondida.", estado: paraEstado(atual as Linha) };
    }

    const expira = new Date(Date.now() + HORAS_VALIDADE_PESQUISA * 3600000).toISOString();
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const token = novoToken();
      const dados = {
        token,
        expira_em: expira,
        criado_em: new Date().toISOString(),
        criado_por: email,
        respondida_em: null,
        nao_participou: false,
        respostas: [],
        observacoes: null,
      };
      const r = atual
        ? await admin.from("pesquisas_integracao").update(dados).eq("colaborador_id", colaboradorId).select(COLUNAS).maybeSingle()
        : await admin.from("pesquisas_integracao").insert({ colaborador_id: colaboradorId, ...dados }).select(COLUNAS).maybeSingle();
      if (!r.error && r.data) {
        revalidatePath("/onboarding");
        return { ok: true, mensagem: "Link criado.", estado: paraEstado(r.data as Linha) };
      }
      // código repetido (muito raro): sorteia outro
      if (r.error && r.error.code !== "23505") return { ok: false, mensagem: FALTA_MIGRATION };
    }
    return { ok: false, mensagem: "Não consegui criar o link agora. Tente de novo." };
  } catch {
    return { ok: false, mensagem: "Não consegui criar o link agora." };
  }
}

/** Desliga o link: quem tiver o endereço deixa de conseguir abrir. */
export async function desativarLinkPesquisa(colaboradorId: string): Promise<RespostaPesquisaRH> {
  if (!(await exigirLogin())) return SEM_LOGIN;
  if (!idOk(colaboradorId)) return { ok: false, mensagem: "Colaborador inválido." };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pesquisas_integracao")
      .update({ expira_em: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId)
      .is("respondida_em", null)
      .select(COLUNAS)
      .maybeSingle();
    if (error) return { ok: false, mensagem: FALTA_MIGRATION };
    const atual = data ? (data as Linha) : (await admin.from("pesquisas_integracao").select(COLUNAS).eq("colaborador_id", colaboradorId).maybeSingle()).data;
    return { ok: true, mensagem: "Link desativado.", estado: paraEstado(atual as Linha | null) };
  } catch {
    return { ok: false, mensagem: "Não consegui desativar agora." };
  }
}

// ---------------------------------------------------------------
// Lado do colaborador (sem login: o código do link é a chave)
// ---------------------------------------------------------------

/**
 * Recebe as respostas. O link vale para UMA resposta: depois de enviar, não aceita outra.
 * `naoParticipou` = o colaborador confirmou que não participou do onboarding (a pesquisa termina na 1ª pergunta).
 */
export async function enviarPesquisaIntegracao(
  token: string,
  respostas: (string | null)[],
  observacoes: string,
  naoParticipou: boolean
): Promise<{ ok: boolean; mensagem: string }> {
  if (!TOKEN_PESQUISA_OK.test(token ?? "")) return { ok: false, mensagem: "Link inválido. Peça ao RH um link novo." };
  if (!Array.isArray(respostas) || respostas.length !== TOTAL_PERGUNTAS) return { ok: false, mensagem: "Responda todas as perguntas." };

  let final: (string | null)[];
  if (naoParticipou) {
    if (respostas[0] !== "Não") return { ok: false, mensagem: "Resposta inválida." };
    final = respostas.map((_, i) => (i === 0 ? "Não" : null));
  } else {
    for (let i = 0; i < TOTAL_PERGUNTAS; i++) {
      if (!respostaValida(i, respostas[i])) return { ok: false, mensagem: "Responda todas as perguntas." };
    }
    if (respostas[0] !== "Sim") return { ok: false, mensagem: "Resposta inválida." };
    final = respostas.slice();
  }
  const obs = naoParticipou ? "" : String(observacoes ?? "").trim().slice(0, 2000);

  try {
    const admin = createAdminClient();
    const { data: linha } = await admin
      .from("pesquisas_integracao")
      .select("id, expira_em, respondida_em")
      .eq("token", token)
      .maybeSingle();
    if (!linha) return { ok: false, mensagem: "Este link não funciona mais. Peça ao RH um link novo." };
    if (linha.respondida_em) return { ok: false, mensagem: "Você já respondeu esta pesquisa. Obrigado!" };
    if (new Date(linha.expira_em).getTime() < Date.now()) return { ok: false, mensagem: "O link expirou. Peça ao RH um link novo." };

    // só grava se ainda não foi respondida (evita duas respostas ao mesmo tempo)
    const { data: gravou, error } = await admin
      .from("pesquisas_integracao")
      .update({
        respostas: final,
        observacoes: obs || null,
        nao_participou: naoParticipou,
        respondida_em: new Date().toISOString(),
      })
      .eq("id", linha.id)
      .is("respondida_em", null)
      .select("id");
    if (error || !gravou || gravou.length === 0) return { ok: false, mensagem: "Não foi possível enviar agora. Tente de novo." };

    revalidatePath("/onboarding");
    return { ok: true, mensagem: "Respostas enviadas." };
  } catch {
    return { ok: false, mensagem: "Não foi possível enviar agora. Tente de novo." };
  }
}
