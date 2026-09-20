"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { calcularFimExperiencia, calcularPeriodoAquisitivo } from "@/lib/calculos";
import { addDays } from "date-fns";
import {
  calcularValorFerias,
  paraSetDeDatas,
  gerarPrevisaoColaborador,
  sugerirOpcoes,
  respeitaRegraInicio,
  type JanelaData,
} from "@/lib/ferias-calculos";
import {
  normalizarConfig,
  periodosDoModelo,
  validarFracionamento,
  diasPreferenciaisParaSet,
  gerarPeriodosParaColaborador,
  calcularSaldo,
} from "@/lib/simulacao-ferias";
import type { Colaborador, PeriodoAquisitivo, Ferias, Feriado, ConfigSimulacao } from "@/types/db";

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
    await sincronizarDependentes(supabase, colaboradorId!, str(formData, "dependentes_json"));

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

export interface ResultadoPeriodoAquisitivo {
  ok: boolean;
  mensagem: string;
}

/**
 * Bootstrap: só é usado quando o colaborador ainda não tem NENHUM período
 * aquisitivo registrado (dado legado, ou colaborador cadastrado sem data de
 * admissão na época). Usa a data de admissão como base. A partir do momento
 * em que o primeiro período existe, gerar os seguintes é sempre feito pela
 * ação "gerar" de um período já existente (gerarProximoPeriodoAquisitivo)
 * — não existe mais um botão avulso de "criar do zero" na tela normal.
 */
export async function gerarPrimeiroPeriodoAquisitivo(colaboradorId: string): Promise<ResultadoPeriodoAquisitivo> {
  const supabase = createClient();

  const [{ data: colaborador }, { count }] = await Promise.all([
    supabase.from("colaboradores").select("data_admissao").eq("id", colaboradorId).single(),
    supabase.from("periodos_aquisitivos").select("id", { count: "exact", head: true }).eq("colaborador_id", colaboradorId),
  ]);
  if (!colaborador) return { ok: false, mensagem: "Colaborador não encontrado." };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      mensagem: 'Esse colaborador já tem período(s) aquisitivo(s). Use a ação "gerar" na tabela pra criar o próximo.',
    };
  }
  if (!colaborador.data_admissao) {
    return { ok: false, mensagem: "Cadastre a data de admissão do colaborador antes de gerar o período aquisitivo." };
  }

  const { inicio, fim, limite_concessao } = calcularPeriodoAquisitivo(colaborador.data_admissao);
  await supabase.from("periodos_aquisitivos").insert({
    colaborador_id: colaboradorId,
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
    limite_concessao: limite_concessao.toISOString().slice(0, 10),
  });

  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/colaboradores");
  revalidatePath("/ferias");
  revalidatePath("/ferias/simulacao");
  return {
    ok: true,
    mensagem: `Período aquisitivo gerado: ${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}.`,
  };
}

/**
 * "Editar período aquisitivo": ajusta manualmente as datas (início, fim e
 * limite de concessão) de um período aquisitivo já existente — útil quando
 * a data calculada automaticamente precisa de um ajuste pontual.
 */
export async function editarPeriodoAquisitivoManual(formData: FormData): Promise<ResultadoPeriodoAquisitivo> {
  const supabase = createClient();
  const id = str(formData, "id");
  const colaboradorId = str(formData, "colaborador_id");
  const inicio = str(formData, "inicio");
  const fim = str(formData, "fim");
  const limite_concessao = str(formData, "limite_concessao");

  if (!id || !colaboradorId) return { ok: false, mensagem: "Período aquisitivo não encontrado." };
  if (!inicio || !fim || !limite_concessao) return { ok: false, mensagem: "Preencha as 3 datas." };
  if (fim <= inicio) return { ok: false, mensagem: "A data de fim precisa ser depois da data de início." };
  if (limite_concessao <= fim) {
    return { ok: false, mensagem: "O limite de concessão precisa ser depois da data de fim." };
  }

  await supabase.from("periodos_aquisitivos").update({ inicio, fim, limite_concessao }).eq("id", id);

  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/colaboradores");
  revalidatePath("/ferias");
  revalidatePath("/ferias/simulacao");
  return { ok: true, mensagem: "Período aquisitivo atualizado ✓" };
}

/**
 * Exclui em definitivo um período aquisitivo. Férias já lançadas que
 * apontavam pra ele não são apagadas — a coluna periodo_aquisitivo_id delas
 * só fica vazia (a referência no banco é "on delete set null"), então o
 * histórico de férias do colaborador continua intacto.
 */
export async function excluirPeriodoAquisitivo(id: string, colaboradorId: string) {
  const supabase = createClient();
  await supabase.from("periodos_aquisitivos").delete().eq("id", id);

  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/colaboradores");
  revalidatePath("/ferias");
  revalidatePath("/ferias/simulacao");
}

/**
 * "Gerar" — ação de cada linha da tabela de períodos aquisitivos: cria o
 * PRÓXIMO período tendo o período clicado como referência, mantendo a
 * sequência do vínculo do colaborador. Regras:
 *  - só é permitido depois que os 30 dias de direito daquele período já
 *    foram totalmente utilizados (saldo = 0) — "encerrado/amortizado";
 *  - o novo período começa no dia seguinte ao fim do período de referência
 *    (ex.: anterior 01/04/2026–31/03/2027 → novo 01/04/2027–31/03/2028);
 *  - não pode haver outro período aquisitivo aberto ao mesmo tempo.
 * As datas geradas podem depois ser ajustadas com a ação "editar".
 */
