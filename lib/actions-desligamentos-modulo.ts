"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { obterPapelUsuarioLogado } from "@/lib/permissoes";
import {
  AVISOS,
  ENTREVISTAS,
  MOTIVOS_POR_INICIATIVA,
  RECONTRATAVEL,
  dataValida,
  hojeSP,
  type Iniciativa,
} from "@/lib/desligamentos-modulo";

export type RespostaRegistro = { ok: true; id: string } | { ok: false; erro: string };

function mensagem(m: string): string {
  if (/does not exist|schema cache/i.test(m)) {
    return "Falta criar as tabelas no banco. Rode o arquivo migration_043_desligamentos_modulo.sql no Supabase.";
  }
  if (/desligamentos_registro_um_ativo|duplicate key/i.test(m)) {
    return "Este colaborador já tem um desligamento ativo registrado.";
  }
  if (/row-level security|permission denied|policy/i.test(m)) return "O banco não permitiu salvar (falta permissão).";
  return m;
}

/** Só RH/admin/gestor usam o módulo. O perfil "assistente" fica de fora. */
async function usuarioAutorizado(): Promise<{ email: string } | { erro: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Entre no sistema para fazer isso." };
  const papel = await obterPapelUsuarioLogado();
  if (papel === "assistente") return { erro: "Esta parte é só para o RH." };
  return { email: user.email ?? user.id };
}

async function gravarAuditoria(
  registroId: string,
  acao: string,
  usuario: string,
  justificativa: string | null,
  antes: unknown,
  depois: unknown
) {
  const supabase = createClient();
  await supabase.from("desligamentos_auditoria").insert({
    registro_id: registroId,
    acao,
    usuario,
    justificativa,
    antes: antes ?? null,
    depois: depois ?? null,
  });
}

function atualizarTelas() {
  revalidatePath("/desligamentos");
  revalidatePath("/desligamentos/historico");
  revalidatePath("/desligamentos/analise");
  revalidatePath("/colaboradores");
  revalidatePath("/colaboradores/[id]", "page");
  revalidatePath("/dashboard");
}

export interface EntradaRegistro {
  colaboradorId: string;
  dataDesligamento: string;
  dataComunicacao: string | null;
  ultimoDia: string | null;
  iniciativa: Iniciativa;
  tipoRescisao: string;
  motivoPrincipal: string;
  avisoPrevio: string | null;
  entrevista: string | null;
  recontratavel: string | null;
  custoRescisorio: number | null;
  motivoComplementar: string | null;
  observacoesRestritas: string | null;
}

