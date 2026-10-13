// Tipos, listas e funções de apoio do módulo Entrevistas (Recrutamento e Seleção).

export const EMPRESAS_SEL = ["BDU", "BABOON", "BSE"] as const;
export type EmpresaSel = (typeof EMPRESAS_SEL)[number];

export const UNIDADES_BSE = ["Savassi", "Belvedere", "Pampulha", "Ouro Minas", "Lagoa Santa", "Confins", "Alphaville"] as const;

export const ETAPAS = [
  "Inscrito",
  "Triagem de currículo",
  "Entrevista RH",
  "Etapa técnica",
  "Entrevista gestor",
  "Entrevista final",
  "Proposta",
  "Admitido",
] as const;
export const ENCERRADOS = ["Reprovado", "Desistiu", "Banco de talentos"] as const;
export const ETAPAS_ENTREVISTA = ["Entrevista RH", "Etapa técnica", "Entrevista gestor", "Entrevista final"] as const;

export const STATUS_VAGA = ["Aberta", "Em triagem", "Em entrevistas", "Proposta", "Congelada", "Fechada", "Cancelada"] as const;
export const STATUS_ENTREVISTA = ["Agendada", "Realizada", "Reagendar", "Cancelada", "Não compareceu"] as const;
export const TIPOS_ENTREVISTA = ["Telefone", "Vídeo", "Presencial", "Painel"] as const;
export const RECOMENDACOES = ["Avançar", "Manter em avaliação", "Não avançar"] as const;
export const FONTES = ["LinkedIn", "Indicação", "Banco de talentos", "Site de vagas", "Site da empresa", "Consultoria", "Outro"] as const;

export const CRITERIOS = [
  { chave: "exp", nome: "Experiência", curto: "Experiência" },
  { chave: "tec", nome: "Técnico", curto: "Técnico" },
  { chave: "com", nome: "Comunicação", curto: "Comunicação" },
  { chave: "res", nome: "Resolução de problemas", curto: "Problemas" },
  { chave: "cul", nome: "Cultura", curto: "Cultura" },
  { chave: "rsl", nome: "Resultados", curto: "Resultados" },
  { chave: "lid", nome: "Liderança", curto: "Liderança" },
  { chave: "org", nome: "Organização", curto: "Organização" },
] as const;

export interface Vaga {
  id: string;
  cargo: string;
  empresa: EmpresaSel;
  unidade: string | null;
  gestor: string | null;
  status: string;
  data_abertura: string;
  observacoes: string | null;
}

export interface CandidatoSel {
  id: string;
  vaga_id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  fonte: string | null;
  etapa: string;
  pretensao: number | null;
  disponibilidade: string | null;
  link_curriculo: string | null;
  curriculo_path: string | null;
  curriculo_nome: string | null;
  pontos_fortes: string | null;
  pontos_atencao: string | null;
  proxima_acao: string | null;
  proxima_data: string | null;
  responsavel: string | null;
  consentimento: boolean;
}

export interface EntrevistaSel {
  id: string;
  candidato_id: string;
  etapa: string;
  data: string;
  hora: string;
  tipo: string;
  entrevistador: string | null;
  status: string;
  link_local: string | null;
  resumo: string | null;
  aprofundar: string | null;
  recomendacao: string | null;
  proxima_acao: string | null;
  proxima_data: string | null;
}

export interface AvaliacaoSel {
  candidato_id: string;
  notas: Record<string, number | null>;
  recomendacao: string | null;
  evidencias: string | null;
  risco: string | null;
}

export type ChaveTabela = "vagas" | "candidatos" | "entrevistas";

export function rotuloEmpresa(v: Pick<Vaga, "empresa" | "unidade">): string {
  return v.empresa === "BSE" && v.unidade ? `BSE ${v.unidade}` : v.empresa;
}

export function encerrado(etapa: string): boolean {
  return etapa === "Admitido" || (ENCERRADOS as readonly string[]).includes(etapa);
}

/** Média das notas preenchidas (1 a 5), com 2 casas; null se não há nota. */
export function mediaNotas(notas: Record<string, number | null> | undefined): number | null {
  if (!notas) return null;
  const v = Object.values(notas).filter((n): n is number => typeof n === "number" && n > 0);
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

/** Data de hoje (AAAA-MM-DD) no horário de São Paulo. */
export function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((new Date(`${ateIso}T12:00:00Z`).getTime() - new Date(`${deIso}T12:00:00Z`).getTime()) / 86400000);
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function diaSemana(iso: string): string {
  return SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}
export function diaMes(iso: string): string {
  return iso.slice(8, 10);
}
export function mesCurto(iso: string): string {
  return MESES[Number(iso.slice(5, 7)) - 1];
}
export function fmtCurta(iso: string | null | undefined): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

/** Cor, nome curto e número de cada etapa de entrevista (usado na agenda). */
export const ESTILO_ETAPA: Record<string, { cor: string; bg: string; curto: string }> = {
  "Entrevista RH": { cor: "#a85822", bg: "#fdf0e3", curto: "RH" },
  "Etapa técnica": { cor: "#0f766e", bg: "#e0f5f2", curto: "Técnica" },
  "Entrevista gestor": { cor: "#6d28d9", bg: "#efe8fc", curto: "Gestor" },
  "Entrevista final": { cor: "#15803d", bg: "#dff3e5", curto: "Final" },
};

export function ordemEtapa(etapa: string): number | null {
  const i = (ETAPAS_ENTREVISTA as readonly string[]).indexOf(etapa);
  return i < 0 ? null : i + 1;
}

/** Texto da etapa para chips: "2ª etapa · Técnica". */
export function rotuloEtapaEntrevista(etapa: string): string {
  const o = ordemEtapa(etapa);
  return o ? `${o}ª etapa · ${ESTILO_ETAPA[etapa]?.curto ?? etapa}` : etapa;
}

/** Etapa que normalmente vem a seguir para o candidato (a próxima depois da última entrevista realizada). */
export function sugerirEtapaEntrevista(etapaAtual: string, entrevistas: { etapa: string; status: string }[]): string {
  const lista = ETAPAS_ENTREVISTA as readonly string[];
  const feitas = entrevistas.filter((e) => e.status === "Realizada").map((e) => lista.indexOf(e.etapa));
  const maior = feitas.length ? Math.max(...feitas) : -1;
  if (maior >= 0) return lista[Math.min(maior + 1, lista.length - 1)];
  return lista.includes(etapaAtual) ? etapaAtual : lista[0];
}
