import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade, Ferias, PeriodoAquisitivo } from "@/types/db";
import { addDays, differenceInCalendarDays } from "date-fns";
import Link from "next/link";
import {
  diasParaVencerFerias,
  FERIAS_STATUS_LABEL,
  FERIAS_STATUS_COR,
  FERIAS_LEGENDA,
} from "@/lib/calculos";
import { formatarReais } from "@/lib/formatadores";
import { detectarConflitos } from "@/lib/ferias-calculos";
import NovaSolicitacaoFerias from "@/components/NovaSolicitacaoFerias";
import FeriasAcoes from "@/components/FeriasAcoes";
import GerarPrevisaoBotao from "@/components/ferias/GerarPrevisaoBotao";
import GraficoFeriasPorMes from "@/components/ferias/GraficoFeriasPorMes";
import MapaFerias, { type LinhaMapa, type CelulaMapa } from "@/components/ferias/MapaFerias";

export const dynamic = "force-dynamic";

const NOMES_MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function chaveDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function FeriasPage({
  searchParams,
}: {
  searchParams: { empresa?: string; unidade?: string; ano?: string; mes?: string; colaborador?: string };
}) {
  const supabase = createClient();

  const anoSelecionado = searchParams.ano ? Number(searchParams.ano) : new Date().getFullYear();
  const mesSelecionado = searchParams.mes ? Number(searchParams.mes) : null; // 1-12

  const [
    { data: colaboradoresData },
    { data: empresasData },
    { data: unidadesData },
    { data: feriasData },
    { data: aquisitivosData },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("ferias").select("*"),
    supabase.from("periodos_aquisitivos").select("*"),
  ]);

  const todosColaboradores = (colaboradoresData ?? []) as Colaborador[];
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const todasFerias = (feriasData ?? []) as Ferias[];
  const todosAquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];

  // ------------------------------------------------------------
  // Filtros (Empresa / Unidade / Ano / Mês / Colaborador)
  // ------------------------------------------------------------
  const colaboradoresFiltrados = todosColaboradores.filter((c) => {
    if (searchParams.empresa && c.empresa_id !== searchParams.empresa) return false;
    if (searchParams.unidade && c.unidade_id !== searchParams.unidade) return false;
    if (searchParams.colaborador && c.id !== searchParams.colaborador) return false;
    return true;
  });
  const idsNoEscopo = new Set(colaboradoresFiltrados.map((c) => c.id));
  const unidadePorColaborador = Object.fromEntries(todosColaboradores.map((c) => [c.id, c.unidade_id]));
  const nomePorColaborador = Object.fromEntries(todosColaboradores.map((c) => [c.id, c.nome]));

  // período aquisitivo aberto de cada colaborador (o mais próximo de vencer, se houver mais de um)
  const abertoPorColaborador: Record<string, PeriodoAquisitivo | undefined> = {};
  for (const p of todosAquisitivos) {
    if (p.status !== "aberto") continue;
    const atual = abertoPorColaborador[p.colaborador_id];
    if (!atual || new Date(p.limite_concessao) < new Date(atual.limite_concessao)) {
      abertoPorColaborador[p.colaborador_id] = p;
    }
  }

  // férias dentro do escopo de equipe (empresa/unidade/colaborador), sem simulação
  const feriasDaEquipe = todasFerias.filter((f) => idsNoEscopo.has(f.colaborador_id) && !f.simulacao);

  // recorte pelo ano/mês selecionado, pro mapa e pros KPIs "do período"
  const inicioIntervalo = mesSelecionado ? new Date(anoSelecionado, mesSelecionado - 1, 1) : new Date(anoSelecionado, 0, 1);
  const fimIntervalo = mesSelecionado
    ? new Date(anoSelecionado, mesSelecionado, 0)
    : new Date(anoSelecionado, 11, 31);

  const feriasNoPeriodo = feriasDaEquipe.filter((f) => {
    if (f.status === "cancelado") return false;
    const inicio = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    return inicio <= fimIntervalo && fim >= inicioIntervalo;
  });

  // ------------------------------------------------------------
  // Conflitos (mesma unidade, mesma semana)
  // ------------------------------------------------------------
  const conflitos = detectarConflitos(
    feriasNoPeriodo.map((f) => ({
      id: f.id,
      colaborador_id: f.colaborador_id,
      unidade_id: unidadePorColaborador[f.colaborador_id] ?? null,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      simulacao: f.simulacao,
      status: f.status,
    }))
  );

  // ------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------
  const hoje = new Date();
  const proximas30 = feriasDaEquipe.filter((f) => {
    if (f.status === "cancelado") return false;
    const dias = differenceInCalendarDays(new Date(f.data_inicio), hoje);
    return dias >= 0 && dias <= 30;
  }).length;

  const kpis = {
    totalColaboradores: colaboradoresFiltrados.length,
    planejadas: feriasNoPeriodo.filter((f) => f.status === "planejada").length,
    aprovadas: feriasNoPeriodo.filter((f) => f.status === "aprovado" || f.status === "concluido").length,
    proximas: proximas30,
    conflitos: conflitos.size,
    custoEstimado: feriasNoPeriodo.reduce((soma, f) => soma + (f.valor_estimado ?? 0), 0),
  };

  // ------------------------------------------------------------
  // Gráfico "férias por mês" (ano selecionado, todo o time no escopo)
  // ------------------------------------------------------------
  const feriasDoAnoTodo = feriasDaEquipe.filter((f) => {
    if (f.status === "cancelado") return false;
    const inicio = new Date(f.data_inicio);
    return inicio.getFullYear() === anoSelecionado;
  });
  const grafico = NOMES_MES_CURTO.map((mes, i) => ({
    mes,
    quantidade: feriasDoAnoTodo.filter((f) => new Date(f.data_inicio).getMonth() === i).length,
  }));

  // ------------------------------------------------------------
  // Mapa de férias — expande cada período em dias, pra colorir as células
  // ------------------------------------------------------------
  const diasPorColaborador: Record<string, Record<string, CelulaMapa>> = {};
  for (const f of feriasNoPeriodo) {
    if (!diasPorColaborador[f.colaborador_id]) diasPorColaborador[f.colaborador_id] = {};
    const cor = f.simulacao ? "bg-amber-400" : FERIAS_STATUS_COR[f.status] ?? "bg-slate-400";
    const titulo = `${FERIAS_STATUS_LABEL[f.status] ?? f.status} — ${new Date(f.data_inicio).toLocaleDateString("pt-BR")} a ${new Date(f.data_fim).toLocaleDateString("pt-BR")}`;
    let d = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    while (d <= fim) {
      diasPorColaborador[f.colaborador_id][chaveDia(d)] = { cor, titulo, conflito: conflitos.has(f.id) };
      d = addDays(d, 1);
    }
  }

  const linhasMapa: LinhaMapa[] = colaboradoresFiltrados
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      periodoAbertoId: abertoPorColaborador[c.id]?.id ?? null,
      dias: diasPorColaborador[c.id] ?? {},
    }));

  const meses = mesSelecionado ? [mesSelecionado - 1] : Array.from({ length: 12 }, (_, i) => i);

  // ------------------------------------------------------------
  // Alerta de período aquisitivo vencendo em até 60 dias (escopo filtrado)
  // ------------------------------------------------------------
  const vencendoEm60Dias = Object.values(abertoPorColaborador)
    .filter((p): p is PeriodoAquisitivo => !!p && idsNoEscopo.has(p.colaborador_id))
    .map((p) => ({ ...p, diasRestantes: diasParaVencerFerias(p.limite_concessao) }))
    .filter((p) => p.diasRestantes <= 60)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  // lista de solicitações (gestão manual) — escopo de equipe, todos os status, sem simulação
  const solicitacoes = feriasDaEquipe.slice().sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1));
  const aquisitivosParaForm = todosAquisitivos.filter((p) => p.status !== "gozado");

  const filtrosAtivos = !!(searchParams.empresa || searchParams.unidade || searchParams.ano || searchParams.mes || searchParams.colaborador);
  const queryRelatorio = new URLSearchParams();
  if (searchParams.empresa) queryRelatorio.set("empresa", searchParams.empresa);
  if (searchParams.unidade) queryRelatorio.set("unidade", searchParams.unidade);
  if (searchParams.ano) queryRelatorio.set("ano", searchParams.ano);
  if (searchParams.mes) queryRelatorio.set("mes", searchParams.mes);
  if (searchParams.colaborador) queryRelatorio.set("colaborador", searchParams.colaborador);
  const queryRelatorioStr = queryRelatorio.toString();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Férias</h1>
          <p className="text-slate-500 text-sm">Planejamento, mapa e simulação de férias</p>
        </div>
        <div className="flex items-start gap-3">
          <Link href="/ferias/simulacao" className="btn-secondary whitespace-nowrap self-start">
            🧪 Simulação
          </Link>
          <GerarPrevisaoBotao />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon="👥" label="Colaboradores" valor={kpis.totalColaboradores.toString()} />
        <KpiCard icon="🟦" label="Planejadas" valor={kpis.planejadas.toString()} />
        <KpiCard icon="🟩" label="Aprovadas" valor={kpis.aprovadas.toString()} />
        <KpiCard icon="⏳" label="Próximas (30d)" valor={kpis.proximas.toString()} />
        <KpiCard icon="🟥" label="Conflitos" valor={kpis.conflitos.toString()} cor={kpis.conflitos > 0 ? "text-red-600" : undefined} />
        <KpiCard icon="💰" label="Custo estimado" valor={formatarReais(kpis.custoEstimado)} pequeno />
      </div>

      {/* Gráfico */}
      <div className="card">
        <h2 className="font-medium text-slate-900 mb-1">Férias por mês — {anoSelecionado}</h2>
        <p className="text-xs text-slate-400 mb-2">Quantidade de períodos com início em cada mês</p>
        <GraficoFeriasPorMes dados={grafico} />
      </div>

      {vencendoEm60Dias.length > 0 && (
        <div className="card border-red-200 bg-red-50">
          <h2 className="font-medium text-red-800 mb-2">⚠️ Períodos aquisitivos vencendo em até 60 dias</h2>
          <ul className="text-sm text-red-700 space-y-1">
            {vencendoEm60Dias.map((p) => (
              <li key={p.id}>
                {nomePorColaborador[p.colaborador_id] ?? "—"} — limite:{" "}
                {new Date(p.limite_concessao).toLocaleDateString("pt-BR")} (
                {p.diasRestantes < 0 ? "vencido" : `${p.diasRestantes} dias`})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mapa de férias */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-medium text-slate-900">Mapa de férias</h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            {FERIAS_LEGENDA.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${l.cor}`} />
                {l.label}
                {l.label === "Simulação" && " (em breve)"}
              </span>
            ))}
          </div>
        </div>

        <form className="flex flex-wrap gap-2 mb-5" method="get">
          <select name="empresa" defaultValue={searchParams.empresa ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Empresa — todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          <select name="unidade" defaultValue={searchParams.unidade ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Unidade — todas</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
          <select name="colaborador" defaultValue={searchParams.colaborador ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Colaborador — todos</option>
            {todosColaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <select name="ano" defaultValue={searchParams.ano ?? String(anoSelecionado)} className="input !w-auto !text-xs !py-1.5">
            {[anoSelecionado - 1, anoSelecionado, anoSelecionado + 1, anoSelecionado + 2].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select name="mes" defaultValue={searchParams.mes ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Mês — ano inteiro</option>
            {NOMES_MES_CURTO.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <button type="submit" className="btn-secondary !px-4 !py-2 !text-xs">Filtrar</button>
          {filtrosAtivos && (
            <Link href="/ferias" className="text-xs text-slate-400 self-center hover:underline">Limpar</Link>
          )}
        </form>

        <MapaFerias ano={anoSelecionado} meses={meses} linhas={linhasMapa} />
      </div>

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">Nova solicitação</h2>
        <NovaSolicitacaoFerias colaboradores={todosColaboradores} periodosAquisitivos={aquisitivosParaForm} />
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-4">
          <div>
            <h2 className="font-medium text-slate-900">Relatório gerencial</h2>
            <p className="text-xs text-slate-400">Segue os mesmos filtros do mapa acima</p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/ferias/relatorio/pdf${queryRelatorioStr ? `?${queryRelatorioStr}` : ""}`} className="btn-secondary text-sm">
              ⬇️ PDF
            </a>
            <a href={`/api/ferias/relatorio/excel${queryRelatorioStr ? `?${queryRelatorioStr}` : ""}`} className="btn-secondary text-sm">
              ⬇️ Excel
            </a>
          </div>
        </div>
        <table className="w-full text-sm mt-2">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="py-3 px-4">Colaborador</th>
              <th className="py-3 px-4">Período</th>
              <th className="py-3 px-4">Dias</th>
              <th className="py-3 px-4">Valor estimado</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {solicitacoes.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="py-3 px-4">{nomePorColaborador[f.colaborador_id] ?? "—"}</td>
                <td className="py-3 px-4">
                  {new Date(f.data_inicio).toLocaleDateString("pt-BR")} —{" "}
                  {new Date(f.data_fim).toLocaleDateString("pt-BR")}
                </td>
                <td className="py-3 px-4">{f.dias}</td>
                <td className="py-3 px-4 text-slate-500">
                  {f.valor_estimado != null ? formatarReais(f.valor_estimado) : "—"}
                </td>
                <td className="py-3 px-4">
                  <span className={`badge text-white ${FERIAS_STATUS_COR[f.status] ?? "bg-slate-400"}`}>
                    {FERIAS_STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <FeriasAcoes id={f.id} status={f.status} />
                </td>
              </tr>
            ))}
            {solicitacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Nenhuma solicitação registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
