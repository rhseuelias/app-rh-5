import { addDays, addMonths, differenceInCalendarDays } from "date-fns";
import type { Colaborador, DiaSemana } from "@/types/db";

/**
 * Custo total mensal de um colaborador CLT para a empresa, incluindo
 * encargos e passivo trabalhista proporcional (1/12 avos).
 * Baseado no que foi definido para o módulo de Projeção de Custo.
 */
export function custoMensalColaborador(c: Colaborador): number {
  if (c.tipo === "PJ") {
    return c.valor_nota_fiscal ?? 0;
  }

  const remuneracao = c.salario_base + c.comissao_media + c.auxilio_outros;
  const beneficios =
    c.custo_vt + c.custo_va_vr + c.custo_assist_medica + c.custo_assist_psicologica;

  const inss_patronal = remuneracao * 0.2; // INSS patronal 20%
  const fgts = remuneracao * 0.08; // FGTS 8%

  // passivo trabalhista proporcional (1/12 avos por mês)
  const decimo_terceiro = remuneracao / 12;
  const ferias = remuneracao / 12;
  const terco_ferias = remuneracao / 36; // 1/3 das férias, prorateado
  const multa_rescisoria = (fgts * 12 * 0.4) / 12; // 40% do FGTS anual, prorateado

  return (
    remuneracao +
    beneficios +
    inss_patronal +
    fgts +
    decimo_terceiro +
    ferias +
    terco_ferias +
    multa_rescisoria
  );
}

/**
 * Mesmo cálculo de custoMensalColaborador, mas com o detalhamento separado
 * em remuneração / benefícios / tributos / passivo trabalhista — usado na
 * Projeção de Custo para mostrar o custo de cada empresa "aberto".
 */
export function custoDetalhado(c: Colaborador) {
  if (c.tipo === "PJ") {
    const total = c.valor_nota_fiscal ?? 0;
    return { remuneracao: total, beneficios: 0, tributos: 0, passivoTrabalhista: 0, total };
  }

  const remuneracao = c.salario_base + c.comissao_media + c.auxilio_outros;
  const beneficios =
    c.custo_vt + c.custo_va_vr + c.custo_assist_medica + c.custo_assist_psicologica;

  const inss_patronal = remuneracao * 0.2;
  const fgts = remuneracao * 0.08;
  const tributos = inss_patronal + fgts;

  const decimo_terceiro = remuneracao / 12;
  const ferias = remuneracao / 12;
  const terco_ferias = remuneracao / 36;
  const multa_rescisoria = (fgts * 12 * 0.4) / 12;
  const passivoTrabalhista = decimo_terceiro + ferias + terco_ferias + multa_rescisoria;

  const total = remuneracao + beneficios + tributos + passivoTrabalhista;

  return { remuneracao, beneficios, tributos, passivoTrabalhista, total };
}

/** % do custo total de folha sobre o faturamento — indicador verde/vermelho do dashboard. */
export function percentualFolhaSobreFaturamento(
  custoTotalFolha: number,
  faturamento: number
): number | null {
  if (!faturamento || faturamento <= 0) return null;
  return (custoTotalFolha / faturamento) * 100;
}

export const LIMITE_SAUDAVEL_FOLHA_PCT = 15;

/** Data prevista de fim do período de experiência (90 dias corridos da admissão). */
export function calcularFimExperiencia(dataAdmissao: string): Date {
  return addDays(new Date(dataAdmissao), 90);
}

/** Quantos dias faltam para o fim da experiência (negativo = já passou). */
export function diasParaFimExperiencia(dataFimExperiencia: string): number {
  return differenceInCalendarDays(new Date(dataFimExperiencia), new Date());
}

/**
 * Gera o período aquisitivo de férias (12 meses a partir da admissão ou do
 * fim do período aquisitivo anterior) e o limite legal de concessão
 * (11 meses após o fim do período aquisitivo — total 23 meses da abertura).
 */
export function calcularPeriodoAquisitivo(dataInicio: string) {
  const inicio = new Date(dataInicio);
  const fim = addMonths(inicio, 12);
  const limite_concessao = addMonths(fim, 11);
  return { inicio, fim, limite_concessao };
}

/** Dias até o limite de concessão de férias vencer (útil para alertas). */
export function diasParaVencerFerias(limiteConcessao: string): number {
  return differenceInCalendarDays(new Date(limiteConcessao), new Date());
}

