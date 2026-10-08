import { addDays, differenceInCalendarDays } from "date-fns";
import type { Colaborador, Empresa, EtapaProcesso, ProcessoIntegracao, Unidade } from "@/types/db";
import { etapaAtrasada } from "@/lib/calculos";
import type {
  EstadoEtapa,
  GrupoTimeline,
  LinhaTimeline,
  StatusLinha,
  Tom,
} from "@/components/integracao/PainelTimeline";

// Qualquer cliente do Supabase (o do usuário logado ou o administrativo do link público).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = { from: (tabela: string) => any };

// As etapas reais do processo (pré-cadastro, exames, vale-transporte, contrato,
// admissão, onboarding, pesquisa, experiência, avaliação dos 90 dias...) são
// agrupadas nestas 6 colunas só para a exibição. Nada muda no banco.
export const GRUPOS = ["Cadastro", "Exame", "Documentação", "Treinamento", "Integração", "Efetivação"];

const STATUS_PRIORIDADE: Record<StatusLinha, number> = {
  atrasado: 0,
  atencao: 1,
  andamento: 2,
  dentro: 3,
  naoiniciado: 4,
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseData(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmt(s?: string | null): string {
  const d = parseData(s);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "—";
}

function fmtCurta(s?: string | null): string {
  const d = parseData(s);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : "";
}

function feita(e: EtapaProcesso) {
  return e.status === "realizado" || e.status === "em_experiencia";
}

// Decide em qual das 6 colunas cada etapa aparece, olhando o nome/chave dela.
// Se o nome não bater com nada, distribui pela posição na sequência.
function indiceGrupo(e: EtapaProcesso, posicao: number, total: number): number {
  const t = normalizar(`${e.chave} ${e.nome}`);
  if (t.includes("exame")) return 1;
  if (t.includes("pesquisa")) return 4;
  if (t.includes("onboarding")) return 3;
  if (t.includes("avalia") || t.includes("efetiv")) return 5;
  if (t.includes("experiencia")) return 4;
  if (t.includes("cadastro")) return 0;
  if (t.includes("vale") || t.includes("transporte") || t.includes("benef") || t.includes("contrato") || t.includes("admissao")) {
    return 2;
  }
  return Math.min(5, Math.floor((posicao / Math.max(total, 1)) * 6));
}

export async function montarPainelIntegracao(supabase: ClienteSupabase) {

  const [{ data: processos }, { data: colaboradores }, { data: empresas }, { data: unidades }, { data: etapas }] =
    await Promise.all([
      supabase.from("processos_integracao").select("*").order("created_at", { ascending: false }),
      supabase.from("colaboradores").select("*"),
      supabase.from("empresas").select("*"),
      supabase.from("unidades").select("*"),
      supabase.from("etapas_processo").select("*").order("ordem", { ascending: true }),
    ]);

  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diasAte = (s?: string | null): number | null => {
    const d = parseData(s);
    return d ? differenceInCalendarDays(d, hojeLocal) : null;
  };

  // Efetivado(a) e Não efetivado(a) não aparecem mais neste painel.
  // Os registros continuam salvos no banco.
  const lista = ((processos ?? []) as ProcessoIntegracao[]).filter(
    (p) => !p.arquivado && (p.status_geral === "integracao" || p.status_geral === "experiencia")
  );

  const colaboradorPorId = new Map(((colaboradores ?? []) as Colaborador[]).map((c) => [c.id, c]));
  const empresaPorId = new Map(((empresas ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((unidades ?? []) as Unidade[]).map((u) => [u.id, u]));

  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of (etapas ?? []) as EtapaProcesso[]) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }

  const linhas: LinhaTimeline[] = lista.map((p) => {
    const colaborador = colaboradorPorId.get(p.colaborador_id);
    const empresa = colaborador?.empresa_id ? empresaPorId.get(colaborador.empresa_id) : undefined;
    const unidade = colaborador?.unidade_id ? unidadePorId.get(colaborador.unidade_id) : undefined;
    const etapasDoProcesso = (etapasPorProcesso.get(p.id) ?? []).slice().sort((a, b) => a.ordem - b.ordem);
    const total = etapasDoProcesso.length;

    const respLabel = (e: EtapaProcesso): string => {
      if (e.responsavel === "LIDER") return colaborador?.lider ? `${colaborador.lider} (Líder)` : "Líder";
      if (e.responsavel === "FUNCIONARIO") return "Funcionário";
      if (e.responsavel === "SISTEMA") return "Sistema";
      return "RH";
    };

    const respCurto = (e: EtapaProcesso): string => {
      if (e.responsavel === "LIDER") return "Líder";
      if (e.responsavel === "FUNCIONARIO") return "Funcionário";
      if (e.responsavel === "SISTEMA") return "Sistema";
      return "RH";
    };

    const porGrupo: EtapaProcesso[][] = GRUPOS.map(() => []);
    etapasDoProcesso.forEach((e, i) => {
      porGrupo[indiceGrupo(e, i, total)].push(e);
    });

    const grupos: GrupoTimeline[] = GRUPOS.map((nome, gi) => {
      const es = porGrupo[gi];
      if (es.length === 0) return { nome, estado: "na", sub: "", dica: `${nome}: não se aplica` };

      const todasRealizadas = es.every((e) => e.status === "realizado");
      const atrasada = es.some((e) => etapaAtrasada(e.prazo, e.status));
      const proximaAberta = es.find((e) => !feita(e) && !e.bloqueada);
      const diasProximaAberta = proximaAberta ? diasAte(proximaAberta.prazo) : null;
      const atencao =
        !atrasada &&
        proximaAberta !== undefined &&
        (proximaAberta.status === "em_andamento" || proximaAberta.status === "pendente") &&
        diasProximaAberta !== null &&
        diasProximaAberta >= 0 &&
        diasProximaAberta <= 2;
      const emCurso = es.some((e) => e.status === "em_andamento" || e.status === "em_experiencia");
      const parcial = es.some(feita) && es.some((e) => !feita(e));

      let estado: EstadoEtapa;
      if (todasRealizadas) estado = "done";
      else if (atrasada) estado = "late";
      else if (atencao) estado = "attention";
      else if (emCurso || parcial) estado = "progress";
      else estado = "pending";

      let sub = "";
      if (estado === "done") {
        const datas = es.map((e) => e.data_conclusao).filter(Boolean) as string[];
        sub = fmtCurta(datas.sort().pop());
      } else if (estado === "progress" || estado === "late" || estado === "attention") {
        const alvo = es.find((e) => !feita(e) && e.prazo) ?? proximaAberta;
        sub = alvo?.prazo ? `até ${fmtCurta(alvo.prazo)}` : "";
      }

      const rotulo: Record<EstadoEtapa, string> = {
        done: "Concluída",
        progress: "Em andamento",
        late: "Atrasada",
        attention: "Atenção: prazo perto do fim",
        pending: "Pendente",
        na: "Não se aplica",
      };
      return { nome, estado, sub, dica: `${nome}: ${rotulo[estado]}` };
    });

    const concluidas = grupos.filter((g) => g.estado === "done").length;

    const atualRaw =
      etapasDoProcesso.find((e) => !feita(e) && !e.bloqueada) ??
      etapasDoProcesso.find((e) => e.status === "em_experiencia") ??
      etapasDoProcesso.find((e) => !feita(e)) ??
      null;

    let atual: LinhaTimeline["atual"] = null;
    let etapaAtualGrupo: string | null = null;
    if (atualRaw) {
      const idx = indiceGrupo(atualRaw, etapasDoProcesso.indexOf(atualRaw), total);
      etapaAtualGrupo = GRUPOS[idx];
      const atrasadaAtual = etapaAtrasada(atualRaw.prazo, atualRaw.status);
      let situacao = "Não iniciada";
      let situacaoTom: Tom = "gray";
      if (atrasadaAtual) {
        situacao = "Atrasada";
        situacaoTom = "red";
      } else if (atualRaw.status === "em_andamento") {
        situacao = "Em andamento";
        situacaoTom = "blue";
      } else if (atualRaw.status === "em_experiencia") {
        situacao = "Em experiência";
        situacaoTom = "blue";
      } else if (atualRaw.status === "pendente") {
        situacao = "Pendente";
        situacaoTom = "amber";
      }
      const dPrazo = diasAte(atualRaw.prazo);
      const curto = respCurto(atualRaw);
      let detalhe: string;
      if (atrasadaAtual && dPrazo !== null) {
        const n = Math.max(1, -dPrazo);
        detalhe = `${curto} · atrasada há ${n} dia${n !== 1 ? "s" : ""}`;
      } else if (atualRaw.prazo) {
        detalhe = `${curto} · até ${fmtCurta(atualRaw.prazo)}`;
      } else {
        detalhe = `${curto} · sem prazo definido`;
      }
      atual = {
        nome: atualRaw.nome,
        detalhe,
        atrasada: atrasadaAtual,
        diasAtraso: atrasadaAtual && dPrazo !== null ? Math.max(1, -dPrazo) : 0,
        prazoCurto: fmtCurta(atualRaw.prazo),
        responsavelTipo: atualRaw.responsavel,
        responsavelCurto: curto,
        responsavel: respLabel(atualRaw),
        inicio: fmt(atualRaw.data_inicio),
        prazo: fmt(atualRaw.prazo),
        conclusao: fmt(atualRaw.data_conclusao),
        situacao,
        situacaoTom,
        observacoes: atualRaw.observacoes ?? "",
      };
    }

    const algumaLate = grupos.some((g) => g.estado === "late");
    const algumaAtencao = grupos.some((g) => g.estado === "attention");
    const temFeito = grupos.some((g) => g.estado === "done");
    const temCurso = grupos.some((g) => g.estado === "progress");
    let status: StatusLinha;
    if (algumaLate) status = "atrasado";
    else if (algumaAtencao) status = "atencao";
    else if (!temFeito && !temCurso) status = "naoiniciado";
    else {
      const d = atualRaw ? diasAte(atualRaw.prazo) : null;
      status = d !== null && d < 5 ? "andamento" : "dentro";
    }

    const pendencias = etapasDoProcesso
      .filter((e) => !feita(e))
      .map((e) => ({ nome: e.nome, atrasada: etapaAtrasada(e.prazo, e.status), resp: respCurto(e) }));

    const etapasLista = etapasDoProcesso.map((e) => {
      const atrasadaE = etapaAtrasada(e.prazo, e.status);
      let estadoE: "done" | "progress" | "late" | "pending" = "pending";
      let direita = "—";
      if (e.status === "realizado") {
        estadoE = "done";
        direita = fmtCurta(e.data_conclusao) || "—";
      } else if (e.status === "em_experiencia") {
        estadoE = "done";
        direita = "em experiência";
      } else if (atrasadaE) {
        estadoE = "late";
        direita = e.prazo ? `prazo ${fmtCurta(e.prazo)}` : "atrasada";
      } else if (e.status === "em_andamento") {
        estadoE = "progress";
        direita = "em andamento";
      }
      return { nome: e.nome, resp: respCurto(e), estado: estadoE, direita };
    });

    const movimentos = etapasDoProcesso
      .flatMap((e) => {
        if (e.data_conclusao) {
          return [{ chave: e.data_conclusao, data: fmtCurta(e.data_conclusao), texto: `${e.nome} — etapa concluída`, quem: e.concluido_por ?? respLabel(e) }];
        }
        if (e.data_inicio) {
          return [{ chave: e.data_inicio, data: fmtCurta(e.data_inicio), texto: `${e.nome} — etapa iniciada`, quem: respLabel(e) }];
        }
        return [];
      })
      .sort((a, b) => b.chave.localeCompare(a.chave))
      .slice(0, 5)
      .map(({ data, texto, quem }) => ({ data, texto, quem }));

    const ultimaEtapa = etapasDoProcesso[etapasDoProcesso.length - 1];
    const previsao = fmt(p.data_fim_experiencia ?? ultimaEtapa?.prazo ?? null);

    const base = parseData(colaborador?.data_admissao ?? p.created_at) ?? hojeLocal;
    const criado = parseData(p.created_at) ?? hojeLocal;

    // Prazo final FIXO da efetivação: fim da experiência; se não houver, prazo da última etapa;
    // se também não houver, admissão + 90 dias.
    const fimData = parseData(p.data_fim_experiencia ?? ultimaEtapa?.prazo ?? null) ?? addDays(base, 90);
    const diasFinal = differenceInCalendarDays(fimData, hojeLocal);
    const prazoFinal = `${pad(fimData.getDate())}/${pad(fimData.getMonth() + 1)}/${fimData.getFullYear()}`;
    const prazoFinalCurto = `${pad(fimData.getDate())}/${pad(fimData.getMonth() + 1)}`;

    return {
      id: p.id,
      colaboradorId: p.colaborador_id,
      nome: colaborador?.nome ?? "—",
      cargo: colaborador?.cargo && colaborador.cargo !== "—" ? colaborador.cargo : "",
      empresaId: colaborador?.empresa_id ?? null,
      empresaNome: empresa?.nome ?? "",
      unidadeId: colaborador?.unidade_id ?? null,
      unidadeNome: unidade?.nome ?? "",
      lider: colaborador?.lider ?? "",
      periodoChave: `${base.getFullYear()}-${pad(base.getMonth() + 1)}`,
      periodoLabel: `${MESES[base.getMonth()]}/${base.getFullYear()}`,
      novo: differenceInCalendarDays(hojeLocal, criado) <= 7,
      statusGeral: p.status_geral as "integracao" | "experiencia",
      status,
      grupos,
      concluidas,
      etapaAtualGrupo,
      atual,
      responsavelAtual: atualRaw ? respLabel(atualRaw) : "RH",
      previsao,
      prazoFinal,
      prazoFinalCurto,
      diasFinal,
      pendencias,
      etapas: etapasLista,
      movimentos,
    };
  });

  // Quem precisa de atenção primeiro: atrasados, depois atenção, e assim por diante.
  linhas.sort(
    (a, b) => STATUS_PRIORIDADE[a.status] - STATUS_PRIORIDADE[b.status] || a.nome.localeCompare(b.nome, "pt-BR")
  );

  const atrasados = linhas.filter((l) => l.status === "atrasado").length;

  // Quem ainda não tem processo de integração pode ser incluído pelo botão do topo.
  const comProcesso = new Set(((processos ?? []) as ProcessoIntegracao[]).map((p) => p.colaborador_id));
  const disponiveis = ((colaboradores ?? []) as Colaborador[])
    .filter((c) => (c.status === "ativo" || c.status === "experiencia") && !comProcesso.has(c.id))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      detalhe: [c.cargo, c.empresa_id ? empresaPorId.get(c.empresa_id)?.nome : ""].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { linhas, atrasados, disponiveis };
}
