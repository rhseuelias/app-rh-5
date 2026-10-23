/**
 * Módulo Desligamentos — listas, tipos e cálculos (sem acesso ao banco).
 * Datas sempre como texto "AAAA-MM-DD".
 */

export type Iniciativa = "colaborador" | "empresa" | "acordo" | "outro";

export const INICIATIVAS: { valor: Iniciativa; rotulo: string }[] = [
  { valor: "colaborador", rotulo: "Iniciativa do colaborador" },
  { valor: "empresa", rotulo: "Iniciativa da empresa" },
  { valor: "acordo", rotulo: "Acordo entre as partes" },
  { valor: "outro", rotulo: "Término de contrato / outros" },
];

export const ROTULO_INICIATIVA: Record<string, string> = {
  colaborador: "Colaborador",
  empresa: "Empresa",
  acordo: "Acordo",
  outro: "Outros",
};

export const TIPOS_RESCISAO = [
  "Pedido de demissão",
  "Dispensa sem justa causa",
  "Dispensa por justa causa",
  "Acordo (art. 484-A da CLT)",
  "Término de contrato de experiência",
  "Rescisão de contrato PJ",
  "Término de estágio",
  "Falecimento",
  "Outros",
];

/** Os motivos mostrados dependem da iniciativa. O sistema nunca sugere um motivo. */
export const MOTIVOS_POR_INICIATIVA: Record<Iniciativa, string[]> = {
  colaborador: [
    "Nova oportunidade profissional",
    "Remuneração ou benefícios",
    "Insatisfação com a liderança",
    "Clima organizacional",
    "Jornada ou condições de trabalho",
    "Falta de oportunidade de crescimento",
    "Motivos pessoais",
    "Mudança de cidade",
    "Incompatibilidade com o cargo",
    "Outros",
  ],
  empresa: [
    "Desempenho abaixo do esperado",
    "Conduta ou comportamento",
    "Não adaptação ao cargo",
    "Término do período de experiência",
    "Reestruturação ou redução de quadro",
    "Fechamento ou redução de unidade",
    "Outros",
  ],
  acordo: ["Acordo entre as partes", "Outros"],
  outro: ["Término de contrato", "Término de estágio", "Aposentadoria", "Falecimento", "Outros"],
};

export const AVISOS = [
  { valor: "trabalhado", rotulo: "Trabalhado" },
  { valor: "indenizado", rotulo: "Indenizado" },
  { valor: "dispensado", rotulo: "Dispensado" },
  { valor: "nao_se_aplica", rotulo: "Não se aplica" },
] as const;

export const ENTREVISTAS = [
  { valor: "realizada", rotulo: "Realizada" },
  { valor: "nao_realizada", rotulo: "Não realizada" },
  { valor: "nao_se_aplica", rotulo: "Não se aplica" },
] as const;

export const RECONTRATAVEL = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "avaliar", rotulo: "A avaliar" },
] as const;

export const ROTULO_AVISO: Record<string, string> = Object.fromEntries(AVISOS.map((a) => [a.valor, a.rotulo]));
export const ROTULO_ENTREVISTA: Record<string, string> = Object.fromEntries(ENTREVISTAS.map((a) => [a.valor, a.rotulo]));
export const ROTULO_RECONTRATAVEL: Record<string, string> = Object.fromEntries(RECONTRATAVEL.map((a) => [a.valor, a.rotulo]));

/** Linha do banco (tabela desligamentos_registro). */
export interface RegistroDesligamento {
  id: string;
  colaborador_id: string | null;
  nome: string;
  matricula: string | null;
  vinculo: string | null;
  empresa: string | null;
  unidade: string | null;
  departamento: string | null;
  cargo: string | null;
  gestor: string | null;
  data_admissao: string | null;
  status_anterior: string | null;
  data_desligamento: string;
  data_comunicacao: string | null;
  ultimo_dia_trabalhado: string | null;
  iniciativa: Iniciativa;
  tipo_rescisao: string;
  motivo_principal: string;
  aviso_previo: string | null;
  entrevista: string | null;
  recontratavel: string | null;
  custo_rescisorio: number | null;
  motivo_complementar: string | null;
  observacoes_restritas: string | null;
  status: "ativo" | "cancelado";
  cancelado_em: string | null;
  cancelado_por: string | null;
  cancelado_justificativa: string | null;
  registrado_por: string | null;
  created_at: string;
}

export interface ConfigDesligamentos {
  limite_90_dias: number;
  limite_quadro_unidade: number;
  meta_entrevistas: number;
  minimo_quadro: number;
}

export const CONFIG_PADRAO: ConfigDesligamentos = {
  limite_90_dias: 20,
  limite_quadro_unidade: 12,
  meta_entrevistas: 70,
  minimo_quadro: 10,
};

/** Dados mínimos do colaborador para contar o quadro. */
export interface ColabQuadro {
  empresa: string;
  unidade: string;
  admissao: string | null;
  desligamento: string | null;
}

// ---------------------------------------------------------------- datas

