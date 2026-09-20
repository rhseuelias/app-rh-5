"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { calcularFimExperiencia, calcularPeriodoAquisitivo } from "@/lib/calculos";

function num(formData: FormData, campo: string): number {
  const v = formData.get(campo);
  if (!v || v === "") return 0;
  return Number(v);
}

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

function bool(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on" || formData.get(campo) === "true";
}

export async function salvarColaborador(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");

  const dataAdmissao = str(formData, "data_admissao");

  const payload = {
    tipo: str(formData, "tipo") ?? "CLT",
    nome: str(formData, "nome"),
    cpf_cnpj: str(formData, "cpf_cnpj"),
    cargo: str(formData, "cargo"),
    departamento: str(formData, "departamento"),
    lider: str(formData, "lider"),
    empresa_id: str(formData, "empresa_id"),
    unidade_id: str(formData, "unidade_id"),
    data_nascimento: str(formData, "data_nascimento"),
    data_admissao: dataAdmissao,
    data_fim_experiencia: dataAdmissao
      ? calcularFimExperiencia(dataAdmissao).toISOString().slice(0, 10)
      : null,
    status: str(formData, "status") ?? "experiencia",
    salario_base: num(formData, "salario_base"),
    comissao_media: num(formData, "comissao_media"),
    auxilio_outros: num(formData, "auxilio_outros"),
    custo_vt: num(formData, "custo_vt"),
    custo_va_vr: num(formData, "custo_va_vr"),
    custo_assist_medica: num(formData, "custo_assist_medica"),
    custo_assist_psicologica: num(formData, "custo_assist_psicologica"),
    telefone: str(formData, "telefone"),
    email: str(formData, "email"),
    telefone_contato_emergencia: str(formData, "telefone_contato_emergencia"),
    nome_contato_emergencia: str(formData, "nome_contato_emergencia"),
    contrato_inicio: str(formData, "contrato_inicio"),
    contrato_fim: str(formData, "contrato_fim"),
    valor_nota_fiscal: num(formData, "valor_nota_fiscal"),
    observacoes: str(formData, "observacoes"),

    // Ficha de Admissão — dados pessoais extras
    rg: str(formData, "rg"),
    endereco: str(formData, "endereco"),
    estado_civil: str(formData, "estado_civil"),
    raca_cor: str(formData, "raca_cor"),
    grau_instrucao: str(formData, "grau_instrucao"),

    // dados funcionais extras
    contrato_experiencia: str(formData, "contrato_experiencia"),
    adiantamento_salario: bool(formData, "adiantamento_salario"),
    primeiro_emprego: bool(formData, "primeiro_emprego"),
    insalubridade: bool(formData, "insalubridade"),
    periculosidade: bool(formData, "periculosidade"),
    quebra_caixa: bool(formData, "quebra_caixa"),
    gratificacao_funcao: bool(formData, "gratificacao_funcao"),

    // dados bancários
    banco: str(formData, "banco"),
    agencia: str(formData, "agencia"),
    conta: str(formData, "conta"),
    conta_digito: str(formData, "conta_digito"),

    // horário de trabalho (montado no cliente como JSON)
    horario_trabalho: parseJsonSeguro(str(formData, "horario_trabalho_json")),

    // benefícios
    vale_transporte: bool(formData, "vale_transporte"),
    vale_transporte_desconto: bool(formData, "vale_transporte_desconto"),
    vale_alimentacao: bool(formData, "vale_alimentacao"),
    vale_alimentacao_valor_desconto: num(formData, "vale_alimentacao_valor_desconto"),

    updated_at: new Date().toISOString(),
  };

  let colaboradorId = id;

  if (id) {
    await supabase.from("colaboradores").update(payload).eq("id", id);
    await sincronizarDependentes(supabase, id, str(formData, "dependentes_json"));
  } else {
    const { data, error } = await supabase
      .from("colaboradores")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    colaboradorId = data.id;
    await sincronizarDependentes(supabase, colaboradorId, str(formData, "dependentes_json"));

    // ao criar, já gera as 5 etapas de onboarding e o primeiro período aquisitivo
    if (dataAdmissao) {
      const etapas = ["pre_admissao", "primeiro_dia", "checkin_30", "avaliacao_45", "avaliacao_90"];
      await supabase.from("onboarding_etapas").insert(
        etapas.map((etapa) => ({ colaborador_id: colaboradorId, etapa }))
      );

      const { inicio, fim, limite_concessao } = calcularPeriodoAquisitivo(dataAdmissao);
      await supabase.from("periodos_aquisitivos").insert({
        colaborador_id: colaboradorId,
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
        limite_concessao: limite_concessao.toISOString().slice(0, 10),
      });

      await supabase.from("eventos_calendario").insert({
        titulo: `Admissão — ${payload.nome}`,
        categoria: "admissao",
        data_inicio: dataAdmissao,
        colaborador_id: colaboradorId,
      });
    }
  }

  revalidatePath("/colaboradores");
  revalidatePath("/dashboard");
  redirect(`/colaboradores/${colaboradorId}`);
}

export async function atualizarStatusColaborador(id: string, status: string) {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "desligado") {
    patch.data_desligamento = new Date().toISOString().slice(0, 10);
  }
  await supabase.from("colaboradores").update(patch).eq("id", id);
  revalidatePath(`/colaboradores/${id}`);
  revalidatePath("/colaboradores");
  revalidatePath("/dashboard");
}