// ------------------------------------------------------------
// FÉRIAS — status, cores do mapa e legenda
// ------------------------------------------------------------
export const FERIAS_STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  solicitado: "Solicitado",
  aprovado: "Aprovada",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

/** Cor de cada status no mapa de férias — azul (planejada), verde (aprovada/concluída), cinza (solicitado/cancelada). Conflito e simulação são sobrepostos por fora, não substituem essa cor. */
export const FERIAS_STATUS_COR: Record<string, string> = {
  planejada: "bg-blue-500",
  solicitado: "bg-slate-400",
  aprovado: "bg-emerald-500",
  concluido: "bg-emerald-600",
  cancelado: "bg-slate-300",
};

export const FERIAS_LEGENDA = [
  { label: "Planejada", cor: "bg-blue-500" },
  { label: "Aprovada", cor: "bg-emerald-500" },
  { label: "Simulação", cor: "bg-amber-400" },
  { label: "Conflito", cor: "bg-red-500" },
];

export const ETAPAS_ONBOARDING_LABEL: Record<string, string> = {
  pre_admissao: "Pré-admissão",
  primeiro_dia: "Primeiro dia",
  checkin_30: "Check-in 30 dias",
  avaliacao_45: "Avaliação 45 dias",
  avaliacao_90: "Avaliação final (90 dias)",
};

export const CATEGORIA_EVENTO_LABEL: Record<string, string> = {
  admissao: "Admissão",
  ferias: "Férias",
  feriado: "Feriado",
  reuniao: "Reunião",
  acao_rh: "Ação de RH",
  aniversario: "Aniversário",
  prazo_dp: "Prazo de DP",
};

export const CATEGORIA_EVENTO_COR: Record<string, string> = {
  admissao: "#4f46e5",
  ferias: "#059669",
  feriado: "#dc2626",
  reuniao: "#d97706",
  acao_rh: "#7c3aed",
  aniversario: "#db2777",
  prazo_dp: "#0891b2",
};

// Paleta de cores que o usuário pode escolher ao criar um evento (em vez de
// ficar preso à cor padrão da categoria). Se o evento não tiver "cor"
// própria, cai na cor da categoria (CATEGORIA_EVENTO_COR) como antes.
export const PALETA_CORES_EVENTO: string[] = [
  "#4f46e5", // índigo
  "#2563eb", // azul
  "#0891b2", // ciano
  "#059669", // esmeralda
  "#65a30d", // verde-lima
  "#d97706", // âmbar
  "#ea580c", // laranja
  "#dc2626", // vermelho
  "#db2777", // rosa
  "#7c3aed", // roxo
  "#475569", // grafite
  "#0f172a", // quase-preto
];

export const REPETICAO_EVENTO_LABEL: Record<string, string> = {
  nenhuma: "Não repete",
  diaria: "Todos os dias",
  semanal: "Todas as semanas",
  mensal: "Todos os meses",
  anual: "Todos os anos",
};

// ------------------------------------------------------------
// PROCESSO DE INTEGRAÇÃO
// ------------------------------------------------------------
export const STATUS_ETAPA_LABEL: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  pendente: "Não realizado",
  em_andamento: "Em andamento",
  realizado: "Realizado",
  em_experiencia: "Em experiência",
};

/** Classes Tailwind pra cada status de etapa — badge, ponto da linha do tempo e barra do painel. */
export const STATUS_ETAPA_COR: Record<
  string,
  { badge: string; dot: string; barra: string }
