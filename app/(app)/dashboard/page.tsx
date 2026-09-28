import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  EtapaProcesso,
  Ferias,
  PeriodoAquisitivo,
  ProcessoIntegracao,
} from "@/types/db";
import {
  custoMensalColaborador,
  percentualFolhaSobreFaturamento,
  LIMITE_SAUDAVEL_FOLHA_PCT,
  diasParaFimExperiencia,
  diasParaVencerFerias,
  etapaAtrasada,
  FERIAS_STATUS_LABEL,
  formatarDataBR,
} from "@/lib/calculos";
import { differenceInCalendarDays, addDays, subMonths } from "date-fns";
import Link from "next/link";
import {
  DonutCargo,
  DonutDuas,
  BarrasTempoEmpresa,
  EvolucaoIndicadores,
} from "@/components/dashboard/DashboardCharts";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

const STATUS_GERAL_LABEL: Record<string, string> = {
  integracao: "Integração",
  experiencia: "Experiência",
  efetivado: "Efetivado(a)",
  nao_efetivado: "Não efetivado(a)",
};

const STATUS_GERAL_ICONE: Record<string, string> = {
  integracao: "🧭",
  experiencia: "🧪",
  efetivado: "✅",
  nao_efetivado: "🚫",
};

// tema "Dark Analytics" — tons claros o bastante pra ler sobre o fundo navy
// (ink-900/ink-800) do dashboard
const STATUS_GERAL_COR: Record<string, string> = {
  integracao: "text-slate-200",
  experiencia: "text-blue-300",
  efetivado: "text-emerald-300",
  nao_efetivado: "text-slate-500",
};

const FERIAS_STATUS_BADGE: Record<string, string> = {
  planejada: "bg-blue-400/15 text-blue-300",
  solicitado: "bg-white/10 text-slate-300",
  aprovado: "bg-emerald-400/15 text-emerald-300",
  concluido: "bg-emerald-400/15 text-emerald-300",
  cancelado: "bg-white/5 text-slate-500",
};

const FONTE_TECH = "'Space Grotesk', sans-serif";
const FONTE_MONO = "'JetBrains Mono', monospace";

/**
 * Gera uma série mensal "de exemplo" (12 pontos, do mês mais antigo pro mais
 * recente), terminando sempre no valor real de hoje — usada só pra ilustrar
 * como o gráfico de evolução vai ficar quando o app passar a guardar um
 * histórico mensal de verdade. Determinística (sem Math.random) pra não
 * mudar a cada carregamento da página.
 */
function gerarSerieExemplo(valorAtual: number, amplitude: number, hoje: Date) {
  const MESES = 12;
  return Array.from({ length: MESES }, (_, i) => {
    const idx = MESES - 1 - i; // 11 = mês atual, 0 = 11 meses atrás
    const d = subMonths(hoje, idx);
    const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    if (idx === 0) return { mes, valor: Math.round(valorAtual * 10) / 10 };
    const onda = Math.sin((MESES - idx) * 1.1) * amplitude;
    const tendencia = valorAtual - amplitude * 0.6 * (idx / MESES);
    return { mes, valor: Math.max(0, Math.round((tendencia + onda) * 10) / 10) };
  });
}