export async function gerarProximoPeriodoAquisitivo(
  periodoAnteriorId: string,
  colaboradorId: string
): Promise<ResultadoPeriodoAquisitivo> {
  const supabase = createClient();

  const [{ data: periodoAnterior }, { data: aquisitivosData }, { data: feriasData }] = await Promise.all([
    supabase.from("periodos_aquisitivos").select("*").eq("id", periodoAnteriorId).single(),
    supabase.from("periodos_aquisitivos").select("*").eq("colaborador_id", colaboradorId),
    supabase
      .from("ferias")
      .select("dias")
      .eq("periodo_aquisitivo_id", periodoAnteriorId)
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);
  if (!periodoAnterior) return { ok: false, mensagem: "Período aquisitivo de referência não encontrado." };

  const aquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];
  if (aquisitivos.some((p) => p.status === "aberto" && p.id !== periodoAnterior.id)) {
    return {
      ok: false,
      mensagem: "Já existe outro período aquisitivo aberto pra esse colaborador. Encerre-o antes de gerar um novo.",
    };
  }

  const usados = ((feriasData ?? []) as { dias: number }[]).reduce((s, f) => s + f.dias, 0);
  const saldo = calcularSaldo(usados);
  if (saldo > 0) {
    return {
      ok: false,
      mensagem: `Esse período ainda tem ${saldo} dia${saldo !== 1 ? "s" : ""} de saldo disponível. Utilize todos os 30 dias antes de gerar o próximo período.`,
    };
  }

  const baseData = addDays(new Date(periodoAnterior.fim), 1).toISOString().slice(0, 10);
  const { inicio, fim, limite_concessao } = calcularPeriodoAquisitivo(baseData);

  await supabase.from("periodos_aquisitivos").insert({
    colaborador_id: colaboradorId,
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
    limite_concessao: limite_concessao.toISOString().slice(0, 10),
  });
  if (periodoAnterior.status === "aberto") {
    await supabase.from("periodos_aquisitivos").update({ status: "gozado" }).eq("id", periodoAnterior.id);
  }

  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/colaboradores");
  revalidatePath("/ferias");
  revalidatePath("/ferias/simulacao");
  return {
    ok: true,
    mensagem: `Próximo período aquisitivo gerado: ${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}.`,
  };
}

/**
 * "Gerar períodos aquisitivos faltantes" (em lote): varre todos os
 * colaboradores ativos/experiência sem nenhum período aberto e gera um
 * pra cada — útil depois de importar uma base antiga ou pra pegar quem
 * ficou pra trás. Nunca duplica quem já tem um período aberto.
 */
export async function gerarPeriodosAquisitivosFaltantes(): Promise<{ criados: number; semDataAdmissao: string[] }> {
  const supabase = createClient();

  const [{ data: colaboradoresData }, { data: aquisitivosData }] = await Promise.all([
    supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
    supabase.from("periodos_aquisitivos").select("*"),
  ]);

  const colaboradores = (colaboradoresData ?? []) as Colaborador[];
  const aquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];

  const porColaborador = new Map<string, PeriodoAquisitivo[]>();
  for (const p of aquisitivos) {
    if (!porColaborador.has(p.colaborador_id)) porColaborador.set(p.colaborador_id, []);
    porColaborador.get(p.colaborador_id)!.push(p);
  }

  let criados = 0;
  const semDataAdmissao: string[] = [];
  const novasLinhas: Record<string, unknown>[] = [];

  for (const c of colaboradores) {
    const doColaborador = porColaborador.get(c.id) ?? [];
    if (doColaborador.some((p) => p.status === "aberto")) continue;

    const maisRecente = doColaborador.slice().sort((a, b) => (a.fim < b.fim ? 1 : -1))[0];
    // o próximo período começa no dia seguinte ao fim do anterior, nunca no mesmo dia
    const baseData = maisRecente ? addDays(new Date(maisRecente.fim), 1).toISOString().slice(0, 10) : c.data_admissao;
    if (!baseData) {
      semDataAdmissao.push(c.nome);
      continue;
    }

    const { inicio, fim, limite_concessao } = calcularPeriodoAquisitivo(baseData);
    novasLinhas.push({
      colaborador_id: c.id,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      limite_concessao: limite_concessao.toISOString().slice(0, 10),
    });
    criados++;
  }

  if (novasLinhas.length > 0) await supabase.from("periodos_aquisitivos").insert(novasLinhas);

  revalidatePath("/colaboradores");
  revalidatePath("/ferias");
  revalidatePath("/ferias/simulacao");
  return { criados, semDataAdmissao };
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

// Exclui uma filial/unidade. Nada é apagado em cascata — colaboradores e
// cenários de simulação vinculados a ela só ficam sem unidade (on delete set null).
export async function excluirUnidade(id: string, empresaId: string) {
  const supabase = createClient();
  await supabase.from("unidades").delete().eq("id", id).eq("empresa_id", empresaId);

  revalidatePath("/projecao-custo");
  revalidatePath("/colaboradores");
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

/**
 * Toda férias precisa obrigatoriamente estar vinculada a um período
 * aquisitivo e ter uma quantidade de dias válida — e essa quantidade não
 * pode ultrapassar o saldo restante daquele período (30 dias de direito
 * menos o que já foi lançado nele). Por isso valida antes de gravar, em vez
 * de só confiar no formulário.
 */
export async function solicitarFerias(formData: FormData): Promise<ResultadoPeriodoAquisitivo> {
  const supabase = createClient();
  const colaborador_id = str(formData, "colaborador_id");
  const periodo_aquisitivo_id = str(formData, "periodo_aquisitivo_id");
  const data_inicio = str(formData, "data_inicio");
  const data_fim = str(formData, "data_fim");
  const dias = num(formData, "dias");
  const vendeu_abono = formData.get("vendeu_abono") === "on";

  if (!colaborador_id || !data_inicio || !data_fim) {
    return { ok: false, mensagem: "Preencha o colaborador e as datas de início e fim." };
  }
  if (!periodo_aquisitivo_id) {
    return { ok: false, mensagem: "Selecione o período aquisitivo ao qual essas férias pertencem." };
  }
  if (dias <= 0) {
    return { ok: false, mensagem: "Informe uma quantidade de dias válida." };
  }

  const { data: usadosData } = await supabase
    .from("ferias")
    .select("dias")
    .eq("periodo_aquisitivo_id", periodo_aquisitivo_id)
    .neq("status", "cancelado")
    .eq("simulacao", false);
  const usados = ((usadosData ?? []) as { dias: number }[]).reduce((s, f) => s + f.dias, 0);
  const saldo = calcularSaldo(usados);
  if (dias > saldo) {
    return {
      ok: false,
      mensagem: `Esse período aquisitivo só tem ${saldo} dia${saldo !== 1 ? "s" : ""} de saldo disponível.`,
    };
  }

  await supabase
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
  return { ok: true, mensagem: "Férias solicitadas ✓" };
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
      // só marca o período aquisitivo como "gozado" quando não sobrar nenhum
      // outro período pendente (ex.: o 2º dos 15+15 dias ainda não tirado)
      const { data: pendentes } = await supabase
        .from("ferias")
        .select("id")
        .eq("periodo_aquisitivo_id", ferias.periodo_aquisitivo_id)
        .not("status", "in", "(concluido,cancelado)");
      if (!pendentes || pendentes.length === 0) {
        await supabase
          .from("periodos_aquisitivos")
          .update({ status: "gozado" })
          .eq("id", ferias.periodo_aquisitivo_id);
      }
    }
  }

  revalidatePath("/ferias");
  revalidatePath("/calendario");
}

