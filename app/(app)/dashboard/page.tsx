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
  integracao: "text-ink-800",
  experiencia: "text-blue-700",
  efetivado: "text-emerald-700",
  nao_efetivado: "text-ink-500",
};

const FERIAS_STATUS_BADGE: Record<string, string> = {
  planejada: "bg-blue-100 text-blue-800",
  solicitado: "bg-ink-800/10 text-ink-800",
  aprovado: "bg-emerald-100 text-emerald-800",
  concluido: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-ink-800/5 text-ink-500",
};

const FONTE_TECH = "'Oswald', 'Arial Narrow', sans-serif";
const FONTE_MONO = "'Inter', sans-serif";

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

  // ------------------------------------------------------------
  // Destaques do topo e "Atenção esta semana"
  // ------------------------------------------------------------
  const emExperienciaAtivos = ativos.filter((c) => c.status === "experiencia");
  const experienciaVencem7 = emExperienciaVencendo.filter(
    (c) => diasParaFimExperiencia(c.data_fim_experiencia!) <= 7
  ).length;

  type Aviso = {
    chave: string;
    texto: string;
    href: string;
    etiqueta: string;
    nivel: "urgente" | "atencao" | "info";
    ordem: number;
  };
  const textoDias = (d: number) => (d <= 0 ? "Vence hoje" : `Vence em ${d} dia${d !== 1 ? "s" : ""}`);
  const avisos: Aviso[] = [
    ...(atrasadasPainel > 0
      ? [{
          chave: "integracao-atrasada",
          texto: `${atrasadasPainel} etapa${atrasadasPainel !== 1 ? "s" : ""} de integração`,
          href: "/onboarding",
          etiqueta: "Atrasada",
          nivel: "urgente" as const,
          ordem: -1,
        }]
      : []),
    ...emExperienciaVencendo.map((c) => {
      const d = diasParaFimExperiencia(c.data_fim_experiencia!);
      return {
        chave: `exp-${c.id}`,
        texto: `${c.nome} · fim da experiência`,
        href: `/colaboradores/${c.id}`,
        etiqueta: textoDias(d),
        nivel: (d <= 7 ? "urgente" : "atencao") as "urgente" | "atencao",
        ordem: d,
      };
    }),
    ...contratosPJVencendo.map((c) => {
      const d = diasParaFimExperiencia(c.contrato_fim!);
      return {
        chave: `pj-${c.id}`,
        texto: `${c.nome} · contrato PJ`,
        href: `/colaboradores/${c.id}`,
        etiqueta: textoDias(d),
        nivel: (d <= 15 ? "urgente" : "atencao") as "urgente" | "atencao",
        ordem: d + 100,
      };
    }),
    ...(periodosVencendo.length > 0
      ? [{
          chave: "periodos-ferias",
          texto: "Períodos de férias vencendo",
          href: "/ferias",
          etiqueta: `${periodosVencendo.length} em até 30 dias`,
          nivel: "atencao" as const,
          ordem: 500,
        }]
      : []),
    ...feriasProximasLista.map((f) => ({
      chave: `ferias-${f.id}`,
      texto: `${nomeColaboradorPorId[f.colaborador_id] ?? "—"} · férias`,
      href: `/colaboradores/${f.colaborador_id}`,
      etiqueta: `Férias dia ${formatarDataBR(f.data_inicio).slice(0, 5)}`,
      nivel: "info" as const,
      ordem: 1000 + differenceInCalendarDays(new Date(f.data_inicio), hoje),
    })),
  ]
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, 6);

  const ETIQUETA_AVISO: Record<Aviso["nivel"], string> = {
    urgente: "bg-red-700 text-white",
    atencao: "bg-brand-400 text-ink-900",
    info: "bg-brand-100 text-ink-800",
  };

  const empresasComPct = empresasDetalhado.filter((d) => d.custoFaturamentoPct !== null);

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: FONTE_TECH }} className="text-4xl font-semibold text-ink-900">
            Painel de RH
          </h1>
          <p className="text-ink-600 text-[13px] mt-1">
            Aqui você acompanha a equipe de todas as empresas ·{" "}
            {hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-brand-200/70 rounded-lg px-3.5 py-2 text-[11px] text-brand-600">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block" />
          dados atualizados agora
        </div>
      </div>

      {/* Destaques do topo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-xl bg-brand-400 text-ink-900 p-5">
          <p className="text-sm">Colaboradores</p>
          <p style={{ fontFamily: FONTE_TECH }} className="text-5xl font-semibold leading-tight">
            {ativos.length}
          </p>
          <p className="text-sm">
            CLT {clt.length} · PJ {pj.length}
            {estagio.length > 0 && <> · Estágio {estagio.length}</>}
            {" · "}
            {deltaHeadcount >= 0 ? "+" : ""}
            {deltaHeadcount} no mês
          </p>
        </div>
        <div className="rounded-xl bg-ink-800 text-brand-50 p-5">
          <p className="text-sm">Em experiência</p>
          <p style={{ fontFamily: FONTE_TECH }} className="text-5xl font-semibold leading-tight">
            {emExperienciaAtivos.length}
          </p>
          <p className="text-sm text-brand-400">
            {experienciaVencem7} vence{experienciaVencem7 !== 1 ? "m" : ""} em 7 dias
          </p>
        </div>
        <div className="rounded-xl bg-brand-100 text-ink-900 p-5">
          <p className="text-sm">Aniversariantes</p>
          <p style={{ fontFamily: FONTE_TECH }} className="text-5xl font-semibold leading-tight">
            {aniversariantesMes.length}
          </p>
          <p className="text-sm">neste mês</p>
        </div>
      </div>

      {/* Custo da folha sobre faturamento + atenção esta semana */}
      <div className={`grid grid-cols-1 gap-4 ${ocultarFinanceiro ? "" : "md:grid-cols-2"}`}>
        {!ocultarFinanceiro && (
          <div className="card">
            <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
              Custo da folha sobre faturamento
            </h2>
            {empresasComPct.length === 0 ? (
              <p className="text-sm text-ink-600">
                Cadastre o faturamento das empresas para ver este indicador.
              </p>
            ) : (
              <div className="space-y-3">
                {empresasComPct.map(({ empresa: e, custoFaturamentoPct }) => {
                  const pct = custoFaturamentoPct as number;
                  const saudavel = pct <= LIMITE_SAUDAVEL_FOLHA_PCT;
                  return (
                    <div key={e.id}>
                      <div className="flex justify-between text-sm">
                        <span className="text-ink-800">{e.nome}</span>
                        <span className={`font-medium ${saudavel ? "text-emerald-700" : "text-red-700"}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-brand-100 overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${saudavel ? "bg-emerald-700" : "bg-red-700"}`}
                          style={{ width: `${Math.min(100, pct * 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between items-center mt-4 text-xs text-ink-600">
              <span>Meta: até {LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento</span>
              <Link href="/projecao-custo" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
                Ver detalhamento →
              </Link>
            </div>
          </div>
        )}

        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Atenção esta semana
          </h2>
          {avisos.length === 0 ? (
            <p className="text-sm text-ink-600">Nada pedindo atenção agora.</p>
          ) : (
            <ul>
              {avisos.map((a, idx) => (
                <li
                  key={a.chave}
                  className={`flex justify-between items-center gap-3 py-2 text-sm ${
                    idx < avisos.length - 1 ? "border-b border-brand-200/70" : ""
                  }`}
                >
                  <Link href={a.href} className="text-ink-800 hover:underline truncate">
                    {a.texto}
                  </Link>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${ETIQUETA_AVISO[a.nivel]}`}>
                    {a.etiqueta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-brand-100 border border-brand-300 px-4 py-2.5 text-xs text-ink-800">
        🧪 Os itens marcados com esse ícone usam <strong>dados de exemplo</strong> — o sistema ainda não guarda
        esse histórico ou não tem esse módulo. O resto do dashboard usa dados reais do seu banco.
      </div>

      {/* KPIs principais */}
      <div className={`grid grid-cols-2 gap-3.5 ${ocultarFinanceiro ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
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
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg">
              Painel de Integração
            </h2>
            <Link href="/onboarding" className="text-sm text-brand-600 hover:text-brand-700">
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
                <p className="text-xs text-ink-600">{STATUS_GERAL_LABEL[status]}</p>
              </div>
            ))}
            <div>
              <p className="text-2xl">⏰</p>
              <p style={{ fontFamily: FONTE_MONO }} className={`text-xl font-bold ${atrasadasPainel > 0 ? "text-red-600" : "text-ink-900"}`}>
                {atrasadasPainel}
              </p>
              <p className="text-xs text-ink-600">Etapa{atrasadasPainel !== 1 ? "s" : ""} atrasada{atrasadasPainel !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      )}

      {/* Evolução dos indicadores e distribuição por cargo */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-1">
            Evolução dos indicadores <span className="text-xs font-normal text-brand-600">🧪 exemplo</span>
          </h2>
          <EvolucaoIndicadores
            serieHeadcount={serieHeadcountExemplo}
            serieTurnover={serieTurnoverExemplo}
            serieAbsenteismo={serieAbsenteismoExemplo}
          />
        </div>
        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-1">
            Distribuição por cargo
          </h2>
          <DonutCargo dados={dadosCargo} />
        </div>
      </div>

      {/* Desenvolvimento, pessoas e alertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Desenvolvimento <span className="text-xs font-normal text-brand-600">🧪 exemplo</span>
          </h2>
          <div className="space-y-4">
            <div>
              <p style={{ fontFamily: FONTE_MONO }} className="text-2xl font-bold text-ink-900">{pdiEmAndamentoExemplo}</p>
              <p className="text-xs text-ink-600">PDI em andamento de {ativos.length} colaboradores</p>
            </div>
            <div>
              <p style={{ fontFamily: FONTE_MONO }} className="text-2xl font-bold text-ink-900">{treinamentosRealizadosExemplo}</p>
              <p className="text-xs text-ink-600">Treinamentos realizados no mês</p>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <p className="text-xs text-ink-600">Avaliação de desempenho concluída</p>
                <p style={{ fontFamily: FONTE_MONO }} className="text-sm font-semibold text-ink-800">{avaliacaoDesempenhoPctExemplo}%</p>
              </div>
              <div className="h-1.5 rounded-full bg-ink-800/10 overflow-hidden">
                <div className="h-full bg-brand-400 rounded-full" style={{ width: `${avaliacaoDesempenhoPctExemplo}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Pessoas
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-ink-600 mb-1">Tipo de vínculo</p>
              <DonutDuas
                labelA="CLT"
                valorA={clt.length}
                labelB="PJ"
                valorB={pj.length}
                labelC="Estágio"
                valorC={estagio.length}
              />
            </div>
            <div>
              <p className="text-xs text-ink-600 mb-1">Tempo de empresa</p>
              <BarrasTempoEmpresa dados={faixasTempoEmpresa} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Alertas e Pendências
          </h2>
          <ul className="space-y-2.5 text-sm">
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-ink-800 hover:underline">
                Períodos de férias vencendo (≤30 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${periodosVencendo.length > 0 ? "text-red-600" : "text-ink-500"}`}>
                {periodosVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-ink-800 hover:underline">
                Experiências terminando (≤15 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${emExperienciaVencendo.length > 0 ? "text-brand-600" : "text-ink-500"}`}>
                {emExperienciaVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/colaboradores" className="text-ink-800 hover:underline">
                Contratos PJ vencendo (≤60 dias)
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${contratosPJVencendo.length > 0 ? "text-brand-600" : "text-ink-500"}`}>
                {contratosPJVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <Link href="/onboarding" className="text-ink-800 hover:underline">
                Etapas de integração atrasadas
              </Link>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${atrasadasPainel > 0 ? "text-red-600" : "text-ink-500"}`}>
                {atrasadasPainel}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <span className="text-ink-800">Avaliações de desempenho pendentes <span className="text-brand-600">🧪</span></span>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${avaliacoesPendentesExemplo > 0 ? "text-brand-600" : "text-ink-500"}`}>
                {avaliacoesPendentesExemplo}
              </span>
            </li>
            <li className="flex justify-between items-center gap-2">
              <span className="text-ink-800">PDIs atrasados <span className="text-brand-600">🧪</span></span>
              <span style={{ fontFamily: FONTE_MONO }} className={`font-semibold shrink-0 ${pdisAtrasadosExemplo > 0 ? "text-red-600" : "text-ink-500"}`}>
                {pdisAtrasadosExemplo}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Experiência terminando e aniversariantes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Experiência terminando
          </h2>
          {emExperienciaVencendo.length === 0 ? (
            <p className="text-sm text-ink-600">Nenhum caso no momento.</p>
          ) : (
            <ul className="space-y-2">
              {emExperienciaVencendo.map((c) => {
                const dias = diasParaFimExperiencia(c.data_fim_experiencia!);
                return (
                  <li key={c.id} className="flex justify-between text-sm">
                    <Link href={`/colaboradores/${c.id}`} className="text-ink-800 hover:underline truncate">
                      {c.nome}
                    </Link>
                    <span style={{ fontFamily: FONTE_MONO }} className={dias <= 7 ? "text-red-600 font-medium shrink-0" : "text-brand-600 shrink-0"}>
                      {dias} dia{dias !== 1 ? "s" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Aniversariantes do mês
          </h2>
          {aniversariantesMes.length === 0 ? (
            <p className="text-sm text-ink-600">Nenhum aniversariante este mês.</p>
          ) : (
            <ul className="space-y-2">
              {aniversariantesMes.map((c) => (
                <li key={c.id} className="flex justify-between text-sm text-ink-800 gap-2">
                  <span className="truncate">
                    <Link href={`/colaboradores/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.empresa_id && nomeEmpresaPorId[c.empresa_id] && (
                      <span className="text-ink-500"> · {nomeEmpresaPorId[c.empresa_id]}</span>
                    )}
                  </span>
                  <span style={{ fontFamily: FONTE_MONO }} className="text-ink-600 shrink-0">
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
        <div className="card">
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
            Visão por empresa
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-600 border-b border-ink-800/10">
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
                  <tr key={e.id} className="border-b border-ink-800/5 hover:bg-brand-50 transition-colors">
                    <td style={{ fontFamily: "'Inter', sans-serif" }} className="py-2 pr-4 font-medium text-ink-900">{e.nome}</td>
                    <td className="py-2 pr-4 text-ink-800">{headcount}</td>
                    <td className="py-2 pr-4 text-ink-800">{e.performance_pct ?? "—"}%</td>
                    <td className="py-2 pr-4 text-ink-800">{turnoverEmpresa.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-ink-800">{e.absenteismo_pct ?? "—"}%</td>
                    {!ocultarFinanceiro && (
                      <td className="py-2 pr-4">
                        {custoFaturamentoPct === null ? (
                          <span className="text-ink-500">—</span>
                        ) : (
                          <span className={custoFaturamentoPct <= LIMITE_SAUDAVEL_FOLHA_PCT ? "text-emerald-700" : "text-red-600"}>
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
      <div className="card">
        <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-3">
          Férias — próximos 30 dias
        </h2>
        {feriasProximasLista.length === 0 ? (
          <p className="text-sm text-ink-600">Nenhuma férias programada pros próximos 30 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-600 border-b border-ink-800/10">
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
                    <tr key={f.id} className="border-b border-ink-800/5 hover:bg-brand-50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-ink-900">
                        <Link href={`/colaboradores/${f.colaborador_id}`} className="hover:underline">
                          {nomeColaboradorPorId[f.colaborador_id] ?? "—"}
                        </Link>
                      </td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-ink-600">{seq ? `${seq}º período` : "—"}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-ink-800">{f.dias}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-ink-800">{formatarDataBR(f.data_inicio)}</td>
                      <td style={{ fontFamily: FONTE_MONO }} className="py-2 pr-4 text-ink-800">{formatarDataBR(f.data_fim)}</td>
                      <td className="py-2 pr-4">
                        <span className={`badge ${FERIAS_STATUS_BADGE[f.status] ?? "bg-ink-800/10 text-ink-800"}`}>
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
    deltaCor === "teal" ? "text-emerald-700" : deltaCor === "red" ? "text-red-600" : "text-brand-600";
  return (
    <div className="bg-white border border-brand-200/70 rounded-2xl p-4 shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-ink-600">{label}</p>
      <p
        style={{ fontFamily: FONTE_TECH }}
        className={`font-semibold mt-2 ${valorMenor ? "text-2xl" : "text-[32px]"} ${alerta ? "text-red-600" : "text-ink-900"}`}
      >
        {valor}
      </p>
      {delta && (
        <p style={{ fontFamily: FONTE_MONO }} className={`text-[11px] mt-1.5 ${corDelta}`}>
          {delta}
          {deltaSimulado && <span className="text-brand-500"> 🧪</span>}
        </p>
      )}
      {sublabel && <p className="text-[11px] text-ink-500 mt-0.5">{sublabel}</p>}
    </div>
  );
}
