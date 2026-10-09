import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { compararGrupos } from "@/lib/folha-calculos";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import {
  competenciaAtualSP,
  deslocarCompetencia,
  elegivelVT,
  grupoVT,
  type LinhaVT,
} from "@/lib/vale-transporte";
import { copiaAutomaticaVT } from "@/lib/vt-copia-mes-anterior";
import ValeTransporteTela, { type LinhaTela, type OpcaoColaborador } from "@/components/vale-transporte/ValeTransporteTela";
import RelatorioPdfVT from "@/components/vale-transporte/RelatorioPdfVT";

export const dynamic = "force-dynamic";

export default async function ValeTransportePage({
  searchParams,
}: {
  searchParams: { competencia?: string; unidade?: string };
}) {
  const supabase = createClient();
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.competencia ?? "")
    ? (searchParams.competencia as string)
    : competenciaAtualSP();
  const anterior = deslocarCompetencia(competencia, -1);

  const [empresasRes, unidadesRes, colaboradoresRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
  ]);

  // Mês novo: traz sozinho os cartões e valores do mês anterior (só na 1ª vez que o mês é aberto).
  let copiouAutomatico = false;
  if (!colaboradoresRes.error) {
    copiouAutomatico = await copiaAutomaticaVT(
      supabase,
      competencia,
      competenciaAtualSP(),
      ((colaboradoresRes.data ?? []) as Colaborador[]).filter(elegivelVT).map((c) => c.id)
    );
  }

  const [matRes, lancRes, antRes] = await Promise.all([
    supabase.from("vt_matriculas").select("colaborador_id, operadora, matricula"),
    supabase.from("vt_lancamentos").select("*").eq("competencia", competencia),
    supabase.from("vt_lancamentos").select("id", { count: "exact", head: true }).eq("competencia", anterior),
  ]);

  // Dias úteis do mês: o que foi salvo neste mês; senão o do mês anterior; senão 26.
  const [cfgAtual, cfgAnterior] = await Promise.all([
    supabase.from("vt_config_mes").select("dias_uteis").eq("competencia", competencia).maybeSingle(),
    supabase.from("vt_config_mes").select("dias_uteis").eq("competencia", anterior).maybeSingle(),
  ]);
  const diasMes =
    (!cfgAtual.error && Number(cfgAtual.data?.dias_uteis)) || (!cfgAnterior.error && Number(cfgAnterior.data?.dias_uteis)) || 26;

  if (lancRes.error) {
    const faltaTabela = /does not exist|schema cache/i.test(lancRes.error.message);
    return (
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">Vale Transporte</h1>
        <p className="text-sm text-red-700">
          {faltaTabela
            ? "Falta criar a tabela no banco. Rode o arquivo migration_022_vale_transporte.sql e depois a migration_023_vale_transporte_caju.sql no Supabase (SQL Editor) e abra esta tela de novo."
            : `Não foi possível carregar: ${lancRes.error.message}`}
        </p>
      </div>
    );
  }
  if (empresasRes.error || colaboradoresRes.error) {
    return (
      <div className="card">
        <p className="text-sm text-red-700">Não foi possível carregar os colaboradores.</p>
      </div>
    );
  }

  const empresaPorId = new Map(((empresasRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colaboradores = (colaboradoresRes.data ?? []) as Colaborador[];
  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const lancamentos = (lancRes.data ?? []) as LinhaVT[];
  // matrícula de cada operadora (BHBUS/ÓTIMO) — é separada da matrícula do cadastro do colaborador
  const matriculaVT = new Map<string, string>();
  if (!matRes.error) {
    for (const m of (matRes.data ?? []) as { colaborador_id: string; operadora: string; matricula: string }[]) {
      matriculaVT.set(`${m.colaborador_id}|${m.operadora}`, m.matricula);
    }
  }

  // cartão usado por mais de um colaborador (na mesma operadora) = repetido
  const donosPorCartao = new Map<string, Set<string>>();
  for (const l of lancamentos) {
    const num = (l.cartao ?? "").replace(/\D/g, "");
    if (!num) continue;
    const k = `${l.operadora}|${num}`;
    if (!donosPorCartao.has(k)) donosPorCartao.set(k, new Set());
    donosPorCartao.get(k)!.add(l.colaborador_id);
  }
  const repetido = (l: LinhaVT) => {
    const num = (l.cartao ?? "").replace(/\D/g, "");
    return !!num && (donosPorCartao.get(`${l.operadora}|${num}`)?.size ?? 0) > 1;
  };

  // cada linha leva a unidade do colaborador (só leitura); a unidade vem do cadastro
  const linhas: LinhaTela[] = [];
  const grupoDoColab = new Map<string, string>();
  const opcoes: OpcaoColaborador[] = [];
  const todosGrupos = new Set<string>();

  for (const c of colaboradores) {
    if (!elegivelVT(c)) continue;
    const g = grupoVT(c, empresaPorId, unidadePorId);
    grupoDoColab.set(c.id, g);
    todosGrupos.add(g);
    opcoes.push({ id: c.id, nome: c.nome, unidade: g });
  }
  for (const l of lancamentos) {
    const c = colabPorId.get(l.colaborador_id);
    if (!c) continue;
    const g = grupoVT(c, empresaPorId, unidadePorId);
    todosGrupos.add(g);
    linhas.push({
      ...l,
      nome: c.nome,
      matricula: matriculaVT.get(`${l.colaborador_id}|${l.operadora}`) ?? null,
      unidade: g,
      repetido: repetido(l),
    });
  }
  opcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const unidades = Array.from(todosGrupos).sort(compararGrupos);
  const unidadesIniciais = unidades.filter((u) => linhas.some((l) => l.unidade === u));

  const href = (comp: string) => `/departamento-pessoal/vale-transporte?competencia=${comp}`;
  const avisoCopia = copiouAutomatico
    ? `Informações de ${rotuloCompetencia(anterior)} trazidas automaticamente (cartões, valores e dias úteis). O saldo começa zerado.`
    : "";

  return (
    <div className="vt-largo space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/departamento-pessoal" className="text-xs font-medium text-brand-600 hover:underline">
            ← Departamento Pessoal
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900">Vale Transporte</h1>
          <p className="text-sm text-stone-600">Lançamento e controle de recarga.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-brand-300 bg-white px-1 py-1">
            <Link href={href(deslocarCompetencia(competencia, -1))} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand-50" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="min-w-[140px] text-center text-sm font-semibold">{rotuloCompetencia(competencia)}</span>
            <Link href={href(deslocarCompetencia(competencia, 1))} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand-50" aria-label="Próximo mês">
              ›
            </Link>
          </div>
          <RelatorioPdfVT competencia={competencia} unidades={unidadesIniciais} />
        </div>
      </div>

      <ValeTransporteTela
        key={competencia}
        competencia={competencia}
        rotuloMes={rotuloCompetencia(competencia)}
        linhas={linhas}
        colaboradores={opcoes}
        unidades={unidades}
        unidadesIniciais={unidadesIniciais}
        temMesAnterior={(antRes.count ?? 0) > 0}
        diasMesInicial={diasMes}
        linkCsvBhbus={`/api/vale-transporte/csv?competencia=${competencia}`}
        avisoCopia={avisoCopia}
      />
    </div>
  );
}
