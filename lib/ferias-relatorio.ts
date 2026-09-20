import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Feriado, Ferias, PeriodoAquisitivo } from "@/types/db";
import { calcularValorFerias, gerarPrevisaoColaborador, paraSetDeDatas, type JanelaData } from "@/lib/ferias-calculos";

export interface PeriodoRelatorio {
  inicio: string;
  fim: string;
  dias: number;
  valor: number;
}

export interface PrevisaoFeriasRelatorio {
  colaboradorNome: string;
  empresaNome: string;
  unidadeNome: string;
  periodo1: PeriodoRelatorio | null;
  periodo2: PeriodoRelatorio | null;
  /** true quando um 2º período era esperado (dias escolhidos < 30) — usado só pra distinguir "sem 2º período porque foi 1 período único" de "não achou data válida pro 2º período". */
  periodo2Necessario: boolean;
  valorTotal: number;
  origem: "salva" | "calculada_agora" | "indisponivel";
  nomeArquivoBase: string;
}

/**
 * Monta os dados do "Gerar previsão de férias" (relatório do colaborador):
 * usa os períodos já salvos ligados ao período aquisitivo aberto, se
 * existirem; senão calcula uma prévia na hora com o mesmo motor do
 * planejamento automático (sem gravar nada no banco), usando `diasPeriodo1`
 * (escolhido pelo RH antes de gerar) como tamanho do 1º período — o resto
 * do saldo (até 30) vira o 2º período.
 */
export async function buscarPrevisaoFerias(
  colaboradorId: string,
  diasPeriodo1: number = 15
): Promise<PrevisaoFeriasRelatorio | null> {
  const supabase = createClient();

  const { data: colaboradorData } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", colaboradorId)
    .single();
  if (!colaboradorData) return null;
  const c = colaboradorData as Colaborador;

  const [{ data: empresaData }, { data: unidadeData }, { data: aquisitivosData }] = await Promise.all([
    c.empresa_id ? supabase.from("empresas").select("nome").eq("id", c.empresa_id).single() : Promise.resolve({ data: null }),
    c.unidade_id ? supabase.from("unidades").select("nome").eq("id", c.unidade_id).single() : Promise.resolve({ data: null }),
    supabase
      .from("periodos_aquisitivos")
      .select("*")
      .eq("colaborador_id", colaboradorId)
      .eq("status", "aberto")
      .order("limite_concessao", { ascending: true }),
  ]);

  const nomeArquivoBase = c.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/(^-|-$)/g, "");

  const periodoAberto = ((aquisitivosData ?? []) as PeriodoAquisitivo[])[0];

  const dias1Escolhido = Math.min(Math.max(Math.round(diasPeriodo1), 5), 30);

  const base: PrevisaoFeriasRelatorio = {
    colaboradorNome: c.nome,
    empresaNome: (empresaData as { nome: string } | null)?.nome ?? "—",
    unidadeNome: (unidadeData as { nome: string } | null)?.nome ?? "—",
    periodo1: null,
    periodo2: null,
    periodo2Necessario: dias1Escolhido < 30,
    valorTotal: 0,
    origem: "indisponivel",
    nomeArquivoBase,
  };

  if (!periodoAberto) return base;

  const { data: feriasDoPeriodo } = await supabase
    .from("ferias")
    .select("*")
    .eq("periodo_aquisitivo_id", periodoAberto.id)
    .neq("status", "cancelado")
    .eq("simulacao", false)
    .order("data_inicio", { ascending: true });

  const lista = (feriasDoPeriodo ?? []) as Ferias[];

  if (lista.length > 0) {
    const paraPeriodo = (f: Ferias): PeriodoRelatorio => ({
      inicio: f.data_inicio,
      fim: f.data_fim,
      dias: f.dias,
      valor: f.valor_estimado ?? calcularValorFerias(c.salario_base, f.dias).total,
    });
    base.periodo1 = lista[0] ? paraPeriodo(lista[0]) : null;
    base.periodo2 = lista[1] ? paraPeriodo(lista[1]) : null;
    base.periodo2Necessario = lista.length > 1; // dados já salvos: só mostra "2º período" se de fato existir um 2º registro
    base.valorTotal = (base.periodo1?.valor ?? 0) + (base.periodo2?.valor ?? 0);
    base.origem = "salva";
    return base;
  }

  // nada salvo ainda pra esse período — calcula uma prévia agora, sem gravar
  const [{ data: feriadosData }, { data: colaboradoresTodos }, { data: feriasExistentes }] = await Promise.all([
    supabase.from("feriados").select("*"),
    supabase.from("colaboradores").select("id, unidade_id"),
    supabase.from("ferias").select("*").neq("status", "cancelado").eq("simulacao", false),
  ]);

  const feriadosSet = paraSetDeDatas((feriadosData ?? []) as Feriado[]);
  const unidadePorColaborador = Object.fromEntries(
    ((colaboradoresTodos ?? []) as { id: string; unidade_id: string | null }[]).map((x) => [x.id, x.unidade_id])
  );
  const ocupadas: JanelaData[] = ((feriasExistentes ?? []) as Ferias[])
    .filter(
      (f) =>
        f.colaborador_id !== colaboradorId &&
        c.unidade_id &&
        unidadePorColaborador[f.colaborador_id] === c.unidade_id
    )
    .map((f) => ({ inicio: new Date(f.data_inicio), fim: new Date(f.data_fim) }));

  const previsao = gerarPrevisaoColaborador(periodoAberto, feriadosSet, ocupadas, dias1Escolhido);
  if (!previsao) return base;

  const dias2Escolhido = 30 - dias1Escolhido;
  const valorPeriodo1 = calcularValorFerias(c.salario_base, dias1Escolhido).total;
  base.periodo1 = {
    inicio: previsao.periodo1.inicio.toISOString().slice(0, 10),
    fim: previsao.periodo1.fim.toISOString().slice(0, 10),
    dias: dias1Escolhido,
    valor: valorPeriodo1,
  };
  base.valorTotal = valorPeriodo1;

  if (previsao.periodo2) {
    const valorPeriodo2 = calcularValorFerias(c.salario_base, dias2Escolhido).total;
    base.periodo2 = {
      inicio: previsao.periodo2.inicio.toISOString().slice(0, 10),
      fim: previsao.periodo2.fim.toISOString().slice(0, 10),
      dias: dias2Escolhido,
      valor: valorPeriodo2,
    };
    base.valorTotal += valorPeriodo2;
  }
  base.origem = "calculada_agora";
  return base;
}

