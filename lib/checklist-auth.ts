import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Login do Checklist de Fechamento (/checklist).
 *
 * Três papéis:
 *  - admin      → quem está logado no app RH (Supabase), exceto perfil "assistente"
 *  - supervisao → login e senha da supervisão (vê o relatório de todas as unidades)
 *  - agente     → login e senha da unidade (vê e preenche só a própria unidade)
 *
 * O login da Agente/supervisão vira um cookie assinado (httpOnly). A cada
 * pedido conferimos no banco se o acesso ainda existe e se a senha não mudou.
 */

export type Papel = "admin" | "supervisao" | "agente";
export type Sessao = { papel: Papel; unidadeId: string | null; nome: string; login: string };

const COOKIE = "cf_sessao";
const DIAS = 14;

function segredo(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return "cf1|" + s;
}

function normaliza(senha: string): string {
  return (senha ?? "").trim().toLowerCase();
}

export function normalizaLogin(login: string): string {
  return (login ?? "").trim().toLowerCase();
}

export function loginValido(login: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(login);
}

export function hashSenha(senha: string): string {
  const sal = randomBytes(16).toString("hex");
  const h = scryptSync(normaliza(senha), sal, 32).toString("hex");
  return `s1$${sal}$${h}`;
}

export function confereSenha(senha: string, guardado: string): boolean {
  const [v, sal, h] = (guardado ?? "").split("$");
  if (v !== "s1" || !sal || !h) return false;
  const calc = scryptSync(normaliza(senha), sal, 32);
  const esperado = Buffer.from(h, "hex");
  return calc.length === esperado.length && timingSafeEqual(calc, esperado);
}

function marca(senhaHash: string): string {
  return createHash("sha256").update(senhaHash).digest("hex").slice(0, 12);
}

function assina(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url");
}

export function criaToken(login: string, senhaHash: string): string {
  const corpo = Buffer.from(
    JSON.stringify({ l: login, v: marca(senhaHash), e: Date.now() + DIAS * 86400000 })
  ).toString("base64url");
  return corpo + "." + assina(corpo);
}

function leToken(token: string): { l: string; v: string } | null {
  const [corpo, sig] = (token ?? "").split(".");
  if (!corpo || !sig) return null;
  const esperado = assina(corpo);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (typeof d.l !== "string" || typeof d.v !== "string" || typeof d.e !== "number") return null;
    if (Date.now() > d.e) return null;
    return { l: d.l, v: d.v };
  } catch {
    return null;
  }
}

export function gravaCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 86400,
  });
}

export function apagaCookie() {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Quem está usando o checklist agora (ou null). */
export async function obterSessao(): Promise<Sessao | null> {
  // 1) RH logado no app → admin
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("perfis").select("papel").eq("id", user.id).single();
      if (data?.papel !== "assistente") {
        return { papel: "admin", unidadeId: null, nome: user.email ?? "RH", login: user.email ?? "rh" };
      }
    }
  } catch {
    // sem sessão do app RH: segue para o cookie do checklist
  }

  // 2) login do checklist
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const t = leToken(token);
  if (!t) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("checklist_acessos")
    .select("login, nome, papel, unidade_id, senha_hash, ativo")
    .eq("login", t.l)
    .maybeSingle();
  if (!data || !data.ativo || marca(data.senha_hash) !== t.v) return null;
  return {
    papel: data.papel as Papel,
    unidadeId: data.unidade_id ?? null,
    nome: data.nome ?? data.login,
    login: data.login,
  };
}

// ---- freio contra tentativa de adivinhar senha (por instância do servidor) ----
const falhas = new Map<string, { n: number; ate: number }>();

export function bloqueado(chave: string): number {
  const f = falhas.get(chave);
  if (!f) return 0;
  if (f.ate && Date.now() < f.ate) return Math.ceil((f.ate - Date.now()) / 1000);
  return 0;
}

export function registraFalha(chave: string) {
  const f = falhas.get(chave) ?? { n: 0, ate: 0 };
  f.n += 1;
  if (f.n >= 5) {
    f.n = 0;
    f.ate = Date.now() + 5 * 60 * 1000;
  }
  falhas.set(chave, f);
}

export function limpaFalhas(chave: string) {
  falhas.delete(chave);
}
