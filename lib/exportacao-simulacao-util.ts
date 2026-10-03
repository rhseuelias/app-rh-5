/**
 * Tipos e ajudantes de texto da exportação (PDF e Excel) da simulação de
 * férias. Sem dependências de servidor, para poder ser usado em qualquer lugar.
 */

export interface PeriodoExportacao {
  inicio: string; // YYYY-MM-DD
  fim: string;
  dias: number;
  origem: "manual" | "automatica";
  valorEstimado: number | null;
}

export type StatusExportacao = "completo" | "parcial" | "sem_definicao";

export interface ColaboradorExportacao {
  nome: string;
  unidadeNome: string;
  limiteConcessao: string; // YYYY-MM-DD
  periodos: PeriodoExportacao[];
  totalDias: number;
  saldo: number;
  status: StatusExportacao;
}

export interface CabecalhoExportacao {
  cenarioNome: string;
  empresaNome: string; // "Todas" quando o cenário não filtra empresa
  unidadeNome: string; // "Todas" quando não filtra unidade
  ano: number;
  status: "rascunho" | "aprovado";
  responsavel: string | null;
  divisaoTexto: string; // "15 + 15"
  prioridadeTexto: string; // "equilibrada"
  maxUnidadeTexto: string | null; // "máx. 1 pessoa fora por unidade"
  regras: [string, string][]; // linhas da aba "Regras do cenário"
}

export interface DadosExportacaoSimulacao {
  cabecalho: CabecalhoExportacao;
  colaboradores: ColaboradorExportacao[];
  mostrarValores: boolean;
  geradoEm: Date;
}

export function dm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
export function dma(iso: string): string {
  return `${dm(iso)}/${iso.slice(0, 4)}`;
}
export function dmaCurto(iso: string): string {
  return `${dm(iso)}/${iso.slice(2, 4)}`;
}

export function dataHoraBrasilia(d: Date): { data: string; hora: string } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

export function origemDoColaborador(c: ColaboradorExportacao): string {
  if (c.periodos.length === 0) return "—";
  if (c.periodos.every((p) => p.origem === "manual")) return "Manual";
  if (c.periodos.every((p) => p.origem === "automatica")) return "Automática";
  return "Mista";
}

export const ROTULO_STATUS: Record<StatusExportacao, string> = {
  completo: "Completo",
  parcial: "Parcial",
  sem_definicao: "Sem definição",
};

export function totaisExportacao(colaboradores: ColaboradorExportacao[]) {
  const completos = colaboradores.filter((c) => c.status === "completo").length;
  const parciais = colaboradores.filter((c) => c.status === "parcial").length;
  const semData = colaboradores.reduce((s, c) => s + Math.max(0, c.saldo - c.totalDias), 0);
  const custo = colaboradores.reduce(
    (s, c) => s + c.periodos.reduce((t, p) => t + (p.valorEstimado ?? 0), 0),
    0
  );
  const dias = colaboradores.reduce((s, c) => s + c.totalDias, 0);
  return { completos, parciais, semData, custo, dias, total: colaboradores.length };
}

export function slugDoNome(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "cenario"
  );
}

export function nomeArquivoExportacao(c: CabecalhoExportacao, extensao: "pdf" | "xlsx"): string {
  return `simulacao-ferias-${c.ano}-${slugDoNome(c.cenarioNome)}.${extensao}`;
}
