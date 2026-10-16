import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { competenciaAtualSP, deslocarCompetencia, empresaVT, EMPRESAS_VT, grupoVT, moedaVT } from "@/lib/vale-transporte";
import { elegivelAdiantamento, valorAdiantamento } from "@/lib/adiantamentos";
import ImprimirBotao from "@/components/ImprimirBotao";

export const dynamic = "force-dynamic";

interface Linha {
  id: string;
  nome: string;
  cargo: string;
  matricula: string;
  pct: number | null;
  valor: number | null;
}

export default async function RelatorioAdiantamentosPage({ searchParams }: { searchParams: { competencia?: string } }) {
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.competencia ?? "")
    ? (searchParams.competencia as string)
    : competenciaAtualSP();

  const supabase = createClient();
  const [empresasRes, unidadesRes, colaboradoresRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
  ]);
  if (colaboradoresRes.error) {
    return (
      <div className="card">
        <p className="text-sm text-red-700">Não foi possível carregar os colaboradores.</p>
      </div>
    );
  }

  const empresaPorId = new Map(((empresasRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colaboradores = (colaboradoresRes.data ?? []) as Colaborador[];

  // empresa -> unidade -> linhas
  const grupos = new Map<string, Map<string, Linha[]>>();
  for (const c of colaboradores) {
    if (!elegivelAdiantamento(c) || !c.adiantamento_salario) continue;
    const empresa = empresaVT(c, empresaPorId, unidadePorId);
    const unidade = grupoVT(c, empresaPorId, unidadePorId);
    const un = c.unidade_id ? unidadePorId.get(c.unidade_id) : undefined;
    if (!grupos.has(empresa)) grupos.set(empresa, new Map());
    const porUnidade = grupos.get(empresa)!;
    if (!porUnidade.has(unidade)) porUnidade.set(unidade, []);
    porUnidade.get(unidade)!.push({
      id: c.id,
      nome: c.nome,
      cargo: c.cargo ?? "",
      matricula: c.matricula ?? "",
      pct: un?.adiantamento_pct ?? null,
      valor: valorAdiantamento(c, un),
    });
  }

  const outras = Array.from(grupos.keys())
    .filter((e) => !(EMPRESAS_VT as readonly string[]).includes(e))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const ordem: string[] = [...EMPRESAS_VT, ...outras].filter((e) => grupos.has(e));

  const resumo = ordem.map((empresa) => {
    const linhas = Array.from(grupos.get(empresa)!.values()).flat();
    return {
      empresa,
      quantidade: linhas.length,
      total: linhas.reduce((s, l) => s + (l.valor ?? 0), 0),
      semValor: linhas.filter((l) => l.valor === null).length,
    };
  });
  const quantidadeTotal = resumo.reduce((s, r) => s + r.quantidade, 0);
  const valorTotal = resumo.reduce((s, r) => s + r.total, 0);
  const semValorTotal = resumo.reduce((s, r) => s + r.semValor, 0);

  const href = (comp: string) => `/departamento-pessoal/adiantamentos/relatorio?competencia=${comp}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link href="/departamento-pessoal/adiantamentos" className="text-xs font-medium text-brand-600 hover:underline">
            ← Adiantamentos
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900">Relatório de adiantamentos</h1>
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
          <ImprimirBotao />
        </div>
      </div>

      <div className="hidden print:block">
        <p className="font-display text-2xl font-semibold uppercase">Relatório de adiantamentos · {rotuloCompetencia(competencia)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card !py-3">
          <p className="text-2xl font-display font-semibold tabular-nums">{quantidadeTotal}</p>
          <p className="text-sm text-stone-600">colaboradores</p>
        </div>
        {resumo.map((r) => (
          <div key={r.empresa} className="card !py-3">
            <p className="text-2xl font-display font-semibold tabular-nums">{r.quantidade}</p>
            <p className="text-sm text-stone-600">{r.empresa}</p>
          </div>
        ))}
      </div>

      {quantidadeTotal === 0 && (
        <div className="card">
          <p className="text-sm text-stone-600">Ninguém está marcado para receber adiantamento. Marque na tela de Adiantamentos.</p>
        </div>
      )}

      {ordem.map((empresa) => {
        const porUnidade = grupos.get(empresa)!;
        const r = resumo.find((x) => x.empresa === empresa)!;
        const unidades = Array.from(porUnidade.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
        return (
          <section key={empresa} className="card !p-0 overflow-hidden break-inside-avoid">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-200 bg-brand-50 px-4 py-3">
              <h2 className="text-xl font-semibold">{empresa}</h2>
              <p className="text-sm text-stone-600">
                {r.quantidade} {r.quantidade === 1 ? "colaborador" : "colaboradores"} · total {moedaVT(r.total)}
              </p>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 text-left text-xs uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2">Colaborador</th>
                  <th className="px-4 py-2">Cargo</th>
                  <th className="px-4 py-2">Matrícula</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((un) => {
                  const linhas = (porUnidade.get(un) ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
                  return (
                    <Fragment key={un}>
                      <tr className="bg-stone-50">
                        <td colSpan={5} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-stone-600">
                          {un} · {linhas.length}
                        </td>
                      </tr>
                      {linhas.map((l) => (
                        <tr key={l.id} className="border-b border-brand-100 last:border-b-0">
                          <td className="px-4 py-2 font-semibold uppercase">{l.nome}</td>
                          <td className="px-4 py-2 uppercase text-stone-600">{l.cargo || "—"}</td>
                          <td className="px-4 py-2 text-stone-600">{l.matricula || "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{l.pct ? `${l.pct}%` : "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{l.valor === null ? "—" : moedaVT(l.valor)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      {quantidadeTotal > 0 && (
        <p className="text-sm text-stone-600">
          Total geral: <b>{moedaVT(valorTotal)}</b> para {quantidadeTotal} {quantidadeTotal === 1 ? "colaborador" : "colaboradores"}.
          {semValorTotal > 0 &&
            ` ${semValorTotal} ${semValorTotal === 1 ? "colaborador está" : "colaboradores estão"} sem valor: a unidade não tem % de adiantamento definido (ou falta o salário no cadastro).`}
          {" "}Valor = salário base × % da unidade. Quem for desligado ou afastado sai da lista sozinho.
        </p>
      )}
    </div>
  );
}
