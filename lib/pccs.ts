// Regras do PCCS (pontuação, formação por categoria e decisão). Valores e pesos são os do manual, a validar com a Diretoria.

export type Categoria = "operacional" | "tatico" | "estrategico";

export const FORMACAO: { nome: string; pontos: number }[] = [
  { nome: "Ensino fundamental", pontos: 0 },
  { nome: "Ensino médio", pontos: 1 },
  { nome: "Curso técnico na área", pontos: 2 },
  { nome: "Graduação", pontos: 3 },
  { nome: "Pós-graduação", pontos: 4 },
  { nome: "MBA", pontos: 5 },
];

// mínimo exigido e teto que pontua (índices de FORMACAO)
export const CATEGORIAS: Record<Categoria, { nome: string; exemplos: string; min: number; max: number }> = {
  operacional: { nome: "Operacional", exemplos: "Manobrista, recepcionista e demais operacionais", min: 1, max: 2 },
  tatico: { nome: "Tático", exemplos: "De analista a coordenador", min: 3, max: 4 },
  estrategico: { nome: "Estratégico", exemplos: "Gerentes e diretores", min: 4, max: 5 },
};

export const PESOS = { resultados: 35, tecnica: 25, comportamento: 20, preparacao: 20 } as const;
export const NOTA_MINIMA = 80;
export const PROGRESSAO_PCT = 4; // dentro da faixa, por ciclo, com nota mínima
export const PROMOCAO_MIN_PCT = 10;

export interface IndicadorValor {
  nome: string;
  alvo: string; // meta cadastrada na descrição do cargo ("0", "100%", "≥ 90%")
  tipo: "zero" | "pct";
  valor: number;
}

export function tipoIndicador(alvo: string): "zero" | "pct" {
  const limpo = alvo.replace(/[^\d.,]/g, "").replace(",", ".");
  return limpo !== "" && Number(limpo) === 0 ? "zero" : "pct";
}

export function alvoNumero(alvo: string): number {
  const n = Number(alvo.replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/** Atingimento de 0 a 100. "zero" = quanto menos melhor (meta 0); "pct" = quanto mais perto da meta melhor. */
export function atingimento(i: IndicadorValor): number {
  if (i.tipo === "zero") return Math.max(0, 100 - 25 * i.valor);
  return Math.max(0, Math.min(100, (i.valor / alvoNumero(i.alvo)) * 100));
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

export interface EntradaCalculo {
  categoria: Categoria;
  formacao: number;
  tecnicas: Record<string, number>;
  comportamentais: Record<string, number>;
  indicadores: IndicadorValor[];
  preparacao: number;
}

export interface ResultadoCalculo {
  resultados: number;
  tecnica: number;
  formacaoPts: number;
  comportamento: number;
  preparacao: number;
  total: number;
  atendeMinimoFormacao: boolean;
}

export function calcular(e: EntradaCalculo): ResultadoCalculo {
  const cat = CATEGORIAS[e.categoria];
  const formacaoPts = FORMACAO[Math.min(e.formacao, cat.max)].pontos; // acima do teto não soma
  const resultados = (media(e.indicadores.map(atingimento)) / 100) * PESOS.resultados;
  const tecnica = (media(Object.values(e.tecnicas)) / 5) * (PESOS.tecnica - 5) + formacaoPts;
  const comportamento = (media(Object.values(e.comportamentais)) / 5) * PESOS.comportamento;
  const preparacao = (e.preparacao / 5) * PESOS.preparacao;
  const total = resultados + tecnica + comportamento + preparacao;
  return { resultados, tecnica, formacaoPts, comportamento, preparacao, total, atendeMinimoFormacao: e.formacao >= cat.min };
}

export interface EntradaDecisao {
  total: number;
  atendeMinimoFormacao: boolean;
  pdi_ok: boolean;
  rh_ok: boolean;
  alcada_ok: boolean;
  vaga_ok: boolean;
}

export function decisaoMes12(d: EntradaDecisao): { decisao: string; ok: boolean; pendencias: string[] } {
  const pend: string[] = [];
  if (d.total < NOTA_MINIMA) pend.push(`Nota abaixo de ${NOTA_MINIMA}`);
  if (!d.atendeMinimoFormacao) pend.push("Formação abaixo do mínimo do cargo");
  if (!d.pdi_ok) pend.push("Plano de desenvolvimento não cumprido");
  if (!d.rh_ok) pend.push("Sem validação do RH");
  if (!d.alcada_ok) pend.push("Sem aprovação da alçada");
  if (!d.vaga_ok) pend.push("Sem posição disponível");
  if (pend.length === 0) return { decisao: "Promoção recomendada", ok: true, pendencias: [] };
  if (d.total >= NOTA_MINIMA) return { decisao: "Progressão na faixa, promoção pendente", ok: false, pendencias: pend };
  return { decisao: "Manter no cargo com novo plano de desenvolvimento", ok: false, pendencias: pend };
}

export function brl(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export const num1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