// ------------------------------------------------------------
// RELATÓRIO GERENCIAL — mesmos filtros da tela de Férias (Empresa,
// Unidade, Ano, Mês, Colaborador), usado pelos exports em PDF e Excel.
// ------------------------------------------------------------
export interface LinhaRelatorioFerias {
  colaboradorNome: string;
  periodoInicio: string;
  periodoFim: string;
  dias: number;
  status: string;
  valorEstimado: number | null;
}

export interface FiltrosRelatorioFerias {
  empresa?: string;
  unidade?: string;
  ano?: string;
  mes?: string;
  colaborador?: string;
}

export async function buscarLinhasRelatorioFerias(
  filtros: FiltrosRelatorioFerias
): Promise<LinhaRelatorioFerias[]> {
  const supabase = createClient();

  const [{ data: colaboradoresData }, { data: feriasData }] = await Promise.all([
    supabase.from("colaboradores").select("id, nome, empresa_id, unidade_id"),
    supabase.from("ferias").select("*"),
  ]);

  const colaboradores = (colaboradoresData ?? []) as {
    id: string;
    nome: string;
    empresa_id: string | null;
    unidade_id: string | null;
  }[];
  const todasFerias = (feriasData ?? []) as Ferias[];

  const colaboradoresFiltrados = colaboradores.filter((c) => {
    if (filtros.empresa && c.empresa_id !== filtros.empresa) return false;
    if (filtros.unidade && c.unidade_id !== filtros.unidade) return false;
    if (filtros.colaborador && c.id !== filtros.colaborador) return false;
    return true;
  });
  const idsNoEscopo = new Set(colaboradoresFiltrados.map((c) => c.id));
  const nomePorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.nome]));

  const anoSelecionado = filtros.ano ? Number(filtros.ano) : new Date().getFullYear();
  const mesSelecionado = filtros.mes ? Number(filtros.mes) : null;
  const inicioIntervalo = mesSelecionado
    ? new Date(anoSelecionado, mesSelecionado - 1, 1)
    : new Date(anoSelecionado, 0, 1);
  const fimIntervalo = mesSelecionado
    ? new Date(anoSelecionado, mesSelecionado, 0)
    : new Date(anoSelecionado, 11, 31);

  return todasFerias
    .filter((f) => idsNoEscopo.has(f.colaborador_id) && !f.simulacao && f.status !== "cancelado")
    .filter((f) => {
      const inicio = new Date(f.data_inicio);
      const fim = new Date(f.data_fim);
      return inicio <= fimIntervalo && fim >= inicioIntervalo;
    })
    .map((f) => ({
      colaboradorNome: nomePorColaborador[f.colaborador_id] ?? "—",
      periodoInicio: f.data_inicio,
      periodoFim: f.data_fim,
      dias: f.dias,
      status: f.status,
      valorEstimado: f.valor_estimado ?? null,
    }))
    .sort((a, b) => (a.periodoInicio < b.periodoInicio ? -1 : 1));
}

