import { createClient } from "@/lib/supabase-server";
import { hojeEmBrasilia, somarDias } from "@/lib/ferias-regras";

/**
 * "Previsão de Vencimento de Férias" — mesmo modelo do relatório da
 * contabilidade: um bloco por empresa, uma linha por colaborador CLT com
 * Código, Admissão, Pér. Aquisit., Venc. Férias, Dias a gozar,
 * Prev. Férias e Data Limite.
 *
 * Qual período aparece para cada pessoa: o primeiro (mais antigo) que ainda
 * não foi totalmente gozado. "Dias" = saldo a gozar (30 − férias já baixadas
 * − 10 se vendeu abono); fica 0 enquanto o período aquisitivo ainda não terminou.
 */

export interface LinhaPrevisao {
  nome: string;
  codigo: string;
  admissao: string;
  periodoInicio: string;
  vencimento: string;
  dias: number;
  previsao: string;
  limite: string;
}

export interface GrupoPrevisao {
  empresaId: string | null;
  empresaNome: string;
  cnpj: string | null;
  linhas: LinhaPrevisao[];
}

export interface DadosPrevisao {
  hoje: string;
  grupos: GrupoPrevisao[];
  total: number;
}

interface PerRow {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  limite_concessao: string;
  status: string;
}
interface FerRow {
  colaborador_id: string;
  periodo_aquisitivo_id: string | null;
  dias: number;
  status: string;
  vendeu_abono: boolean;
}

const dia = (s: string) => String(s ?? "").slice(0, 10);

/** início + 12 meses − 1 dia (fim do período aquisitivo), em texto AAAA-MM-DD */
function fimDoPeriodo(inicio: string): string {
  const [a, m, d] = inicio.split("-").map(Number);
  const t = new Date(Date.UTC(a + 1, m - 1, d));
  return somarDias(t.toISOString().slice(0, 10), -1);
}
/** fim + 11 meses */
function limiteDoPeriodo(fim: string): string {
  const [a, m, d] = fim.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + 11, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

interface PeriodoMin {
  id: string;
  inicio: string;
  fim: string;
  limite_concessao: string;
  status: string;
}
interface FeriasMin {
  periodo_aquisitivo_id: string | null;
  dias: number;
  status: string;
  vendeu_abono: boolean;
}

/**
 * Regra de cálculo de UMA pessoa (usada no relatório e no histórico de férias
 * do colaborador): recebe os períodos e as férias reais (não simuladas e não
 * canceladas) dela.
 */
export function calcularPrevisaoColaborador(
  c: { nome: string; matricula?: string | null; data_admissao: string | null },
  periodos: PeriodoMin[],
  ferias: FeriasMin[],
  hoje: string
): LinhaPrevisao | null {
  if (!c.data_admissao) return null;
  // saldo "da contabilidade": só conta o que já foi baixado (concluído) + abono vendido
  const saldoDe = (periodoId: string): number => {
    const lista = ferias.filter((f) => f.periodo_aquisitivo_id === periodoId);
    const gozados = lista.filter((f) => f.status === "concluido").reduce((s, f) => s + (f.dias || 0), 0);
    const abono = lista.some((f) => f.vendeu_abono) ? 10 : 0;
    return Math.max(0, 30 - gozados - abono);
  };
  const dele = periodos.slice().sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const foco = dele.find((p) => {
    if (p.status === "gozado") return false;
    // período já encerrado e sem saldo: está quitado mesmo que não esteja marcado
    return !(dia(p.fim) < hoje && saldoDe(p.id) <= 0);
  });
  let inicio: string, fim: string, limite: string, dias: number;
  if (foco) {
    inicio = dia(foco.inicio);
    fim = dia(foco.fim);
    limite = dia(foco.limite_concessao);
    dias = fim < hoje ? saldoDe(foco.id) : 0;
  } else {
    inicio = dele.length ? somarDias(dia(dele[dele.length - 1].fim), 1) : dia(c.data_admissao);
    fim = fimDoPeriodo(inicio);
    limite = limiteDoPeriodo(fim);
    dias = 0;
  }
  return {
    nome: c.nome,
    codigo: c.matricula ?? "",
    admissao: dia(c.data_admissao),
    periodoInicio: inicio,
    vencimento: fim,
    dias,
    previsao: somarDias(fim, 1),
    limite,
  };
}

export async function buscarPrevisaoVencimento(filtroEmpresa?: string): Promise<DadosPrevisao> {
  const supabase = createClient();
  const hoje = hojeEmBrasilia();

  const [{ data: colabData }, { data: empData }, { data: perData }, { data: ferData }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, matricula, empresa_id, data_admissao, status")
      .eq("tipo", "CLT")
      .neq("status", "desligado"),
    supabase.from("empresas").select("id, nome, cnpj"),
    supabase.from("periodos_aquisitivos").select("id, colaborador_id, inicio, fim, limite_concessao, status"),
    supabase
      .from("ferias")
      .select("colaborador_id, periodo_aquisitivo_id, dias, status, vendeu_abono")
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);

  const colaboradores = (colabData ?? []) as {
    id: string;
    nome: string;
    matricula: string | null;
    empresa_id: string | null;
    data_admissao: string | null;
    status: string;
  }[];
  const empresas = (empData ?? []) as { id: string; nome: string; cnpj: string | null }[];
  const periodos = (perData ?? []) as PerRow[];
  const ferias = (ferData ?? []) as FerRow[];

  const periodosPor = new Map<string, PerRow[]>();
  for (const p of periodos) {
    if (!periodosPor.has(p.colaborador_id)) periodosPor.set(p.colaborador_id, []);
    periodosPor.get(p.colaborador_id)!.push(p);
  }
  const feriasPor = new Map<string, FerRow[]>();
  for (const f of ferias) {
    if (!feriasPor.has(f.colaborador_id)) feriasPor.set(f.colaborador_id, []);
    feriasPor.get(f.colaborador_id)!.push(f);
  }
  const montar = (c: (typeof colaboradores)[number]): LinhaPrevisao | null =>
    calcularPrevisaoColaborador(c, periodosPor.get(c.id) ?? [], feriasPor.get(c.id) ?? [], hoje);

  const grupos: GrupoPrevisao[] = [];
  const ordemEmpresas = empresas
    .filter((e) => !filtroEmpresa || e.id === filtroEmpresa)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const semEmpresa = !filtroEmpresa ? [{ id: null as string | null, nome: "SEM EMPRESA", cnpj: null as string | null }] : [];
  for (const e of [...ordemEmpresas, ...semEmpresa]) {
    const linhas = colaboradores
      .filter((c) => (e.id === null ? !c.empresa_id || !empresas.some((x) => x.id === c.empresa_id) : c.empresa_id === e.id))
      .map(montar)
      .filter((l): l is LinhaPrevisao => l !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (linhas.length > 0) grupos.push({ empresaId: e.id, empresaNome: e.nome, cnpj: e.cnpj, linhas });
  }
  return { hoje, grupos, total: grupos.reduce((s, g) => s + g.linhas.length, 0) };
}
