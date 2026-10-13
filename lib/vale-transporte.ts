import type { Colaborador, Empresa, Unidade } from "@/types/db";

export const OPERADORAS = ["BHBUS", "SEMPARAR", "OTIMO", "CAJU"] as const;
export type OperadoraVT = (typeof OPERADORAS)[number];

export const ROTULO_OPERADORA: Record<OperadoraVT, string> = {
  BHBUS: "BHBUS",
  SEMPARAR: "SEMPARAR",
  OTIMO: "ÓTIMO",
  CAJU: "CAJU",
};

/** Cores de cada operadora (classes do Tailwind). */
export const COR_OPERADORA: Record<OperadoraVT, { fundo: string; texto: string; faixa: string }> = {
  BHBUS: { fundo: "bg-violet-50", texto: "text-violet-800", faixa: "border-violet-500" },
  SEMPARAR: { fundo: "bg-orange-50", texto: "text-orange-800", faixa: "border-orange-500" },
  OTIMO: { fundo: "bg-emerald-50", texto: "text-emerald-800", faixa: "border-emerald-600" },
  CAJU: { fundo: "bg-blue-50", texto: "text-blue-800", faixa: "border-blue-600" },
};

export interface LinhaVT {
  id: string;
  competencia: string;
  colaborador_id: string;
  operadora: OperadoraVT;
  cartao: string | null;
  diaria: number;
  valor_unit: number;
  dias_uteis: number;
  saldo: number;
  /** Só o CAJU usa estes dois. */
  alimentacao: number;
  premio: number;
  /** Dias que ainda faltam até a recarga: o cartão gasta isso antes de receber a carga. */
  dias_ate_recarga?: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function valorDiarioVT(l: Pick<LinhaVT, "diaria" | "valor_unit">): number {
  return arred(l.diaria * l.valor_unit);
}

/** Transporte do mês: diária × valor × dias úteis. */
export function transporteVT(l: Pick<LinhaVT, "diaria" | "valor_unit" | "dias_uteis">): number {
  return arred(l.diaria * l.valor_unit * l.dias_uteis);
}

type CamposTotal = Pick<LinhaVT, "diaria" | "valor_unit" | "dias_uteis"> & {
  operadora?: OperadoraVT;
  alimentacao?: number;
  premio?: number;
};

/** Total do mês. No CAJU soma também alimentação e prêmio. */
export function totalVT(l: CamposTotal): number {
  const extra = l.operadora === "CAJU" ? (l.alimentacao ?? 0) + (l.premio ?? 0) : 0;
  return arred(transporteVT(l) + extra);
}

/**
 * Saldo que o cartão ainda terá no dia da recarga:
 * saldo atual − (dias até a recarga × valor diário). Nunca fica abaixo de zero.
 */
export function saldoNaRecargaVT(l: Pick<LinhaVT, "diaria" | "valor_unit" | "saldo"> & { dias_ate_recarga?: number }): number {
  const consumo = arred((l.dias_ate_recarga ?? 0) * l.diaria * l.valor_unit);
  return Math.max(0, arred(l.saldo - consumo));
}

/** Quanto precisa recarregar: Total − Saldo na recarga (se o saldo cobre tudo, é zero). */
export function cargaVT(l: CamposTotal & { saldo: number; dias_ate_recarga?: number }): number {
  return Math.max(0, arred(totalVT(l) - saldoNaRecargaVT(l)));
}

export function somaVT(linhas: LinhaVT[]) {
  let total = 0;
  let saldo = 0;
  let saldoAtual = 0;
  let carga = 0;
  for (const l of linhas) {
    total += totalVT(l);
    saldo += saldoNaRecargaVT(l);
    saldoAtual += l.saldo;
    carga += cargaVT(l);
  }
  // saldo = o que vale na conta da carga (já descontados os dias até a recarga); saldoAtual = o que está no cartão hoje
  return { total: arred(total), saldo: arred(saldo), saldoAtual: arred(saldoAtual), carga: arred(carga) };
}

export function moedaVT(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function numeroVT(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "6,25" ou "6.25" -> 6.25 (vazio = 0, texto inválido = null) */
export function lerNumeroVT(texto: string): number | null {
  const t = texto.replace(/[R$\s]/g, "");
  if (t === "") return 0;
  if (!/^\d+([.,]\d+)?$/.test(t) && !/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)) return null;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = parseFloat(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Número para mostrar dentro de um campo de edição ("" quando zero). */
export function campoVT(n: number): string {
  return n === 0 ? "" : String(n).replace(".", ",");
}

export function competenciaAtualSP(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const ano = partes.find((x) => x.type === "year")?.value ?? "";
  const mes = partes.find((x) => x.type === "month")?.value ?? "";
  return `${ano}-${mes}`;
}

export function deslocarCompetencia(comp: string, meses: number): string {
  const [a, m] = comp.split("-").map(Number);
  const d = new Date(a, m - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Em qual grupo (unidade, ou empresa se não tiver unidade) o colaborador aparece. */
export function grupoVT(
  c: Colaborador,
  empresaPorId: Map<string, Empresa>,
  unidadePorId: Map<string, Unidade>
): string {
  if (c.unidade_id && unidadePorId.get(c.unidade_id)) return unidadePorId.get(c.unidade_id)!.nome;
  if (c.empresa_id && empresaPorId.get(c.empresa_id)) return empresaPorId.get(c.empresa_id)!.nome;
  return "Sem unidade";
}

/** Empresas do grupo, na ordem em que aparecem nas telas. */
export const EMPRESAS_VT = ["BSE MG", "BSE SP", "BABOON", "BDU"] as const;

/** Operadoras de cada empresa (na ordem das abas). */
export const OPERADORAS_DA_EMPRESA: Record<string, OperadoraVT[]> = {
  "BSE MG": ["CAJU", "BHBUS", "OTIMO"],
  "BSE SP": ["CAJU", "SEMPARAR"],
  BABOON: ["CAJU", "BHBUS", "OTIMO"],
  BDU: ["CAJU", "SEMPARAR"],
};

/** Unidades da BSE em Minas Gerais (a BSE SP tem só a Alphaville). */
const UNIDADES_BSE_MG = ["savassi", "belvedere", "pampulha", "ouro minas", "lagoa santa", "confins"];

function semAcentoVT(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** A qual empresa (BSE MG, BSE SP, BABOON ou BDU) o colaborador pertence. Se não reconhecer, devolve o nome da empresa cadastrada. */
export function empresaVT(
  c: Colaborador,
  empresaPorId: Map<string, Empresa>,
  unidadePorId: Map<string, Unidade>
): string {
  const emp = c.empresa_id ? empresaPorId.get(c.empresa_id)?.nome ?? "" : "";
  const uni = c.unidade_id ? unidadePorId.get(c.unidade_id) : undefined;
  const uniEmp = uni?.empresa_id ? empresaPorId.get(uni.empresa_id)?.nome ?? "" : "";
  const textos = [emp, uniEmp, uni?.nome ?? ""].map(semAcentoVT);
  const unidade = semAcentoVT(uni?.nome ?? "").trim();

  if (textos.some((t) => t.includes("baboon"))) return "BABOON";
  if (textos.some((t) => t.includes("bdu"))) return "BDU";
  // BSE: Alphaville (ou uma empresa cadastrada como "BSE SP") é São Paulo; o resto é Minas Gerais.
  const ehSP = unidade.includes("alphaville") || textos.some((t) => /\bsp\b|sao paulo/.test(t));
  if (ehSP) return "BSE SP";
  if (textos.some((t) => t.includes("bse")) || UNIDADES_BSE_MG.includes(unidade)) return "BSE MG";
  return emp || uniEmp || "Sem empresa";
}

/** Quem pode receber vale transporte: CLT e Estágio, ativo ou em experiência. */
export function elegivelVT(c: Colaborador): boolean {
  return c.tipo !== "PJ" && (c.status === "ativo" || c.status === "experiencia");
}
