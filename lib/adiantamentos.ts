import type { Colaborador, Unidade } from "@/types/db";

/** Quem pode receber adiantamento: CLT e Estágio, ativo ou em experiência. */
export function elegivelAdiantamento(c: Colaborador): boolean {
  return c.tipo !== "PJ" && (c.status === "ativo" || c.status === "experiencia");
}

/**
 * Valor do adiantamento = salário base × % da unidade (20, 30 ou 40).
 * Sem % na unidade, ou sem salário no cadastro, devolve null (a tela mostra "—").
 */
export function valorAdiantamento(c: Pick<Colaborador, "salario_base">, u: Pick<Unidade, "adiantamento_pct"> | undefined): number | null {
  const pct = u?.adiantamento_pct ?? null;
  const salario = Number(c.salario_base) || 0;
  if (!pct || salario <= 0) return null;
  return Math.round(salario * pct) / 100;
}
