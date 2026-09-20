import { addDays, addMonths, differenceInCalendarDays, getDay } from "date-fns";
import type { ConfigSimulacao, DiaSemana, EstrategiaSimulacao, ModeloDivisaoFerias, PesosEstrategia } from "@/types/db";
import { respeitaRegraInicio, semanasEnvolvidas, type JanelaData } from "@/lib/ferias-calculos";

/**
 * Motor do Simulador avançado de férias: modelos de fracionamento,
 * validação legal do fracionamento, busca de datas respeitando
 * preferências de dia da semana e capacidade máxima simultânea por
 * unidade/departamento, e escolha da "melhor" data entre as candidatas
 * conforme a estratégia de priorização escolhida pelo RH.
 *
 * Reaproveita de lib/ferias-calculos.ts as regras já validadas (início
 * CLT art. 134 §3º, semanas envolvidas) — não duplica essa lógica.
 */

// ------------------------------------------------------------
// MODELOS DE DIVISÃO (fracionamento)
// ------------------------------------------------------------
export const MODELOS_DIVISAO: { valor: ModeloDivisaoFerias; label: string; periodos: number[] | null }[] = [
  { valor: "30", label: "30 dias (período único)", periodos: [30] },
  { valor: "15_15", label: "15 + 15 dias", periodos: [15, 15] },
  { valor: "20_10", label: "20 + 10 dias", periodos: [20, 10] },
  { valor: "14_16", label: "14 + 16 dias", periodos: [14, 16] },
  { valor: "14_10_6", label: "14 + 10 + 6 dias", periodos: [14, 10, 6] },
  { valor: "personalizado", label: "Personalizado", periodos: null },
];

export const ESTRATEGIAS_SIMULACAO: { valor: EstrategiaSimulacao; label: string; descricao: string }[] = [
  { valor: "equilibrada", label: "Equilibrada", descricao: "Distribui as férias ao longo do ano, evitando meses concentrados." },
  { valor: "vencimento", label: "Vencimento", descricao: "Prioriza quem tem data-limite de concessão mais próxima." },
  { valor: "operacional", label: "Operacional", descricao: "Evita concentrar pessoas da mesma unidade/departamento nos mesmos dias." },
  { valor: "personalizada", label: "Personalizada", descricao: "Combine pesos entre data-limite, cobertura, distribuição e preferências." },
];

export const CONFIG_SIMULACAO_PADRAO: ConfigSimulacao = {
  modelo: "15_15",
  periodosPersonalizados: [],
  diasPreferenciais: [],
  intervaloMinMeses: 4,
  intervaloMaxMeses: 6,
  capacidadeMaxUnidade: null,
  capacidadeMaxDepartamento: null,
  estrategia: "equilibrada",
  pesos: { dataLimite: 40, cobertura: 30, distribuicao: 20, preferencias: 10 },
};

/** Preenche os campos que faltarem com o padrão — cenários antigos (ou recém-criados) sempre viram uma config completa. */
export function normalizarConfig(config: Partial<ConfigSimulacao> | null | undefined): ConfigSimulacao {
  return {
    ...CONFIG_SIMULACAO_PADRAO,
    ...(config ?? {}),
    pesos: { ...CONFIG_SIMULACAO_PADRAO.pesos, ...(config?.pesos ?? {}) } as PesosEstrategia,
  };
}

export function periodosDoModelo(config: ConfigSimulacao): number[] {
  if (config.modelo === "personalizado") return config.periodosPersonalizados.filter((d) => d > 0);
  const preset = MODELOS_DIVISAO.find((m) => m.valor === config.modelo);
  return preset?.periodos ?? [30];
}

/**
 * Validação legal do fracionamento (CLT art. 134 §1º, redação da Lei
 * 13.467/2017): no máximo 3 períodos; pelo menos 1 com 14 dias corridos
 * ou mais; os demais com, no mínimo, 5 dias corridos cada.
 */
export function validarFracionamento(
  periodosDias: number[],
  saldoDisponivel: number
): { valido: boolean; erro: string | null } {
  const periodos = periodosDias.filter((d) => d > 0);
  if (periodos.length === 0) return { valido: false, erro: "Informe ao menos 1 período." };
  if (periodos.length > 3) return { valido: false, erro: "No máximo 3 períodos por período aquisitivo." };
  const soma = periodos.reduce((a, b) => a + b, 0);
  if (soma > saldoDisponivel) {
    return {
      valido: false,
      erro: `A soma dos períodos (${soma} dias) é maior que o saldo disponível (${saldoDisponivel} dias).`,
    };
  }
  if (periodos.length > 1) {
    if (!periodos.some((d) => d >= 14)) {
      return { valido: false, erro: "Pelo menos 1 período precisa ter 14 dias corridos ou mais (CLT, art. 134 §1º)." };
    }
    if (periodos.some((d) => d < 5)) {
      return { valido: false, erro: "Cada período do fracionamento precisa ter, no mínimo, 5 dias corridos." };
    }
  }
  return { valido: true, erro: null };
}

