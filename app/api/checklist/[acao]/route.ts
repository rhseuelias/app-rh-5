import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  obterSessao,
  confereSenha,
  hashSenha,
  criaToken,
  gravaCookie,
  apagaCookie,
  normalizaLogin,
  loginValido,
  bloqueado,
  registraFalha,
  limpaFalhas,
} from "@/lib/checklist-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Unidade = { id: string; name: string; groups: unknown[]; ops?: unknown[] };

function erro(msg: string, status: number) {
  return NextResponse.json({ erro: msg }, { status });
}

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
function hojeBR(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function somaDias(d: string, n: number): string {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function limpaUnidades(entrada: unknown): Unidade[] | null {
  if (!Array.isArray(entrada) || entrada.length > 40) return null;
  const ids = new Set<string>();
  const saida: Unidade[] = [];
  for (const u of entrada) {
    if (!u || typeof u !== "object") return null;
    const o = u as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || o.id.length > 40 || ids.has(o.id)) return null;
    if (typeof o.name !== "string" || o.name.length > 80) return null;
    if (!Array.isArray(o.groups)) return null;
    ids.add(o.id);
    saida.push({
      id: o.id,
      name: o.name.trim(),
      groups: o.groups,
      ops: Array.isArray(o.ops) ? o.ops : [],
    });
  }
  return saida;
}

async function lerUnidades(): Promise<Unidade[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("checklist_config").select("units").eq("id", "main").maybeSingle();
  return Array.isArray(data?.units) ? (data!.units as Unidade[]) : [];
}

async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- GET dados
export async function GET(_req: Request, { params }: { params: { acao: string } }) {
  if (params.acao !== "dados") return erro("Não encontrado.", 404);
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ me: null });

  const admin = createAdminClient();
  let units = await lerUnidades();
  if (sessao.papel === "agente") units = units.filter((u) => u.id === sessao.unidadeId);

  const desde = somaDias(hojeBR(), -60);
  let q = admin
    .from("checklist_relatorios")
    .select("doc")
    .gte("data", desde)
    .order("data", { ascending: false })
    .limit(400);
  if (sessao.papel === "agente") q = q.eq("unidade_id", sessao.unidadeId ?? "");
  const { data: rel } = await q;

  const resposta: Record<string, unknown> = {
    me: { papel: sessao.papel, unidadeId: sessao.unidadeId, nome: sessao.nome },
    units,
    relatorios: (rel ?? []).map((r: { doc: unknown }) => r.doc),
    hoje: hojeBR(),
  };

  if (sessao.papel === "admin") {
    const { data: acc } = await admin
      .from("checklist_acessos")
      .select("login, nome, papel, unidade_id");
    const lista = (acc ?? []) as { login: string; nome: string | null; papel: string; unidade_id: string | null }[];
    const sup = lista.find((a) => a.papel === "supervisao");
    resposta.acessos = {
      agentes: lista
        .filter((a) => a.papel === "agente")
        .map((a) => ({ unidade_id: a.unidade_id, login: a.login })),
      supervisao: sup ? { login: sup.login, nome: sup.nome ?? "" } : null,
    };
  }
  return NextResponse.json(resposta);
}

// ---------------------------------------------------------------- POST
export async function POST(req: Request, { params }: { params: { acao: string } }) {
  const admin = createAdminClient();

  if (params.acao === "entrar") {
    const corpo = await lerCorpo(req);
    const login = normalizaLogin(String(corpo?.login ?? ""));
    const senha = String(corpo?.senha ?? "");
    if (!login || !senha) return erro("Digite o login e a senha.", 400);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
    const chave = ip + "|" + login;
    const espera = bloqueado(chave);
    if (espera) return erro(`Muitas tentativas. Espere ${Math.ceil(espera / 60)} minuto(s).`, 429);

    const { data } = await admin
      .from("checklist_acessos")
      .select("login, senha_hash, ativo")
      .eq("login", login)
      .maybeSingle();
    if (!data || !data.ativo || !confereSenha(senha, data.senha_hash)) {
      registraFalha(chave);
      return erro("Login ou senha incorretos.", 401);
    }
    limpaFalhas(chave);
    gravaCookie(criaToken(data.login, data.senha_hash));
    return NextResponse.json({ ok: true });
  }

  if (params.acao === "sair") {
    apagaCookie();
    return NextResponse.json({ ok: true });
  }

  if (params.acao === "relatorio") {
    const sessao = await obterSessao();
    if (!sessao || sessao.papel === "supervisao") return erro("Sem permissão para enviar.", 403);
    const corpo = await lerCorpo(req);
    const doc = corpo?.doc as Record<string, unknown> | undefined;
    if (!doc || typeof doc !== "object") return erro("Relatório inválido.", 400);
    const unitId = doc.unitId;
    const data = doc.date;
    if (typeof unitId !== "string" || !unitId || unitId.length > 40) return erro("Unidade inválida.", 400);
    if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Data inválida.", 400);
    if (JSON.stringify(doc).length > 300000) return erro("Relatório grande demais.", 413);

    if (sessao.papel === "agente") {
      if (unitId !== sessao.unidadeId) return erro("Você só pode enviar a sua unidade.", 403);
      const hoje = hojeBR();
      if (data < somaDias(hoje, -7) || data > somaDias(hoje, 1)) {
        return erro("Essa data está fora do prazo para envio.", 400);
      }
    }
    const unidade = (await lerUnidades()).find((u) => u.id === unitId);
    if (!unidade) return erro("Unidade não encontrada.", 404);

    const agora = new Date().toISOString();
    const final = { ...doc, unitName: unidade.name, submittedAt: agora };
    const { error } = await admin.from("checklist_relatorios").upsert({
      id: `${unitId}_${data}`,
      unidade_id: unitId,
      data,
      doc: final,
      enviado_em: agora,
    });
    if (error) return erro("Não consegui gravar o relatório.", 500);
    return NextResponse.json({ ok: true, submittedAt: agora });
  }

  return erro("Não encontrado.", 404);
}

