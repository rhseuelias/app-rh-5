// Regras de prazo do desligamento (pagamento das verbas e homologação).
// Funções puras: sem banco, sem fuso horário do servidor (datas "AAAA-MM-DD").
//
// Regra geral usada aqui (CLT art. 477): as verbas rescisórias são pagas em até
// 10 dias corridos depois do último dia do contrato. A homologação no sindicato
// não é obrigatória por lei desde a reforma de 2017, mas a convenção coletiva
// pode exigir — por isso ela pode ser marcada como "dispensada".
// Confirme sempre com a contabilidade.

export type TipoAviso = "trabalhado" | "indenizado" | "acordo";

export const ROTULO_TIPO_AVISO: Record<TipoAviso, string> = {
  trabalhado: "Aviso trabalhado",
  indenizado: "Aviso indenizado",
  acordo: "Acordo consensual",
};

export const DICA_TIPO_AVISO: Record<TipoAviso, string> = {
  trabalhado: "O colaborador cumpre o aviso. O prazo conta a partir do último dia de trabalho.",
  indenizado: "O contrato termina na data da comunicação. O prazo conta a partir dela.",
  acordo: "Acordo entre as duas partes (art. 484-A). Aviso pago a 50%, multa do FGTS de 20%.",
};

export const PRAZO_PAGAMENTO_DIAS = 10;
export const DIAS_ATENCAO = 5;

export interface Desligamento {
  colaborador_id: string;
  tipo_aviso: TipoAviso;
  data_comunicacao: string;
  dias_aviso: number | null;
  ultimo_dia: string;
  prazo_pagamento: string;
  pago_em: string | null;
  homologacao_necessaria: boolean;
  homologacao_data: string | null;
  homologacao_hora: string | null;
  homologacao_local: string | null;
  homologacao_feita_em: string | null;
  observacao: string | null;
}

export type Tom = "ok" | "atencao" | "atrasado" | "feito" | "neutro";

// ---------- datas ----------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataValida(iso: string | null | undefined): iso is string {
  if (!iso) return false;
  const m = ISO.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === iso;
}

/** Data de hoje em Brasília, "AAAA-MM-DD". */
export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDias(iso: string, dias: number): string {
  const m = ISO.exec(iso)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias)).toISOString().slice(0, 10);
}

/** Quantos dias de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  const a = ISO.exec(de)!;
  const b = ISO.exec(ate)!;
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((tb - ta) / 86400000);
}

export function br(iso: string | null | undefined): string {
  if (!iso || !ISO.test(iso)) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function brCurto(iso: string | null | undefined): string {
  if (!iso || !ISO.test(iso)) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
export const fDias = (n: number) => `${n} ${plural(n, "dia", "dias")}`;

// ---------- prazos ----------

/** Anos completos de casa entre a admissão e a data da comunicação. */
export function anosCompletos(admissao: string | null, ate: string): number {
  if (!dataValida(admissao) || !dataValida(ate)) return 0;
  const a = ISO.exec(admissao)!;
  const b = ISO.exec(ate)!;
  let anos = Number(b[1]) - Number(a[1]);
  if (Number(b[2]) < Number(a[2]) || (Number(b[2]) === Number(a[2]) && Number(b[3]) < Number(a[3]))) anos -= 1;
  return Math.max(0, anos);
}

/** Aviso prévio proporcional: 30 dias + 3 por ano completo de casa, no máximo 90. */
export function diasDeAviso(admissao: string | null, comunicacao: string): number {
  return Math.min(90, 30 + 3 * anosCompletos(admissao, comunicacao));
}

export function calcularPrazos(
  tipo: TipoAviso,
  comunicacao: string,
  diasAviso: number | null
): { ultimoDia: string; prazoPagamento: string } {
  const ultimoDia = tipo === "trabalhado" ? somarDias(comunicacao, diasAviso ?? 30) : comunicacao;
  return { ultimoDia, prazoPagamento: somarDias(ultimoDia, PRAZO_PAGAMENTO_DIAS) };
}

// ---------- situação de cada etapa ----------

export interface SituacaoEtapa {
  tom: Tom;
  rotulo: string;
}

export function situacaoPagamento(d: Desligamento, hoje: string): SituacaoEtapa {
  if (d.pago_em) return { tom: "feito", rotulo: `Pago em ${br(d.pago_em)}` };
  const falta = diasEntre(hoje, d.prazo_pagamento);
  if (falta < 0) return { tom: "atrasado", rotulo: `Atrasado há ${fDias(-falta)}` };
  if (falta === 0) return { tom: "atencao", rotulo: "Vence hoje" };
  if (falta <= DIAS_ATENCAO) return { tom: "atencao", rotulo: `Atenção · faltam ${fDias(falta)}` };
  return { tom: "ok", rotulo: `No prazo · faltam ${fDias(falta)}` };
}

export function situacaoHomologacao(d: Desligamento, hoje: string): SituacaoEtapa {
  if (!d.homologacao_necessaria) return { tom: "neutro", rotulo: "Dispensada" };
  if (d.homologacao_feita_em) return { tom: "feito", rotulo: `Realizada em ${br(d.homologacao_feita_em)}` };
  if (!d.homologacao_data) return { tom: "neutro", rotulo: "Sem data marcada" };
  const falta = diasEntre(hoje, d.homologacao_data);
  if (falta < 0) return { tom: "atrasado", rotulo: "Data passou, sem registro" };
  if (falta === 0) return { tom: "atencao", rotulo: "É hoje" };
  if (falta <= DIAS_ATENCAO) return { tom: "atencao", rotulo: `Atenção · faltam ${fDias(falta)}` };
  return { tom: "neutro", rotulo: `Agendada · faltam ${fDias(falta)}` };
}

