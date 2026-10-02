/**
 * Regras de lançamento de férias (CLT) usadas pela tela de Férias.
 * Funções puras, sem dependências: rodam no navegador (painel de lançamento)
 * e no servidor (que valida de novo antes de gravar).
 * Todas as datas são texto "AAAA-MM-DD"; a conta é feita em UTC pra nunca
 * errar um dia por causa de fuso horário.
 */

const DIA_MS = 86_400_000;

export const D = (s: string): number => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const S = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const somarDias = (s: string, n: number): string => S(D(s) + n * DIA_MS);
export const difDias = (a: string, b: string): number => Math.round((D(b) - D(a)) / DIA_MS);
export const diaSemana = (s: string): number => new Date(D(s)).getUTCDay(); // 0 = domingo

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const fDM = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const fDMA = (s: string): string => `${fDM(s)}/${s.slice(0, 4)}`;
export const fDMAcurto = (s: string): string => `${fDM(s)}/${s.slice(2, 4)}`;
export const fComSemana = (s: string): string => `${fDM(s)} (${SEMANA[diaSemana(s)]})`;

export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ------------------------------------------------------------
// Feriados (mapa data -> nome). O banco (tabela "feriados") manda;
// esta lista só garante os nacionais e os de Belo Horizonte quando a
// tabela ainda não tem o ano.
// ------------------------------------------------------------
export const FERIADOS_PADRAO: Record<string, string> = {
  "2026-01-01": "Confraternização Universal",
  "2026-02-16": "Carnaval",
  "2026-02-17": "Carnaval",
  "2026-04-03": "Sexta-feira Santa",
  "2026-04-21": "Tiradentes",
  "2026-05-01": "Dia do Trabalho",
  "2026-06-04": "Corpus Christi (BH)",
  "2026-08-15": "Assunção de Nossa Senhora (BH)",
  "2026-09-07": "Independência",
  "2026-10-12": "Nossa Senhora Aparecida",
  "2026-11-02": "Finados",
  "2026-11-15": "Proclamação da República",
  "2026-11-20": "Consciência Negra",
  "2026-12-08": "Imaculada Conceição (BH)",
  "2026-12-25": "Natal",
  "2027-01-01": "Confraternização Universal",
};

export function mapaDeFeriados(doBanco: { data: string; nome: string }[]): Record<string, string> {
  const mapa: Record<string, string> = { ...FERIADOS_PADRAO };
  for (const f of doBanco) mapa[f.data.slice(0, 10)] = f.nome;
  return mapa;
}

/**
 * Art. 134 §3º: o início das férias não pode cair em domingo/feriado nem
 * nos 2 dias que antecedem domingo/feriado. Devolve o motivo ou null.
 */
export function motivoInicioInvalido(inicio: string, feriados: Record<string, string>): string | null {
  if (diaSemana(inicio) === 0 || feriados[inicio]) return "não pode começar em domingo ou feriado";
  for (let k = 1; k <= 2; k++) {
    const n = somarDias(inicio, k);
    if (diaSemana(n) === 0) return `começa a menos de 2 dias do descanso semanal (domingo ${fDM(n)})`;
    if (feriados[n]) return `começa a menos de 2 dias do feriado de ${fDM(n)} (${feriados[n]})`;
  }
  return null;
}

export const inicioValido = (s: string, f: Record<string, string>): boolean => !motivoInicioInvalido(s, f);

/** Avança até o próximo dia em que as férias podem começar. */
export function proximoInicioValido(s: string, feriados: Record<string, string>): string {
  let n = 0;
  while (!inicioValido(s, feriados) && n++ < 14) s = somarDias(s, 1);
  return s;
}

/** Data sugerida: ~30 dias à frente (antecedência do art. 135), ou antes se o limite apertar. */
export function sugerirInicio(hoje: string, dias: number, limite: string | null, feriados: Record<string, string>): string {
  let s = proximoInicioValido(somarDias(hoje, 30), feriados);
  if (limite && somarDias(s, dias - 1) > limite) s = proximoInicioValido(somarDias(hoje, 7), feriados);
  return s;
}

// ------------------------------------------------------------
// Validação do lançamento
// ------------------------------------------------------------
export interface EntradaValidacao {
  hoje: string;
  limite: string | null;
  feriados: Record<string, string>;
  /** dias dos OUTROS períodos já marcados neste período aquisitivo (sem o que está sendo editado) */
  outrosDias: number[];
  abono: boolean;
  inicio: string;
  dias: number;
}