// ------------------------------------------------------------
// EXPORT DE 1 CENÁRIO DE SIMULAÇÃO (mapa de férias — simulação)
// ------------------------------------------------------------
export interface LinhaRelatorioSimulacao {
  colaboradorNome: string;
  periodoInicio: string;
  periodoFim: string;
  dias: number;
  origemSimulacao: "manual" | "automatica" | null;
  valorEstimado: number | null;
}

export interface CabecalhoSimulacao {
  cenarioNome: string;
  empresaNome: string;
  unidadeNome: string;
  ano: number | null;
  status: string;
}

export async function buscarDadosRelatorioSimulacao(
  cenarioId: string
): Promise<{ cabecalho: CabecalhoSimulacao; linhas: LinhaRelatorioSimulacao[] } | null> {
  const supabase = createClient();
  const { data: cenario } = await supabase.from("cenarios_simulacao").select("*").eq("id", cenarioId).single();
  if (!cenario) return null;

  const [{ data: empresaData }, { data: unidadeData }, { data: feriasData }] = await Promise.all([
    cenario.empresa_id
      ? supabase.from("empresas").select("nome").eq("id", cenario.empresa_id).single()
      : Promise.resolve({ data: null }),
    cenario.unidade_id
      ? supabase.from("unidades").select("nome").eq("id", cenario.unidade_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("ferias")
      .select("*, colaboradores(nome)")
      .eq("cenario_id", cenarioId)
      .eq("simulacao", true)
      .order("data_inicio", { ascending: true }),
  ]);

  type LinhaBruta = {
    data_inicio: string;
    data_fim: string;
    dias: number;
    origem_simulacao: "manual" | "automatica" | null;
    valor_estimado: number | null;
    colaboradores: { nome: string } | null;
  };

  const linhas: LinhaRelatorioSimulacao[] = ((feriasData ?? []) as unknown as LinhaBruta[]).map((f) => ({
    colaboradorNome: f.colaboradores?.nome ?? "—",
    periodoInicio: f.data_inicio,
    periodoFim: f.data_fim,
    dias: f.dias,
    origemSimulacao: f.origem_simulacao,
    valorEstimado: f.valor_estimado,
  }));

  return {
    cabecalho: {
      cenarioNome: cenario.nome,
      empresaNome: (empresaData as { nome: string } | null)?.nome ?? "Todas",
      unidadeNome: (unidadeData as { nome: string } | null)?.nome ?? "Todas",
      ano: cenario.ano,
      status: cenario.status,
    },
    linhas,
  };
}
