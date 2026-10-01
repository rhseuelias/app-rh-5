import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  EtapaProcesso,
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
  formatarDataBR,
} from "@/lib/calculos";
import { differenceInCalendarDays, subMonths } from "date-fns";
import Link from "next/link";
import {
  DonutCargo,
  DonutDuas,
  BarrasTempoEmpresa,
  EvolucaoIndicadores,
} from "@/components/dashboard/DashboardCharts";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";
import ComposicaoEquipe, { type CartaoEmpresa, type TemaCartao } from "@/components/dashboard/ComposicaoEquipe";
import TimelineResumo from "@/components/dashboard/TimelineResumo";

export const dynamic = "force-dynamic";

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

  const [
    { data: colaboradores },
    { data: empresas },
    { data: processos },
    { data: etapasProcesso },
    { data: configIntegracao },
    { data: periodosAbertos },
    { data: franquias },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*"),
    supabase.from("empresas").select("*"),
    supabase.from("processos_integracao").select("*"),
    supabase.from("etapas_processo").select("*"),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    // franquias da BSE (cadastro simples de quantidades de CLT e PJ). Se a tabela
    // ainda não existir, a consulta volta vazia e o painel mostra zero.
    supabase.from("franquias_bse").select("*"),
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

  const atrasadasPainel = processosNoPainel.filter((p) =>
    (etapasPorProcesso.get(p.id) ?? []).some((e) => etapaAtrasada(e.prazo, e.status))
  ).length;

  const ativos = lista.filter((c) => c.status === "ativo" || c.status === "experiencia");
  const clt = ativos.filter((c) => c.tipo === "CLT");
  const pj = ativos.filter((c) => c.tipo === "PJ");
  const estagio = ativos.filter((c) => c.tipo === "Estagio");

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
  // 🧪 DADOS DE EXEMPLO — o app ainda não guarda esse histórico/módulo.
  // Gerados de forma determinística (não é aleatório a cada F5) só pra
  // mostrar como o dashboard fica quando essas informações existirem de
  // verdade no sistema.
  // ------------------------------------------------------------
  const serieHeadcountExemplo = gerarSerieExemplo(ativos.length, Math.max(1, ativos.length * 0.08), hoje);
  const serieTurnoverExemplo = gerarSerieExemplo(turnoverMensal, 0.8, hoje);
  const serieAbsenteismoExemplo = gerarSerieExemplo(absenteismoMedio ?? 3, 0.6, hoje);

  const pdiEmAndamentoExemplo = Math.max(1, Math.round(ativos.length * 0.18));
  const avaliacoesPendentesExemplo = Math.max(0, Math.round(ativos.length * 0.1));
  const pdisAtrasadosExemplo = Math.max(0, Math.round(pdiEmAndamentoExemplo * 0.2));

  // ------------------------------------------------------------
  // Topo: colaboradores por empresa (valores reais do cadastro) e franquias
  // ------------------------------------------------------------
  const listaFranquias = (franquias ?? []) as { id: string; nome: string; qtd_clt: number; qtd_pj: number }[];
  const franqClt = listaFranquias.reduce((a, f) => a + (f.qtd_clt || 0), 0);
  const franqPj = listaFranquias.reduce((a, f) => a + (f.qtd_pj || 0), 0);
  const franqTotal = franqClt + franqPj;

  const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const contar = (arr: Colaborador[]) => ({
    total: arr.length,
    clt: arr.filter((c) => c.tipo === "CLT").length,
    pj: arr.filter((c) => c.tipo === "PJ").length,
    estagio: arr.filter((c) => c.tipo === "Estagio").length,
  });

  const empresaBSE = listaEmpresas.find((e) => normalizar(e.nome).startsWith("bse"));
  const outrasEmpresas = listaEmpresas
    .filter((e) => e !== empresaBSE)
    .map((e) => ({ empresa: e, ...contar(ativos.filter((c) => c.empresa_id === e.id)) }))
    .sort((a, b) => b.total - a.total);
  const semEmpresa = ativos.filter((c) => !c.empresa_id || !listaEmpresas.some((e) => e.id === c.empresa_id));

  const TEMAS: TemaCartao[] = ["pessego", "creme", "grafite", "branco", "pedra"];
  const cartoesBase: Omit<CartaoEmpresa, "tema">[] = [];
  if (empresaBSE) {
    const bse = contar(ativos.filter((c) => c.empresa_id === empresaBSE.id));
    cartoesBase.push({ chave: "bse-propria", nome: `${empresaBSE.nome} Própria`, ...bse });
    cartoesBase.push({
      chave: "bse-franquias",
      nome: `${empresaBSE.nome} Franquias`,
      total: franqTotal,
      clt: franqClt,
      pj: franqPj,
      estagio: 0,
      nota: listaFranquias.length === 0 ? "Nenhuma franquia cadastrada" : undefined,
      link: {
        href: "/projecao-custo#franquias",
        texto: listaFranquias.length === 0 ? "Cadastrar franquias →" : "Editar franquias →",
      },
    });
  }
  for (const o of outrasEmpresas) {
    cartoesBase.push({ chave: o.empresa.id, nome: o.empresa.nome, total: o.total, clt: o.clt, pj: o.pj, estagio: o.estagio });
  }
  if (semEmpresa.length > 0) {
    cartoesBase.push({ chave: "sem-empresa", nome: "Sem empresa", ...contar(semEmpresa) });
  }
  const cartoesEmpresa: CartaoEmpresa[] = cartoesBase.map((c, i) => ({ ...c, tema: TEMAS[Math.min(i, TEMAS.length - 1)] }));

  const totalGeral = ativos.length + franqTotal;

  const empresasComPct = empresasDetalhado.filter((d) => d.custoFaturamentoPct !== null);

  return (
    <div className="space-y-6">
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

      {/* Topo: total, composição CLT x PJ, empresas e gráficos */}
      <ComposicaoEquipe
        total={totalGeral}
        clt={clt.length + franqClt}
        pj={pj.length + franqPj}
        estagio={estagio.length}
        noSistema={ativos.length}
        emFranquias={franqTotal}
        cartoes={cartoesEmpresa}
        fonteDisplay={FONTE_TECH}
      />

      {/* O que precisa de atenção */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <li key={c.id} className="flex justify-between gap-2 text-sm">
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

      {/* Painel de Integração */}
      <TimelineResumo
        processos={todosProcessos}
        etapas={todasEtapas}
        colaboradores={lista}
        empresas={listaEmpresas}
        fonteDisplay={FONTE_TECH}
      />

      {/* Custo da folha e visão por empresa */}
      <div className={`grid grid-cols-1 gap-4 ${ocultarFinanceiro ? "" : "lg:grid-cols-[1fr_1.3fr]"}`}>
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
      </div>

      {/* Pessoas, distribuição por cargo e evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.4fr] gap-4">
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
          <h2 style={{ fontFamily: FONTE_TECH }} className="font-semibold text-ink-900 text-lg mb-1">
            Distribuição por cargo
          </h2>
          <DonutCargo dados={dadosCargo} />
        </div>

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
      </div>

      <p className="text-xs text-ink-600">
        🧪 Os itens marcados com esse ícone usam dados de exemplo — o sistema ainda não guarda esse histórico
        ou não tem esse módulo. O resto do painel usa dados reais do seu banco.
      </p>
    </div>
  );
}

