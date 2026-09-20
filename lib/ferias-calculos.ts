import { addDays, addMonths, getDay, getISOWeek, getYear } from "date-fns";
import type { Feriado } from "@/types/db";

/**
 * Motor de cálculo do módulo de Férias: regra de início (CLT), valor
 * estimado, detecção de conflito (mesma unidade/mesma semana) e geração
 * de sugestões de datas — usado tanto no "Planejamento automático" quanto
 * no botão "Sugerir férias" e nas Simulações.
 */

// ------------------------------------------------------------
// VALOR ESTIMADO
// ------------------------------------------------------------
export interface ValorFerias {
  diaria: number;
  periodo: number;
  terco: number;
  total: number;
}

/** Salário ÷ 30 × dias, + 1/3 constitucional. Sempre uma ESTIMATIVA — não substitui o cálculo definitivo da folha. */
export function calcularValorFerias(salarioBase: number, dias: number): ValorFerias {
  const diaria = (salarioBase || 0) / 30;
  const periodo = diaria * dias;
  const terco = periodo / 3;
  return { diaria, periodo, terco, total: periodo + terco };
}

// ------------------------------------------------------------
// FERIADOS / REGRA DE INÍCIO
// ------------------------------------------------------------
function chaveData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function paraSetDeDatas(feriados: Feriado[]): Set<string> {
  return new Set(feriados.map((f) => f.data));
}

/**
 * CLT art. 134 §3º: é vedado o início das férias nos 2 dias que antecedem
 * feriado ou dia de repouso semanal remunerado (domingo). Ou seja, não
 * pode começar sexta/sábado, nem nos 2 dias que antecedem qualquer
 * feriado cadastrado.
 */
export function respeitaRegraInicio(dataInicio: Date, feriadosSet: Set<string>): boolean {
  const diaSemana = getDay(dataInicio); // 0=domingo ... 6=sábado
  if (diaSemana === 5 || diaSemana === 6) return false;
  for (let i = 1; i <= 2; i++) {
    if (feriadosSet.has(chaveData(addDays(dataInicio, i)))) return false;
  }
  return true;
}

// ------------------------------------------------------------
// JANELAS DE DATA / CONFLITO
// ------------------------------------------------------------
export interface JanelaData {
  inicio: Date;
  fim: Date;
}

function seSobrepoe(a: JanelaData, b: JanelaData): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

/** Todas as semanas (ano-semanaISO) tocadas por uma janela — usado pra regra "mesma semana = conflito". */
export function semanasEnvolvidas(j: JanelaData): string[] {
  const set = new Set<string>();
  let d = j.inicio;
  while (d <= j.fim) {
    set.add(`${getYear(d)}-${getISOWeek(d)}`);
    d = addDays(d, 1);
  }
  return Array.from(set);
}

function janelaValida(
  inicio: Date,
  dias: number,
  limiteConcessao: Date,
  feriadosSet: Set<string>,
  ocupadas: JanelaData[]
): JanelaData | null {
  if (!respeitaRegraInicio(inicio, feriadosSet)) return null;
  const fim = addDays(inicio, dias - 1);
  if (fim > limiteConcessao) return null;

  const janela = { inicio, fim };
  const semanasDaJanela = semanasEnvolvidas(janela);
  for (const ocupada of ocupadas) {
    if (seSobrepoe(janela, ocupada)) return null;
    const semanasOcupada = semanasEnvolvidas(ocupada);
    if (semanasDaJanela.some((s) => semanasOcupada.includes(s))) return null;
  }
  return janela;
}

