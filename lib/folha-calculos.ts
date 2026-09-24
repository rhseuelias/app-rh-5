import type { Colaborador, Empresa, FolhaLancamento, FolhaTipo, Unidade } from "@/types/db";

export function colaboradorAtivoFolha(c: Colaborador): boolean {
  return c.status === "ativo" || c.status === "experiencia";
}

const ORDEM_GRUPOS = [
  "ALPHAVILLE",
  "BELVEDERE",
  "CONFINS",
  "LAGOA SANTA",
  "OURO MINAS",
  "PAMPULHA",
  "SAVASSI",
];

export const GRUPO_ESTAGIO = "ESTÁGIO";

export function rotuloGrupoColaborador(
  c: Colaborador,
  empresasPorId: Record<string, Empresa>,
  unidadesPorId: Record<string, Unidade>
): string {
  if (c.tipo === "Estagio") return GRUPO_ESTAGIO;
  if (c.unidade_id && unidadesPorId[c.unidade_id]) return unidadesPorId[c.unidade_id].nome;
  if (c.empresa_id && empresasPorId[c.empresa_id]) return empresasPorId[c.empresa_id].nome;
  return "Sem empresa";
}

export function compararGrupos(a: string, b: string): number {
  if (a === GRUPO_ESTAGIO) return b === GRUPO_ESTAGIO ? 0 : 1;
  if (b === GRUPO_ESTAGIO) return -1;
  const ia = ORDEM_GRUPOS.indexOf(a.toUpperCase());
  const ib = ORDEM_GRUPOS.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, "pt-BR");
}

export function somarLancamentos(lancamentos: Pick<FolhaLancamento, "valor">[]): number {
  return lancamentos.reduce((soma, l) => soma + (l.valor || 0), 0);
}

export function calcularQuebraCaixa(colaborador: Pick<Colaborador, "cargo" | "salario_base">): number {
  const cargo = (colaborador.cargo ?? "").toLowerCase();
  if (!cargo.includes("caixa")) return 0;
  return Math.round((colaborador.salario_base || 0) * 0.1 * 100) / 100;
}

/** true = essa coluna (tipo) vale pra essa unidade/empresa. Sem
 * restrição cadastrada (lista vazia ou ausente) = vale pra todo
 * mundo, que é o padrão de toda coluna. */
export function tipoValeParaGrupo(
  tipoId: string,
  grupo: string,
  gruposPorTipo: Record<string, string[]>
): boolean {
  const lista = gruposPorTipo[tipoId];
  if (!lista || lista.length === 0) return true;
  return lista.includes(grupo);
}

/** Filtra a lista de colunas pras que valem pra essa unidade/empresa. */
export function tiposDoGrupo(
  tipos: FolhaTipo[],
  grupo: string,
  gruposPorTipo: Record<string, string[]>
): FolhaTipo[] {
  return tipos.filter((t) => tipoValeParaGrupo(t.id, grupo, gruposPorTipo));
}