export interface ResultadoValidacao {
  erros: string[];
  avisos: string[];
  disp: number;
  fim: string;
}

export function validarLancamento(e: EntradaValidacao): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const dias = Number(e.dias) || 0;
  const usados = e.outrosDias.reduce((a, b) => a + b, 0);
  const disp = 30 - usados - (e.abono ? 10 : 0);

  if (!e.inicio) erros.push("Escolha a data de início.");
  if (dias < 5) erros.push("Cada período precisa ter pelo menos 5 dias.");
  if (dias > disp) erros.push(disp > 0 ? `O saldo disponível é de ${disp} dias.` : "Não há saldo disponível neste período aquisitivo.");

  const sobra = disp - dias;
  const n = e.outrosDias.length + 1;
  if (dias >= 5 && dias <= disp) {
    if (n > 3) erros.push("Máximo de 3 períodos por período aquisitivo.");
    else if (sobra > 0 && sobra < 5) erros.push(`Sobrariam ${sobra} dias, e cada período precisa ter pelo menos 5.`);
    else if (sobra > 0 && n === 3) erros.push(`Sobrariam ${sobra} dias sem período disponível (máximo de 3).`);
    if (!(e.outrosDias.some((d) => d >= 14) || dias >= 14 || sobra >= 14)) {
      erros.push("Um dos períodos precisa ter 14 dias ou mais.");
    }
  }

  let fim = "";
  if (e.inicio) {
    if (e.inicio < e.hoje) erros.push("A data de início já passou.");
    const motivo = motivoInicioInvalido(e.inicio, e.feriados);
    if (motivo) erros.push(`Início inválido: ${motivo}.`);
    fim = somarDias(e.inicio, Math.max(dias, 1) - 1);
    if (e.limite && fim > e.limite) {
      avisos.push(`Termina depois do limite de concessão (${fDMA(e.limite)}). Os dias após o limite são pagos em dobro.`);
    }
    if (e.inicio >= e.hoje && difDias(e.hoje, e.inicio) < 30) {
      avisos.push("Aviso com menos de 30 dias de antecedência (art. 135). Combine com o colaborador por escrito.");
    }
  }
  return { erros, avisos, disp, fim };
}

/** Estimativa: salário ÷ 30 × dias + 1/3. */
export const valorFeriasEstimado = (salario: number, dias: number): number => ((salario || 0) / 30) * dias * (4 / 3);

// ------------------------------------------------------------
// Amortizar férias antigas (já tiradas e não registradas)
// ------------------------------------------------------------
export interface EntradaAmortizacao {
  hoje: string;
  inicio: string;
  fim: string;
  /** dias dos OUTROS períodos já registrados no mesmo período aquisitivo */
  outrosDias: number[];
  abono: boolean;
  /** todas as outras férias do colaborador (pra não registrar duas vezes o mesmo intervalo) */
  outros: { i: string; f: string }[];
}

export interface ResultadoAmortizacao {
  erros: string[];
  dias: number;
  disp: number;
}

export function validarAmortizacao(e: EntradaAmortizacao): ResultadoAmortizacao {
  const erros: string[] = [];
  const disp = 30 - e.outrosDias.reduce((a, b) => a + b, 0) - (e.abono ? 10 : 0);
  let dias = 0;
  if (!e.inicio || !e.fim) {
    erros.push("Escolha a data de início e a data de fim.");
  } else if (e.fim < e.inicio) {
    erros.push("A data de fim não pode ser antes da data de início.");
  } else {
    dias = difDias(e.inicio, e.fim) + 1;
    if (e.fim >= e.hoje) erros.push("Essas datas ainda não passaram. Para férias futuras, use “Lançar férias”.");
    if (dias > 30) erros.push("Um período de férias não pode passar de 30 dias.");
    if (dias > disp) {
      erros.push(disp > 0 ? `O saldo deste período aquisitivo é de ${disp} dias.` : "Este período aquisitivo não tem mais saldo.");
    }
    const choque = e.outros.find((o) => o.i <= e.fim && o.f >= e.inicio);
    if (choque) erros.push(`Já existem férias registradas de ${fDM(choque.i)} a ${fDM(choque.f)} neste intervalo.`);
  }
  return { erros, dias, disp };
}
