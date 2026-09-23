import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type {
  BeneficioCompetencia,
  BeneficioExtra,
  BeneficioTipoTransporte,
  BeneficioTransporte,
  Colaborador,
  Empresa,
  Unidade,
} from "@/types/db";
import { formatarReais } from "@/lib/formatadores";
import {
  TIPOS_COM_CARTAO,
  classeTipoTransporte,
  colaboradorElegivel,
  competenciaAtual,
  rotuloCompetencia,
  totalExtras,
  totalTransportePorTipo,
} from "@/lib/beneficios-calculos";
import TiposTransporteCadastro from "@/components/beneficios/TiposTransporteCadastro";
import CompetenciaAcoes from "@/components/beneficios/CompetenciaAcoes";
import PainelTipoCaju, { type LinhaCaju } from "@/components/beneficios/PainelTipoCaju";
import PainelTipoOutro, { type LinhaOutro } from "@/components/beneficios/PainelTipoOutro";

export const dynamic = "force-dynamic";

const CLASSE_COR: Record<string, string> = {
  caju: "bg-blue-50 text-blue-700",
  semparar: "bg-amber-50 text-amber-700",
  bhbus: "bg-violet-50 text-violet-700",
  otimo: "bg-emerald-50 text-emerald-700",
  extra: "bg-pink-50 text-pink-700",
};

const BADGE_COR: Record<string, string> = {
  caju: "bg-blue-100 text-blue-700",
  semparar: "bg-amber-100 text-amber-700",
  bhbus: "bg-violet-100 text-violet-700",
  otimo: "bg-emerald-100 text-emerald-700",
  extra: "bg-pink-100 text-pink-700",
};

