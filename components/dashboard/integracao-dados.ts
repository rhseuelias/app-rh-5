import { differenceInCalendarDays } from "date-fns";
import type { Colaborador, Empresa, EtapaProcesso, ProcessoIntegracao } from "@/types/db";
import { etapaAtrasada } from "@/lib/calculos";

/** Dados já prontos (e simples) para o quadro "Processo de integração" do Painel. */

export type EstadoEtapaVisual = "feita" | "atual" | "atrasada" | "futura";
export type SituacaoLinha = "atrasado" | "vence" | "prazo";

export interface EtapaVisual {
  nome: string;
  estado: EstadoEtapaVisual;
  /** Data de conclusão (se feita) ou prazo (se aberta), "dd/mm". */
  data: string;
  resp: string;
}

export interface LinhaIntegracao {
  id: string;
  colaboradorId: string;
  nome: string;
  cargo: string;
  empresa: string;
  fase: "integracao" | "experiencia";
  quem: string;
  etapas: EtapaVisual[];
  feitas: number;
  etapaAtual: string;
  prazoTexto: string;
  situacao: SituacaoLinha;
  cronometro: string | null;
}

function parseData(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function curta(s?: string | null): string {
  const d = parseData(s);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "";
}

const feita = (e: EtapaProcesso) => e.status === "realizado" || e.status === "em_experiencia";

function rotuloResp(r: EtapaProcesso["responsavel"]): string {
  if (r === "LIDER") return "Líder";
  if (r === "FUNCIONARIO") return "Colaborador";
  if (r === "SISTEMA") return "Sistema";
  return "RH";
}

export function montarLinhasIntegracao(
  processos: ProcessoIntegracao[],
  etapas: EtapaProcesso[],
  colaboradores: Colaborador[],
  empresas: Empresa[]
): LinhaIntegracao[] {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diasAte = (s?: string | null) => {
    const d = parseData(s);
    return d ? differenceInCalendarDays(d, hoje) : null;
  };

  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of etapas) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }

  const ativos = processos.filter(
    (p) => !p.arquivado && (p.status_geral === "integracao" || p.status_geral === "experiencia")
  );

  const linhas: LinhaIntegracao[] = ativos.map((p) => {
    const colab = colabPorId.get(p.colaborador_id);
    const empresa = colab?.empresa_id ? empresaPorId.get(colab.empresa_id) : undefined;
    const lista = (etapasPorProcesso.get(p.id) ?? []).slice().sort((a, b) => a.ordem - b.ordem);
    const atual = lista.find((e) => !feita(e) && !e.bloqueada) ?? null;

    const visuais: EtapaVisual[] = lista.map((e) => {
      let estado: EstadoEtapaVisual = "futura";
      if (feita(e)) estado = "feita";
      else if (etapaAtrasada(e.prazo, e.status)) estado = "atrasada";
      else if (atual && e.id === atual.id) estado = "atual";
      return {
        nome: e.nome,
        estado,
        data: feita(e) ? curta(e.data_conclusao) : curta(e.prazo),
        resp: rotuloResp(e.responsavel),
      };
    });

    const algumaAtrasada = visuais.some((v) => v.estado === "atrasada");
    const dAtual = atual ? diasAte(atual.prazo) : null;

    let situacao: SituacaoLinha = "prazo";
    if (algumaAtrasada) situacao = "atrasado";
    else if (dAtual !== null && dAtual >= 0 && dAtual <= 3) situacao = "vence";

    // Prazo mostrado: o da etapa atrasada mais antiga, senão o da etapa atual.
    const alvo = lista.find((e) => !feita(e) && etapaAtrasada(e.prazo, e.status)) ?? atual;
    const dAlvo = alvo ? diasAte(alvo.prazo) : null;
    let prazoTexto = "—";
    if (alvo && alvo.prazo && dAlvo !== null) {
      if (dAlvo < 0) prazoTexto = `${-dAlvo} dia${dAlvo === -1 ? "" : "s"} de atraso`;
      else if (dAlvo === 0) prazoTexto = "Vence hoje";
      else prazoTexto = `${curta(alvo.prazo)} · em ${dAlvo} dia${dAlvo === 1 ? "" : "s"}`;
    } else if (!atual) {
      prazoTexto = "Etapas concluídas";
    }

    // Cronômetro da integração (começa no exame admissional, vai até o onboarding).
    let cronometro: string | null = null;
    const ini = parseData(p.cronometro_iniciado_em);
    if (ini && p.status_geral === "integracao") {
      const dia = Math.max(1, differenceInCalendarDays(hoje, ini) + 1);
      cronometro = `Cronômetro iniciado em ${curta(p.cronometro_iniciado_em)} · dia ${dia} de ${p.prazo_integracao_dias}`;
    }

    return {
      id: p.id,
      colaboradorId: p.colaborador_id,
      nome: colab?.nome ?? "—",
      cargo: colab?.cargo ?? "",
      empresa: empresa?.nome ?? "Sem empresa",
      fase: p.status_geral === "experiencia" ? "experiencia" : "integracao",
      quem: atual ? rotuloResp(atual.responsavel) : "—",
      etapas: visuais,
      feitas: visuais.filter((v) => v.estado === "feita").length,
      etapaAtual: atual?.nome ?? (lista.length > 0 ? "Concluída" : "—"),
      prazoTexto,
      situacao,
      cronometro,
    };
  });

  const ordem: Record<SituacaoLinha, number> = { atrasado: 0, vence: 1, prazo: 2 };
  return linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome, "pt-BR"));
}