function menorData(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/** Varre dia a dia a partir de `inicioBusca` até achar uma janela de `dias` corridos válida (ou esgotar o prazo/tentativas). */
export function buscarProximaJanelaValida(
  inicioBusca: Date,
  dias: number,
  limiteConcessao: Date,
  feriadosSet: Set<string>,
  ocupadas: JanelaData[],
  maxTentativas = 400
): JanelaData | null {
  let candidato = inicioBusca;
  for (let i = 0; i < maxTentativas; i++) {
    if (candidato > limiteConcessao) return null;
    const janela = janelaValida(candidato, dias, limiteConcessao, feriadosSet, ocupadas);
    if (janela) return janela;
    candidato = addDays(candidato, 1);
  }
  return null;
}

// ------------------------------------------------------------
// PLANEJAMENTO AUTOMÁTICO (2 períodos de 15 dias, 4-6 meses de intervalo)
// ------------------------------------------------------------
export interface PrevisaoFerias {
  periodo1: JanelaData;
  /** null quando o 1º período já cobre o saldo inteiro (ex.: 30 dias de uma vez só). */
  periodo2: JanelaData | null;
}

/**
 * `diasPeriodo1` é escolhido pelo RH antes de gerar a previsão (padrão 15).
 * O 2º período pega o resto do saldo (até 30 no total) — se não sobrar
 * nada, a previsão é de 1 período único e `periodo2` vem null.
 */
export function gerarPrevisaoColaborador(
  periodoAquisitivo: { fim: string; limite_concessao: string },
  feriadosSet: Set<string>,
  ocupadas: JanelaData[],
  diasPeriodo1: number = 15
): PrevisaoFerias | null {
  const limite = new Date(periodoAquisitivo.limite_concessao);
  const inicioBusca = new Date(periodoAquisitivo.fim);
  const dias1 = Math.min(Math.max(Math.round(diasPeriodo1), 5), 30);
  const dias2 = 30 - dias1;

  const periodo1 = buscarProximaJanelaValida(inicioBusca, dias1, limite, feriadosSet, ocupadas);
  if (!periodo1) return null;

  if (dias2 <= 0) return { periodo1, periodo2: null };

  const ocupadasComPeriodo1 = [...ocupadas, periodo1];
  const inicioBusca2 = addMonths(periodo1.fim, 4);
  const limitePreferido = menorData(addMonths(periodo1.fim, 6), limite);

  let periodo2 = buscarProximaJanelaValida(inicioBusca2, dias2, limitePreferido, feriadosSet, ocupadasComPeriodo1);
  if (!periodo2) {
    // não coube dentro da janela preferida de 4-6 meses — tenta até o limite legal de concessão
    periodo2 = buscarProximaJanelaValida(inicioBusca2, dias2, limite, feriadosSet, ocupadasComPeriodo1);
  }
  if (!periodo2) return null;

  return { periodo1, periodo2 };
}

// ------------------------------------------------------------
// SUGESTÃO DE DATAS (botão "Sugerir férias")
// ------------------------------------------------------------
export interface OpcaoSugestao {
  inicio: Date;
  fim: Date;
  dias: number;
  semConflito: boolean;
  dentroDoPrazo: boolean;
  regrasAtendidas: boolean;
}

export function sugerirOpcoes(
  inicioBusca: Date,
  dias: number,
  limiteConcessao: Date,
  feriadosSet: Set<string>,
  ocupadas: JanelaData[],
  quantidade = 3
): OpcaoSugestao[] {
  const opcoes: OpcaoSugestao[] = [];
  let candidato = inicioBusca;
  let tentativas = 0;
  while (opcoes.length < quantidade && tentativas < 400) {
    const janela = buscarProximaJanelaValida(candidato, dias, limiteConcessao, feriadosSet, ocupadas);
    if (!janela) break;
    opcoes.push({
      inicio: janela.inicio,
      fim: janela.fim,
      dias,
      semConflito: true,
      dentroDoPrazo: true,
      regrasAtendidas: true,
    });
    candidato = addDays(janela.inicio, 7);
    tentativas++;
  }
  return opcoes;
}

// ------------------------------------------------------------
// DETECÇÃO DE CONFLITO NO MAPA (exibição) — mesma unidade, mesma semana
// ------------------------------------------------------------
export interface FeriasParaConflito {
  id: string;
  colaborador_id: string;
  unidade_id: string | null;
  data_inicio: string;
  data_fim: string;
  simulacao?: boolean;
  status: string;
}

export function detectarConflitos(lista: FeriasParaConflito[]): Set<string> {
  const conflitos = new Set<string>();
  const porUnidade = new Map<string, FeriasParaConflito[]>();

  for (const f of lista) {
    if (f.simulacao || f.status === "cancelado" || !f.unidade_id) continue;
    if (!porUnidade.has(f.unidade_id)) porUnidade.set(f.unidade_id, []);
    porUnidade.get(f.unidade_id)!.push(f);
  }

  for (const grupo of porUnidade.values()) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = grupo[i];
        const b = grupo[j];
        if (a.colaborador_id === b.colaborador_id) continue;
        const semanasA = semanasEnvolvidas({ inicio: new Date(a.data_inicio), fim: new Date(a.data_fim) });
        const semanasB = semanasEnvolvidas({ inicio: new Date(b.data_inicio), fim: new Date(b.data_fim) });
        if (semanasA.some((s) => semanasB.includes(s))) {
          conflitos.add(a.id);
          conflitos.add(b.id);
        }
      }
    }
  }

  return conflitos;
}