/**
 * Exclui em definitivo um registro de férias do histórico do colaborador.
 * Só é permitido excluir registros já com status "cancelado" — o filtro
 * `.eq("status", "cancelado")` na query garante isso mesmo que alguém
 * tente chamar essa ação passando o id de um registro em outro status.
 */
export async function excluirFeriasCancelada(id: string, colaboradorId: string) {
  const supabase = createClient();
  await supabase.from("ferias").delete().eq("id", id).eq("status", "cancelado");

  revalidatePath(`/colaboradores/${colaboradorId}`);
  revalidatePath("/ferias");
  revalidatePath("/calendario");
}

/**
 * Planejamento automático: pra cada colaborador com período aquisitivo
 * aberto e sem nenhuma férias ainda marcada, gera os 2 períodos de 15
 * dias (respeitando a regra de início da CLT, o prazo legal de concessão
 * e evitando que colaboradores da mesma unidade fiquem de férias na
 * mesma semana). Os registros entram como "planejada" — o RH confirma
 * (ou ajusta as datas) depois, um por um.
 */
export async function gerarPrevisaoAnoTodos(): Promise<{ criados: number; semVaga: string[] }> {
  const supabase = createClient();

  const [{ data: colaboradores }, { data: aquisitivos }, { data: feriasExistentes }, { data: feriados }] =
    await Promise.all([
      supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
      supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
      supabase.from("ferias").select("*").neq("status", "cancelado").eq("simulacao", false),
      supabase.from("feriados").select("*"),
    ]);

  const listaColaboradores = (colaboradores ?? []) as Colaborador[];
  const listaAquisitivos = (aquisitivos ?? []) as PeriodoAquisitivo[];
  const listaFerias = (feriasExistentes ?? []) as Ferias[];
  const feriadosSet = paraSetDeDatas((feriados ?? []) as Feriado[]);

  const unidadePorColaborador = Object.fromEntries(
    listaColaboradores.map((c) => [c.id, c.unidade_id ?? "sem-unidade"])
  );

  const ocupadasPorUnidade = new Map<string, JanelaData[]>();
  for (const f of listaFerias) {
    const unidadeId = unidadePorColaborador[f.colaborador_id];
    if (!unidadeId) continue;
    if (!ocupadasPorUnidade.has(unidadeId)) ocupadasPorUnidade.set(unidadeId, []);
    ocupadasPorUnidade.get(unidadeId)!.push({ inicio: new Date(f.data_inicio), fim: new Date(f.data_fim) });
  }

  const periodosComFerias = new Set(listaFerias.map((f) => f.periodo_aquisitivo_id).filter(Boolean));

  let criados = 0;
  const semVaga: string[] = [];

  for (const periodo of listaAquisitivos) {
    if (periodosComFerias.has(periodo.id)) continue;
    const colaborador = listaColaboradores.find((c) => c.id === periodo.colaborador_id);
    if (!colaborador) continue;

    const unidadeId = colaborador.unidade_id ?? "sem-unidade";
    const ocupadas = ocupadasPorUnidade.get(unidadeId) ?? [];

    const previsao = gerarPrevisaoColaborador(periodo, feriadosSet, ocupadas);
    if (!previsao) {
      semVaga.push(colaborador.nome);
      continue;
    }

    const valor = calcularValorFerias(colaborador.salario_base, 15).total;
    const { periodo1, periodo2 } = previsao;

    const registrosFerias = [
      {
        colaborador_id: colaborador.id,
        periodo_aquisitivo_id: periodo.id,
        data_inicio: periodo1.inicio.toISOString().slice(0, 10),
        data_fim: periodo1.fim.toISOString().slice(0, 10),
        dias: 15,
        status: "planejada",
        origem: "planejamento_auto",
        valor_estimado: valor,
      },
    ];
    if (periodo2) {
      registrosFerias.push({
        colaborador_id: colaborador.id,
        periodo_aquisitivo_id: periodo.id,
        data_inicio: periodo2.inicio.toISOString().slice(0, 10),
        data_fim: periodo2.fim.toISOString().slice(0, 10),
        dias: 15,
        status: "planejada",
        origem: "planejamento_auto",
        valor_estimado: valor,
      });
    }
    await supabase.from("ferias").insert(registrosFerias);

    const eventosCalendario = [
      {
        titulo: `Férias (planejada) — ${colaborador.nome}`,
        categoria: "ferias",
        data_inicio: periodo1.inicio.toISOString().slice(0, 10),
        data_fim: periodo1.fim.toISOString().slice(0, 10),
        colaborador_id: colaborador.id,
        empresa_id: colaborador.empresa_id,
      },
    ];
    if (periodo2) {
      eventosCalendario.push({
        titulo: `Férias (planejada) — ${colaborador.nome}`,
        categoria: "ferias",
        data_inicio: periodo2.inicio.toISOString().slice(0, 10),
        data_fim: periodo2.fim.toISOString().slice(0, 10),
        colaborador_id: colaborador.id,
        empresa_id: colaborador.empresa_id,
      });
    }
    await supabase.from("eventos_calendario").insert(eventosCalendario);

    if (!ocupadasPorUnidade.has(unidadeId)) ocupadasPorUnidade.set(unidadeId, []);
    const listaOcupadas = ocupadasPorUnidade.get(unidadeId)!;
    listaOcupadas.push(periodo1);
    if (periodo2) listaOcupadas.push(periodo2);
    criados++;
  }

  revalidatePath("/ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");

  return { criados, semVaga };
}

