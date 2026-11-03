import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { empresaVT, grupoVT } from "@/lib/vale-transporte";

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

/**
 * Desconto de vale transporte = 6% do salário base (limite da lei).
 * Só existe se o colaborador recebe VT e está marcado para ter o desconto. Sem salário, devolve null.
 */
export function descontoValeTransporte(c: Pick<Colaborador, "salario_base" | "vale_transporte" | "vale_transporte_desconto">): number | null {
  if (!c.vale_transporte || !c.vale_transporte_desconto) return null;
  const salario = Number(c.salario_base) || 0;
  if (salario <= 0) return null;
  return Math.round(salario * 6) / 100;
}

/** Uma linha do relatório de adiantamentos (a mesma forma ao vivo e salva). */
export interface LinhaAdiantamento {
  id: string;
  nome: string;
  cargo: string;
  matricula: string;
  empresa: string;
  unidade: string;
  pct: number | null;
  valor: number | null;
  /** Os campos abaixo só existem no relatório com vale transporte. Se faltarem, a linha é de adiantamento. */
  temAdiantamento?: boolean;
  recebeVt?: boolean;
  descontoVt?: number | null;
}

/** Monta a lista de quem recebe adiantamento hoje, com empresa, unidade, % e valor. */
export function montarLinhasAdiantamento(
  colaboradores: Colaborador[],
  empresaPorId: Map<string, Empresa>,
  unidadePorId: Map<string, Unidade>
): LinhaAdiantamento[] {
  const linhas: LinhaAdiantamento[] = [];
  for (const c of colaboradores) {
    if (!elegivelAdiantamento(c) || !c.adiantamento_salario) continue;
    const un = c.unidade_id ? unidadePorId.get(c.unidade_id) : undefined;
    linhas.push({
      id: c.id,
      nome: c.nome,
      cargo: c.cargo ?? "",
      matricula: c.matricula ?? "",
      empresa: empresaVT(c, empresaPorId, unidadePorId),
      unidade: grupoVT(c, empresaPorId, unidadePorId),
      pct: un?.adiantamento_pct ?? null,
      valor: valorAdiantamento(c, un),
    });
  }
  return linhas;
}

/**
 * Lista do relatório com vale transporte: entra quem recebe adiantamento OU vale transporte.
 * Cada linha diz se tem adiantamento, se recebe VT e qual o desconto de VT.
 */
export function montarLinhasRelatorio(
  colaboradores: Colaborador[],
  empresaPorId: Map<string, Empresa>,
  unidadePorId: Map<string, Unidade>
): LinhaAdiantamento[] {
  const linhas: LinhaAdiantamento[] = [];
  for (const c of colaboradores) {
    if (!elegivelAdiantamento(c)) continue;
    const temAdiantamento = !!c.adiantamento_salario;
    const recebeVt = !!c.vale_transporte;
    if (!temAdiantamento && !recebeVt) continue;
    const un = c.unidade_id ? unidadePorId.get(c.unidade_id) : undefined;
    linhas.push({
      id: c.id,
      nome: c.nome,
      cargo: c.cargo ?? "",
      matricula: c.matricula ?? "",
      empresa: empresaVT(c, empresaPorId, unidadePorId),
      unidade: grupoVT(c, empresaPorId, unidadePorId),
      pct: temAdiantamento ? (un?.adiantamento_pct ?? null) : null,
      valor: temAdiantamento ? valorAdiantamento(c, un) : null,
      temAdiantamento,
      recebeVt,
      descontoVt: descontoValeTransporte(c),
    });
  }
  return linhas;
}
