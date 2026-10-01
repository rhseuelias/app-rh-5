import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { FolhaCompetencia } from "@/types/db";
import { competenciaAtualSP, fmt2, montarRelatorioAnalitico, rotuloMesCompleto } from "@/lib/relatorio-analitico";
import BotaoBaixarPdf from "@/components/lancamentos/BotaoBaixarPdf";

export const dynamic = "force-dynamic";

const COR_P = "#2F62B0";
const COR_D = "#B04A3A";
const COR_DESTAQUE = "#C62828";

export default async function RelatorioAnaliticoPage({
  searchParams,
}: {
  searchParams: { competencia?: string; escopo?: string };
}) {
  const competencia = /^\d{4}-\d{2}$/.test(searchParams.competencia ?? "") ? (searchParams.competencia as string) : competenciaAtualSP();
  const escopoPedido = searchParams.escopo ?? "todas";

  const resultado = await montarRelatorioAnalitico(competencia, escopoPedido);
  if ("erro" in resultado) {
    return (
      <div className="card">
        <p className="text-sm text-red-700">{resultado.erro}</p>
      </div>
    );
  }
  const { relatorio: rel, opcoes } = resultado;
  const escopoAtual = opcoes.some((o) => o.chave === escopoPedido) ? escopoPedido : "todas";

  const supabase = createClient();
  const { data: comps } = await supabase.from("folha_competencias").select("competencia").order("competencia", { ascending: false });
  const meses = Array.from(
    new Set([competenciaAtualSP(), competencia, ...((comps ?? []) as Pick<FolhaCompetencia, "competencia">[]).map((c) => c.competencia)])
  ).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/departamento-pessoal/lancamentos?competencia=${competencia}`} className="text-sm text-brand-600 hover:underline">
            ← voltar aos lançamentos
          </Link>
          <p role="heading" aria-level={1} className="font-display text-3xl font-semibold uppercase text-ink-900">
            Relatório analítico da folha
          </p>
          <p className="text-sm text-ink-600">
            {rel.rotuloMes} · período {rel.periodo} · {rel.escopoRotulo}
            {rel.mesFechado ? " · 🔒 mês fechado" : ""}
          </p>
        </div>
        <BotaoBaixarPdf competencia={competencia} escopo={escopoAtual} />
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 !py-3">
        <label className="flex flex-col gap-0.5 text-[11px] text-ink-600">
          Mês
          <select name="competencia" defaultValue={competencia} className="input !w-auto !py-1.5 !text-sm">
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMesCompleto(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-ink-600">
          Unidade
          <select name="escopo" defaultValue={escopoAtual} className="input !w-auto !py-1.5 !text-sm">
            {opcoes.map((o) => (
              <option key={o.chave} value={o.chave}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-secondary !text-sm !py-1.5">
          Ver relatório
        </button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-200/70 bg-white px-4 py-3">
          <p className="text-xs text-ink-600">Funcionários</p>
          <p className="font-display text-3xl font-semibold text-ink-900">{rel.totalFuncionarios}</p>
        </div>
        <div className="rounded-xl border border-brand-200/70 bg-white px-4 py-3">
          <p className="text-xs text-ink-600">Total de proventos</p>
          <p className="font-display text-3xl font-semibold" style={{ color: COR_P }}>
            {fmt2(rel.totalP)}
          </p>
        </div>
        <div className="rounded-xl border border-brand-200/70 bg-white px-4 py-3">
          <p className="text-xs text-ink-600">Total de descontos</p>
          <p className="font-display text-3xl font-semibold" style={{ color: COR_D }}>
            {fmt2(rel.totalD)}
          </p>
        </div>
      </div>
      <p className="text-xs text-ink-600">Valores em R$. Colunas de horas (Referência) aparecem em horas e não entram nos totais.</p>

      {rel.grupos.length === 0 && <div className="card text-sm text-ink-600">Nenhum funcionário encontrado para este filtro.</div>}

      {rel.grupos.map((g) => (
        <section key={g.rotulo} className="card space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-semibold text-ink-900">{g.rotulo}</h2>
            <span className="text-xs text-ink-600">
              {g.linhas.length} funcionário{g.linhas.length === 1 ? "" : "s"}
            </span>
          </div>

          {g.colunas.length === 0 ? (
            <p className="text-sm text-ink-600">Nenhum valor lançado nesta unidade no mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 border border-stone-300 bg-stone-100 px-2 py-1.5 text-left">Funcionário</th>
                    {g.colunas.map((c) => (
                      <th
                        key={c.id}
                        className="border border-stone-300 px-2 py-1.5 text-left align-top font-semibold"
                        style={{ background: c.grupo === "provento" ? "#DDF0D9" : "#FCE3D6", color: c.destaque ? COR_DESTAQUE : undefined }}
                      >
                        <span className="block text-[10px] font-bold" style={{ color: c.destaque ? COR_DESTAQUE : c.grupo === "provento" ? COR_P : COR_D }}>
                          {c.codigo ? `cód. ${c.codigo}` : c.grupo === "provento" ? "provento" : "desconto"}
                        </span>
                        {c.rotulo}
                      </th>
                    ))}
                    <th className="border border-stone-300 bg-[#DDF0D9] px-2 py-1.5 text-right" style={{ color: COR_P }}>
                      Total proventos
                    </th>
                    <th className="border border-stone-300 bg-[#FCE3D6] px-2 py-1.5 text-right" style={{ color: COR_D }}>
                      Total descontos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-brand-50">
                      <td className="sticky left-0 whitespace-nowrap border border-stone-200 bg-white px-2 py-1 font-medium">{l.nome}</td>
                      {g.colunas.map((c) => (
                        <td
                          key={c.id}
                          className={`whitespace-nowrap border border-stone-200 px-2 py-1 ${c.formato === "moeda" ? "text-right font-mono" : ""} ${c.destaque ? "font-bold" : ""}`}
                          style={{ color: c.destaque ? COR_DESTAQUE : undefined }}
                        >
                          {l.valores[c.id] ?? ""}
                        </td>
                      ))}
                      <td className="border border-stone-200 px-2 py-1 text-right font-mono" style={{ color: COR_P }}>
                        {l.totalP ? fmt2(l.totalP) : ""}
                      </td>
                      <td className="border border-stone-200 px-2 py-1 text-right font-mono" style={{ color: COR_D }}>
                        {l.totalD ? fmt2(l.totalD) : ""}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-stone-100 font-bold">
                    <td className="sticky left-0 border border-stone-300 bg-stone-100 px-2 py-1.5">TOTAL</td>
                    {g.colunas.map((c) => (
                      <td
                        key={c.id}
                        className="border border-stone-300 px-2 py-1.5 text-right font-mono"
                        style={{ color: c.destaque ? COR_DESTAQUE : undefined }}
                      >
                        {c.formato === "moeda" ? fmt2(g.totaisColuna[c.id] ?? 0) : ""}
                      </td>
                    ))}
                    <td className="border border-stone-300 px-2 py-1.5 text-right font-mono" style={{ color: COR_P }}>
                      {fmt2(g.totalP)}
                    </td>
                    <td className="border border-stone-300 px-2 py-1.5 text-right font-mono" style={{ color: COR_D }}>
                      {fmt2(g.totalD)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {g.linhas.some((l) => l.ponto.trim() !== "") && (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-ink-600">Observações de ponto</p>
              <ul className="space-y-0.5 text-[12px] text-ink-800">
                {g.linhas
                  .filter((l) => l.ponto.trim() !== "")
                  .map((l) => (
                    <li key={l.id}>
                      <b>{l.nome}:</b> {l.ponto}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {rel.grupos.length > 1 && (
        <section className="card space-y-4">
          <div>
            <h2 className="mb-2 text-lg font-semibold text-ink-900">Resumo por unidade</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[420px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-stone-100">
                    <th className="border border-stone-300 px-3 py-1.5 text-left">Unidade</th>
                    <th className="border border-stone-300 px-3 py-1.5 text-right">Funcionários</th>
                    <th className="border border-stone-300 px-3 py-1.5 text-right" style={{ color: COR_P }}>
                      Proventos
                    </th>
                    <th className="border border-stone-300 px-3 py-1.5 text-right" style={{ color: COR_D }}>
                      Descontos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rel.resumoUnidades.map((r) => (
                    <tr key={r.rotulo}>
                      <td className="border border-stone-200 px-3 py-1">{r.rotulo}</td>
                      <td className="border border-stone-200 px-3 py-1 text-right">{r.funcionarios}</td>
                      <td className="border border-stone-200 px-3 py-1 text-right font-mono" style={{ color: COR_P }}>
                        {fmt2(r.totalP)}
                      </td>
                      <td className="border border-stone-200 px-3 py-1 text-right font-mono" style={{ color: COR_D }}>
                        {fmt2(r.totalD)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-stone-100 font-bold">
                    <td className="border border-stone-300 px-3 py-1.5">TOTAL GERAL</td>
                    <td className="border border-stone-300 px-3 py-1.5 text-right">{rel.totalFuncionarios}</td>
                    <td className="border border-stone-300 px-3 py-1.5 text-right font-mono" style={{ color: COR_P }}>
                      {fmt2(rel.totalP)}
                    </td>
                    <td className="border border-stone-300 px-3 py-1.5 text-right font-mono" style={{ color: COR_D }}>
                      {fmt2(rel.totalD)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {rel.resumoColunas.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-ink-900">Resumo por coluna (todas as unidades somadas)</h2>
              <table className="min-w-[360px] border-collapse text-[12.5px]">
                <tbody>
                  {rel.resumoColunas.map((r) => (
                    <tr key={r.coluna.id}>
                      <td
                        className={`border border-stone-200 px-3 py-1 ${r.coluna.destaque ? "font-bold" : ""}`}
                        style={{ background: r.coluna.grupo === "provento" ? "#DDF0D9" : "#FCE3D6", color: r.coluna.destaque ? COR_DESTAQUE : undefined }}
                      >
                        {r.coluna.codigo ? `${r.coluna.codigo} - ` : ""}
                        {r.coluna.rotulo}
                      </td>
                      <td
                        className="border border-stone-200 px-3 py-1 text-right font-mono font-semibold"
                        style={{ color: r.coluna.destaque ? COR_DESTAQUE : undefined }}
                      >
                        {fmt2(r.total)}
                        {r.coluna.horas ? " h" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="text-[11px] text-ink-600">Gerado em {rel.geradoEm} (horário de Brasília).</p>
    </div>
  );
}