> = {
  nao_iniciado: { badge: "bg-slate-100 text-slate-500", dot: "bg-slate-400", barra: "bg-slate-300" },
  pendente: { badge: "bg-red-100 text-red-700", dot: "bg-red-500", barra: "bg-red-500" },
  em_andamento: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500", barra: "bg-amber-400" },
  realizado: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", barra: "bg-emerald-500" },
  em_experiencia: { badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500", barra: "bg-blue-500" },
};

export const RESPONSAVEL_LABEL: Record<string, string> = {
  RH: "RH",
  LIDER: "Líder",
  FUNCIONARIO: "Funcionário",
  SISTEMA: "Sistema",
};

/** Progresso do período de experiência (90 dias corridos por padrão, configurável). */
export function calcularExperiencia(dataAdmissao: string, prazoDias: number = 90) {
  const inicio = new Date(dataAdmissao);
  const hoje = new Date();
  const fim = addDays(inicio, prazoDias);
  const diasDecorridos = Math.max(0, differenceInCalendarDays(hoje, inicio));
  const diasRestantes = differenceInCalendarDays(fim, hoje);
  const percentual = Math.min(100, Math.max(0, Math.round((diasDecorridos / prazoDias) * 100)));
  return { fim, diasDecorridos, diasRestantes, percentual };
}

/** Uma etapa está atrasada se tiver prazo vencido e ainda não tiver sido concluída. */
export function etapaAtrasada(prazo: string | null, status: string): boolean {
  if (!prazo || status === "realizado" || status === "em_experiencia") return false;
  return new Date(prazo).getTime() < Date.now();
}

// ------------------------------------------------------------
// FICHA DE ADMISSÃO — dados pessoais, funcionais e de benefícios
// ------------------------------------------------------------

export const ESTADO_CIVIL_LABEL: Record<string, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
  uniao_estavel: "União estável",
};

export const GRAU_INSTRUCAO_LABEL: Record<string, string> = {
  fundamental_incompleto: "Fundamental Incompleto",
  fundamental_completo: "Fundamental Completo",
  medio_incompleto: "Médio Incompleto",
  medio_completo: "Médio Completo",
  superior_incompleto: "Superior Incompleto",
  superior_completo: "Superior Completo",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado_pos_doutorado: "Doutorado/Pós-Doutorado",
};

export const CONTRATO_EXPERIENCIA_LABEL: Record<string, string> = {
  "90_dias_45_45": "90 dias (45 + 45)",
  "90_dias_15_75": "90 dias (15 + 75)",
  "45_dias_45": "45 dias (45 apenas)",
};

export const TIPO_RESCISAO_OPCOES = [
  "Dispensa sem justa causa",
  "Dispensa com justa causa",
  "Pedido de demissão",
  "Rescisão por acordo (mútuo)",
  "Término de contrato de experiência",
  "Rescisão indireta",
  "Aposentadoria",
  "Falecimento",
];

export const ADIANTAMENTO_OPCOES = [20, 30, 40];

export const DIAS_SEMANA: { chave: DiaSemana; label: string }[] = [
  { chave: "segunda", label: "Segunda-feira" },
  { chave: "terca", label: "Terça-feira" },
  { chave: "quarta", label: "Quarta-feira" },
  { chave: "quinta", label: "Quinta-feira" },
  { chave: "sexta", label: "Sexta-feira" },
  { chave: "sabado", label: "Sábado" },
  { chave: "domingo", label: "Domingo" },
];

export const DIAS_SEMANA_LABEL: Record<string, string> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [d.chave, d.label])
);

type HorarioDiaCampos = {
  manha_entrada?: string | null;
  manha_saida?: string | null;
  tarde_entrada?: string | null;
  tarde_saida?: string | null;
};

/** Total de minutos trabalhados no dia, a partir dos 4 horários (início/intervalo/fim). */
export function minutosCargaDia(dia?: HorarioDiaCampos | null): number {
  if (!dia) return 0;
  function paraMinutos(hhmm?: string | null): number | null {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }
  const manhaIni = paraMinutos(dia.manha_entrada);
  const manhaFim = paraMinutos(dia.manha_saida);
  const tardeIni = paraMinutos(dia.tarde_entrada);
  const tardeFim = paraMinutos(dia.tarde_saida);
  let total = 0;
  if (manhaIni !== null && manhaFim !== null && manhaFim > manhaIni) total += manhaFim - manhaIni;
  if (tardeIni !== null && tardeFim !== null && tardeFim > tardeIni) total += tardeFim - tardeIni;
  return total;
}

/** Formata um total de minutos como "H:MM" (ex.: 510 → "8:30"). */
export function formatarHorasMinutos(totalMinutos: number): string {
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Formata um total de minutos como "H:MM:SS" (segundos sempre "00" — a régua não registra segundos). */
export function formatarHorasMinutosSegundos(totalMinutos: number): string {
  return `${formatarHorasMinutos(totalMinutos)}:00`;
}

/** Carga horária diária, a partir dos 4 horários de um dia (em minutos → texto "Xh Ymin"). */
export function cargaHorariaDia(dia?: HorarioDiaCampos | null): string {
  const total = minutosCargaDia(dia);
  if (total === 0) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${m}min`;
}