export default async function DashboardPage() {
  const supabase = createClient();

  // gera sozinho o próximo período aquisitivo de quem já passou da data
  // de fim do período anterior, antes de buscar os dados da página
  await autoGerarProximosPeriodosVencidos();

  // perfil "assistente" não vê custo/folha/faturamento em lugar nenhum do app
  const ocultarFinanceiro = await souAssistente();

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const daqui30 = addDays(hoje, 30);

  const [
    { data: colaboradores },
    { data: empresas },
    { data: processos },
    { data: etapasProcesso },
    { data: configIntegracao },
    { data: periodosAbertos },
    { data: feriasProximas },
    { data: feriasDoPeriodo },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*"),
    supabase.from("empresas").select("*"),
    supabase.from("processos_integracao").select("*"),
    supabase.from("etapas_processo").select("*"),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase
      .from("ferias")
      .select("*")
      .eq("simulacao", false)
      .neq("status", "cancelado")
      .gte("data_inicio", hoje.toISOString().slice(0, 10))
      .lte("data_inicio", daqui30.toISOString().slice(0, 10))
      .order("data_inicio", { ascending: true }),
    // todo mundo com período aquisitivo vinculado — só pra saber se uma
    // férias é a 1ª/2ª/3ª daquele período (coluna "Período" da tabela)
    supabase
      .from("ferias")
      .select("id,periodo_aquisitivo_id,data_inicio")
      .eq("simulacao", false)
      .neq("status", "cancelado")
      .not("periodo_aquisitivo_id", "is", null)
      .order("data_inicio", { ascending: true }),
  ]);

  const lista = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = (empresas ?? []) as Empresa[];

  // ------------------------------------------------------------
  // PAINEL DE INTEGRAÇÃO — status dos colaboradores no painel
  // (mesma regra de "some sozinho" do painel: Efetivado/Não efetivado
  // saem da contagem depois do prazo configurado, ou se foram retirados
  // manualmente — mas o histórico continua existindo no banco)
  // ------------------------------------------------------------
  const prazoSaidaPainelDias = configIntegracao?.prazo_saida_painel_dias ?? 7;
  const todosProcessos = (processos ?? []) as ProcessoIntegracao[];
  const todasEtapas = (etapasProcesso ?? []) as EtapaProcesso[];

  function deveEstarNoPainel(p: ProcessoIntegracao): boolean {
    if (p.arquivado) return false;
    if (p.status_geral === "efetivado" || p.status_geral === "nao_efetivado") {
      const base = p.status_geral_definido_em;
      if (!base) return true;
      const diasNoStatus = Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
      return diasNoStatus < prazoSaidaPainelDias;
    }
    return true;
  }

  const processosNoPainel = todosProcessos.filter(deveEstarNoPainel);
  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of todasEtapas) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }

  const statusPainel = ["integracao", "experiencia", "efetivado", "nao_efetivado"].map((status) => ({
    status,
    total: processosNoPainel.filter((p) => p.status_geral === status).length,
  }));
  const atrasadasPainel = processosNoPainel.filter((p) =>
    (etapasPorProcesso.get(p.id) ?? []).some((e) => etapaAtrasada(e.prazo, e.status))
  ).length;

  const ativos = lista.filter((c) => c.status === "ativo" || c.status === "experiencia");
  const clt = ativos.filter((c) => c.tipo === "CLT");
  const pj = ativos.filter((c) => c.tipo === "PJ");
  const estagio = ativos.filter((c) => c.tipo === "Estagio");

  const admissoesMes = lista.filter(
    (c) => c.data_admissao && new Date(c.data_admissao) >= inicioMes
  ).length;
  const desligamentosMes = lista.filter(
    (c) => c.data_desligamento && new Date(c.data_desligamento) >= inicioMes
  ).length;

  // Variação real de headcount no mês (admissões - desligamentos deste mês).
  const deltaHeadcount = admissoesMes - desligamentosMes;

  // Turnover do mês = desligamentos do mês / headcount ativo atual.
  const turnoverMensal = ativos.length > 0 ? (desligamentosMes / ativos.length) * 100 : 0;

  const emExperienciaVencendo = ativos.filter((c) => {
    if (!c.data_fim_experiencia) return false;
    const dias = diasParaFimExperiencia(c.data_fim_experiencia);
    return dias >= 0 && dias <= 15;
  });

  // contratos PJ perto do fim (≤60 dias) — pra lembrar de renovar antes de vencer
  const contratosPJVencendo = pj.filter((c) => {
    if (!c.contrato_fim) return false;
    const dias = diasParaFimExperiencia(c.contrato_fim);
    return dias >= 0 && dias <= 60;
  });

  const aniversariantesMes = lista.filter((c) => {
    if (!c.data_nascimento) return false;
    // não usa new Date(texto).getMonth() — pega o mês direto do texto
    // "yyyy-MM-dd", porque ler um Date construído assim com métodos que
    // dependem do fuso local pode cair no mês anterior.
    const mesNasc = Number(c.data_nascimento.slice(5, 7)) - 1;
    return mesNasc === hoje.getMonth();
  });

  const nomeEmpresaPorId = Object.fromEntries(listaEmpresas.map((e) => [e.id, e.nome]));

  const custoTotalFolha = ativos.reduce((acc, c) => acc + custoMensalColaborador(c), 0);
  const faturamentoTotal = listaEmpresas.reduce(
    (acc, e) => acc + (e.faturamento_mensal || 0),
    0
  );
  const pctFolha = percentualFolhaSobreFaturamento(custoTotalFolha, faturamentoTotal);

  // Absenteísmo médio — média simples dos valores cadastrados por empresa
  // (mesmo campo já usado na tabela "Visão por empresa").
  function mediaCampo(campo: "absenteismo_pct"): number | null {
    const valores = listaEmpresas.map((e) => e[campo]).filter((v): v is number => v != null);
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  }
  const absenteismoMedio = mediaCampo("absenteismo_pct");

  // ------------------------------------------------------------
  // Alertas — férias com período aquisitivo vencendo em até 30 dias
  // ------------------------------------------------------------
  const periodosLista = (periodosAbertos ?? []) as PeriodoAquisitivo[];
  const periodosVencendo = periodosLista.filter((p) => {
    const dias = diasParaVencerFerias(p.limite_concessao);
    return dias >= 0 && dias <= 30;
  });

  // ------------------------------------------------------------
  // Distribuição por cargo — top 6 + "Outros"
  // ------------------------------------------------------------
  const contagemCargo = new Map<string, number>();
  for (const c of ativos) {
    const chave = c.cargo?.trim() || "Sem cargo";
    contagemCargo.set(chave, (contagemCargo.get(chave) ?? 0) + 1);
  }
  const cargosOrdenados = [...contagemCargo.entries()].sort((a, b) => b[1] - a[1]);
  const TOP_CARGOS = 6;
  const dadosCargo =
    cargosOrdenados.length > TOP_CARGOS
      ? [
          ...cargosOrdenados.slice(0, TOP_CARGOS).map(([nome, total]) => ({ nome, total })),
          {
            nome: "Outros",
            total: cargosOrdenados.slice(TOP_CARGOS).reduce((acc, [, total]) => acc + total, 0),
          },
        ]
      : cargosOrdenados.map(([nome, total]) => ({ nome, total }));

  // ------------------------------------------------------------
  // Tempo de empresa — faixas a partir da data de admissão
  // ------------------------------------------------------------
  const faixasTempoEmpresa = [
    { faixa: "< 1 ano", total: 0 },
    { faixa: "1-3 anos", total: 0 },
    { faixa: "3-5 anos", total: 0 },
    { faixa: "> 5 anos", total: 0 },
  ];
  for (const c of ativos) {
    if (!c.data_admissao) continue;
    const anos = differenceInCalendarDays(hoje, new Date(c.data_admissao)) / 365.25;
    if (anos < 1) faixasTempoEmpresa[0].total++;
    else if (anos < 3) faixasTempoEmpresa[1].total++;
    else if (anos < 5) faixasTempoEmpresa[2].total++;
    else faixasTempoEmpresa[3].total++;
  }

  // ------------------------------------------------------------
  // Headcount, custo e turnover por empresa (pra tabela "Visão por empresa")
  // ------------------------------------------------------------
  const empresasDetalhado = listaEmpresas.map((e) => {
    const colaboradoresDaEmpresa = ativos.filter((c) => c.empresa_id === e.id);
    const custo = colaboradoresDaEmpresa.reduce((acc, c) => acc + custoMensalColaborador(c), 0);
    const desligadosEmpresaMes = lista.filter(
      (c) => c.empresa_id === e.id && c.data_desligamento && new Date(c.data_desligamento) >= inicioMes
    ).length;
    const turnoverEmpresa = colaboradoresDaEmpresa.length > 0 ? (desligadosEmpresaMes / colaboradoresDaEmpresa.length) * 100 : 0;
    const custoFaturamentoPct = percentualFolhaSobreFaturamento(custo, e.faturamento_mensal);
    return { empresa: e, headcount: colaboradoresDaEmpresa.length, custo, turnoverEmpresa, custoFaturamentoPct };
  });

  // ------------------------------------------------------------
  // Férias nos próximos 30 dias — com o número do período (1º/2º/3º...)
  // dentro do período aquisitivo, calculado a partir da ordem real das
  // férias já lançadas naquele período.
  // ------------------------------------------------------------
  const feriasProximasLista = (feriasProximas ?? []) as Ferias[];
  const nomeColaboradorPorId = Object.fromEntries(lista.map((c) => [c.id, c.nome]));

  const feriasPorPeriodo = new Map<string, string[]>(); // periodo_aquisitivo_id -> ids em ordem de data_inicio
  for (const f of (feriasDoPeriodo ?? []) as { id: string; periodo_aquisitivo_id: string | null }[]) {
    if (!f.periodo_aquisitivo_id) continue;
    if (!feriasPorPeriodo.has(f.periodo_aquisitivo_id)) feriasPorPeriodo.set(f.periodo_aquisitivo_id, []);
    feriasPorPeriodo.get(f.periodo_aquisitivo_id)!.push(f.id);
  }
  function sequenciaDaFerias(f: Ferias): number | null {
    if (!f.periodo_aquisitivo_id) return null;
    const ids = feriasPorPeriodo.get(f.periodo_aquisitivo_id);
    if (!ids) return null;
    const idx = ids.indexOf(f.id);
    return idx === -1 ? null : idx + 1;
  }

  // ------------------------------------------------------------
  // 🧪 DADOS DE EXEMPLO — o app ainda não guarda esse histórico/módulo.
  // Gerados de forma determinística (não é aleatório a cada F5) só pra
  // mostrar como o dashboard fica quando essas informações existirem de
  // verdade no sistema.
  // ------------------------------------------------------------
  const serieHeadcountExemplo = gerarSerieExemplo(ativos.length, Math.max(1, ativos.length * 0.08), hoje);
  const serieTurnoverExemplo = gerarSerieExemplo(turnoverMensal, 0.8, hoje);
  const serieAbsenteismoExemplo = gerarSerieExemplo(absenteismoMedio ?? 3, 0.6, hoje);

  const deltaTurnoverExemplo = -(Math.round(turnoverMensal * 0.15 * 10) / 10);
  const deltaAbsenteismoExemplo = -(Math.round((absenteismoMedio ?? 3) * 0.08 * 10) / 10);
  const deltaCustoExemploPct = 2.1;

  const pdiEmAndamentoExemplo = Math.max(1, Math.round(ativos.length * 0.18));
  const treinamentosRealizadosExemplo = Math.max(1, Math.round(ativos.length * 0.35));
  const avaliacaoDesempenhoPctExemplo = 80;
  const avaliacoesPendentesExemplo = Math.max(0, Math.round(ativos.length * 0.1));
  const pdisAtrasadosExemplo = Math.max(0, Math.round(pdiEmAndamentoExemplo * 0.2));

  return (
    <div className="rounded-3xl bg-ink-900 p-6 md:p-10 space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: FONTE_TECH }} className="text-[26px] font-bold text-white">
            Dashboard
          </h1>
          <p className="text-slate-400 text-[13px] mt-1">
            Visão geral do RH ·{" "}
            {hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-ink-800 border border-white/10 rounded-lg px-3.5 py-2 text-[11px] text-brand-300">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block" />
          dados atualizados agora
        </div>
      </div>

      <div className="rounded-xl bg-gold-500/10 border border-gold-500/25 px-4 py-2.5 text-xs text-gold-300">
        🧪 Os itens marcados com esse ícone usam <strong>dados de exemplo</strong> — o sistema ainda não guarda
        esse histórico ou não tem esse módulo. O resto do dashboard usa dados reais do seu banco.
      </div>

      {/* KPIs principais */}
      <div className={`grid grid-cols-2 md:grid-cols-3 gap-3.5 ${ocultarFinanceiro ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
        <Indicador
          label="Headcount"
          valor={ativos.length.toString()}
          delta={`${deltaHeadcount >= 0 ? "+" : ""}${deltaHeadcount}`}
          deltaCor={deltaHeadcount >= 0 ? "teal" : "red"}
        />
        <Indicador
          label="Turnover (mês)"
          valor={`${turnoverMensal.toFixed(1)}%`}
          alerta={turnoverMensal > 5}
          delta={`${deltaTurnoverExemplo >= 0 ? "+" : ""}${deltaTurnoverExemplo} pts`}
          deltaCor={deltaTurnoverExemplo <= 0 ? "teal" : "red"}
          deltaSimulado
        />
        <Indicador
          label="Absenteísmo médio"
          valor={absenteismoMedio == null ? "—" : `${absenteismoMedio.toFixed(1)}%`}
          alerta={absenteismoMedio != null && absenteismoMedio > 5}
          delta={absenteismoMedio == null ? undefined : `${deltaAbsenteismoExemplo >= 0 ? "+" : ""}${deltaAbsenteismoExemplo} pts`}
          deltaCor={deltaAbsenteismoExemplo <= 0 ? "teal" : "red"}
          deltaSimulado
        />
        {!ocultarFinanceiro && (
          <Indicador
            label="Custo de pessoal"
            valor={custoTotalFolha.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            delta={`+${deltaCustoExemploPct}%`}
            deltaCor="gold"
            deltaSimulado
            valorMenor
          />
        )}
        <Indicador
          label="Férias próximas"
          valor={feriasProximasLista.length.toString()}
          sublabel="próximos 30 dias"
        />
      </div>

      {processosNoPainel.length > 0 && (
        <div className="card-dark">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px]">
              🧭 Painel de Integração
            </h2>
            <Link href="/onboarding" className="text-sm text-brand-300 hover:text-brand-200">
              Ver painel completo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {statusPainel.map(({ status, total }) => (
              <div key={status}>
                <p className="text-2xl">{STATUS_GERAL_ICONE[status]}</p>
                <p style={{ fontFamily: FONTE_MONO }} className={`text-xl font-bold ${STATUS_GERAL_COR[status]}`}>
                  {total}
                </p>
                <p className="text-xs text-slate-400">{STATUS_GERAL_LABEL[status]}</p>
              </div>
            ))}
            <div>
              <p className="text-2xl">⏰</p>
              <p style={{ fontFamily: FONTE_MONO }} className={`text-xl font-bold ${atrasadasPainel > 0 ? "text-red-400" : "text-white"}`}>
                {atrasadasPainel}
              </p>
              <p className="text-xs text-slate-400">Etapa{atrasadasPainel !== 1 ? "s" : ""} atrasada{atrasadasPainel !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      )}

      {/* Evolução dos indicadores e distribuição por cargo */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-1">
            📈 Evolução dos indicadores <span className="text-xs font-normal text-gold-400">🧪 exemplo</span>
          </h2>
          <EvolucaoIndicadores
            serieHeadcount={serieHeadcountExemplo}
            serieTurnover={serieTurnoverExemplo}
            serieAbsenteismo={serieAbsenteismoExemplo}
            escuro
          />
        </div>
        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-1">
            👔 Distribuição por cargo
          </h2>
          <DonutCargo dados={dadosCargo} escuro />
        </div>
      </div>

      {/* Desenvolvimento, pessoas e alertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            🌱 Desenvolvimento <span className="text-xs font-normal text-gold-400">🧪 exemplo</span>
          </h2>
          <div className="space-y-4">
            <div>
              <p style={{ fontFamily: FONTE_MONO }} className="text-2xl font-bold text-white">{pdiEmAndamentoExemplo}</p>
              <p className="text-xs text-slate-400">PDI em andamento de {ativos.length} colaboradores</p>
            </div>
            <div>
              <p style={{ fontFamily: FONTE_MONO }} className="text-2xl font-bold text-white">{treinamentosRealizadosExemplo}</p>
              <p className="text-xs text-slate-400">Treinamentos realizados no mês</p>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <p className="text-xs text-slate-400">Avaliação de desempenho concluída</p>
                <p style={{ fontFamily: FONTE_MONO }} className="text-sm font-semibold text-slate-200">{avaliacaoDesempenhoPctExemplo}%</p>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-brand-400 rounded-full" style={{ width: `${avaliacaoDesempenhoPctExemplo}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            🧑‍🤝‍🧑 Pessoas
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-400 mb-1">Tipo de vínculo</p>
              <DonutDuas
                labelA="CLT"
                valorA={clt.length}
                labelB="PJ"
                valorB={pj.length}
                labelC="Estágio"
                valorC={estagio.length}
                escuro
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Tempo de empresa</p>
              <BarrasTempoEmpresa dados={faixasTempoEmpresa} escuro />
            </div>
          </div>
        </div>

        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            🔔 Alertas e Pendências
          </h2>
          <ul className="space-y-2.5 text-sm">
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-slate-300 hover:underline">
                Períodos de férias vencendo (≤30 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${periodosVencendo.length > 0 ? "text-red-400" : "text-slate-500"}`}>
                {periodosVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-slate-300 hover:underline">
                Experiências terminando (≤15 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${emExperienciaVencendo.length > 0 ? "text-gold-400" : "text-slate-500"}`}>
                {emExperienciaVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-slate-300 hover:underline">
                Contratos PJ vencendo (≤60 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${contratosPJVencendo.length > 0 ? "text-gold-400" : "text-slate-500"}`}>
                {contratosPJVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/onboarding" className="text-slate-300 hover:underline">
                Etapas de integração atrasadas
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${atrasadasPainel > 0 ? "text-red-400" : "text-slate-500"}`}>
                {atrasadasPainel}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <span className="text-slate-300">Avaliações de desempenho pendentes <span className="text-gold-400">🧪</span></span>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${avaliacoesPendentesExemplo > 0 ? "text-gold-400" : "text-slate-500"}`}>
                {avaliacoesPendentesExemplo}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <span className="text-slate-300">PDIs atrasados <span className="text-gold-400">🧪</span></span>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${pdisAtrasadosExemplo > 0 ? "text-red-400" : "text-slate-500"}`}>
                {pdisAtrasadosExemplo}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Custo × faturamento, experiência e aniversariantes */}
      <div className={`grid grid-cols-1 gap-4 ${ocultarFinanceiro ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {!ocultarFinanceiro && (
          <div className="card-dark">
            <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
              💰 Custo de folha × Faturamento
            </h2>
            {pctFolha === null ? (
              <p className="text-sm text-slate-400">
                Cadastre o faturamento das empresas para ver este indicador.
              </p>
            ) : (
              <div>
                <p
                  style={{ fontFamily: FONTE_MONO }}
                  className={`text-3xl font-semibold ${
                    pctFolha <= LIMITE_SAUDAVEL_FOLHA_PCT ? "text-brand-300" : "text-red-400"
                  }`}
                >
                  {pctFolha.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Meta: até {LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento
                </p>
              </div>
            )}
            <Link href="/projecao-custo" className="text-sm text-brand-300 hover:text-brand-200 mt-3 inline-block">
              Ver detalhamento →
            </Link>
          </div>
        )}

        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            ⚠️ Experiência terminando
          </h2>
          {emExperienciaVencendo.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum caso no momento.</p>
          ) : (
            <ul className="space-y-2">
              {emExperienciaVencendo.map((c) => {
                const dias = diasParaFimExperiencia(c.data_fim_experiencia!);
                return (
                  <li key={c.id} className="flex justify-between text-sm">
                    <Link href={`/colaboradores/${c.id}`} className="text-slate-300 hover:underline truncate">
                      {c.nome}
                    </Link>
                    <span style={{ fontFamily: FONTE_MONO }} className={dias <= 7 ? "text-red-400 font-medium shrink-0" : "text-gold-400 shrink-0"}>
                      {dias} dia{dias !== 1 ? "s" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            🎂 Aniversariantes do mês
          </h2>
          {aniversariantesMes.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum aniversariante este mês.</p>
          ) : (
            <ul className="space-y-2">
              {aniversariantesMes.map((c) => (
                <li key={c.id} className="flex justify-between text-sm text-slate-300 gap-2">
                  <span className="truncate">
                    <Link href={`/colaboradores/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.empresa_id && nomeEmpresaPorId[c.empresa_id] && (
                      <span className="text-slate-500"> · {nomeEmpresaPorId[c.empresa_id]}</span>
                    )}
                  </span>
                  <span style={{ fontFamily: FONTE_MONO }} className="text-slate-400 shrink-0">
                    {formatarDataBR(c.data_nascimento).slice(0, 5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tabela detalhada de empresas */}
      {empresasDetalhado.length > 0 && (
        <div className="card-dark">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
            📋 Visão por empresa
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-4 font-normal">Empresa</th>
                  <th className="py-2 pr-4 font-normal">Headcount</th>
                  <th className="py-2 pr-4 font-normal">Performance</th>
                  <th className="py-2 pr-4 font-normal">Turnover (mês)</th>
                  <th className="py-2 pr-4 font-normal">Absenteísmo</th>
                  {!ocultarFinanceiro && <th className="py-2 pr-4 font-normal">Custo / Faturamento</th>}
                </tr>
              </thead>
              <tbody style={{ fontFamily: FONTE_MONO }}>
                {empresasDetalhado.map(({ empresa: e, headcount, turnoverEmpresa, custoFaturamentoPct }) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td style={{ fontFamily: "'Inter', sans-serif" }} className="py-2 pr-4 font-medium text-slate-100">{e.nome}</td>
                    <td className="py-2 pr-4 text-slate-300">{headcount}</td>
                    <td className="py-2 pr-4 text-slate-300">{e.performance_pct ?? "—"}%</td>
                    <td className="py-2 pr-4 text-slate-300">{turnoverEmpresa.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-slate-300">{e.absenteismo_pct ?? "—"}%</td>
                    {!ocultarFinanceiro && (
                      <td className="py-2 pr-4">
                        {custoFaturamentoPct === null ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span className={custoFaturamentoPct <= LIMITE_SAUDAVEL_FOLHA_PCT ? "text-brand-300" : "text-red-400"}>
                            {custoFaturamentoPct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Férias nos próximos 30 dias */}
      <div className="card-dark">
        <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-white text-[15px] mb-3">
          🏖️ Férias — próximos 30 dias
        </h2>
        {feriasProximasLista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma férias programada pros próximos 30 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-4 font-normal">Colaborador</th>
                  <th className="py-2 pr-4 font-normal">Período</th>
                  <th className="py-2 pr-4 font-normal">Dias</th>
                  <th className="py-2 pr-4 font-normal">Início</th>
                  <th className="py-2 pr-4 font-normal">Fim</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {feriasProximasLista.map((f) => {
                  const seq = sequenciaDaFerias(f);
                  return (
                    <tr key={f.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-medium text-slate-100">
                        <Link href={`/colaboradores/${f.colaborador_id}`} className="hover:underline">
                          {nomeColaboradorPorId[f.colaborador_id] ?? "—"}
                        </Link>
                      </td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-slate-400">{seq ? `${seq}º período` : "—"}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-slate-300">{f.dias}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-slate-300">{formatarDataBR(f.data_inicio)}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-slate-300">{formatarDataBR(f.data_fim)}</td>
                      <td className="py-2 pr-4">
                        <span className={`badge ${FERIAS_STATUS_BADGE[f.status] ?? "bg-white/10 text-slate-300"}`}>
                          {FERIAS_STATUS_LABEL[f.status] ?? f.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Indicador({
  label,
  valor,
  sublabel,
  alerta,
  delta,
  deltaCor,
  deltaSimulado,
  valorMenor,
}: {
  label: string;
  valor: string;
  sublabel?: string;
  alerta?: boolean;
  delta?: string;
  deltaCor?: "teal" | "red" | "gold";
  deltaSimulado?: boolean;
  valorMenor?: boolean;
}) {
  const corDelta =
    deltaCor === "teal" ? "text-brand-300" : deltaCor === "red" ? "text-red-400" : "text-gold-400";
  return (
    <div className="bg-ink-800 border border-white/10 rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p
        style={{ fontFamily: FONTE_MONO }}
        className={`font-bold mt-2 ${valorMenor ? "text-xl" : "text-[26px]"} ${alerta ? "text-red-400" : "text-white"}`}
      >
        {valor}
      </p>
      {delta && (
        <p style={{ fontFamily: FONTE_MONO }} className={`text-[11px] mt-1.5 ${corDelta}`}>
          {delta}
          {deltaSimulado && <span className="text-gold-500/70"> 🧪</span>}
        </p>
      )}
      {sublabel && <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>}
    </div>
  );
}
