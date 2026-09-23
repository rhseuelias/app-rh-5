import type { BeneficioExtra, BeneficioTransporte, Colaborador } from "@/types/db";

/** Tipos que sempre têm campo de "N° do Cartão" no lançamento de transporte. */
export const TIPOS_COM_CARTAO = ["BHBUS", "OTIMO"];

/** Cor de destaque de cada bloco de tipo de transporte na tela (CAJU é sempre
 * especial — mistura transporte com alimentação/prêmio/outros). As demais
 * cores giram por um hash simples do nome, pra qualquer tipo cadastrado ter
 * uma cor consistente sem precisar cadastrar cor manualmente. */
const CLASSES_PADRAO = ["semparar", "bhbus", "otimo", "extra"] as const;
const CLASSE_FIXA: Record<string, string> = { CAJU: "caju", SEMPARAR: "semparar", BHBUS: "bhbus", OTIMO: "otimo" };

export function classeTipoTransporte(tipo: string): string {
  if (CLASSE_FIXA[tipo]) return CLASSE_FIXA[tipo];
  let hash = 0;
  for (let i = 0; i < tipo.length; i++) hash = (hash * 31 + tipo.charCodeAt(i)) % 997;
  return CLASSES_PADRAO[hash % CLASSES_PADRAO.length];
}

/** Colaboradores elegíveis ao Controle de Benefícios: só CLT e Estagiário,
 * e só quem está ativo ou em experiência (desligados/afastados não entram). */
export function colaboradorElegivel(c: Colaborador): boolean {
  return (c.tipo === "CLT" || c.tipo === "Estagio") && (c.status === "ativo" || c.status === "experiencia");
}

/** Total de 1 lançamento de transporte: Km rodado × valor por km, ou
 * viagens/dia × valor por viagem × dias úteis, conforme o modo escolhido. */
export function calcularEntradaTransporte(tr: Pick<
  BeneficioTransporte,
  "modo" | "km" | "valor_km" | "viagens_dia" | "valor_viagem" | "dias_uteis"
>): number {
  return tr.modo === "km" ? tr.km * tr.valor_km : tr.viagens_dia * tr.valor_viagem * tr.dias_uteis;
}

/** Soma de todos os lançamentos de transporte de 1 colaborador (todos os tipos). */
export function totalTransporteColaborador(lancamentos: BeneficioTransporte[]): number {
  return lancamentos.reduce((soma, tr) => soma + calcularEntradaTransporte(tr), 0);
}

/** Soma dos lançamentos de transporte de 1 colaborador, só de 1 tipo específico. */
export function totalTransportePorTipo(lancamentos: BeneficioTransporte[], tipo: string): number {
  return lancamentos.filter((tr) => tr.tipo === tipo).reduce((soma, tr) => soma + calcularEntradaTransporte(tr), 0);
}

export function totalExtras(extra: Pick<BeneficioExtra, "alimentacao" | "premio" | "outros_valor"> | undefined): number {
  if (!extra) return 0;
  return extra.alimentacao + extra.premio + extra.outros_valor;
}

/** Total geral de 1 colaborador no mês: todo o transporte + alimentação + prêmio + outros. */
export function totalGeralColaborador(
  lancamentosTransporte: BeneficioTransporte[],
  extra: Pick<BeneficioExtra, "alimentacao" | "premio" | "outros_valor"> | undefined
): number {
  return totalTransporteColaborador(lancamentosTransporte) + totalExtras(extra);
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Competência (mês) atual, no formato 'AAAA-MM' usado nas tabelas. */
export function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" -> "Setembro/2026". */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const nome = NOMES_MES[(mes || 1) - 1] ?? competencia;
  return `${nome}/${ano}`;
}