/** Desligamento com os detalhes pedidos: data do último dia, tipo de rescisão e motivo. */
export async function desligarColaborador(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "colaborador_id")!;

  await supabase
    .from("colaboradores")
    .update({
      status: "desligado",
      data_desligamento: str(formData, "data_ultimo_dia") ?? new Date().toISOString().slice(0, 10),
      tipo_rescisao: str(formData, "tipo_rescisao"),
      motivo_desligamento: str(formData, "motivo_desligamento"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/colaboradores/${id}`);
  revalidatePath("/colaboradores");
  revalidatePath("/dashboard");
}

/**
 * Exclui em definitivo o colaborador e todos os registros ligados a ele
 * (férias, período aquisitivo, onboarding, processo de integração, eventos
 * do calendário, dependentes, histórico) — as tabelas têm "on delete cascade".
 * Ação irreversível; a confirmação em duas etapas fica na tela (StatusColaboradorAcoes).
 */
export async function excluirColaborador(id: string) {
  const supabase = createClient();
  await supabase.from("colaboradores").delete().eq("id", id);
  revalidatePath("/colaboradores");
  revalidatePath("/dashboard");
  redirect("/colaboradores");
}

// ------------------------------------------------------------
// Helpers — dependentes e horário de trabalho (JSON vindo do cliente)
// ------------------------------------------------------------

function parseJsonSeguro(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Substitui a lista de dependentes do colaborador pela lista enviada do formulário. */
async function sincronizarDependentes(
  supabase: ReturnType<typeof createClient>,
  colaboradorId: string,
  dependentesJson: string | null
) {
  const lista = parseJsonSeguro(dependentesJson) as
    | { nome: string; data_nascimento: string | null; parentesco: string | null; cpf: string; dependente_ir: boolean }[]
    | null;

  await supabase.from("dependentes_colaborador").delete().eq("colaborador_id", colaboradorId);

  const validos = (lista ?? []).filter((d) => d.nome && d.cpf);
  if (validos.length === 0) return;

  await supabase.from("dependentes_colaborador").insert(
    validos.map((d) => ({
      colaborador_id: colaboradorId,
      nome: d.nome,
      data_nascimento: d.data_nascimento || null,
      parentesco: d.parentesco || null,
      cpf: d.cpf,
      dependente_ir: !!d.dependente_ir,
    }))
  );
}

// ------------------------------------------------------------
// Unidades (filiais dentro de uma empresa)
// ------------------------------------------------------------

export async function salvarUnidade(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  const adiantamento = str(formData, "adiantamento_pct");

  const payload = {
    empresa_id: str(formData, "empresa_id"),
    nome: str(formData, "nome"),
    cnpj: str(formData, "cnpj"),
    adiantamento_pct: adiantamento ? Number(adiantamento) : null,
  };

  if (id) {
    await supabase.from("unidades").update(payload).eq("id", id);
  } else {
    await supabase.from("unidades").insert(payload);
  }

  revalidatePath("/projecao-custo");
}

export async function atualizarEtapaOnboarding(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  const status = str(formData, "status");
  const responsavel = str(formData, "responsavel");
  const prazo = str(formData, "prazo");

  await supabase
    .from("onboarding_etapas")
    .update({
      status,
      responsavel,
      prazo,
      concluido_em: status === "concluido" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  revalidatePath("/onboarding");
}

export async function solicitarFerias(formData: FormData) {
  const supabase = createClient();
  const colaborador_id = str(formData, "colaborador_id");
  const periodo_aquisitivo_id = str(formData, "periodo_aquisitivo_id");
  const data_inicio = str(formData, "data_inicio")!;
  const data_fim = str(formData, "data_fim")!;
  const dias = num(formData, "dias");
  const vendeu_abono = formData.get("vendeu_abono") === "on";

  const { data } = await supabase
    .from("ferias")
    .insert({
      colaborador_id,
      periodo_aquisitivo_id,
      data_inicio,
      data_fim,
      dias,
      vendeu_abono,
      status: "solicitado",
    })
    .select("id, colaborador_id")
    .single();

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("nome")
    .eq("id", colaborador_id)
    .single();

  await supabase.from("eventos_calendario").insert({
    titulo: `Férias — ${colaborador?.nome ?? ""}`,
    categoria: "ferias",
    data_inicio,
    data_fim,
    colaborador_id,
  });

  revalidatePath("/ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
}

export async function atualizarStatusFerias(id: string, status: string) {
  const supabase = createClient();
  await supabase.from("ferias").update({ status }).eq("id", id);

  if (status === "concluido") {
    const { data: ferias } = await supabase
      .from("ferias")
      .select("periodo_aquisitivo_id")
      .eq("id", id)
      .single();
    if (ferias?.periodo_aquisitivo_id) {
      await supabase
        .from("periodos_aquisitivos")
        .update({ status: "gozado" })
        .eq("id", ferias.periodo_aquisitivo_id);
    }
  }

  revalidatePath("/ferias");
}

export async function salvarEmpresa(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  const payload = {
    nome: str(formData, "nome"),
    cnpj: str(formData, "cnpj"),
    faturamento_mensal: num(formData, "faturamento_mensal"),
    absenteismo_pct: num(formData, "absenteismo_pct"),
    performance_pct: num(formData, "performance_pct"),
    treinamento_pct: num(formData, "treinamento_pct"),
    clima_pct: num(formData, "clima_pct"),
  };

  if (id) {
    await supabase.from("empresas").update(payload).eq("id", id);
  } else {
    await supabase.from("empresas").insert(payload);
  }

  revalidatePath("/projecao-custo");
  revalidatePath("/dashboard");
}

export async function criarEventoCalendario(formData: FormData) {
  const supabase = createClient();
  await supabase.from("eventos_calendario").insert({
    titulo: str(formData, "titulo"),
    categoria: str(formData, "categoria"),
    data_inicio: str(formData, "data_inicio"),
    data_fim: str(formData, "data_fim"),
    descricao: str(formData, "descricao"),
  });
  revalidatePath("/calendario");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