export function hojeSP(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function dataValida(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function diasEntre(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function somarDias(s: string, dias: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês, deslocado em `meses` (pode ser negativo). */
export function inicioMesDeslocado(s: string, meses: number): string {
  const d = new Date(`${s.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function textoTempoDeCasa(dias: number | null): string {
  if (dias === null || dias < 0) return "—";
  if (dias < 31) return `${dias} dia${dias === 1 ? "" : "s"}`;
  if (dias < 365) return `${Math.floor(dias / 30)} m`;
  const anos = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  return meses > 0 ? `${anos} ano${anos > 1 ? "s" : ""} ${meses} m` : `${anos} ano${anos > 1 ? "s" : ""}`;
}

export function tempoDeCasaDias(r: Pick<RegistroDesligamento, "data_admissao" | "data_desligamento">): number | null {
  if (!r.data_admissao) return null;
  const d = diasEntre(r.data_admissao, r.data_desligamento);
  return d < 0 ? null : d;
}

// ---------------------------------------------------------------- período

export type PeriodoChave = "mes" | "trimestre" | "semestre" | "ano" | "personalizado";

export const PERIODOS: { valor: PeriodoChave; rotulo: string }[] = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "trimestre", rotulo: "Trimestre" },
  { valor: "semestre", rotulo: "Semestre" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export interface Intervalo {
  de: string;
  ate: string;
}

/** Período escolhido e o período anterior de mesmo tamanho. */
export function calcularIntervalos(
  periodo: PeriodoChave,
  hoje: string,
  de?: string,
  ate?: string
): { atual: Intervalo; anterior: Intervalo } {
  if (periodo === "personalizado" && dataValida(de) && dataValida(ate) && de <= ate) {
    const tam = diasEntre(de, ate) + 1;
    return { atual: { de, ate }, anterior: { de: somarDias(de, -tam), ate: somarDias(de, -1) } };
  }
  const meses = periodo === "mes" ? 1 : periodo === "trimestre" ? 3 : periodo === "ano" ? 12 : 6;
  // o período termina hoje e começa no 1º dia do mês, (meses - 1) meses atrás
  const inicio = inicioMesDeslocado(hoje, -(meses - 1));
  const anteriorInicio = inicioMesDeslocado(inicio, -meses);
  return {
    atual: { de: inicio, ate: hoje },
    anterior: { de: anteriorInicio, ate: somarDias(inicio, -1) },
  };
}

export function emIntervalo(data: string, i: Intervalo): boolean {
  return data >= i.de && data <= i.ate;
}

// ---------------------------------------------------------------- quadro e turnover

export function quadroEm(cols: ColabQuadro[], data: string): number {
  return cols.filter((c) => c.admissao && c.admissao <= data && !(c.desligamento && c.desligamento <= data)).length;
}

export function admissoesNoPeriodo(cols: ColabQuadro[], i: Intervalo): number {
  return cols.filter((c) => c.admissao && emIntervalo(c.admissao, i)).length;
}

export function quadroMedio(cols: ColabQuadro[], i: Intervalo): number {
  return (quadroEm(cols, i.de) + quadroEm(cols, i.ate)) / 2;
}

/** Turnover geral = [(admissões + desligamentos) / 2] / quadro médio × 100 */
export function turnoverGeral(admissoes: number, desligamentos: number, quadroMed: number): number | null {
  if (quadroMed <= 0) return null;
  return (((admissoes + desligamentos) / 2) / quadroMed) * 100;
}

/** Turnover voluntário = desligamentos por iniciativa do colaborador / quadro médio × 100 */
export function turnoverVoluntario(voluntarios: number, quadroMed: number): number | null {
  if (quadroMed <= 0) return null;
  return (voluntarios / quadroMed) * 100;
}

export function pct(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return (parte / total) * 100;
}

export function fmtPct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(casas).replace(".", ",")}%`;
}

export function fmtNumero(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function fmtReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Variação percentual simples entre dois períodos (null = sem base para comparar). */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

// ---------------------------------------------------------------- faixas

export const FAIXAS_PERMANENCIA = [
  { chave: "ate90", rotulo: "Até 90 dias", min: 0, max: 90 },
  { chave: "91a180", rotulo: "91 a 180 dias", min: 91, max: 180 },
  { chave: "181a365", rotulo: "181 a 365 dias", min: 181, max: 365 },
  { chave: "mais365", rotulo: "Mais de 1 ano", min: 366, max: Infinity },
];

export function faixaDePermanencia(dias: number | null): string | null {
  if (dias === null) return null;
  return FAIXAS_PERMANENCIA.find((f) => dias >= f.min && dias <= f.max)?.chave ?? null;
}

/** Conta quantos itens há em cada valor, do maior para o menor. */
export function contar<T>(itens: T[], chave: (x: T) => string | null | undefined): { nome: string; qtd: number }[] {
  const m = new Map<string, number>();
  for (const x of itens) {
    const k = (chave(x) ?? "").trim() || "Não informado";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function ehVoluntario(r: Pick<RegistroDesligamento, "iniciativa">): boolean {
  return r.iniciativa === "colaborador";
}

export function ehInvoluntario(r: Pick<RegistroDesligamento, "iniciativa">): boolean {
  return r.iniciativa === "empresa";
}