export async function registrarDesligamento(e: EntradaRegistro): Promise<RespostaRegistro> {
  const auth = await usuarioAutorizado();
  if ("erro" in auth) return { ok: false, erro: auth.erro };

  if (!e.colaboradorId) return { ok: false, erro: "Escolha o colaborador." };
  if (!dataValida(e.dataDesligamento)) return { ok: false, erro: "Confira a data do desligamento." };
  if (e.dataComunicacao && !dataValida(e.dataComunicacao)) return { ok: false, erro: "Confira a data de comunicação." };
  if (e.ultimoDia && !dataValida(e.ultimoDia)) return { ok: false, erro: "Confira o último dia trabalhado." };
  if (!MOTIVOS_POR_INICIATIVA[e.iniciativa]) return { ok: false, erro: "Escolha a iniciativa do desligamento." };
  if (!e.tipoRescisao?.trim()) return { ok: false, erro: "Escolha o tipo de rescisão." };
  if (!e.motivoPrincipal?.trim()) return { ok: false, erro: "Escolha o motivo principal." };
  if (!MOTIVOS_POR_INICIATIVA[e.iniciativa].includes(e.motivoPrincipal)) {
    return { ok: false, erro: "O motivo não combina com a iniciativa escolhida." };
  }
  if (e.avisoPrevio && !AVISOS.some((a) => a.valor === e.avisoPrevio)) return { ok: false, erro: "Aviso-prévio inválido." };
  if (e.entrevista && !ENTREVISTAS.some((a) => a.valor === e.entrevista)) return { ok: false, erro: "Entrevista inválida." };
  if (e.recontratavel && !RECONTRATAVEL.some((a) => a.valor === e.recontratavel)) return { ok: false, erro: "Recontratável inválido." };
  if (e.custoRescisorio !== null && (!Number.isFinite(e.custoRescisorio) || e.custoRescisorio < 0)) {
    return { ok: false, erro: "Confira o custo rescisório." };
  }

  const supabase = createClient();
  const { data: colab } = await supabase.from("colaboradores").select("*").eq("id", e.colaboradorId).maybeSingle();
  if (!colab) return { ok: false, erro: "Colaborador não encontrado." };
  const c = colab as Record<string, unknown>;

  const admissao = (c.data_admissao as string | null) ?? null;
  if (admissao && e.dataDesligamento < admissao) {
    return { ok: false, erro: "A data do desligamento não pode ser antes da admissão." };
  }

  // sem duplicidade: um colaborador só tem um desligamento ativo
  const { data: existente, error: erroExistente } = await supabase
    .from("desligamentos_registro")
    .select("id")
    .eq("colaborador_id", e.colaboradorId)
    .eq("status", "ativo")
    .maybeSingle();
  if (erroExistente) return { ok: false, erro: mensagem(erroExistente.message) };
  if (existente) return { ok: false, erro: "Este colaborador já tem um desligamento ativo registrado." };

  const [empRes, uniRes] = await Promise.all([
    c.empresa_id ? supabase.from("empresas").select("nome").eq("id", c.empresa_id as string).maybeSingle() : Promise.resolve({ data: null }),
    c.unidade_id ? supabase.from("unidades").select("nome").eq("id", c.unidade_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const { data: criado, error } = await supabase
    .from("desligamentos_registro")
    .insert({
      colaborador_id: e.colaboradorId,
      nome: c.nome as string,
      matricula: (c.matricula as string | null) ?? null,
      vinculo: (c.tipo as string | null) ?? null,
      empresa: (empRes.data as { nome: string } | null)?.nome ?? null,
      unidade: (uniRes.data as { nome: string } | null)?.nome ?? null,
      departamento: (c.departamento as string | null) ?? null,
      cargo: (c.cargo as string | null) ?? null,
      gestor: (c.lider as string | null) ?? null,
      data_admissao: admissao,
      status_anterior: (c.status as string | null) ?? null,
      data_desligamento: e.dataDesligamento,
      data_comunicacao: e.dataComunicacao || null,
      ultimo_dia_trabalhado: e.ultimoDia || null,
      iniciativa: e.iniciativa,
      tipo_rescisao: e.tipoRescisao.trim(),
      motivo_principal: e.motivoPrincipal.trim(),
      aviso_previo: e.avisoPrevio || null,
      entrevista: e.entrevista || null,
      recontratavel: e.recontratavel || null,
      custo_rescisorio: e.custoRescisorio,
      motivo_complementar: e.motivoComplementar?.trim() || null,
      observacoes_restritas: e.observacoesRestritas?.trim() || null,
      registrado_por: auth.email,
    })
    .select("id")
    .single();
  if (error || !criado) return { ok: false, erro: mensagem(error?.message ?? "Não foi possível salvar.") };

  // Inativa pelo status que o app já usa. Se a data é futura, o colaborador segue ativo até lá.
  if (e.dataDesligamento <= hojeSP()) {
    const { error: erroStatus } = await supabase
      .from("colaboradores")
      .update({
        status: "desligado",
        data_desligamento: e.dataDesligamento,
        // campos antigos da ficha, mantidos para as telas que já os mostram
        tipo_rescisao: e.tipoRescisao.trim(),
        motivo_desligamento: e.motivoComplementar?.trim() || e.motivoPrincipal.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.colaboradorId);
    if (erroStatus) {
      return { ok: false, erro: `O desligamento foi salvo, mas o status do colaborador não mudou: ${mensagem(erroStatus.message)}` };
    }
  }

  await gravarAuditoria(criado.id as string, "criado", auth.email, null, null, {
    colaborador: c.nome,
    data_desligamento: e.dataDesligamento,
    iniciativa: e.iniciativa,
    motivo_principal: e.motivoPrincipal,
  });

  atualizarTelas();
  return { ok: true, id: criado.id as string };
}

/**
 * Desligamentos agendados (data futura): quando a data chega, o colaborador passa
 * para "desligado". Chamado ao abrir as telas do módulo.
 */
export async function aplicarDesligamentosAgendados(): Promise<void> {
  const supabase = createClient();
  const hoje = hojeSP();
  const { data, error } = await supabase
    .from("desligamentos_registro")
    .select("colaborador_id, data_desligamento")
    .eq("status", "ativo")
    .not("colaborador_id", "is", null)
    .lte("data_desligamento", hoje);
  if (error || !data) return;
  for (const r of data as { colaborador_id: string; data_desligamento: string }[]) {
    await supabase
      .from("colaboradores")
      .update({ status: "desligado", data_desligamento: r.data_desligamento })
      .eq("id", r.colaborador_id)
      .neq("status", "desligado");
  }
}

function voltar(id: string, msg: string): never {
  redirect(`/desligamentos/historico?sel=${encodeURIComponent(id)}&msg=${encodeURIComponent(msg)}`);
}

/** Cancela um registro (erro de lançamento). Reativa o colaborador no status que ele tinha antes. */
export async function cancelarRegistro(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  const auth = await usuarioAutorizado();
  if ("erro" in auth) voltar(id, auth.erro);
  if (!id) voltar("", "Registro não encontrado.");
  if (justificativa.length < 5) voltar(id, "Escreva a justificativa do cancelamento.");

  const supabase = createClient();
  const { data: reg } = await supabase.from("desligamentos_registro").select("*").eq("id", id).maybeSingle();
  if (!reg) voltar(id, "Registro não encontrado.");
  const r = reg as { colaborador_id: string | null; status: string; status_anterior: string | null; nome: string };
  if (r.status === "cancelado") voltar(id, "Este registro já está cancelado.");

  const { error } = await supabase
    .from("desligamentos_registro")
    .update({
      status: "cancelado",
      cancelado_em: new Date().toISOString(),
      cancelado_por: (auth as { email: string }).email,
      cancelado_justificativa: justificativa,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) voltar(id, mensagem(error.message));

  // devolve o colaborador ao status anterior, se ele não tiver outro desligamento ativo
  // (registros importados podem não ter colaborador ligado: nesse caso não há o que reativar)
  const { data: outro } = r.colaborador_id
    ? await supabase
        .from("desligamentos_registro")
        .select("id")
        .eq("colaborador_id", r.colaborador_id)
        .eq("status", "ativo")
        .maybeSingle()
    : { data: null };
  if (r.colaborador_id && !outro) {
    const volta = r.status_anterior && r.status_anterior !== "desligado" ? r.status_anterior : "ativo";
    await supabase.from("colaboradores").update({ status: volta, data_desligamento: null }).eq("id", r.colaborador_id);
  }

  await gravarAuditoria(id, "cancelado", (auth as { email: string }).email, justificativa, { status: "ativo" }, { status: "cancelado" });
  atualizarTelas();
  voltar(id, "Registro cancelado. O colaborador voltou à situação anterior.");
}

/** Corrige campos do registro (não muda colaborador nem data). Justificativa obrigatória; guarda antes e depois. */
export async function corrigirRegistro(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  const auth = await usuarioAutorizado();
  if ("erro" in auth) voltar(id, auth.erro);
  if (!id) voltar("", "Registro não encontrado.");
  if (justificativa.length < 5) voltar(id, "Escreva a justificativa da correção.");

  const supabase = createClient();
  const { data: reg } = await supabase.from("desligamentos_registro").select("*").eq("id", id).maybeSingle();
  if (!reg) voltar(id, "Registro não encontrado.");
  const antes = reg as Record<string, unknown>;
  if (antes.status === "cancelado") voltar(id, "Registro cancelado não pode ser corrigido.");

  const texto = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const motivo = texto("motivo_principal");
  const iniciativa = antes.iniciativa as Iniciativa;
  if (motivo && !MOTIVOS_POR_INICIATIVA[iniciativa].includes(motivo)) voltar(id, "O motivo não combina com a iniciativa.");
  const entrevista = texto("entrevista");
  if (entrevista && !ENTREVISTAS.some((a) => a.valor === entrevista)) voltar(id, "Entrevista inválida.");
  const recontratavel = texto("recontratavel");
  if (recontratavel && !RECONTRATAVEL.some((a) => a.valor === recontratavel)) voltar(id, "Recontratável inválido.");
  const custoTxt = texto("custo_rescisorio");
  const custo = custoTxt === null ? null : Number(custoTxt.replace(/\./g, "").replace(",", "."));
  if (custo !== null && (!Number.isFinite(custo) || custo < 0)) voltar(id, "Confira o custo rescisório.");

  const mudancas = {
    motivo_principal: motivo ?? (antes.motivo_principal as string),
    motivo_complementar: texto("motivo_complementar"),
    observacoes_restritas: texto("observacoes_restritas"),
    entrevista,
    recontratavel,
    custo_rescisorio: custo,
  };

  const { error } = await supabase
    .from("desligamentos_registro")
    .update({ ...mudancas, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) voltar(id, mensagem(error.message));

  const depois: Record<string, unknown> = {};
  const antesRec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mudancas)) {
    if ((antes[k] ?? null) !== v) {
      antesRec[k] = antes[k] ?? null;
      depois[k] = v;
    }
  }
  await gravarAuditoria(id, "corrigido", (auth as { email: string }).email, justificativa, antesRec, depois);
  atualizarTelas();
  voltar(id, "Correção salva.");
}

/** Limites dos alertas (Análise estratégica). */
export async function salvarConfigDesligamentos(formData: FormData): Promise<void> {
  const auth = await usuarioAutorizado();
  if ("erro" in auth) redirect("/desligamentos/analise");
  const num = (k: string, min: number, max: number, padrao: number) => {
    const v = Number(String(formData.get(k) ?? "").replace(",", "."));
    return Number.isFinite(v) && v >= min && v <= max ? v : padrao;
  };
  const supabase = createClient();
  await supabase.from("desligamentos_config").upsert({
    id: 1,
    limite_90_dias: num("limite_90_dias", 0, 100, 20),
    limite_quadro_unidade: num("limite_quadro_unidade", 0, 100, 12),
    meta_entrevistas: num("meta_entrevistas", 0, 100, 70),
    minimo_quadro: Math.round(num("minimo_quadro", 1, 1000, 10)),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/desligamentos/analise");
  redirect("/desligamentos/analise");
}
