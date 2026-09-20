import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { addDays } from "date-fns";
import type { Colaborador, Empresa, Unidade, Ferias, PeriodoAquisitivo, Feriado, CenarioSimulacao } from "@/types/db";
import { formatarReais } from "@/lib/formatadores";
import { diasParaVencerFerias } from "@/lib/calculos";
import { detectarConflitos, respeitaRegraInicio, paraSetDeDatas } from "@/lib/ferias-calculos";
import { normalizarConfig, periodosDoModelo, calcularSaldo } from "@/lib/simulacao-ferias";
import { criarCenario, excluirCenario, duplicarCenario, limparCenario, promoverCenario } from "@/lib/actions";
import ConfigSimulacaoForm from "@/components/ferias/ConfigSimulacaoForm";
import DefinirManualForm from "@/components/ferias/DefinirManualForm";
import GerarAutomaticoBotao from "@/components/ferias/GerarAutomaticoBotao";
import MapaSimulacao, { type LinhaSimulacao, type CelulaSimulacao, LEGENDA_SIMULACAO } from "@/components/ferias/MapaSimulacao";

export const dynamic = "force-dynamic";

function chaveDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function SimulacaoFeriasPage({
  searchParams,
}: {
  searchParams: { cenario?: string; view?: string };
}) {
  const supabase = createClient();

  const [{ data: empresasData }, { data: unidadesData }, { data: cenariosData }] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("cenarios_simulacao").select("*").order("created_at", { ascending: false }),
  ]);
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const cenarios = (cenariosData ?? []) as CenarioSimulacao[];
  const nomeEmpresa = Object.fromEntries(empresas.map((e) => [e.id, e.nome]));
  const nomeUnidade = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));

  const cenarioId = searchParams.cenario ?? null;
  const cenarioAtual = cenarioId ? cenarios.find((c) => c.id === cenarioId) ?? null : null;

  // ------------------------------------------------------------
  // MODO GALERIA — nenhum cenário selecionado
  // ------------------------------------------------------------
  if (!cenarioAtual) {
    const anoBase = new Date().getFullYear();
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Simulação de férias</h1>
          <p className="text-slate-500 text-sm">
            Monte cenários de planejamento por empresa/unidade e ano — o RH escolhe manualmente alguns colaboradores e
            deixa o sistema distribuir os demais, sem mexer no mapa oficial até aprovar.
          </p>
        </div>
        <Link href="/ferias" className="text-xs text-brand-600 hover:underline inline-block">
          ← Voltar pro mapa de férias
        </Link>

        <div className="card">
          <h2 className="font-medium text-slate-900 mb-3">+ Nova simulação</h2>
          <form action={criarCenario} className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-slate-500">
              Nome
              <input
                type="text" name="nome" required placeholder="Planejamento de Férias 2027 — Cenário A"
                className="input !text-xs mt-1 !w-64"
              />
            </label>
            <label className="text-xs text-slate-500">
              Empresa
              <select name="empresa_id" className="input !text-xs mt-1 !w-auto">
                <option value="">Todas</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Unidade
              <select name="unidade_id" className="input !text-xs mt-1 !w-auto">
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Ano
              <select name="ano" defaultValue={anoBase + 1} className="input !text-xs mt-1 !w-auto">
                {[0, 1, 2, 3].map((i) => (
                  <option key={anoBase + i} value={anoBase + i}>{anoBase + i}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500 flex-1 min-w-[180px]">
              Descrição (opcional)
              <input type="text" name="descricao" className="input !text-xs mt-1 w-full" />
            </label>
            <button type="submit" className="btn-primary !text-xs">Criar cenário</button>
          </form>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {cenarios.map((c) => (
            <Link
              key={c.id}
              href={`/ferias/simulacao?cenario=${c.id}`}
              className="card hover:border-brand-300 hover:shadow-card block"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{c.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.empresa_id ? nomeEmpresa[c.empresa_id] ?? "—" : "Todas as empresas"} ·{" "}
                    {c.unidade_id ? nomeUnidade[c.unidade_id] ?? "—" : "Todas as unidades"} · {c.ano ?? "—"}
                  </p>
                </div>
                <span className={`badge ${c.status === "aprovado" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.status === "aprovado" ? "Aprovado" : "Rascunho"}
                </span>
              </div>
              {c.descricao && <p className="text-xs text-slate-400 mt-2">{c.descricao}</p>}
            </Link>
          ))}
          {cenarios.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10 md:col-span-2">Nenhum cenário criado ainda.</p>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // MODO WORKSPACE — cenário selecionado
  // ------------------------------------------------------------
  const config = normalizarConfig(cenarioAtual.config);
  const periodosModelo = periodosDoModelo(config);
  const ano = cenarioAtual.ano ?? new Date().getFullYear();

  const [
    { data: colaboradoresData },
    { data: aquisitivosData },
    { data: feriasReaisData },
    { data: feriasSimuladasData },
    { data: feriadosData },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("ferias").select("*").eq("simulacao", false).neq("status", "cancelado"),
    supabase.from("ferias").select("*").eq("cenario_id", cenarioAtual.id).eq("simulacao", true),
    supabase.from("feriados").select("*"),
  ]);

  let colaboradores = (colaboradoresData ?? []) as Colaborador[];
  if (cenarioAtual.empresa_id) colaboradores = colaboradores.filter((c) => c.empresa_id === cenarioAtual.empresa_id);
  if (cenarioAtual.unidade_id) colaboradores = colaboradores.filter((c) => c.unidade_id === cenarioAtual.unidade_id);
  colaboradores = colaboradores.slice().sort((a, b) => a.nome.localeCompare(b.nome));

  const todosAquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];
  const todasFeriasReais = (feriasReaisData ?? []) as Ferias[];
  const feriasSimuladas = (feriasSimuladasData ?? []) as Ferias[];
  const feriados = (feriadosData ?? []) as Feriado[];
  const feriadosSet = paraSetDeDatas(feriados);
  const feriadosChaveSet = new Set(feriados.map((f) => f.data));

  const idsEscopo = new Set(colaboradores.map((c) => c.id));
  const nomePorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.nome]));
  const unidadePorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.unidade_id]));
  const departamentoPorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.departamento]));

  const aquisitivoAbertoPorColaborador: Record<string, PeriodoAquisitivo | undefined> = {};
  for (const p of todosAquisitivos) {
    if (!idsEscopo.has(p.colaborador_id)) continue;
    const atual = aquisitivoAbertoPorColaborador[p.colaborador_id];
    if (!atual || new Date(p.limite_concessao) < new Date(atual.limite_concessao)) {
      aquisitivoAbertoPorColaborador[p.colaborador_id] = p;
    }
  }

  const usadosPorPeriodo: Record<string, number> = {};
  for (const f of todasFeriasReais) {
    if (!f.periodo_aquisitivo_id) continue;
    usadosPorPeriodo[f.periodo_aquisitivo_id] = (usadosPorPeriodo[f.periodo_aquisitivo_id] ?? 0) + f.dias;
  }

  const simuladosPorColaborador: Record<string, Ferias[]> = {};
  for (const f of feriasSimuladas) {
    if (!simuladosPorColaborador[f.colaborador_id]) simuladosPorColaborador[f.colaborador_id] = [];
    simuladosPorColaborador[f.colaborador_id].push(f);
  }
  for (const lista of Object.values(simuladosPorColaborador)) lista.sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1));

  // ------------------------------------------------------------
  // CONFLITOS + DATAS INVÁLIDAS
  // ------------------------------------------------------------
  const feriasParaConflito = [...todasFeriasReais.filter((f) => idsEscopo.has(f.colaborador_id)), ...feriasSimuladas].map((f) => ({
    id: f.id,
    colaborador_id: f.colaborador_id,
    unidade_id: unidadePorColaborador[f.colaborador_id] ?? null,
    data_inicio: f.data_inicio,
    data_fim: f.data_fim,
    simulacao: false, // força cruzar simulação x real na mesma checagem
    status: f.status,
  }));
  const conflitos = detectarConflitos(feriasParaConflito);
  const datasInvalidas = new Set(
    feriasSimuladas.filter((f) => !respeitaRegraInicio(new Date(f.data_inicio), feriadosSet)).map((f) => f.id)
  );

  // ------------------------------------------------------------
  // CAPACIDADE DA EQUIPE (concentração acima do configurado)
  // ------------------------------------------------------------
  const contagemUnidadeDia = new Map<string, number>();
  const contagemDeptoDia = new Map<string, number>();
  for (const f of [...todasFeriasReais.filter((f) => idsEscopo.has(f.colaborador_id)), ...feriasSimuladas]) {
    const unidadeId = unidadePorColaborador[f.colaborador_id];
    const depto = departamentoPorColaborador[f.colaborador_id];
    if (!unidadeId) continue;
    let d = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    while (d <= fim) {
      const dia = chaveDia(d);
      const chaveU = `${unidadeId}::${dia}`;
      contagemUnidadeDia.set(chaveU, (contagemUnidadeDia.get(chaveU) ?? 0) + 1);
      if (depto) {
        const chaveD = `${unidadeId}::${depto}::${dia}`;
        contagemDeptoDia.set(chaveD, (contagemDeptoDia.get(chaveD) ?? 0) + 1);
      }
      d = addDays(d, 1);
    }
  }
  let concentracaoOperacional = 0;
  if (config.capacidadeMaxUnidade != null) {
    for (const v of contagemUnidadeDia.values()) if (v > config.capacidadeMaxUnidade) concentracaoOperacional++;
  }
  if (config.capacidadeMaxDepartamento != null) {
    for (const v of contagemDeptoDia.values()) if (v > config.capacidadeMaxDepartamento) concentracaoOperacional++;
  }

  // ------------------------------------------------------------
  // RESUMO / ALERTAS
  // ------------------------------------------------------------
  const colaboradoresComAquisitivo = colaboradores.filter((c) => aquisitivoAbertoPorColaborador[c.id]);
  const programados = colaboradoresComAquisitivo.filter((c) => (simuladosPorColaborador[c.id] ?? []).length > 0);
  const naoProgramados = colaboradoresComAquisitivo.filter((c) => !(simuladosPorColaborador[c.id]?.length));

  let saldoNaoProgramado = 0;
  const proximosDoLimite: Colaborador[] = [];
  for (const c of colaboradoresComAquisitivo) {
    const periodo = aquisitivoAbertoPorColaborador[c.id]!;
    const usados = usadosPorPeriodo[periodo.id] ?? 0;
    const saldoTotal = calcularSaldo(usados);
    const simulado = (simuladosPorColaborador[c.id] ?? []).reduce((s, f) => s + f.dias, 0);
    saldoNaoProgramado += Math.max(0, saldoTotal - simulado);
    if (diasParaVencerFerias(periodo.limite_concessao) <= 60 && simulado < saldoTotal) proximosDoLimite.push(c);
  }
  const periodosComConflito = feriasSimuladas.filter((f) => conflitos.has(f.id));

  const resumo = {
    colaboradores: colaboradoresComAquisitivo.length,
    programados: programados.length,
    comConflito: periodosComConflito.length,
    datasInvalidas: datasInvalidas.size,
    proximosDoLimite: proximosDoLimite.length,
    concentracaoOperacional,
    saldoNaoProgramado,
  };
  const custoTotal = feriasSimuladas.reduce((s, f) => s + (f.valor_estimado ?? 0), 0);

  // ------------------------------------------------------------
  // MAPA (calendário) — ano inteiro do cenário
  // ------------------------------------------------------------
  const diasPorColaborador: Record<string, Record<string, CelulaSimulacao>> = {};
  function pintarPeriodo(f: Ferias, cor: string, rotulo: string) {
    if (!diasPorColaborador[f.colaborador_id]) diasPorColaborador[f.colaborador_id] = {};
    const titulo = `${rotulo} — ${new Date(f.data_inicio).toLocaleDateString("pt-BR")} a ${new Date(f.data_fim).toLocaleDateString("pt-BR")}`;
    let d = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    while (d <= fim) {
      diasPorColaborador[f.colaborador_id][chaveDia(d)] = {
        cor,
        titulo,
        conflito: conflitos.has(f.id) || datasInvalidas.has(f.id),
      };
      d = addDays(d, 1);
    }
  }
  for (const f of todasFeriasReais.filter((f) => idsEscopo.has(f.colaborador_id))) pintarPeriodo(f, "bg-blue-500", "Real");
  for (const f of feriasSimuladas) {
    pintarPeriodo(
      f,
      f.origem_simulacao === "manual" ? "bg-emerald-500" : "bg-amber-400",
      f.origem_simulacao === "manual" ? "Manual" : "Automática"
    );
  }

  const linhasMapa: LinhaSimulacao[] = colaboradoresComAquisitivo.map((c) => ({
    id: c.id,
    nome: c.nome,
    dias: diasPorColaborador[c.id] ?? {},
    periodos: (simuladosPorColaborador[c.id] ?? []).map((f) => ({
      id: f.id,
      dataInicio: f.data_inicio,
      dataFim: f.data_fim,
      dias: f.dias,
      origemSimulacao: f.origem_simulacao ?? null,
    })),
  }));

  const view = searchParams.view === "lista" ? "lista" : "calendario";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900">{cenarioAtual.nome}</h1>
            <span className={`badge ${cenarioAtual.status === "aprovado" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {cenarioAtual.status === "aprovado" ? "Aprovado" : "Rascunho"}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            {cenarioAtual.empresa_id ? nomeEmpresa[cenarioAtual.empresa_id] ?? "—" : "Todas as empresas"} ·{" "}
            {cenarioAtual.unidade_id ? nomeUnidade[cenarioAtual.unidade_id] ?? "—" : "Todas as unidades"} · {ano}
            {cenarioAtual.usuario_responsavel && <> · por {cenarioAtual.usuario_responsavel}</>}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <Link href="/ferias" className="text-xs text-brand-600 hover:underline">← Voltar pro mapa de férias</Link>
            <Link href="/ferias/simulacao" className="text-xs text-slate-400 hover:underline">Ver todos os cenários</Link>
          </div>
        </div>
        <form method="get" className="flex items-center gap-1.5">
          <select name="cenario" defaultValue={cenarioAtual.id} className="input !text-xs !py-1.5 !w-auto">
            {cenarios.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} ({c.ano ?? "—"})</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary !text-xs !py-1.5">Trocar</button>
        </form>
      </div>

      <div className="card flex items-center gap-2 flex-wrap">
        <form action={duplicarCenario.bind(null, cenarioAtual.id)}>
          <button type="submit" className="btn-secondary !text-xs">⧉ Duplicar cenário</button>
        </form>
        <form action={limparCenario.bind(null, cenarioAtual.id)}>
          <button type="submit" className="btn-secondary !text-xs">🧹 Limpar simulação</button>
        </form>
        <a href={`/api/ferias/simulacao/${cenarioAtual.id}/pdf`} className="btn-secondary !text-xs">⬇️ PDF</a>
        <a href={`/api/ferias/simulacao/${cenarioAtual.id}/excel`} className="btn-secondary !text-xs">⬇️ Excel</a>
        <form action={excluirCenario.bind(null, cenarioAtual.id)} className="ml-auto">
          <button type="submit" className="text-xs text-red-500 hover:underline">🗑️ Excluir cenário</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">Configuração da simulação</h2>
        <ConfigSimulacaoForm cenarioId={cenarioAtual.id} config={config} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard icon="👥" label="Colaboradores" valor={resumo.colaboradores.toString()} />
        <KpiCard icon="✅" label="Programados" valor={resumo.programados.toString()} />
        <KpiCard icon="🟥" label="Com conflito" valor={resumo.comConflito.toString()} cor={resumo.comConflito > 0 ? "text-red-600" : undefined} />
        <KpiCard icon="⚠️" label="Datas inválidas" valor={resumo.datasInvalidas.toString()} cor={resumo.datasInvalidas > 0 ? "text-red-600" : undefined} />
        <KpiCard icon="⏳" label="Próx. do limite" valor={resumo.proximosDoLimite.toString()} cor={resumo.proximosDoLimite > 0 ? "text-amber-600" : undefined} />
        <KpiCard icon="🏭" label="Concentração" valor={resumo.concentracaoOperacional.toString()} cor={resumo.concentracaoOperacional > 0 ? "text-amber-600" : undefined} />
        <KpiCard icon="📆" label="Saldo não programado" valor={`${resumo.saldoNaoProgramado} dias`} pequeno />
      </div>

      {(naoProgramados.length > 0 || proximosDoLimite.length > 0 || periodosComConflito.length > 0) && (
        <div className="card !p-4 space-y-2 text-xs">
          {naoProgramados.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-500">Sem nenhuma definição ({naoProgramados.length}) — clique pra ver</summary>
              <p className="mt-1 text-slate-400">{naoProgramados.map((c) => c.nome).join(", ")}</p>
            </details>
          )}
          {proximosDoLimite.length > 0 && (
            <details>
              <summary className="cursor-pointer text-amber-600">Próximos do limite de concessão ({proximosDoLimite.length}) — clique pra ver</summary>
              <p className="mt-1 text-slate-400">{proximosDoLimite.map((c) => c.nome).join(", ")}</p>
            </details>
          )}
          {periodosComConflito.length > 0 && (
            <details>
              <summary className="cursor-pointer text-red-600">Períodos com conflito ({periodosComConflito.length}) — clique pra ver</summary>
              <p className="mt-1 text-slate-400">{periodosComConflito.map((f) => nomePorColaborador[f.colaborador_id]).join(", ")}</p>
            </details>
          )}
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 pt-4 pb-3">
          <div>
            <h2 className="font-medium text-slate-900">Colaboradores elegíveis</h2>
            <p className="text-xs text-slate-400">Modelo configurado: {periodosModelo.join(" + ")} dias</p>
          </div>
          <GerarAutomaticoBotao cenarioId={cenarioAtual.id} modo="gerar" />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="py-2 px-4">Colaborador</th>
              <th className="py-2 px-4">Período aquisitivo</th>
              <th className="py-2 px-4">Saldo</th>
              <th className="py-2 px-4">Definição</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {colaboradoresComAquisitivo.map((c) => {
              const periodo = aquisitivoAbertoPorColaborador[c.id]!;
              const usados = usadosPorPeriodo[periodo.id] ?? 0;
              const saldo = calcularSaldo(usados);
              const simulados = simuladosPorColaborador[c.id] ?? [];
              const diasSimulados = simulados.reduce((s, f) => s + f.dias, 0);
              const origem =
                simulados.length === 0
                  ? null
                  : simulados.every((f) => f.origem_simulacao === "manual")
                  ? "manual"
                  : simulados.every((f) => f.origem_simulacao === "automatica")
                  ? "automatica"
                  : "mista";
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2.5 px-4">{c.nome}</td>
                  <td className="py-2.5 px-4 text-xs text-slate-500">
                    {new Date(periodo.inicio).toLocaleDateString("pt-BR")} – {new Date(periodo.fim).toLocaleDateString("pt-BR")}
                    <br />
                    <span className="text-slate-400">limite: {new Date(periodo.limite_concessao).toLocaleDateString("pt-BR")}</span>
                  </td>
                  <td className="py-2.5 px-4 text-xs">
                    {saldo} dias {diasSimulados > 0 && <span className="text-slate-400">({diasSimulados} simulados)</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    {origem === null && <span className="badge bg-slate-100 text-slate-500">Não definido</span>}
                    {origem === "manual" && <span className="badge bg-emerald-100 text-emerald-700">Manual</span>}
                    {origem === "automatica" && <span className="badge bg-amber-100 text-amber-700">Automática</span>}
                    {origem === "mista" && <span className="badge bg-slate-100 text-slate-500">Mista</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <DefinirManualForm
                      cenarioId={cenarioAtual.id}
                      colaboradorId={c.id}
                      colaboradorNome={c.nome}
                      periodoAquisitivoId={periodo.id}
                      periodoAquisitivoLabel={`${new Date(periodo.inicio).toLocaleDateString("pt-BR")} a ${new Date(periodo.fim).toLocaleDateString("pt-BR")}`}
                      saldoDisponivel={saldo}
                      periodosPadrao={periodosModelo}
                    />
                  </td>
                </tr>
              );
            })}
            {colaboradoresComAquisitivo.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Nenhum colaborador com período aquisitivo aberto nesse escopo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Link
              href={`/ferias/simulacao?cenario=${cenarioAtual.id}&view=calendario`}
              className={`btn-secondary !text-xs ${view === "calendario" ? "!bg-brand-600 !text-white" : ""}`}
            >
              MAPA DE FÉRIAS — CALENDÁRIO
            </Link>
            <Link
              href={`/ferias/simulacao?cenario=${cenarioAtual.id}&view=lista`}
              className={`btn-secondary !text-xs ${view === "lista" ? "!bg-brand-600 !text-white" : ""}`}
            >
              MAPA DE FÉRIAS — LISTA
            </Link>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            {LEGENDA_SIMULACAO.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${l.cor}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {view === "calendario" ? (
          <MapaSimulacao
            ano={ano}
            meses={Array.from({ length: 12 }, (_, i) => i)}
            linhas={linhasMapa}
            feriados={feriadosChaveSet}
            cenarioId={cenarioAtual.id}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="py-2 px-3">Colaborador</th>
                  <th className="py-2 px-3">Período aquisitivo</th>
                  <th className="py-2 px-3">1º início</th>
                  <th className="py-2 px-3">1º fim</th>
                  <th className="py-2 px-3">Dias</th>
                  <th className="py-2 px-3">2º início</th>
                  <th className="py-2 px-3">2º fim</th>
                  <th className="py-2 px-3">Dias</th>
                  <th className="py-2 px-3">3º período</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {colaboradoresComAquisitivo.map((c) => {
                  const periodo = aquisitivoAbertoPorColaborador[c.id]!;
                  const simulados = simuladosPorColaborador[c.id] ?? [];
                  const [p1, p2, p3] = simulados;
                  const totalSimulado = simulados.reduce((s, f) => s + f.dias, 0);
                  const usados = usadosPorPeriodo[periodo.id] ?? 0;
                  const saldoTotal = calcularSaldo(usados);
                  const completo = saldoTotal > 0 && totalSimulado >= saldoTotal;
                  return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="py-2 px-3">{c.nome}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">
                        {new Date(periodo.inicio).toLocaleDateString("pt-BR")}–{new Date(periodo.fim).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 px-3 text-xs">{p1 ? new Date(p1.data_inicio).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-3 text-xs">{p1 ? new Date(p1.data_fim).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-3 text-xs">{p1 ? p1.dias : "—"}</td>
                      <td className="py-2 px-3 text-xs">{p2 ? new Date(p2.data_inicio).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-3 text-xs">{p2 ? new Date(p2.data_fim).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2 px-3 text-xs">{p2 ? p2.dias : "—"}</td>
                      <td className="py-2 px-3 text-xs">
                        {p3 ? `${new Date(p3.data_inicio).toLocaleDateString("pt-BR")}–${new Date(p3.data_fim).toLocaleDateString("pt-BR")} (${p3.dias}d)` : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {completo ? (
                          <span className="text-emerald-600">✅ completo</span>
                        ) : simulados.length > 0 ? (
                          <span className="text-amber-600">parcial</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {colaboradoresComAquisitivo.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">Nenhum colaborador nesse escopo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-400">Custo total estimado do cenário</p>
          <p className="font-display font-bold text-xl text-slate-900">{formatarReais(custoTotal)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <GerarAutomaticoBotao cenarioId={cenarioAtual.id} modo="regenerar" />
          <form action={promoverCenario.bind(null, cenarioAtual.id)}>
            <button type="submit" disabled={feriasSimuladas.length === 0} className="btn-primary disabled:opacity-40">
              ✅ Aprovar e converter em programação oficial
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  valor,
  cor,
  pequeno,
}: {
  icon: string;
  label: string;
  valor: string;
  cor?: string;
  pequeno?: boolean;
}) {
  return (
    <div className="card !p-4">
      <p className="text-[11px] text-slate-400">{icon} {label}</p>
      <p className={`font-display font-bold mt-0.5 ${pequeno ? "text-base" : "text-xl"} ${cor ?? "text-slate-900"}`}>
        {valor}
      </p>
    </div>
  );
}
