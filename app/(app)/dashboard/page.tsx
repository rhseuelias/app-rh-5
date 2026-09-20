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
} from "@/lib/calculos";
import { differenceInCalendarDays, addDays } from "date-fns";
import Link from "next/link";
import {
  DonutCargo,
  DonutDuas,
  BarrasIndicadoresEmpresa,
  BarrasTempoEmpresa,
} from "@/components/dashboard/DashboardCharts";

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

const STATUS_GERAL_COR: Record<string, string> = {
  integracao: "text-slate-700",
  experiencia: "text-blue-600",
  efetivado: "text-emerald-600",
  nao_efetivado: "text-slate-500",
};

const FERIAS_STATUS_BADGE: Record<string, string> = {
  planejada: "bg-blue-100 text-blue-700",
  solicitado: "bg-slate-100 text-slate-600",
  aprovado: "bg-emerald-100 text-emerald-700",
  concluido: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-slate-100 text-slate-400",
};

export default async function DashboardPage() {
  const supabase = createClient();

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

  const desligamentosMes = lista.filter(
    (c) => c.data_desligamento && new Date(c.data_desligamento) >= inicioMes
  ).length;

  // Turnover do mês = desligamentos do mês / headcount ativo atual.
  const turnoverMensal = ativos.length > 0 ? (desligamentosMes / ativos.length) * 100 : 0;

  const emExperienciaVencendo = ativos.filter((c) => {
    if (!c.data_fim_experiencia) return false;
    const dias = diasParaFimExperiencia(c.data_fim_experiencia);
    return dias >= 0 && dias <= 15;
  });

  const aniversariantesMes = lista.filter((c) => {
    if (!c.data_nascimento) return false;
    const nasc = new Date(c.data_nascimento);
    return nasc.getMonth() === hoje.getMonth();
  });

  const nomeEmpresaPorId = Object.fromEntries(listaEmpresas.map((e) => [e.id, e.nome]));

  const custoTotalFolha = ativos.reduce((acc, c) => acc + custoMensalColaborador(c), 0);
  const faturamentoTotal = listaEmpresas.reduce(
    (acc, e) => acc + (e.faturamento_mensal || 0),
    0
  );
  const pctFolha = percentualFolhaSobreFaturamento(custoTotalFolha, faturamentoTotal);

  // Absenteísmo/Performance médios — média simples dos valores cadastrados
  // por empresa (mesmos campos já usados na tabela "Indicadores por empresa").
  function mediaCampo(campo: "absenteismo_pct" | "performance_pct"): number | null {
    const valores = listaEmpresas.map((e) => e[campo]).filter((v): v is number => v != null);
    if (valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  }
  const absenteismoMedio = mediaCampo("absenteismo_pct");
  const performanceMedia = mediaCampo("performance_pct");

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
  // Indicadores + headcount + custo por empresa (pro gráfico e a tabela)
  // ------------------------------------------------------------
  const dadosIndicadoresEmpresa = listaEmpresas.map((e) => ({
    empresa: e.nome,
    performance: e.performance_pct ?? 0,
    absenteismo: e.absenteismo_pct ?? 0,
    treinamento: e.treinamento_pct ?? 0,
    clima: e.clima_pct ?? 0,
  }));

  const empresasDetalhado = listaEmpresas.map((e) => {
    const colaboradoresDaEmpresa = ativos.filter((c) => c.empresa_id === e.id);
    const custo = colaboradoresDaEmpresa.reduce((acc, c) => acc + custoMensalColaborador(c), 0);
    return { empresa: e, headcount: colaboradoresDaEmpresa.length, custo };
  });

  // ------------------------------------------------------------
  // Férias nos próximos 30 dias
  // ------------------------------------------------------------
  const feriasProximasLista = (feriasProximas ?? []) as Ferias[];
  const nomeColaboradorPorId = Object.fromEntries(lista.map((c) => [c.id, c.nome]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Visão geral do RH ·{" "}
          {hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Indicador icon="👥" label="Headcount" valor={ativos.length.toString()} />
        <Indicador
          icon="🔄"
          label="Turnover (mês)"
          valor={`${turnoverMensal.toFixed(1)}%`}
          alerta={turnoverMensal > 5}
        />
        <Indicador
          icon="📆"
          label="Absenteísmo médio"
          valor={absenteismoMedio == null ? "—" : `${absenteismoMedio.toFixed(1)}%`}
          alerta={absenteismoMedio != null && absenteismoMedio > 5}
        />
        <Indicador
          icon="💰"
          label="Custo de pessoal"
          valor={custoTotalFolha.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
        />
        <Indicador
          icon="🎯"
          label="Performance média"
          valor={performanceMedia == null ? "—" : `${performanceMedia.toFixed(0)}%`}
        />
        <Indicador
          icon="🏖️"
          label="Férias próximas"
          valor={feriasProximasLista.length.toString()}
          sublabel="próximos 30 dias"
        />
      </div>

      {processosNoPainel.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-display font-semibold text-slate-900">🧭 Painel de Integração</h2>
            <Link href="/onboarding" className="text-sm text-brand-600">
              Ver painel completo →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {statusPainel.map(({ status, total }) => (
              <div key={status}>
                <p className="text-2xl">{STATUS_GERAL_ICONE[status]}</p>
                <p className={`text-xl font-display font-bold ${STATUS_GERAL_COR[status]}`}>{total}</p>
                <p className="text-xs text-slate-500">{STATUS_GERAL_LABEL[status]}</p>
              </div>
            ))}
            <div>
              <p className="text-2xl">⏰</p>
              <p className={`text-xl font-display font-bold ${atrasadasPainel > 0 ? "text-red-600" : "text-slate-900"}`}>
                {atrasadasPainel}
              </p>
              <p className="text-xs text-slate-500">Etapa{atrasadasPainel !== 1 ? "s" : ""} atrasada{atrasadasPainel !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      )}

      {/* Alertas, custo × faturamento, experiência e aniversariantes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card card-hover">
          <h2 className="font-display font-semibold text-slate-900 mb-3">🔔 Alertas e Pendências</h2>
          <ul className="space-y-2.5 text-sm">
            <li className="flex justify-between items-center">
              <Link href="/colaboradores" className="text-slate-600 hover:underline">
                Períodos de férias vencendo (≤30 dias)
              </Link>
              <span className={`font-semibold ${periodosVencendo.length > 0 ? "text-red-600" : "text-slate-400"}`}>
                {periodosVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center">
              <Link href="/colaboradores" className="text-slate-600 hover:underline">
                Experiências terminando (≤15 dias)
              </Link>
              <span className={`font-semibold ${emExperienciaVencendo.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {emExperienciaVencendo.length}
              </span>
            </li>
            <li className="flex justify-between items-center">
              <Link href="/onboarding" className="text-slate-600 hover:underline">
                Etapas de integração atrasadas
              </Link>
              <span className={`font-semibold ${atrasadasPainel > 0 ? "text-red-600" : "text-slate-400"}`}>
                {atrasadasPainel}
              </span>
            </li>
          </ul>
        </div>

        <div className="card card-hover">
          <h2 className="font-display font-semibold text-slate-900 mb-3">
            💰 Custo de folha × Faturamento
          </h2>
          {pctFolha === null ? (
            <p className="text-sm text-slate-500">
              Cadastre o faturamento das empresas para ver este indicador.
            </p>
          ) : (
            <div>
              <p
                className={`text-3xl font-semibold ${
                  pctFolha <= LIMITE_SAUDAVEL_FOLHA_PCT ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {pctFolha.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Meta: até {LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento
              </p>
            </div>
          )}
          <Link href="/projecao-custo" className="text-sm text-brand-600 mt-3 inline-block">
            Ver detalhamento →
          </Link>
        </div>

        <div className="card card-hover">
          <h2 className="font-display font-semibold text-slate-900 mb-3">
            ⚠️ Experiência terminando
          </h2>
          {emExperienciaVencendo.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum caso no momento.</p>
          ) : (
            <ul className="space-y-2">
              {emExperienciaVencendo.map((c) => {
                const dias = diasParaFimExperiencia(c.data_fim_experiencia!);
                return (
                  <li key={c.id} className="flex justify-between text-sm">
                    <Link href={`/colaboradores/${c.id}`} className="text-slate-700 hover:underline truncate">
                      {c.nome}
                    </Link>
                    <span className={dias <= 7 ? "text-red-600 font-medium shrink-0" : "text-amber-600 shrink-0"}>
                      {dias} dia{dias !== 1 ? "s" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card card-hover">
          <h2 className="font-display font-semibold text-slate-900 mb-3">🎂 Aniversariantes do mês</h2>
          {aniversariantesMes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum aniversariante este mês.</p>
          ) : (
            <ul className="space-y-2">
              {aniversariantesMes.map((c) => (
                <li key={c.id} className="flex justify-between text-sm text-slate-700 gap-2">
                  <span className="truncate">
                    <Link href={`/colaboradores/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.empresa_id && nomeEmpresaPorId[c.empresa_id] && (
                      <span className="text-slate-400"> · {nomeEmpresaPorId[c.empresa_id]}</span>
                    )}
                  </span>
                  <span className="text-slate-500 shrink-0">
                    {new Date(c.data_nascimento!).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Gráficos de composição do quadro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="card">
          <h2 className="font-display font-semibold text-slate-900 mb-1">👔 Distribuição por cargo</h2>
          <DonutCargo dados={dadosCargo} />
        </div>
        <div className="card">
          <h2 className="font-display font-semibold text-slate-900 mb-1">🧾 Tipo de vínculo</h2>
          <DonutDuas labelA="CLT" valorA={clt.length} labelB="PJ" valorB={pj.length} />
        </div>
        <div className="card">
          <h2 className="font-display font-semibold text-slate-900 mb-1">⏳ Tempo de empresa</h2>
          <BarrasTempoEmpresa dados={faixasTempoEmpresa} />
        </div>
      </div>

      {/* Indicadores por empresa */}
      {listaEmpresas.length > 0 && (
        <div className="card">
          <h2 className="font-display font-semibold text-slate-900 mb-3">📊 Indicadores por empresa</h2>
          <BarrasIndicadoresEmpresa dados={dadosIndicadoresEmpresa} />
        </div>
      )}

      {/* Tabela detalhada de empresas */}
      {empresasDetalhado.length > 0 && (
        <div className="card">
          <h2 className="font-display font-semibold text-slate-900 mb-3">🏢 Empresas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Headcount</th>
                  <th className="py-2 pr-4">Custo mensal</th>
                  <th className="py-2 pr-4">Absenteísmo</th>
                  <th className="py-2 pr-4">Performance</th>
                  <th className="py-2 pr-4">Treinamento</th>
                  <th className="py-2 pr-4">Clima</th>
                </tr>
              </thead>
              <tbody>
                {empresasDetalhado.map(({ empresa: e, headcount, custo }) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{e.nome}</td>
                    <td className="py-2 pr-4">{headcount}</td>
                    <td className="py-2 pr-4">
                      {custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 pr-4">{e.absenteismo_pct ?? "—"}%</td>
                    <td className="py-2 pr-4">{e.performance_pct ?? "—"}%</td>
                    <td className="py-2 pr-4">{e.treinamento_pct ?? "—"}%</td>
                    <td className={`py-2 pr-4 ${
                      e.clima_pct != null && e.clima_pct < 80 ? "text-red-600" : "text-emerald-600"
                    }`}>
                      {e.clima_pct ?? "—"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Férias nos próximos 30 dias */}
      <div className="card">
        <h2 className="font-display font-semibold text-slate-900 mb-3">🏖️ Férias — próximos 30 dias</h2>
        {feriasProximasLista.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma férias programada pros próximos 30 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">Início</th>
                  <th className="py-2 pr-4">Fim</th>
                  <th className="py-2 pr-4">Dias</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {feriasProximasLista.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      <Link href={`/colaboradores/${f.colaborador_id}`} className="hover:underline">
                        {nomeColaboradorPorId[f.colaborador_id] ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{new Date(f.data_inicio).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2 pr-4">{new Date(f.data_fim).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2 pr-4">{f.dias}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${FERIAS_STATUS_BADGE[f.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {FERIAS_STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Indicador({
  icon,
  label,
  valor,
  sublabel,
  alerta,
}: {
  icon: string;
  label: string;
  valor: string;
  sublabel?: string;
  alerta?: boolean;
}) {
  return (
    <div className="card card-hover">
      <div className="icon-chip mb-3">{icon}</div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-display font-bold mt-1 ${alerta ? "text-red-600" : "text-slate-900"}`}>
        {valor}
      </p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}
