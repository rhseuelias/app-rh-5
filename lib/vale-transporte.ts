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
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function valorDiarioVT(l: Pick<LinhaVT, "diaria" | "valor_unit">): number {
  return arred(l.diaria * l.valor_unit);
}

export function totalVT(l: Pick<LinhaVT, "diaria" | "valor_unit" | "dias_uteis">): number {
  return arred(l.diaria * l.valor_unit * l.dias_uteis);
}

/** Quanto precisa recarregar: Total − Saldo (se o saldo cobre tudo, é zero). */
export function cargaVT(l: Pick<LinhaVT, "diaria" | "valor_unit" | "dias_uteis" | "saldo">): number {
  return Math.max(0, arred(totalVT(l) - l.saldo));
}

export function somaVT(linhas: LinhaVT[]) {
  let total = 0;
  let saldo = 0;
  let carga = 0;
  for (const l of linhas) {
    total += totalVT(l);
    saldo += l.saldo;
    carga += cargaVT(l);
  }
  return { total: arred(total), saldo: arred(saldo), carga: arred(carga) };
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

/** Quem pode receber vale transporte: CLT e Estágio, ativo ou em experiência. */
export function elegivelVT(c: Colaborador): boolean {
  return c.tipo !== "PJ" && (c.status === "ativo" || c.status === "experiencia");
}