/** Gera até 3 opções de datas válidas pro botão "Sugerir férias" de um colaborador específico. */
export async function sugerirOpcoesFerias(colaboradorId: string, periodoAquisitivoId: string) {
  const supabase = createClient();

  const [{ data: colaborador }, { data: periodo }, { data: feriados }, { data: colaboradoresTodos }, { data: feriasExistentes }] =
    await Promise.all([
      supabase.from("colaboradores").select("*").eq("id", colaboradorId).single(),
      supabase.from("periodos_aquisitivos").select("*").eq("id", periodoAquisitivoId).single(),
      supabase.from("feriados").select("*"),
      supabase.from("colaboradores").select("id, unidade_id"),
      supabase.from("ferias").select("*").neq("status", "cancelado").eq("simulacao", false),
    ]);

  if (!colaborador || !periodo) return [];

  const feriadosSet = paraSetDeDatas((feriados ?? []) as Feriado[]);
  const unidadePorColaborador = Object.fromEntries(
    ((colaboradoresTodos ?? []) as { id: string; unidade_id: string | null }[]).map((c) => [c.id, c.unidade_id])
  );

  const ocupadas: JanelaData[] = ((feriasExistentes ?? []) as Ferias[])
    .filter(
      (f) =>
        f.colaborador_id !== colaboradorId &&
        colaborador.unidade_id &&
        unidadePorColaborador[f.colaborador_id] === colaborador.unidade_id
    )
    .map((f) => ({ inicio: new Date(f.data_inicio), fim: new Date(f.data_fim) }));

  const opcoes = sugerirOpcoes(
    new Date(periodo.fim),
    15,
    new Date(periodo.limite_concessao),
    feriadosSet,
    ocupadas,
    3
  );

  return opcoes.map((o) => ({
    inicio: o.inicio.toISOString().slice(0, 10),
    fim: o.fim.toISOString().slice(0, 10),
    dias: o.dias,
    semConflito: o.semConflito,
    dentroDoPrazo: o.dentroDoPrazo,
    regrasAtendidas: o.regrasAtendidas,
  }));
}

/** Cria a férias "planejada" a partir de uma das opções escolhidas no botão "Sugerir férias". */
export async function criarFeriasDeSugestao(formData: FormData): Promise<ResultadoPeriodoAquisitivo> {
  const supabase = createClient();
  const colaborador_id = str(formData, "colaborador_id");
  const periodo_aquisitivo_id = str(formData, "periodo_aquisitivo_id");
  const data_inicio = str(formData, "data_inicio");
  const data_fim = str(formData, "data_fim");
  const dias = num(formData, "dias");

  if (!colaborador_id || !data_inicio || !data_fim) {
    return { ok: false, mensagem: "Dados incompletos — tente sugerir novamente." };
  }
  if (!periodo_aquisitivo_id) {
    return { ok: false, mensagem: "Essa sugestão não está vinculada a um período aquisitivo." };
  }
  if (dias <= 0) {
    return { ok: false, mensagem: "Quantidade de dias inválida." };
  }

  const { data: usadosData } = await supabase
    .from("ferias")
    .select("dias")
    .eq("periodo_aquisitivo_id", periodo_aquisitivo_id)
    .neq("status", "cancelado")
    .eq("simulacao", false);
  const usados = ((usadosData ?? []) as { dias: number }[]).reduce((s, f) => s + f.dias, 0);
  const saldo = calcularSaldo(usados);
  if (dias > saldo) {
    return {
      ok: false,
      mensagem: `Esse período aquisitivo só tem ${saldo} dia${saldo !== 1 ? "s" : ""} de saldo disponível.`,
    };
  }

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("nome, salario_base, empresa_id")
    .eq("id", colaborador_id)
    .single();

  const valorEstimado = colaborador ? calcularValorFerias(colaborador.salario_base, dias).total : null;

  await supabase.from("ferias").insert({
    colaborador_id,
    periodo_aquisitivo_id,
    data_inicio,
    data_fim,
    dias,
    status: "planejada",
    origem: "planejamento_auto",
    valor_estimado: valorEstimado,
  });

  await supabase.from("eventos_calendario").insert({
    titulo: `Férias (planejada) — ${colaborador?.nome ?? ""}`,
    categoria: "ferias",
    data_inicio,
    data_fim,
    colaborador_id,
    empresa_id: colaborador?.empresa_id ?? null,
  });

  revalidatePath("/ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  return { ok: true, mensagem: "Período planejado criado ✓" };
}

// ------------------------------------------------------------
// SIMULAÇÃO — cenários de planejamento de férias, sem afetar o mapa
// real até o RH decidir "Aprovar e converter em programação oficial".
// ------------------------------------------------------------

async function nomeUsuarioAtual(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: perfil } = await supabase.from("perfis").select("nome").eq("id", user.id).single();
    return perfil?.nome ?? user.email ?? null;
  } catch {
    return null;
  }
}

export async function criarCenario(formData: FormData) {
  const supabase = createClient();
  const nome = str(formData, "nome") ?? "Cenário sem nome";
  const descricao = str(formData, "descricao");
  const empresa_id = str(formData, "empresa_id");
  const unidade_id = str(formData, "unidade_id");
  const ano = num(formData, "ano") || new Date().getFullYear();
  const usuario_responsavel = await nomeUsuarioAtual(supabase);

  const { data } = await supabase
    .from("cenarios_simulacao")
    .insert({
      nome,
      descricao,
      empresa_id,
      unidade_id,
      ano,
      config: normalizarConfig(null),
      status: "rascunho",
      usuario_responsavel,
    })
    .select("id")
    .single();

  revalidatePath("/ferias/simulacao");
  if (data?.id) redirect(`/ferias/simulacao?cenario=${data.id}`);
}

export async function excluirCenario(cenarioId: string) {
  const supabase = createClient();
  // apagar o cenário já apaga em cascata as férias de simulação ligadas a ele (on delete cascade)
  await supabase.from("cenarios_simulacao").delete().eq("id", cenarioId);
  revalidatePath("/ferias/simulacao");
  redirect("/ferias/simulacao");
}