// ------------------------------------------------------------
// DIAS PREFERENCIAIS DE INÍCIO
// ------------------------------------------------------------
const DIA_SEMANA_INDICE: Record<DiaSemana, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

export function diasPreferenciaisParaSet(dias: DiaSemana[]): Set<number> {
  return new Set(dias.map((d) => DIA_SEMANA_INDICE[d]));
}

// ------------------------------------------------------------
// CAPACIDADE DA EQUIPE (máximo simultâneo por unidade/departamento)
// ------------------------------------------------------------
function chaveData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function contarPorDia(janelas: JanelaData[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const j of janelas) incrementarContagem(mapa, j);
  return mapa;
}

export function incrementarContagem(mapa: Map<string, number>, janela: JanelaData): void {
  let d = janela.inicio;
  while (d <= janela.fim) {
    const k = chaveData(d);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
    d = addDays(d, 1);
  }
}

function capacidadeDisponivel(mapa: Map<string, number> | undefined, max: number | null | undefined, janela: JanelaData): boolean {
  if (!mapa || max == null) return true;
  let d = janela.inicio;
  while (d <= janela.fim) {
    if ((mapa.get(chaveData(d)) ?? 0) >= max) return false;
    d = addDays(d, 1);
  }
  return true;
}

function somaOcupacao(mapa: Map<string, number> | undefined, janela: JanelaData): number {
  if (!mapa) return 0;
  let soma = 0;
  let d = janela.inicio;
  while (d <= janela.fim) {
    soma += mapa.get(chaveData(d)) ?? 0;
    d = addDays(d, 1);
  }
  return soma;
}

function menorData(a: Date, b: Date): Date {
  return a < b ? a : b;
}

// ------------------------------------------------------------
// BUSCA DE JANELAS CANDIDATAS
// ------------------------------------------------------------
export interface ContextoBusca {
  feriadosSet: Set<string>;
  diasPreferenciais: Set<number>; // vazio = sem preferência (qualquer dia útil permitido pela CLT)
  ocupadas: JanelaData[]; // do próprio colaborador (simulação + real) — não pode sobrepor nem cair na mesma semana
  contagemUnidade?: Map<string, number>;
  maxUnidade?: number | null;
  contagemDepartamento?: Map<string, number>;
  maxDepartamento?: number | null;
}

function janelaValidaCtx(inicio: Date, dias: number, limite: Date, ctx: ContextoBusca): JanelaData | null {
  if (!respeitaRegraInicio(inicio, ctx.feriadosSet)) return null;
  if (ctx.diasPreferenciais.size > 0 && !ctx.diasPreferenciais.has(getDay(inicio))) return null;
  const fim = addDays(inicio, dias - 1);
  if (fim > limite) return null;

  const janela: JanelaData = { inicio, fim };
  const semanasDaJanela = semanasEnvolvidas(janela);
  for (const ocupada of ctx.ocupadas) {
    if (janela.inicio <= ocupada.fim && ocupada.inicio <= janela.fim) return null;
    const semanasOcupada = semanasEnvolvidas(ocupada);
    if (semanasDaJanela.some((s) => semanasOcupada.includes(s))) return null;
  }

  if (!capacidadeDisponivel(ctx.contagemUnidade, ctx.maxUnidade, janela)) return null;
  if (!capacidadeDisponivel(ctx.contagemDepartamento, ctx.maxDepartamento, janela)) return null;

  return janela;
}

/** Varre a partir de `inicioBusca` e devolve até `quantidade` janelas válidas (pra depois escolher a melhor conforme a estratégia). */
export function buscarCandidatas(
  inicioBusca: Date,
  dias: number,
  limite: Date,
  ctx: ContextoBusca,
  quantidade = 5,
  maxTentativas = 500
): JanelaData[] {
  const candidatas: JanelaData[] = [];
  let candidato = inicioBusca;
  let tentativas = 0;
  while (candidatas.length < quantidade && tentativas < maxTentativas) {
    if (candidato > limite) break;
    const janela = janelaValidaCtx(candidato, dias, limite, ctx);
    if (janela) {
      candidatas.push(janela);
      candidato = addDays(janela.inicio, 7);
    } else {
      candidato = addDays(candidato, 1);
    }
    tentativas++;
  }
  return candidatas;
}

