import type { Colaborador, Empresa, FolhaLancamento, Unidade } from "@/types/db";

/** Colaboradores que entram no Controle de Folha: qualquer tipo (CLT, PJ,
 * Estágio) — diferente do Controle de Benefícios, que só pega CLT e
 * Estagiário — desde que ativo ou em experiência (desligados/afastados
 * não entram). */
export function colaboradorAtivoFolha(c: Colaborador): boolean {
  return c.status === "ativo" || c.status === "experiencia";
}

/** Nome do "bloco" da grade a que um colaborador pertence — a mesma
 * lógica da sua planilha: se ele tem unidade cadastrada, o bloco é a
 * unidade (ex.: Savassi, Belvedere); senão, o bloco é a própria empresa
 * (ex.: BABOON, Barber Day - SP), que não tem unidades separadas. */
export function rotuloGrupoColaborador(
  c: Colaborador,
  empresasPorId: Record<string, Empresa>,
  unidadesPorId: Record<string, Unidade>
): string {
  if (c.unidade_id && unidadesPorId[c.unidade_id]) return unidadesPorId[c.unidade_id].nome;
  if (c.empresa_id && empresasPorId[c.empresa_id]) return empresasPorId[c.empresa_id].nome;
  return "Sem empresa";
}

/** Soma os valores em R$ de uma lista de lançamentos (colunas de formato
 * "texto" não entram na soma — o valor delas fica em valor_texto). */
export function somarLancamentos(lancamentos: Pick<FolhaLancamento, "valor">[]): number {
  return lancamentos.reduce((soma, l) => soma + (l.valor || 0), 0);
}