/** "Duplicar cenário": copia a config e todos os períodos simulados pra um novo cenário independente. */
export async function duplicarCenario(cenarioId: string) {
  const supabase = createClient();
  const { data: original } = await supabase.from("cenarios_simulacao").select("*").eq("id", cenarioId).single();
  if (!original) return;

  const usuario_responsavel = await nomeUsuarioAtual(supabase);
  const { data: copia } = await supabase
    .from("cenarios_simulacao")
    .insert({
      nome: `${original.nome} (cópia)`,
      descricao: original.descricao,
      empresa_id: original.empresa_id,
      unidade_id: original.unidade_id,
      ano: original.ano,
      config: original.config,
      status: "rascunho",
      usuario_responsavel,
    })
    .select("id")
    .single();
  if (!copia?.id) return;

  const { data: periodos } = await supabase.from("ferias").select("*").eq("cenario_id", cenarioId).eq("simulacao", true);
  const linhas = ((periodos ?? []) as Ferias[]).map((p) => ({
    colaborador_id: p.colaborador_id,
    periodo_aquisitivo_id: p.periodo_aquisitivo_id,
    cenario_id: copia.id,
    simulacao: true,
    origem: "simulacao",
    origem_simulacao: p.origem_simulacao,
    status: "planejada",
    data_inicio: p.data_inicio,
    data_fim: p.data_fim,
    dias: p.dias,
    valor_estimado: p.valor_estimado,
  }));
  if (linhas.length > 0) await supabase.from("ferias").insert(linhas);

  revalidatePath("/ferias/simulacao");
  redirect(`/ferias/simulacao?cenario=${copia.id}`);
}

/** "Limpar simulação": apaga todos os períodos (manuais e automáticos) do cenário, mas mantém o cenário e a configuração salva. */
export async function limparCenario(cenarioId: string) {
  const supabase = createClient();
  await supabase.from("ferias").delete().eq("cenario_id", cenarioId).eq("simulacao", true);
  revalidatePath("/ferias/simulacao");
}

/** Salva a "Configuração da simulação" (modelo de divisão, regras de data, capacidade da equipe, estratégia). */
export async function atualizarConfigCenario(formData: FormData) {
  const supabase = createClient();
  const cenario_id = str(formData, "cenario_id");
  if (!cenario_id) return;

  const modelo = (str(formData, "modelo") ?? "15_15") as ConfigSimulacao["modelo"];
  const p1 = num(formData, "p1");
  const p2 = num(formData, "p2");
  const p3 = num(formData, "p3");

  const somenteSegQui = bool(formData, "somente_seg_qui");
  const diasMarcados = formData.getAll("dias_preferenciais").map((v) => String(v)) as ConfigSimulacao["diasPreferenciais"];
  const diasPreferenciais = somenteSegQui
    ? (["segunda", "terca", "quarta", "quinta"] as ConfigSimulacao["diasPreferenciais"])
    : diasMarcados;

  const config: ConfigSimulacao = {
    modelo,
    periodosPersonalizados: [p1, p2, p3].filter((d) => d > 0),
    diasPreferenciais,
    intervaloMinMeses: num(formData, "intervalo_min") || 4,
    intervaloMaxMeses: num(formData, "intervalo_max") || 6,
    capacidadeMaxUnidade: formData.get("capacidade_unidade") ? num(formData, "capacidade_unidade") : null,
    capacidadeMaxDepartamento: formData.get("capacidade_departamento") ? num(formData, "capacidade_departamento") : null,
    estrategia: (str(formData, "estrategia") ?? "equilibrada") as ConfigSimulacao["estrategia"],
    pesos: {
      dataLimite: num(formData, "peso_data_limite") || 0,
      cobertura: num(formData, "peso_cobertura") || 0,
      distribuicao: num(formData, "peso_distribuicao") || 0,
      preferencias: num(formData, "peso_preferencias") || 0,
    },
  };

  await supabase
    .from("cenarios_simulacao")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", cenario_id);
  revalidatePath("/ferias/simulacao");
}

export interface ResultadoDefinicaoManual {
  ok: boolean;
  erro?: string;
}

/**
 * "Definir manualmente": salva até 3 períodos escolhidos pelo RH pra 1
 * colaborador dentro do cenário, sempre vinculados ao período aquisitivo
 * informado. Valida o fracionamento legal e a regra de início da CLT
 * antes de gravar — se algo não bater, devolve o erro sem salvar nada.
 */
export async function definirFeriasManualCenario(formData: FormData): Promise<ResultadoDefinicaoManual> {
  const supabase = createClient();
  const cenario_id = str(formData, "cenario_id");
  const colaborador_id = str(formData, "colaborador_id");
  const periodo_aquisitivo_id = str(formData, "periodo_aquisitivo_id");
  if (!cenario_id || !colaborador_id || !periodo_aquisitivo_id) {
    return { ok: false, erro: "Faltam dados obrigatórios." };
  }

  const linhas = [1, 2, 3]
    .map((i) => ({ inicio: str(formData, `inicio${i}`), dias: num(formData, `dias${i}`) }))
    .filter((l) => l.inicio && l.dias > 0) as { inicio: string; dias: number }[];

  if (linhas.length === 0) return { ok: false, erro: "Informe ao menos 1 período com data de início." };

  const [{ data: periodo }, { data: colaborador }, { data: feriadosData }, { data: usadosData }] = await Promise.all([
    supabase.from("periodos_aquisitivos").select("*").eq("id", periodo_aquisitivo_id).single(),
    supabase.from("colaboradores").select("salario_base").eq("id", colaborador_id).single(),
    supabase.from("feriados").select("*"),
    supabase
      .from("ferias")
      .select("dias")
      .eq("periodo_aquisitivo_id", periodo_aquisitivo_id)
      .eq("simulacao", false)
      .neq("status", "cancelado"),
  ]);
  if (!periodo || !colaborador) return { ok: false, erro: "Colaborador ou período aquisitivo não encontrado." };

  const usados = ((usadosData ?? []) as { dias: number }[]).reduce((s, f) => s + f.dias, 0);
  const saldo = calcularSaldo(usados);

  const { valido, erro } = validarFracionamento(
    linhas.map((l) => l.dias),
    saldo
  );
  if (!valido) return { ok: false, erro: erro ?? "Fracionamento inválido." };

  const feriadosSet = paraSetDeDatas((feriadosData ?? []) as Feriado[]);
  const limite = new Date(periodo.limite_concessao);

  const janelas: JanelaData[] = linhas.map((l) => ({
    inicio: new Date(l.inicio),
    fim: addDays(new Date(l.inicio), l.dias - 1),
  }));

  for (const j of janelas) {
    if (!respeitaRegraInicio(j.inicio, feriadosSet)) {
      return {
        ok: false,
        erro: `⚠️ Data inválida: ${j.inicio.toLocaleDateString("pt-BR")} não pode ser início de férias (cai numa sexta/sábado ou nos 2 dias antes de um feriado — CLT art. 134 §3º).`,
      };
    }
    if (j.fim > limite) {
      return { ok: false, erro: `⚠️ O período iniciado em ${j.inicio.toLocaleDateString("pt-BR")} ultrapassa o limite de concessão (${limite.toLocaleDateString("pt-BR")}).` };
    }
  }
  for (let i = 0; i < janelas.length; i++) {
    for (let j = i + 1; j < janelas.length; j++) {
      if (janelas[i].inicio <= janelas[j].fim && janelas[j].inicio <= janelas[i].fim) {
        return { ok: false, erro: "Os períodos informados se sobrepõem — ajuste as datas." };
      }
    }
  }

  // substitui qualquer definição anterior desse colaborador nesse cenário (manual ou automática)
  await supabase.from("ferias").delete().eq("cenario_id", cenario_id).eq("colaborador_id", colaborador_id).eq("simulacao", true);

  const valorPorDia = calcularValorFerias(colaborador.salario_base, 1).total;
  const novasLinhas = linhas.map((l) => ({
    colaborador_id,
    periodo_aquisitivo_id,
    cenario_id,
    simulacao: true,
    origem: "simulacao",
    origem_simulacao: "manual",
    status: "planejada",
    data_inicio: l.inicio,
    data_fim: addDays(new Date(l.inicio), l.dias - 1).toISOString().slice(0, 10),
    dias: l.dias,
    valor_estimado: valorPorDia * l.dias,
  }));
  await supabase.from("ferias").insert(novasLinhas);

  revalidatePath("/ferias/simulacao");
  return { ok: true };
}