// ------------------------------------------------------------
// ESCOLHA DA MELHOR CANDIDATA (estratégia de priorização)
// ------------------------------------------------------------
export function escolherMelhorCandidata(
  candidatas: JanelaData[],
  opts: {
    estrategia: EstrategiaSimulacao;
    pesos: PesosEstrategia;
    limiteConcessao: Date;
    diasPreferenciais: Set<number>;
    contagemMesGlobal: Map<string, number>;
    contagemUnidade?: Map<string, number>;
  }
): JanelaData {
  if (candidatas.length <= 1 || opts.estrategia === "vencimento") return candidatas[0];

  function chaveMes(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}`;
  }

  let melhor = candidatas[0];
  let melhorScore = -Infinity;
  for (const cand of candidatas) {
    const ocupacaoMes = opts.contagemMesGlobal.get(chaveMes(cand.inicio)) ?? 0;
    const ocupacaoUnidade = somaOcupacao(opts.contagemUnidade, cand);
    const diasAteLimite = Math.max(0, differenceInCalendarDays(opts.limiteConcessao, cand.fim));
    const preferido = opts.diasPreferenciais.size === 0 || opts.diasPreferenciais.has(cand.inicio.getDay());

    let score: number;
    if (opts.estrategia === "operacional") {
      score = -ocupacaoUnidade;
    } else if (opts.estrategia === "personalizada") {
      const p = opts.pesos;
      const urgencia = 1 / (1 + diasAteLimite);
      const cobertura = 1 / (1 + ocupacaoUnidade);
      const distribuicao = 1 / (1 + ocupacaoMes);
      const preferencia = preferido ? 1 : 0;
      score = (p.dataLimite * urgencia + p.cobertura * cobertura + p.distribuicao * distribuicao + p.preferencias * preferencia) / 100;
    } else {
      // equilibrada (padrão): espalha entre os meses menos ocupados
      score = -ocupacaoMes;
    }
    if (score > melhorScore) {
      melhorScore = score;
      melhor = cand;
    }
  }
  return melhor;
}

// ------------------------------------------------------------
// GERAÇÃO SEQUENCIAL DE TODOS OS PERÍODOS DE 1 COLABORADOR
// ------------------------------------------------------------
export interface ResultadoGeracao {
  periodos: JanelaData[];
  incompleto: boolean;
}

export function gerarPeriodosParaColaborador(
  periodosDias: number[],
  periodoAquisitivo: { fim: string; limite_concessao: string },
  ctxBase: Omit<ContextoBusca, "ocupadas"> & { ocupadasColaborador: JanelaData[] },
  opts: {
    intervaloMinMeses: number;
    intervaloMaxMeses: number;
    estrategia: EstrategiaSimulacao;
    pesos: PesosEstrategia;
    contagemMesGlobal: Map<string, number>;
    inicioPreferido?: Date; // pra "puxar" o 1º período pro ano da simulação, quando possível
  }
): ResultadoGeracao {
  const limite = new Date(periodoAquisitivo.limite_concessao);
  const minimoInicio = new Date(periodoAquisitivo.fim);
  const periodos: JanelaData[] = [];
  let ocupadas = [...ctxBase.ocupadasColaborador];

  const diasValidos = periodosDias.filter((d) => d > 0);

  for (let i = 0; i < diasValidos.length; i++) {
    const dias = diasValidos[i];
    let inicioBusca: Date;
    let limiteBusca: Date;

    if (i === 0) {
      inicioBusca = opts.inicioPreferido && opts.inicioPreferido > minimoInicio ? opts.inicioPreferido : minimoInicio;
      limiteBusca = limite;
    } else {
      const anterior = periodos[periodos.length - 1];
      inicioBusca = addMonths(anterior.fim, opts.intervaloMinMeses);
      limiteBusca = menorData(addMonths(anterior.fim, opts.intervaloMaxMeses), limite);
    }

    const ctx: ContextoBusca = { ...ctxBase, ocupadas };
    let candidatas = buscarCandidatas(inicioBusca, dias, limiteBusca, ctx, 5);
    if (candidatas.length === 0 && i > 0) {
      // não coube dentro da janela preferida de intervalo — tenta até o limite legal de concessão
      candidatas = buscarCandidatas(inicioBusca, dias, limite, ctx, 5);
    }
    if (candidatas.length === 0) {
      return { periodos, incompleto: true };
    }

    const escolhida = escolherMelhorCandidata(candidatas, {
      estrategia: opts.estrategia,
      pesos: opts.pesos,
      limiteConcessao: limite,
      diasPreferenciais: ctxBase.diasPreferenciais,
      contagemMesGlobal: opts.contagemMesGlobal,
      contagemUnidade: ctxBase.contagemUnidade,
    });
    periodos.push(escolhida);
    ocupadas = [...ocupadas, escolhida];
  }

  return { periodos, incompleto: periodos.length < diasValidos.length };
}

// ------------------------------------------------------------
// SALDO
// ------------------------------------------------------------
export const DIAS_DIREITO_PADRAO = 30;

export function calcularSaldo(diasJaUtilizados: number, diasDireito: number = DIAS_DIREITO_PADRAO): number {
  return Math.max(0, diasDireito - diasJaUtilizados);
}