// ---------------------------------------------------------------- PUT config
type EntradaAcesso = { unidade_id?: unknown; login?: unknown; senha?: unknown };

export async function PUT(req: Request, { params }: { params: { acao: string } }) {
  if (params.acao !== "config") return erro("Não encontrado.", 404);
  const sessao = await obterSessao();
  if (!sessao || sessao.papel !== "admin") return erro("Só o RH pode alterar.", 403);

  const corpo = await lerCorpo(req);
  const units = limpaUnidades(corpo?.units);
  if (!units) return erro("Unidades inválidas.", 400);
  if (JSON.stringify(units).length > 400000) return erro("Configuração grande demais.", 413);

  const admin = createAdminClient();
  const { error: e1 } = await admin
    .from("checklist_config")
    .upsert({ id: "main", units, atualizado_em: new Date().toISOString() });
  if (e1) return erro("Não consegui salvar as unidades.", 500);

  const avisos: string[] = [];
  const ids = new Set(units.map((u) => u.id));
  const nomeDe = new Map(units.map((u) => [u.id, u.name] as [string, string]));
  const { data: atuaisBrutos } = await admin
    .from("checklist_acessos")
    .select("id, login, papel, unidade_id");
  const atuais = (atuaisBrutos ?? []) as { id: string; login: string; papel: string; unidade_id: string | null }[];

  async function salvaAcesso(
    existente: { id: string; login: string } | undefined,
    novo: { login: string; senha: string; papel: "agente" | "supervisao"; unidade_id: string | null; nome: string },
    rotulo: string
  ) {
    const login = normalizaLogin(novo.login);
    const senha = novo.senha.trim();
    if (!login && !existente) return;
    if (login && !loginValido(login)) {
      avisos.push(`${rotulo}: login inválido. Use de 3 a 40 letras minúsculas, números, ponto, hífen ou _.`);
      return;
    }
    if (senha && senha.length < 4) {
      avisos.push(`${rotulo}: a senha precisa ter pelo menos 4 caracteres.`);
      return;
    }
    if (existente) {
      const mudancas: Record<string, unknown> = { nome: novo.nome };
      if (login && login !== existente.login) mudancas.login = login;
      if (senha) mudancas.senha_hash = hashSenha(senha);
      const { error } = await admin.from("checklist_acessos").update(mudancas).eq("id", existente.id);
      if (error) {
        avisos.push(
          error.code === "23505" ? `${rotulo}: esse login já está em uso.` : `${rotulo}: não consegui salvar o login.`
        );
      }
      return;
    }
    if (!senha) {
      avisos.push(`${rotulo}: defina uma senha para criar o acesso.`);
      return;
    }
    const { error } = await admin.from("checklist_acessos").insert({
      login,
      nome: novo.nome,
      papel: novo.papel,
      unidade_id: novo.unidade_id,
      senha_hash: hashSenha(senha),
      ativo: true,
    });
    if (error) {
      avisos.push(
        error.code === "23505" ? `${rotulo}: esse login já está em uso.` : `${rotulo}: não consegui criar o acesso.`
      );
    }
  }

  // Agentes (um login por unidade)
  const entradas = Array.isArray(corpo?.acessos) ? (corpo!.acessos as EntradaAcesso[]) : [];
  for (const a of entradas) {
    const uid = typeof a.unidade_id === "string" ? a.unidade_id : "";
    if (!ids.has(uid)) continue;
    const existente = atuais.find((x) => x.papel === "agente" && x.unidade_id === uid);
    await salvaAcesso(
      existente,
      {
        login: String(a.login ?? ""),
        senha: String(a.senha ?? ""),
        papel: "agente",
        unidade_id: uid,
        nome: nomeDe.get(uid) ?? uid,
      },
      `Unidade ${nomeDe.get(uid) ?? uid}`
    );
  }

  // Apaga o acesso de unidades que foram removidas
  for (const x of atuais) {
    if (x.papel === "agente" && x.unidade_id && !ids.has(x.unidade_id)) {
      await admin.from("checklist_acessos").delete().eq("id", x.id);
    }
  }

  // Supervisão (um login)
  const sup = corpo?.supervisao as { login?: unknown; nome?: unknown; senha?: unknown } | null | undefined;
  if (sup && typeof sup === "object") {
    const existente = atuais.find((x) => x.papel === "supervisao");
    await salvaAcesso(
      existente,
      {
        login: String(sup.login ?? ""),
        senha: String(sup.senha ?? ""),
        papel: "supervisao",
        unidade_id: null,
        nome: String(sup.nome ?? "").trim().slice(0, 60) || "Supervisão",
      },
      "Supervisão"
    );
  }

  return NextResponse.json({ ok: true, avisos });
}