export default async function BeneficiosPage({
  searchParams,
}: {
  searchParams: { empresa?: string; unidade?: string; competencia?: string; tab?: string };
}) {
  const supabase = createClient();

  const [{ data: empresasData }, { data: unidadesData }, { data: colaboradoresData }, { data: competenciasData }] =
    await Promise.all([
      supabase.from("empresas").select("*"),
      supabase.from("unidades").select("*"),
      supabase.from("colaboradores").select("*"),
      supabase.from("beneficios_competencias").select("*").order("competencia", { ascending: false }),
    ]);

  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const todosColaboradores = ((colaboradoresData ?? []) as Colaborador[]).filter(colaboradorElegivel);
  const competencias = (competenciasData ?? []) as BeneficioCompetencia[];

  if (empresas.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Departamento Pessoal · Controle de Benefícios</h1>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">
            Ainda não há nenhuma empresa cadastrada. Cadastre a empresa primeiro em{" "}
            <Link href="/projecao-custo" className="text-brand-600 hover:underline">Projeção de Custo</Link>.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Filtros (Empresa / Unidade / Competência)
  // ------------------------------------------------------------
  const empresaId = searchParams.empresa && empresas.some((e) => e.id === searchParams.empresa)
    ? searchParams.empresa
    : empresas[0].id;
  const empresaAtual = empresas.find((e) => e.id === empresaId)!;
  const unidadesDaEmpresa = unidades.filter((u) => u.empresa_id === empresaId);
  const unidadeId = unidadesDaEmpresa.length > 0
    ? (searchParams.unidade && unidadesDaEmpresa.some((u) => u.id === searchParams.unidade)
        ? searchParams.unidade
        : unidadesDaEmpresa[0].id)
    : null;
  const unidadeAtual = unidadeId ? unidadesDaEmpresa.find((u) => u.id === unidadeId) : null;

  const competencia = searchParams.competencia || competenciaAtual();
  const competenciaRow = competencias.find((c) => c.competencia === competencia);
  const mesFechado = competenciaRow?.fechado ?? false;

  const opcoesCompetencia = Array.from(
    new Set([competenciaAtual(), competencia, ...competencias.map((c) => c.competencia)])
  ).sort((a, b) => (a < b ? 1 : -1));

  // colaboradores elegíveis (CLT/Estagiário, ativos/experiência) desta empresa — todas as unidades,
  // pra dar pra montar tanto a tela filtrada quanto os totais por unidade
  const colaboradoresDaEmpresa = todosColaboradores.filter((c) => c.empresa_id === empresaId);
  const linhas = unidadeId
    ? colaboradoresDaEmpresa.filter((c) => c.unidade_id === unidadeId)
    : colaboradoresDaEmpresa;

  const { data: tiposData } = await supabase
    .from("beneficios_tipos_transporte")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("created_at");
  const tiposDaEmpresa = (tiposData ?? []) as BeneficioTipoTransporte[];

  let transporteRows: BeneficioTransporte[] = [];
  let extrasRows: BeneficioExtra[] = [];
  const idsColaboradoresEmpresa = colaboradoresDaEmpresa.map((c) => c.id);
  if (competenciaRow && idsColaboradoresEmpresa.length > 0) {
    const [{ data: transpData }, { data: extrasData }] = await Promise.all([
      supabase
        .from("beneficios_transporte")
        .select("*")
        .eq("competencia_id", competenciaRow.id)
        .in("colaborador_id", idsColaboradoresEmpresa),
      supabase
        .from("beneficios_extras")
        .select("*")
        .eq("competencia_id", competenciaRow.id)
        .in("colaborador_id", idsColaboradoresEmpresa),
    ]);
    transporteRows = (transpData ?? []) as BeneficioTransporte[];
    extrasRows = (extrasData ?? []) as BeneficioExtra[];
  }

  const transportePorColaborador: Record<string, BeneficioTransporte[]> = {};
  for (const c of colaboradoresDaEmpresa) transportePorColaborador[c.id] = [];
  for (const tr of transporteRows) (transportePorColaborador[tr.colaborador_id] ??= []).push(tr);

  const extraPorColaborador: Record<string, BeneficioExtra> = {};
  for (const ex of extrasRows) extraPorColaborador[ex.colaborador_id] = ex;

  function subtotalTipo(tipoObj: BeneficioTipoTransporte, colaboradoresLista: Colaborador[]): number {
    let sub = 0;
    for (const c of colaboradoresLista) {
      sub += totalTransportePorTipo(transportePorColaborador[c.id] ?? [], tipoObj.nome);
      if (tipoObj.nome === "CAJU") sub += totalExtras(extraPorColaborador[c.id]);
    }
    return sub;
  }

  function contarComTipo(tipo: string): number {
    return linhas.filter((c) => (transportePorColaborador[c.id] ?? []).some((tr) => tr.tipo === tipo)).length;
  }

  // ------------------------------------------------------------
  // Resumo por colaborador + totais (usado no card de estatísticas, na barra
  // lateral e na tabela de resumo lá embaixo)
  // ------------------------------------------------------------
  let somaTransporte = 0, somaAlimentacao = 0, somaPremio = 0, somaOutros = 0, somaGeral = 0;
  const linhasResumo = linhas.map((c) => {
    const transp = transportePorColaborador[c.id] ?? [];
    const extra = extraPorColaborador[c.id];
    const totalTransporteColab = tiposDaEmpresa.reduce((s, t) => s + totalTransportePorTipo(transp, t.nome), 0);
    const alimentacao = extra?.alimentacao ?? 0;
    const premio = extra?.premio ?? 0;
    const outros = extra?.outros_valor ?? 0;
    const totalGeralColab = totalTransporteColab + alimentacao + premio + outros;
    somaTransporte += totalTransporteColab;
    somaAlimentacao += alimentacao;
    somaPremio += premio;
    somaOutros += outros;
    somaGeral += totalGeralColab;
    return { c, totalTransporteColab, alimentacao, premio, outros, totalGeralColab };
  });

  const somaTaxas = tiposDaEmpresa.reduce((s, t) => s + t.taxa_adm, 0);
  const qtdPendencias = linhasResumo.filter((l) => l.totalGeralColab === 0).length;
  const qtdConfirmados = linhas.length - qtdPendencias;

  // ------------------------------------------------------------
  // Aba de tipo selecionada
  // ------------------------------------------------------------
  const tabSelecionada = searchParams.tab && tiposDaEmpresa.some((t) => t.nome === searchParams.tab)
    ? searchParams.tab
    : tiposDaEmpresa[0]?.nome;
  const tipoObjSelecionado = tiposDaEmpresa.find((t) => t.nome === tabSelecionada);

  let linhasCaju: LinhaCaju[] = [];
  let linhasOutro: LinhaOutro[] = [];
  let subtotalSelecionado = 0;
  if (tipoObjSelecionado) {
    if (tipoObjSelecionado.nome === "CAJU") {
      linhasCaju = linhas.map((c) => {
        const entradasCaju = (transportePorColaborador[c.id] ?? []).filter((tr) => tr.tipo === "CAJU");
        const extra = extraPorColaborador[c.id];
        const alimentacao = extra?.alimentacao ?? 0;
        const premio = extra?.premio ?? 0;
        const outros = extra?.outros_valor ?? 0;
        const totalCaju = totalTransportePorTipo(transportePorColaborador[c.id] ?? [], "CAJU") + totalExtras(extra);
        return { colaboradorId: c.id, nome: c.nome, entradasCaju, extra, alimentacao, premio, outros, totalCaju };
      });
      subtotalSelecionado = subtotalTipo(tipoObjSelecionado, linhas);
    } else {
      linhas.forEach((c) => {
        (transportePorColaborador[c.id] ?? []).forEach((tr) => {
          if (tr.tipo === tipoObjSelecionado.nome) linhasOutro.push({ colaboradorId: c.id, nome: c.nome, tr });
        });
      });
      subtotalSelecionado = subtotalTipo(tipoObjSelecionado, linhas);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Departamento Pessoal · Controle de Benefícios</h1>
        <p className="text-slate-500 text-sm">
          Transporte, Alimentação, Prêmio e Outros — só colaboradores CLT e Estagiário (ativos ou em experiência).
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          {empresas.map((e) => (
            <Link
              key={e.id}
              href={`/departamento-pessoal/beneficios?empresa=${e.id}`}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                e.id === empresaId ? "bg-ink-900 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href="#config-tipos" className="btn-secondary !text-sm !py-1.5">⚙️ Configurar benefícios</a>
          <button type="button" disabled className="btn-secondary !text-sm !py-1.5 opacity-50 cursor-not-allowed" title="Em breve">
            ⬆️ Importar relatório <span className="text-[10px] font-normal">(em breve)</span>
          </button>
          <CompetenciaAcoes competencia={competencia} fechado={mesFechado} />
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="empresa" value={empresaId} />
        {unidadesDaEmpresa.length > 0 && (
          <select name="unidade" defaultValue={unidadeId ?? ""} className="input !w-auto !text-sm !py-1.5">
            {unidadesDaEmpresa.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        )}
        <select name="competencia" defaultValue={competencia} className="input !w-auto !text-sm !py-1.5">
          {opcoesCompetencia.map((comp) => (
            <option key={comp} value={comp}>{rotuloCompetencia(comp)}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary !text-sm !py-1.5">Ver</button>
      </form>

      {mesFechado && (
        <div className="card bg-slate-50 border-slate-200">
          <p className="text-sm text-slate-500">
            🔒 {rotuloCompetencia(competencia)} está fechado — vira histórico, só dá pra consultar. Use "Reabrir este mês" ali em cima se precisar corrigir algo.
          </p>
        </div>
      )}

      {/* ---------------- Cards de resumo ---------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card !py-3 !px-4">
          <p className="text-xs text-slate-400">Colaboradores</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{linhas.length}</p>
          <p className="text-[11px] text-slate-400">com benefício</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-slate-400">Custo total dos benefícios</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{formatarReais(somaGeral)}</p>
          <p className="text-[11px] text-slate-400">+ Taxas: {formatarReais(somaTaxas)}</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-slate-400">Pendências</p>
          <p className="text-xl font-bold text-amber-600 mt-0.5">{qtdPendencias}</p>
          <p className="text-[11px] text-slate-400">sem nada lançado ainda</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-slate-400">Lançamentos confirmados</p>
          <p className="text-xl font-bold text-emerald-600 mt-0.5">{qtdConfirmados}</p>
          <p className="text-[11px] text-slate-400">de {linhas.length} colaboradores</p>
        </div>
      </div>

      <div id="config-tipos">
        <TiposTransporteCadastro empresaId={empresaId} tipos={tiposDaEmpresa} />
      </div>

      {/* ---------------- Abas por tipo + resumo lateral ---------------- */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">🚌 Transporte — separado por tipo de cartão</h2>
        {tiposDaEmpresa.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">Nenhum tipo de transporte cadastrado pra {empresaAtual.nome} ainda. Cadastre um ali em cima.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
            <div className="card !p-0 overflow-hidden">
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                {tiposDaEmpresa.map((t) => {
                  const ativo = t.nome === tabSelecionada;
                  const cor = BADGE_COR[classeTipoTransporte(t.nome)] ?? BADGE_COR.extra;
                  return (
                    <Link
                      key={t.id}
                      href={`?empresa=${empresaId}${unidadeId ? `&unidade=${unidadeId}` : ""}&competencia=${competencia}&tab=${encodeURIComponent(t.nome)}#tabela-tipo`}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg ${
                        ativo ? "bg-ink-900 text-white" : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {t.nome}
                      <span className={`text-[10px] font-bold rounded-full px-1.5 ${ativo ? "bg-white/20" : cor}`}>
                        {contarComTipo(t.nome)}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {tipoObjSelecionado && (
                <div id="tabela-tipo">
                  <div
                    className={`flex items-center justify-between flex-wrap gap-2 px-4 py-3 mt-3 ${
                      CLASSE_COR[classeTipoTransporte(tipoObjSelecionado.nome)] ?? CLASSE_COR.extra
                    }`}
                  >
                    <span className="font-bold">{tipoObjSelecionado.nome}</span>
                    <div className="flex gap-3 text-xs font-semibold flex-wrap">
                      <span>Taxa adm.: {formatarReais(tipoObjSelecionado.taxa_adm)}</span>
                      <span>Subtotal: {formatarReais(subtotalSelecionado)}</span>
                      <span>Total c/ taxa: {formatarReais(subtotalSelecionado + tipoObjSelecionado.taxa_adm)}</span>
                    </div>
                  </div>
                  {tipoObjSelecionado.nome === "CAJU" ? (
                    <>
                      <p className="text-xs text-slate-400 px-4 pt-2">
                        Alimentação, Prêmio e Outros de todos os colaboradores ficam aqui, porque são pagos pelo cartão CAJU —
                        mesmo quem usa outro cartão só pro transporte continua recebendo normalmente.
                      </p>
                      <PainelTipoCaju competencia={competencia} tipo="CAJU" mesFechado={mesFechado} linhas={linhasCaju} />
                    </>
                  ) : (
                    <PainelTipoOutro
                      competencia={competencia}
                      tipo={tipoObjSelecionado.nome}
                      comCartao={TIPOS_COM_CARTAO.includes(tipoObjSelecionado.nome)}
                      mesFechado={mesFechado}
                      linhas={linhasOutro}
                      colaboradoresParaAdicionar={linhas.map((c) => ({ id: c.id, nome: c.nome }))}
                    />
                  )}
                </div>
              )}
            </div>

            {/* ---------------- Barra lateral: resumo + ações ---------------- */}
            <div className="space-y-3">
              <div className="card-dark !py-4 !px-4">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-300 mb-3">
                  Resumo — {rotuloCompetencia(competencia)}
                </h3>
                <div className="space-y-1.5">
                  {tiposDaEmpresa.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{t.nome}</span>
                      <span className="font-semibold">{formatarReais(subtotalTipo(t, linhas))}</span>
                    </div>
                  ))}
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Total dos benefícios</span>
                    <span className="font-semibold">{formatarReais(somaGeral)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Taxas administrativas</span>
                    <span className="font-semibold">{formatarReais(somaTaxas)}</span>
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 text-sm">Custo total</span>
                    <span className="font-bold text-emerald-300 text-lg">{formatarReais(somaGeral + somaTaxas)}</span>
                  </div>
                </div>
              </div>

              <div className="card !py-3 !px-4">
                <h3 className="text-[11px] uppercase tracking-wide text-slate-400 font-bold mb-2">Ações rápidas</h3>
                <div className="space-y-1">
                  <a href="#resumo-colaborador" className="block text-sm text-slate-600 hover:text-brand-600 py-1">
                    📄 Ver resumo completo
                  </a>
                  <span className="flex items-center gap-1.5 text-sm text-slate-300 py-1 cursor-not-allowed">
                    📊 Exportar para Excel <span className="text-[10px]">(em breve)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-slate-300 py-1 cursor-not-allowed">
                    🕓 Histórico de importações <span className="text-[10px]">(em breve)</span>
                  </span>
                </div>
              </div>

              <div className="card !py-3 !px-4 bg-blue-50/60 border-blue-100">
                <p className="text-xs text-blue-800">
                  💡 No CAJU, cada colaborador pode receber por <strong>Km rodado</strong> ou por <strong>Viagens por dia</strong> —
                  é só trocar no menu ao lado do nome, na visão Detalhado.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div id="resumo-colaborador">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">📊 Resumo por colaborador</h2>
        <div className="card !p-0 overflow-hidden">
          {linhas.length === 0 ? (
            <p className="text-sm text-slate-400 p-4">
              Nenhum colaborador CLT/Estagiário {unidadeAtual ? `na unidade ${unidadeAtual.nome}` : `em ${empresaAtual.nome}`} neste mês.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-xs uppercase">
                    <th className="py-2 px-4">Colaborador</th>
                    <th className="py-2 px-4">Transporte</th>
                    <th className="py-2 px-4">Alimentação</th>
                    <th className="py-2 px-4">Prêmio</th>
                    <th className="py-2 px-4">Outros</th>
                    <th className="py-2 px-4">Total do mês</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasResumo.map(({ c, totalTransporteColab, alimentacao, premio, outros, totalGeralColab }) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 px-4">{c.nome}</td>
                      <td className="py-2 px-4">{formatarReais(totalTransporteColab)}</td>
                      <td className="py-2 px-4">{formatarReais(alimentacao)}</td>
                      <td className="py-2 px-4">{formatarReais(premio)}</td>
                      <td className="py-2 px-4">{formatarReais(outros)}</td>
                      <td className="py-2 px-4 font-bold text-brand-700">{formatarReais(totalGeralColab)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">🧾 Totais por tipo (toda a empresa, taxa administrativa incluída)</h2>
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 px-4">Tipo</th>
                  <th className="py-2 px-4">Taxa adm.</th>
                  <th className="py-2 px-4">Subtotal (carga)</th>
                  <th className="py-2 px-4">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {tiposDaEmpresa.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 px-4 text-center text-slate-400">Nenhum tipo cadastrado.</td></tr>
                ) : (
                  tiposDaEmpresa.map((tipoObj) => {
                    const sub = subtotalTipo(tipoObj, colaboradoresDaEmpresa);
                    return (
                      <tr key={tipoObj.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 px-4 font-semibold">{tipoObj.nome}</td>
                        <td className="py-2 px-4">{formatarReais(tipoObj.taxa_adm)}</td>
                        <td className="py-2 px-4">{formatarReais(sub)}</td>
                        <td className="py-2 px-4 font-bold">{formatarReais(sub + tipoObj.taxa_adm)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {unidadesDaEmpresa.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">🏢 Totais por unidade — para separar no relatório</h2>
          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-xs uppercase">
                    <th className="py-2 px-4">Unidade</th>
                    {tiposDaEmpresa.map((t) => <th key={t.id} className="py-2 px-4">{t.nome}</th>)}
                    <th className="py-2 px-4 bg-slate-50">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {unidadesDaEmpresa.map((u) => {
                    const colaboradoresUnidade = colaboradoresDaEmpresa.filter((c) => c.unidade_id === u.id);
                    let totalLinha = 0;
                    const celulas = tiposDaEmpresa.map((tipoObj) => {
                      const sub = subtotalTipo(tipoObj, colaboradoresUnidade);
                      totalLinha += sub;
                      return sub;
                    });
                    return (
                      <tr key={u.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 px-4 font-semibold">{u.nome}</td>
                        {celulas.map((v, i) => <td key={i} className="py-2 px-4">{formatarReais(v)}</td>)}
                        <td className="py-2 px-4 font-bold bg-slate-50">{formatarReais(totalLinha)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-900 text-white font-bold">
                    <td className="py-2 px-4">Total</td>
                    {tiposDaEmpresa.map((tipoObj) => (
                      <td key={tipoObj.id} className="py-2 px-4">{formatarReais(subtotalTipo(tipoObj, colaboradoresDaEmpresa))}</td>
                    ))}
                    <td className="py-2 px-4">
                      {formatarReais(tiposDaEmpresa.reduce((s, t) => s + subtotalTipo(t, colaboradoresDaEmpresa), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card-dark">
        <h3 className="text-xs uppercase tracking-wide text-slate-300 mb-3">
          Totais {unidadeAtual ? `da unidade ${unidadeAtual.nome}` : `de ${empresaAtual.nome}`} — {rotuloCompetencia(competencia)}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><p className="text-xs text-slate-400">🚌 Transporte</p><p className="text-lg font-bold mt-0.5">{formatarReais(somaTransporte)}</p></div>
          <div><p className="text-xs text-slate-400">🍽️ Alimentação</p><p className="text-lg font-bold mt-0.5">{formatarReais(somaAlimentacao)}</p></div>
          <div><p className="text-xs text-slate-400">🏆 Prêmio</p><p className="text-lg font-bold mt-0.5">{formatarReais(somaPremio)}</p></div>
          <div><p className="text-xs text-slate-400">📦 Outros</p><p className="text-lg font-bold mt-0.5">{formatarReais(somaOutros)}</p></div>
          <div><p className="text-xs text-slate-400">Total geral</p><p className="text-xl font-bold mt-0.5 text-emerald-300">{formatarReais(somaGeral)}</p></div>
        </div>
      </div>
    </div>
  );
}
