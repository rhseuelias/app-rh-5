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

/** Subdivisão por unidade dentro de uma empresa (ex.: BSE → Savassi, Belvedere…). */
export interface BlocoUnidade {
  unidadeId: string | null;
  unidadeNome: string;
  cnpj: string | null;
  linhas: LinhaPrevisao[];
}

export interface GrupoPrevisao {
  empresaId: string | null;
  empresaNome: string;
  cnpj: string | null;
  /** todas as linhas da empresa (para contagem) */
  linhas: LinhaPrevisao[];
  /** preenchido só quando a empresa é mostrada por unidade; senão fica vazio */
  unidades: BlocoUnidade[];
}

export interface OpcaoEmpresa {
  id: string;
  nome: string;
  /** unidades que têm colaboradores CLT ativos */
  unidades: { id: string; nome: string }[];
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
  dias_direito?: number | null;
  dias_direito_base?: number | null;
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
  /** "Dias Direito" do relatório das barbearias (BSE); vazio = calcula pelo saldo */
  dias_direito?: number | null;
  dias_direito_base?: number | null;
}

/** 12,5 → "12,5" · 30 → "30" */
export function fDias(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
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
  const usadoDe = (periodoId: string): number => {
    const lista = ferias.filter((f) => f.periodo_aquisitivo_id === periodoId);
    const gozados = lista.filter((f) => f.status === "concluido").reduce((s, f) => s + (f.dias || 0), 0);
    const abono = lista.some((f) => f.vendeu_abono) ? 10 : 0;
    return gozados + abono;
  };
  const saldoDe = (periodoId: string): number => Math.max(0, 30 - usadoDe(periodoId));
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
    if (foco.dias_direito != null) {
      // vem do relatório das barbearias; abate só o que foi baixado depois dele
      const depois = Math.max(0, usadoDe(foco.id) - (foco.dias_direito_base ?? 0));
      dias = Math.max(0, Number(foco.dias_direito) - depois);
    } else {
      dias = fim < hoje ? saldoDe(foco.id) : 0;
    }
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

/** Empresas e unidades para as opções de escolha da tela (só as que têm gente). */
export async function buscarOpcoesPrevisao(): Promise<OpcaoEmpresa[]> {
  const supabase = createClient();
  const [{ data: colabData }, { data: empData }, { data: uniData }] = await Promise.all([
    supabase.from("colaboradores").select("empresa_id, unidade_id").eq("tipo", "CLT").neq("status", "desligado"),
    supabase.from("empresas").select("id, nome").order("nome"),
    supabase.from("unidades").select("id, nome, empresa_id").order("nome"),
  ]);
  const colabs = (colabData ?? []) as { empresa_id: string | null; unidade_id: string | null }[];
  const unidades = (uniData ?? []) as { id: string; nome: string; empresa_id: string | null }[];
  const comGente = new Set(colabs.map((c) => c.unidade_id).filter(Boolean) as string[]);
  return ((empData ?? []) as { id: string; nome: string }[]).map((e) => ({
    id: e.id,
    nome: e.nome,
    unidades: unidades
      .filter((u) => u.empresa_id === e.id && comGente.has(u.id))
      .map((u) => ({ id: u.id, nome: u.nome })),
  }));
}

export async function buscarPrevisaoVencimento(filtroEmpresa?: string, filtroUnidade?: string): Promise<DadosPrevisao> {
  const supabase = createClient();
  const hoje = hojeEmBrasilia();

  const [{ data: colabData }, { data: empData }, { data: uniData }, { data: perData }, { data: ferData }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, matricula, empresa_id, unidade_id, data_admissao, status")
      .eq("tipo", "CLT")
      .neq("status", "desligado"),
    supabase.from("empresas").select("id, nome, cnpj"),
    supabase.from("unidades").select("id, nome, cnpj, empresa_id"),
    supabase.from("periodos_aquisitivos").select("*"),
    supabase
      .from("ferias")
      .select("colaborador_id, periodo_aquisitivo_id, dias, status, vendeu_abono")
      .neq("status", "cancelado")
      .eq("simulacao", false),
  ]);

  type Colab = {
    id: string;
    nome: string;
    matricula: string | null;
    empresa_id: string | null;
    unidade_id: string | null;
    data_admissao: string | null;
    status: string;
  };
  const todos = (colabData ?? []) as Colab[];
  const empresas = (empData ?? []) as { id: string; nome: string; cnpj: string | null }[];
  const unidades = (uniData ?? []) as { id: string; nome: string; cnpj: string | null; empresa_id: string | null }[];
  const periodos = (perData ?? []) as PerRow[];
  const ferias = (ferData ?? []) as FerRow[];

  // filtro por unidade escolhida: a empresa passa a ser a dona da unidade
  const unidadeEscolhida = filtroUnidade ? unidades.find((u) => u.id === filtroUnidade) : undefined;
  const empresaFiltro = unidadeEscolhida?.empresa_id ?? filtroEmpresa;
  const colaboradores = unidadeEscolhida ? todos.filter((c) => c.unidade_id === unidadeEscolhida.id) : todos;

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
  const montar = (c: Colab): LinhaPrevisao | null =>
    calcularPrevisaoColaborador(c, periodosPor.get(c.id) ?? [], feriasPor.get(c.id) ?? [], hoje);
  const porNome = (a: LinhaPrevisao, b: LinhaPrevisao) => a.nome.localeCompare(b.nome, "pt-BR");
  const linhasDe = (lista: Colab[]) =>
    lista.map(montar).filter((l): l is LinhaPrevisao => l !== null).sort(porNome);

  const grupos: GrupoPrevisao[] = [];
  const ordemEmpresas = empresas
    .filter((e) => !empresaFiltro || e.id === empresaFiltro)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const semEmpresa = !empresaFiltro ? [{ id: null as string | null, nome: "SEM EMPRESA", cnpj: null as string | null }] : [];
  for (const e of [...ordemEmpresas, ...semEmpresa]) {
    const daEmpresa = colaboradores.filter((c) =>
      e.id === null ? !c.empresa_id || !empresas.some((x) => x.id === c.empresa_id) : c.empresa_id === e.id
    );
    const linhas = linhasDe(daEmpresa);
    if (linhas.length === 0) continue;

    // mostra por unidade quando a empresa tem 2+ unidades (ou quando uma unidade foi escolhida)
    const idsUnidades = new Set(daEmpresa.map((c) => c.unidade_id).filter(Boolean) as string[]);
    const subdividir = !!unidadeEscolhida || idsUnidades.size >= 2;
    const blocos: BlocoUnidade[] = [];
    if (subdividir) {
      const ordem = unidades
        .filter((u) => idsUnidades.has(u.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      for (const u of ordem) {
        const l = linhasDe(daEmpresa.filter((c) => c.unidade_id === u.id));
        if (l.length > 0) blocos.push({ unidadeId: u.id, unidadeNome: u.nome, cnpj: u.cnpj, linhas: l });
      }
      const sem = linhasDe(daEmpresa.filter((c) => !c.unidade_id || !idsUnidades.has(c.unidade_id)));
      if (sem.length > 0) blocos.push({ unidadeId: null, unidadeNome: "Sem unidade", cnpj: null, linhas: sem });
    }
    grupos.push({ empresaId: e.id, empresaNome: e.nome, cnpj: e.cnpj, linhas, unidades: blocos });
  }
  return { hoje, grupos, total: grupos.reduce((s, g) => s + g.linhas.length, 0) };
}