/** Limpa a definição (manual ou automática) de 1 colaborador nesse cenário — ele volta a aparecer como "não definido". */
export async function removerDefinicaoColaborador(cenarioId: string, colaboradorId: string) {
  const supabase = createClient();
  await supabase.from("ferias").delete().eq("cenario_id", cenarioId).eq("colaborador_id", colaboradorId).eq("simulacao", true);
  revalidatePath("/ferias/simulacao");
}

export async function removerPeriodoSimulado(id: string) {
  const supabase = createClient();
  // o .eq("simulacao", true) é uma trava de segurança — esse botão nunca apaga uma férias real
  await supabase.from("ferias").delete().eq("id", id).eq("simulacao", true);
  revalidatePath("/ferias/simulacao");
}

/** "Edição direta no mapa/lista": ajusta a data de início e a quantidade de dias de 1 período já simulado. */
export async function editarPeriodoSimulado(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  const data_inicio = str(formData, "data_inicio");
  const dias = num(formData, "dias");
  if (!id || !data_inicio || dias <= 0) return;

  const { data: periodo } = await supabase.from("ferias").select("colaborador_id").eq("id", id).eq("simulacao", true).single();
  if (!periodo) return;
  const { data: colaborador } = await supabase.from("colaboradores").select("salario_base").eq("id", periodo.colaborador_id).single();
  const data_fim = addDays(new Date(data_inicio), dias - 1).toISOString().slice(0, 10);
  const valorEstimado = colaborador ? calcularValorFerias(colaborador.salario_base, dias).total : null;

  await supabase
    .from("ferias")
    .update({ data_inicio, data_fim, dias, valor_estimado: valorEstimado, origem_simulacao: "manual" })
    .eq("id", id)
    .eq("simulacao", true);
  revalidatePath("/ferias/simulacao");
}

interface ResumoGeracaoAutomatica {
  criados: number;
  semPeriodoAquisitivo: string[];
  saldoInsuficiente: string[];
  incompletos: string[];
}

/**
 * Motor do "Gerar automaticamente": pra cada colaborador do escopo do
 * cenário que ainda não tem NENHUM período simulado (nem manual, nem
 * automático), gera os períodos do modelo configurado respeitando
 * feriados, regra de início da CLT, intervalo entre períodos, dias
 * preferenciais e capacidade máxima simultânea por unidade/departamento.
 * Períodos definidos manualmente nunca são tocados por essa função.
 */
