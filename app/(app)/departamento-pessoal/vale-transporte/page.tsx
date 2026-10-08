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
  moedaVT,
  somaVT,
  type LinhaVT,
} from "@/lib/vale-transporte";
import { copiaAutomaticaVT } from "@/lib/vt-copia-mes-anterior";
import ValeTransporteUnidade, { type LinhaTela } from "@/components/vale-transporte/ValeTransporteUnidade";
import SeletorUnidadeVT from "@/components/vale-transporte/SeletorUnidadeVT";
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
  if (!colaboradoresRes.error) {
    await copiaAutomaticaVT(
      supabase,
      competencia,
      competenciaAtualSP(),
      ((colaboradoresRes.data ?? []) as Colaborador[]).filter(elegivelVT).map((c) => c.id)
    );
  }

  const [lancRes, antRes] = await Promise.all([
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

  // grupos (unidades) = quem é elegível OU já tem lançamento no mês
  const linhasPorGrupo = new Map<string, LinhaTela[]>();
  const colabsPorGrupo = new Map<string, { id: string; nome: string }[]>();
  const garantir = (g: string) => {
    if (!linhasPorGrupo.has(g)) linhasPorGrupo.set(g, []);
    if (!colabsPorGrupo.has(g)) colabsPorGrupo.set(g, []);
  };

  for (const c of colaboradores) {
    if (!elegivelVT(c)) continue;
    const g = grupoVT(c, empresaPorId, unidadePorId);
    garantir(g);
    colabsPorGrupo.get(g)!.push({ id: c.id, nome: c.nome });
  }
  for (const l of lancamentos) {
    const c = colabPorId.get(l.colaborador_id);
    if (!c) continue;
    const g = grupoVT(c, empresaPorId, unidadePorId);
    garantir(g);
    linhasPorGrupo.get(g)!.push({ ...l, nome: c.nome, repetido: repetido(l) });
  }
  for (const lista of colabsPorGrupo.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  for (const lista of linhasPorGrupo.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const grupos = Array.from(linhasPorGrupo.keys()).sort(compararGrupos);
  const escolhido =
    searchParams.unidade && linhasPorGrupo.has(searchParams.unidade)
      ? searchParams.unidade
      : grupos.find((g) => (linhasPorGrupo.get(g) ?? []).length > 0) ?? grupos[0] ?? "";

  const linhasEscolhido = linhasPorGrupo.get(escolhido) ?? [];
  const somaEscolhido = somaVT(linhasEscolhido);
  const opcoesUnidade = grupos.map((g) => {
    const lista = linhasPorGrupo.get(g) ?? [];
    return { nome: g, carga: lista.length > 0 ? moedaVT(somaVT(lista).carga) : "—" };
  });

  const href = (comp: string, unidade: string) =>
    `/departamento-pessoal/vale-transporte?competencia=${comp}&unidade=${encodeURIComponent(unidade)}`;
  const linkExcel = `/api/vale-transporte/excel?competencia=${competencia}&unidade=${encodeURIComponent(escolhido)}`;
  const linkExcelTodas = `/api/vale-transporte/excel?competencia=${competencia}`;

  return (
    <div className="vt-largo space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/departamento-pessoal" className="text-xs font-medium text-brand-600 hover:underline">
            ← Departamento Pessoal
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900">Vale Transporte por unidade</h1>
          <p className="text-sm text-stone-600">Escolha a unidade e veja todos os cartões dela de uma vez.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-brand-300 bg-white px-1 py-1">
            <Link href={href(deslocarCompetencia(competencia, -1), escolhido)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand-50" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="min-w-[140px] text-center text-sm font-semibold">{rotuloCompetencia(competencia)}</span>
            <Link href={href(deslocarCompetencia(competencia, 1), escolhido)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand-50" aria-label="Próximo mês">
              ›
            </Link>
          </div>
          <RelatorioPdfVT competencia={competencia} unidades={grupos.filter((g) => (linhasPorGrupo.get(g) ?? []).length > 0)} />
          <a href={linkExcelTodas} className="btn-secondary no-underline">
            Exportar todas as unidades
          </a>
        </div>
      </div>

      <div className="card flex flex-wrap items-end justify-between gap-4 !p-4">
        <SeletorUnidadeVT opcoes={opcoesUnidade} atual={escolhido} competencia={competencia} />
        <p className="max-w-md text-sm text-stone-600">
          O valor ao lado do nome da unidade é a carga a recarregar (todos os cartões dela).
        </p>
      </div>

      {escolhido ? (
        <>
              <ValeTransporteUnidade
                key={`${competencia}|${escolhido}`}
                competencia={competencia}
                rotuloMes={rotuloCompetencia(competencia)}
                grupo={escolhido}
                linhas={linhasEscolhido}
                colaboradores={colabsPorGrupo.get(escolhido) ?? []}
                temMesAnterior={(antRes.count ?? 0) > 0}
                linkExcel={linkExcel}
                diasMesInicial={diasMes}
              />

              <div className="card-dark flex flex-wrap items-center justify-between gap-3 !py-4">
                <div className="text-sm text-brand-100">Resumo da unidade — o que precisa ser recarregado</div>
                <div className="flex flex-wrap items-baseline gap-5">
                  <span className="text-sm">Total {moedaVT(somaEscolhido.total)}</span>
                  <span className="text-sm">Saldo {moedaVT(somaEscolhido.saldo)}</span>
                  <span className="text-3xl font-bold">{moedaVT(somaEscolhido.carga)}</span>
                </div>
              </div>
            </>
      ) : (
        <div className="card text-sm text-stone-600">Cadastre colaboradores e unidades para começar o lançamento.</div>
      )}
    </div>
  );
}
