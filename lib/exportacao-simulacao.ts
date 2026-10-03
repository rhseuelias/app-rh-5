import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import {
  calcularSaldo,
  normalizarConfig,
  periodosDoModelo,
  ESTRATEGIAS_SIMULACAO,
  unidadesDoCenario,
  unidadeNoEscopo,
} from "@/lib/simulacao-ferias";
import type { Colaborador, Ferias, PeriodoAquisitivo, CenarioSimulacao } from "@/types/db";
import type { ColaboradorExportacao, DadosExportacaoSimulacao, PeriodoExportacao, StatusExportacao } from "@/lib/exportacao-simulacao-util";

export * from "@/lib/exportacao-simulacao-util";

/**
 * Busca os dados da exportação (PDF e Excel) de um cenário de simulação de
 * férias: uma linha por COLABORADOR (com os períodos dele), incluindo quem
 * ainda não tem nenhum período ("sem definição"). Só CLT, como a tela.
 */

export async function buscarDadosExportacaoSimulacao(cenarioId: string): Promise<DadosExportacaoSimulacao | null> {
  const supabase = createClient();
  const { data: cenarioData } = await supabase.from("cenarios_simulacao").select("*").eq("id", cenarioId).single();
  if (!cenarioData) return null;
  const cenario = cenarioData as CenarioSimulacao;

  const ocultarValores = await souAssistente();

  const [
    { data: empresaData },
    { data: unidadesData },
    { data: colaboradoresData },
    { data: aquisitivosData },
    { data: feriasReaisData },
    { data: feriasSimuladasData },
  ] = await Promise.all([
    cenario.empresa_id
      ? supabase.from("empresas").select("nome").eq("id", cenario.empresa_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("unidades").select("id, nome"),
    supabase.from("colaboradores").select("*").eq("tipo", "CLT").in("status", ["ativo", "experiencia"]),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("ferias").select("periodo_aquisitivo_id, dias").eq("simulacao", false).neq("status", "cancelado"),
    supabase.from("ferias").select("*").eq("cenario_id", cenarioId).eq("simulacao", true),
  ]);

  const config = normalizarConfig(cenario.config);
  const escopoUnidades = unidadesDoCenario(cenario, config);
  const nomeUnidade = new Map(((unidadesData ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));

  let colaboradores = (colaboradoresData ?? []) as Colaborador[];
  if (cenario.empresa_id) colaboradores = colaboradores.filter((c) => c.empresa_id === cenario.empresa_id);
  colaboradores = colaboradores.filter((c) => unidadeNoEscopo(c.unidade_id, escopoUnidades));
  const ids = new Set(colaboradores.map((c) => c.id));

  // período aquisitivo aberto com o limite mais próximo (mesma regra da tela)
  const aquisitivoPorColaborador = new Map<string, PeriodoAquisitivo>();
  for (const p of (aquisitivosData ?? []) as PeriodoAquisitivo[]) {
    if (!ids.has(p.colaborador_id)) continue;
    const atual = aquisitivoPorColaborador.get(p.colaborador_id);
    if (!atual || new Date(p.limite_concessao) < new Date(atual.limite_concessao)) {
      aquisitivoPorColaborador.set(p.colaborador_id, p);
    }
  }

  const usadosPorPeriodo = new Map<string, number>();
  for (const f of (feriasReaisData ?? []) as { periodo_aquisitivo_id: string | null; dias: number }[]) {
    if (!f.periodo_aquisitivo_id) continue;
    usadosPorPeriodo.set(f.periodo_aquisitivo_id, (usadosPorPeriodo.get(f.periodo_aquisitivo_id) ?? 0) + f.dias);
  }

  const simuladasPor = new Map<string, Ferias[]>();
  for (const f of (feriasSimuladasData ?? []) as Ferias[]) {
    if (!simuladasPor.has(f.colaborador_id)) simuladasPor.set(f.colaborador_id, []);
    simuladasPor.get(f.colaborador_id)!.push(f);
  }

  const lista: ColaboradorExportacao[] = colaboradores
    .filter((c) => aquisitivoPorColaborador.has(c.id))
    .map((c) => {
      const aq = aquisitivoPorColaborador.get(c.id)!;
      const saldo = calcularSaldo(usadosPorPeriodo.get(aq.id) ?? 0);
      const periodos: PeriodoExportacao[] = (simuladasPor.get(c.id) ?? [])
        .slice()
        .sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1))
        .map((f) => ({
          inicio: String(f.data_inicio).slice(0, 10),
          fim: String(f.data_fim).slice(0, 10),
          dias: f.dias,
          origem: f.origem_simulacao === "manual" ? ("manual" as const) : ("automatica" as const),
          valorEstimado: ocultarValores ? null : f.valor_estimado ?? null,
        }));
      const totalDias = periodos.reduce((s, p) => s + p.dias, 0);
      const status: StatusExportacao =
        saldo <= 0 || (totalDias > 0 && totalDias >= saldo) ? "completo" : totalDias > 0 ? "parcial" : "sem_definicao";
      return {
        nome: c.nome,
        unidadeNome: (c.unidade_id && nomeUnidade.get(c.unidade_id)) || "Sem unidade",
        limiteConcessao: String(aq.limite_concessao).slice(0, 10),
        periodos,
        totalDias,
        saldo,
        status,
      };
    })
    .sort((a, b) => a.unidadeNome.localeCompare(b.unidadeNome, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  const unidadesTexto = escopoUnidades.length
    ? escopoUnidades.map((id) => nomeUnidade.get(id) ?? "—").join(", ")
    : "Todas";
  const divisaoTexto = periodosDoModelo(config).join(" + ") || "30";
  const estrategia = ESTRATEGIAS_SIMULACAO.find((e) => e.valor === config.estrategia);
  const prioridadeTexto = (estrategia?.label ?? config.estrategia).toLowerCase();
  const n = config.capacidadeMaxUnidade;
  const maxUnidadeTexto = n == null ? null : `máx. ${n} pessoa${n !== 1 ? "s" : ""} fora por unidade`;
  const NOMES_DIA: Record<string, string> = {
    segunda: "segunda",
    terca: "terça",
    quarta: "quarta",
    quinta: "quinta",
    sexta: "sexta",
    sabado: "sábado",
    domingo: "domingo",
  };
  const regras: [string, string][] = [
    ["Cenário", cenario.nome],
    ["Ano", String(cenario.ano ?? new Date().getFullYear())],
    ["Empresa", (empresaData as { nome: string } | null)?.nome ?? "Todas"],
    ["Unidade", unidadesTexto],
    ["Status", cenario.status === "aprovado" ? "Aprovado" : "Rascunho"],
    ["Responsável", cenario.usuario_responsavel ?? "—"],
    ["Divisão das férias", `${divisaoTexto} dias`],
    ["Prioridade", estrategia?.label ?? config.estrategia],
    [
      "Dias preferenciais de início",
      config.diasPreferenciais.length ? config.diasPreferenciais.map((d) => NOMES_DIA[d] ?? d).join(", ") : "sem preferência",
    ],
    ["Intervalo entre períodos", `${config.intervaloMinMeses} a ${config.intervaloMaxMeses} meses`],
    ["Máximo fora ao mesmo tempo, por unidade", config.capacidadeMaxUnidade != null ? String(config.capacidadeMaxUnidade) : "sem limite"],
    [
      "Máximo fora ao mesmo tempo, por departamento",
      config.capacidadeMaxDepartamento != null ? String(config.capacidadeMaxDepartamento) : "sem limite",
    ],
  ];
  if (config.estrategia === "personalizada") {
    regras.push([
      "Pesos da prioridade personalizada",
      `data-limite ${config.pesos.dataLimite}% · cobertura ${config.pesos.cobertura}% · distribuição ${config.pesos.distribuicao}% · preferências ${config.pesos.preferencias}%`,
    ]);
  }
  return {
    cabecalho: {
      cenarioNome: cenario.nome,
      empresaNome: (empresaData as { nome: string } | null)?.nome ?? "Todas",
      unidadeNome: unidadesTexto,
      ano: cenario.ano ?? new Date().getFullYear(),
      status: cenario.status,
      responsavel: cenario.usuario_responsavel ?? null,
      divisaoTexto,
      prioridadeTexto,
      maxUnidadeTexto,
      regras,
    },
    colaboradores: lista,
    mostrarValores: !ocultarValores,
    geradoEm: new Date(),
  };
}