async function executarGeracaoAutomatica(cenarioId: string): Promise<ResumoGeracaoAutomatica> {
  const supabase = createClient();

  const { data: cenario } = await supabase.from("cenarios_simulacao").select("*").eq("id", cenarioId).single();
  const resumo: ResumoGeracaoAutomatica = { criados: 0, semPeriodoAquisitivo: [], saldoInsuficiente: [], incompletos: [] };
  if (!cenario) return resumo;

  const config = normalizarConfig(cenario.config);
  const periodosDias = periodosDoModelo(config);
  const diasPreferenciaisSet = diasPreferenciaisParaSet(config.diasPreferenciais);

  const [
    { data: colaboradoresData },
    { data: aquisitivosData },
    { data: feriasReaisData },
    { data: feriasSimuladasData },
    { data: feriadosData },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("ferias").select("*").eq("simulacao", false).neq("status", "cancelado"),
    supabase.from("ferias").select("*").eq("cenario_id", cenarioId).eq("simulacao", true),
    supabase.from("feriados").select("*"),
  ]);

  let colaboradores = (colaboradoresData ?? []) as Colaborador[];
  if (cenario.empresa_id) colaboradores = colaboradores.filter((c) => c.empresa_id === cenario.empresa_id);
  if (cenario.unidade_id) colaboradores = colaboradores.filter((c) => c.unidade_id === cenario.unidade_id);

  const aquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];
  const feriasReais = (feriasReaisData ?? []) as Ferias[];
  const feriasSimuladas = (feriasSimuladasData ?? []) as Ferias[];
  const feriadosSet = paraSetDeDatas((feriadosData ?? []) as Feriado[]);

  const jaDefinidos = new Set(feriasSimuladas.map((f) => f.colaborador_id));
  const aquisitivoPorColaborador = new Map<string, PeriodoAquisitivo>();
  for (const p of aquisitivos) {
    const atual = aquisitivoPorColaborador.get(p.colaborador_id);
    if (!atual || new Date(p.limite_concessao) < new Date(atual.limite_concessao)) {
      aquisitivoPorColaborador.set(p.colaborador_id, p);
    }
  }

  // fila de colaboradores a gerar, na ordem definida pela estratégia
  let fila = colaboradores.filter((c) => !jaDefinidos.has(c.id) && aquisitivoPorColaborador.has(c.id));
  if (config.estrategia === "vencimento") {
    fila = fila.slice().sort((a, b) => {
      const la = aquisitivoPorColaborador.get(a.id)!.limite_concessao;
      const lb = aquisitivoPorColaborador.get(b.id)!.limite_concessao;
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
  } else if (config.estrategia === "operacional") {
    fila = fila
      .slice()
      .sort((a, b) => (a.unidade_id ?? "").localeCompare(b.unidade_id ?? "") || (a.departamento ?? "").localeCompare(b.departamento ?? "") || a.nome.localeCompare(b.nome));
  } else {
    fila = fila.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  }

  for (const c of colaboradores) {
    if (!aquisitivoPorColaborador.has(c.id) && !jaDefinidos.has(c.id)) resumo.semPeriodoAquisitivo.push(c.nome);
  }

  // capacidade + ocupação, seedadas com o que já existe (real + manual) no escopo
  const contagemUnidade = new Map<string, Map<string, number>>();
  const contagemDepartamento = new Map<string, Map<string, number>>();
  // ocupação DO PRÓPRIO colaborador (real + já simulada) — usada só pra o 2º/3º
  // período dele não cair na mesma semana do 1º; não tem nada a ver com os
  // colegas de unidade (isso é o que contagemUnidade/maxUnidade controla).
  const ocupadasPorColaborador = new Map<string, JanelaData[]>();
  const contagemMesGlobal = new Map<string, number>();

  const unidadePorColaborador = new Map(colaboradoresData ? (colaboradoresData as Colaborador[]).map((c) => [c.id, c.unidade_id]) : []);
  const departamentoPorColaborador = new Map(colaboradoresData ? (colaboradoresData as Colaborador[]).map((c) => [c.id, c.departamento]) : []);

  function chaveMes(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}`;
  }
  function registrarOcupacao(colaboradorId: string, janela: JanelaData) {
    if (!ocupadasPorColaborador.has(colaboradorId)) ocupadasPorColaborador.set(colaboradorId, []);
    ocupadasPorColaborador.get(colaboradorId)!.push(janela);

    const unidadeId = unidadePorColaborador.get(colaboradorId) ?? null;
    const depto = departamentoPorColaborador.get(colaboradorId) ?? null;
    if (unidadeId) {
      if (!contagemUnidade.has(unidadeId)) contagemUnidade.set(unidadeId, new Map());
      incrementarContagemLocal(contagemUnidade.get(unidadeId)!, janela);
    }
    if (unidadeId && depto) {
      const chave = `${unidadeId}::${depto}`;
      if (!contagemDepartamento.has(chave)) contagemDepartamento.set(chave, new Map());
      incrementarContagemLocal(contagemDepartamento.get(chave)!, janela);
    }
    contagemMesGlobal.set(chaveMes(janela.inicio), (contagemMesGlobal.get(chaveMes(janela.inicio)) ?? 0) + 1);
  }
  function incrementarContagemLocal(mapa: Map<string, number>, janela: JanelaData) {
    let d = janela.inicio;
    while (d <= janela.fim) {
      const k = d.toISOString().slice(0, 10);
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
      d = addDays(d, 1);
    }
  }

  for (const f of [...feriasReais, ...feriasSimuladas]) {
    registrarOcupacao(f.colaborador_id, { inicio: new Date(f.data_inicio), fim: new Date(f.data_fim) });
  }

  const inicioPreferido = cenario.ano ? new Date(cenario.ano, 0, 1) : undefined;
  const novasLinhas: Record<string, unknown>[] = [];

  for (const colaborador of fila) {
    const periodoAquisitivo = aquisitivoPorColaborador.get(colaborador.id)!;
    const { data: usadosData } = await supabase
      .from("ferias")
      .select("dias")
      .eq("periodo_aquisitivo_id", periodoAquisitivo.id)
      .eq("simulacao", false)
      .neq("status", "cancelado");
    const usados = ((usadosData ?? []) as { dias: number }[]).reduce((s, f) => s + f.dias, 0);
    const saldo = calcularSaldo(usados);

    const { valido } = validarFracionamento(periodosDias, saldo);
    if (!valido) {
      resumo.saldoInsuficiente.push(colaborador.nome);
      continue;
    }

    const unidadeId = colaborador.unidade_id;
    const depto = colaborador.departamento;
    const chaveDepto = unidadeId && depto ? `${unidadeId}::${depto}` : null;

    const resultado = gerarPeriodosParaColaborador(
      periodosDias,
      periodoAquisitivo,
      {
        feriadosSet,
        diasPreferenciais: diasPreferenciaisSet,
        ocupadasColaborador: ocupadasPorColaborador.get(colaborador.id) ?? [],
        contagemUnidade: unidadeId ? contagemUnidade.get(unidadeId) : undefined,
        maxUnidade: config.capacidadeMaxUnidade,
        contagemDepartamento: chaveDepto ? contagemDepartamento.get(chaveDepto) : undefined,
        maxDepartamento: config.capacidadeMaxDepartamento,
      },
      {
        intervaloMinMeses: config.intervaloMinMeses,
        intervaloMaxMeses: config.intervaloMaxMeses,
        estrategia: config.estrategia,
        pesos: config.pesos,
        contagemMesGlobal,
        inicioPreferido,
      }
    );

    if (resultado.periodos.length === 0) {
      resumo.incompletos.push(colaborador.nome);
      continue;
    }
    if (resultado.incompleto) resumo.incompletos.push(colaborador.nome);

    const valorPorDia = calcularValorFerias(colaborador.salario_base, 1).total;
    for (const janela of resultado.periodos) {
      const dias = Math.round((janela.fim.getTime() - janela.inicio.getTime()) / 86400000) + 1;
      novasLinhas.push({
        colaborador_id: colaborador.id,
        periodo_aquisitivo_id: periodoAquisitivo.id,
        cenario_id: cenarioId,
        simulacao: true,
        origem: "simulacao",
        origem_simulacao: "automatica",
        status: "planejada",
        data_inicio: janela.inicio.toISOString().slice(0, 10),
        data_fim: janela.fim.toISOString().slice(0, 10),
        dias,
        valor_estimado: valorPorDia * dias,
      });
      registrarOcupacao(colaborador.id, janela);
    }
    resumo.criados++;
  }

  if (novasLinhas.length > 0) await supabase.from("ferias").insert(novasLinhas);

  revalidatePath("/ferias/simulacao");
  return resumo;
}

/** "🎲 Gerar automaticamente" / "GERAR FÉRIAS ALEATORIAMENTE": gera só pra quem ainda não tem nenhuma definição no cenário. */
export async function gerarAutomaticoParaRestantes(cenarioId: string): Promise<ResumoGeracaoAutomatica> {
  return executarGeracaoAutomatica(cenarioId);
}

/** "🎲 Nova simulação": mantém as férias definidas manualmente e gera datas novas só pros colaboradores automáticos. */
export async function regenerarAutomaticos(cenarioId: string): Promise<ResumoGeracaoAutomatica> {
  const supabase = createClient();
  await supabase.from("ferias").delete().eq("cenario_id", cenarioId).eq("simulacao", true).eq("origem_simulacao", "automatica");
  return executarGeracaoAutomatica(cenarioId);
}

/** "Aprovar e converter em programação oficial": os períodos do cenário viram férias planejadas de verdade, aparecem no mapa real. O cenário continua existindo (histórico), só solto dos períodos que promoveu. */
export async function promoverCenario(cenarioId: string) {
  const supabase = createClient();

  const { data: periodos } = await supabase
    .from("ferias")
    .select("id, colaborador_id, data_inicio, data_fim, colaboradores(nome, empresa_id)")
    .eq("cenario_id", cenarioId)
    .eq("simulacao", true);

  await supabase
    .from("ferias")
    .update({ simulacao: false, cenario_id: null, status: "planejada" })
    .eq("cenario_id", cenarioId)
    .eq("simulacao", true);

  await supabase
    .from("cenarios_simulacao")
    .update({ status: "aprovado", updated_at: new Date().toISOString() })
    .eq("id", cenarioId);

  type LinhaPromovida = {
    id: string;
    colaborador_id: string;
    data_inicio: string;
    data_fim: string;
    colaboradores: { nome: string; empresa_id: string | null } | null;
  };
  const eventos = ((periodos ?? []) as unknown as LinhaPromovida[]).map((p) => ({
    titulo: `Férias (planejada) — ${p.colaboradores?.nome ?? ""}`,
    categoria: "ferias",
    data_inicio: p.data_inicio,
    data_fim: p.data_fim,
    colaborador_id: p.colaborador_id,
    empresa_id: p.colaboradores?.empresa_id ?? null,
  }));
  if (eventos.length > 0) await supabase.from("eventos_calendario").insert(eventos);

  revalidatePath("/ferias/simulacao");
  revalidatePath("/ferias");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
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

// Exclui uma empresa. Isso APAGA EM CASCATA todas as filiais/unidades dela
// (on delete cascade). Colaboradores, eventos de calendário, candidatos e
// cenários de simulação vinculados a ela NÃO são apagados — só ficam sem
// empresa vinculada (on delete set null).
export async function excluirEmpresa(id: string) {
  const supabase = createClient();
  await supabase.from("empresas").delete().eq("id", id);

  revalidatePath("/projecao-custo");
  revalidatePath("/dashboard");
  revalidatePath("/colaboradores");
}

// Avança uma data para a próxima ocorrência de um evento que repete.
function proximaOcorrencia(data: Date, repete: string): Date {
  const d = new Date(data);
  if (repete === "diaria") d.setDate(d.getDate() + 1);
  else if (repete === "semanal") d.setDate(d.getDate() + 7);
  else if (repete === "mensal") d.setMonth(d.getMonth() + 1);
  else if (repete === "anual") d.setFullYear(d.getFullYear() + 1);
  return d;
}

export async function criarEventoCalendario(formData: FormData) {
  const supabase = createClient();

  const titulo = str(formData, "titulo");
  const categoria = str(formData, "categoria");
  const dataInicioStr = str(formData, "data_inicio");
  if (!titulo || !categoria || !dataInicioStr) return;

  const dataFimStr = str(formData, "data_fim");
  const cor = str(formData, "cor");
  const repete = str(formData, "repete") ?? "nenhuma";
  const repeteAteStr = str(formData, "repete_ate");

  const linhaBase = {
    titulo,
    categoria,
    descricao: str(formData, "descricao"),
    cor,
    alerta_email_1: str(formData, "alerta_email_1"),
    alerta_email_2: str(formData, "alerta_email_2"),
  };

  if (repete === "nenhuma") {
    await supabase.from("eventos_calendario").insert({
      ...linhaBase,
      data_inicio: dataInicioStr,
      data_fim: dataFimStr,
      repete: "nenhuma",
    });
  } else {
    // Gera uma ocorrência por linha (mesmo "span" de dias em cada uma, se o
    // evento tiver data final), até a data limite informada ou, se não
    // informada, até 1 ano a partir do início — com um teto de segurança
    // pra nunca gerar uma quantidade absurda de linhas de uma vez.
    const dataInicio = new Date(dataInicioStr + "T00:00:00");
    const duracaoDias = dataFimStr
      ? Math.max(0, Math.round((new Date(dataFimStr + "T00:00:00").getTime() - dataInicio.getTime()) / 86400000))
      : 0;
    const limite = repeteAteStr
      ? new Date(repeteAteStr + "T00:00:00")
      : new Date(dataInicio.getFullYear() + 1, dataInicio.getMonth(), dataInicio.getDate());

    const serieId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const linhas: Record<string, unknown>[] = [];
    let atual = dataInicio;
    let contador = 0;
    while (atual <= limite && contador < 400) {
      const fimOcorrencia = duracaoDias > 0 ? new Date(atual.getTime() + duracaoDias * 86400000) : null;
      linhas.push({
        ...linhaBase,
        data_inicio: atual.toISOString().slice(0, 10),
        data_fim: fimOcorrencia ? fimOcorrencia.toISOString().slice(0, 10) : null,
        repete,
        serie_id: serieId,
      });
      atual = proximaOcorrencia(atual, repete);
      contador++;
    }

    if (linhas.length > 0) {
      await supabase.from("eventos_calendario").insert(linhas);
    }
  }

  revalidatePath("/calendario");
}

export async function excluirEventoCalendario(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  if (!id) return;
  await supabase.from("eventos_calendario").delete().eq("id", id);
  revalidatePath("/calendario");
}

export async function atualizarConfigCalendario(formData: FormData) {
  const supabase = createClient();
  await supabase.from("config_calendario").upsert({
    id: "default",
    whatsapp_numero_1: str(formData, "whatsapp_numero_1"),
    whatsapp_numero_2: str(formData, "whatsapp_numero_2"),
    relatorio_diario_ativo: bool(formData, "relatorio_diario_ativo"),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/configuracoes/calendario");
  revalidatePath("/calendario");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