export interface ProgressoAviso {
  total: number;
  diaAtual: number;
  faltam: number;
  terminou: boolean;
}

/** Só para o aviso trabalhado: em que dia do aviso estamos. */
export function progressoAviso(d: Desligamento, hoje: string): ProgressoAviso | null {
  if (d.tipo_aviso !== "trabalhado" || !d.dias_aviso) return null;
  const total = d.dias_aviso;
  const decorridos = diasEntre(d.data_comunicacao, hoje);
  const diaAtual = Math.max(0, Math.min(total, decorridos));
  return { total, diaAtual, faltam: Math.max(0, diasEntre(hoje, d.ultimo_dia)), terminou: hoje > d.ultimo_dia };
}

// ---------- faixa de aviso (a mais urgente) ----------

export interface Faixa {
  tom: Tom;
  titulo: string;
  detalhe: string;
  numero: string;
  legenda: string;
  /** dias até o próximo prazo (negativo = atrasado). 9999 = nada pendente. */
  ordem: number;
}

function tomPorDias(falta: number): Tom {
  return falta <= DIAS_ATENCAO ? "atencao" : "ok";
}

export function faixaDesligamento(d: Desligamento, hoje: string): Faixa {
  const faltaPag = diasEntre(hoje, d.prazo_pagamento);
  const homolPendente = d.homologacao_necessaria && !d.homologacao_feita_em;
  const homol = d.homologacao_data
    ? `Homologação ${br(d.homologacao_data)}${d.homologacao_hora ? ` às ${d.homologacao_hora}` : ""}.`
    : "Homologação ainda sem data marcada.";

  if (!d.pago_em && faltaPag < 0) {
    return {
      tom: "atrasado",
      titulo: `O pagamento das verbas venceu em ${br(d.prazo_pagamento)}`,
      detalhe: "Pagar fora do prazo pode gerar multa equivalente a um salário. Marque como pago assim que fizer.",
      numero: String(-faltaPag),
      legenda: plural(-faltaPag, "dia de atraso", "dias de atraso"),
      ordem: faltaPag,
    };
  }

  if (homolPendente && d.homologacao_data) {
    const faltaHom = diasEntre(hoje, d.homologacao_data);
    if (faltaHom < 0) {
      return {
        tom: "atrasado",
        titulo: `A homologação de ${br(d.homologacao_data)} está sem registro`,
        detalhe: "Registre como realizada ou remarque a data.",
        numero: String(-faltaHom),
        legenda: plural(-faltaHom, "dia desde a data", "dias desde a data"),
        ordem: faltaHom,
      };
    }
  }

  const prog = progressoAviso(d, hoje);
  if (prog && !prog.terminou) {
    return {
      tom: tomPorDias(prog.faltam),
      titulo:
        prog.faltam === 0
          ? `Hoje é o último dia do aviso (${brCurto(d.ultimo_dia)})`
          : `O aviso termina em ${fDias(prog.faltam)} (${brCurto(d.ultimo_dia)})`,
      detalhe: `Depois disso, o pagamento das verbas vence em ${br(d.prazo_pagamento)}. ${homol}`,
      numero: String(prog.faltam),
      legenda: plural(prog.faltam, "dia", "dias"),
      ordem: prog.faltam,
    };
  }

  if (!d.pago_em) {
    return {
      tom: tomPorDias(faltaPag),
      titulo:
        faltaPag === 0
          ? "O pagamento das verbas vence hoje"
          : `O pagamento das verbas vence em ${br(d.prazo_pagamento)}`,
      detalhe: homolPendente ? homol : "Homologação dispensada ou já realizada.",
      numero: String(faltaPag),
      legenda: plural(faltaPag, "dia para pagar", "dias para pagar"),
      ordem: faltaPag,
    };
  }

  if (homolPendente) {
    if (!d.homologacao_data) {
      return {
        tom: "atencao",
        titulo: "Pagamento feito. Falta marcar a homologação",
        detalhe: "Se o sindicato não for exigido, marque a homologação como dispensada.",
        numero: "—",
        legenda: "sem data",
        ordem: 0,
      };
    }
    const faltaHom = diasEntre(hoje, d.homologacao_data);
    return {
      tom: tomPorDias(faltaHom),
      titulo: faltaHom === 0 ? "A homologação é hoje" : `Homologação em ${br(d.homologacao_data)}`,
      detalhe: "O pagamento já foi registrado.",
      numero: String(faltaHom),
      legenda: plural(faltaHom, "dia", "dias"),
      ordem: faltaHom,
    };
  }

  return {
    tom: "feito",
    titulo: "Desligamento concluído",
    detalhe: "Pagamento e homologação registrados.",
    numero: "OK",
    legenda: "tudo certo",
    ordem: 9999,
  };
}

/** Texto curto para listas (Painel): o que está pendente e para quando. */
export function resumoParaLista(d: Desligamento, hoje: string): { tom: Tom; texto: string; ordem: number } {
  const f = faixaDesligamento(d, hoje);
  return { tom: f.tom, texto: f.titulo, ordem: f.ordem };
}
