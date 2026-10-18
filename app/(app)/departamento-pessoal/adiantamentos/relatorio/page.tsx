import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { competenciaAtualSP, deslocarCompetencia, EMPRESAS_VT, moedaVT } from "@/lib/vale-transporte";
import { montarLinhasAdiantamento, type LinhaAdiantamento } from "@/lib/adiantamentos";
import ImprimirBotao from "@/components/ImprimirBotao";
import GerarAdiantamentosBotao from "@/components/GerarAdiantamentosBotao";

export const dynamic = "force-dynamic";

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function RelatorioAdiantamentosPage({ searchParams }: { searchParams: { competencia?: string; empresa?: string; modo?: string } }) {
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.competencia ?? "")
    ? (searchParams.competencia as string)
    : competenciaAtualSP();

  const supabase = createClient();
  const [empresasRes, unidadesRes, colaboradoresRes, salvosRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("adiantamentos_mensais").select("*").eq("competencia", competencia),
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

  // Mês salvo (gerado antes) tem prioridade; senão mostra a prévia com a lista de hoje.
  const tabelaFaltando = !!salvosRes.error;
  const salvos = tabelaFaltando ? [] : (salvosRes.data ?? []);
  const jaSalvo = salvos.length > 0;
  const geradoEm = jaSalvo ? (salvos as { gerado_em: string }[]).map((s) => s.gerado_em).sort().slice(-1)[0] : null;

  const todas: LinhaAdiantamento[] = jaSalvo
    ? (salvos as Record<string, unknown>[]).map((s) => ({
        id: String(s.colaborador_id ?? s.id),
        nome: String(s.nome ?? ""),
        cargo: String(s.cargo ?? ""),
        matricula: String(s.matricula ?? ""),
        empresa: String(s.empresa ?? ""),
        unidade: String(s.unidade ?? ""),
        pct: s.pct === null || s.pct === undefined ? null : Number(s.pct),
        valor: s.valor === null || s.valor === undefined ? null : Number(s.valor),
      }))
    : montarLinhasAdiantamento((colaboradoresRes.data ?? []) as Colaborador[], empresaPorId, unidadePorId);

  const empresasComDados = Array.from(new Set(todas.map((l) => l.empresa)));
  const outras = empresasComDados.filter((e) => !(EMPRESAS_VT as readonly string[]).includes(e)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const empresasOrdem: string[] = [...EMPRESAS_VT, ...outras];

  const filtro = searchParams.empresa && empresasOrdem.includes(searchParams.empresa) ? searchParams.empresa : "todas";
  const linhasFiltradas = filtro === "todas" ? todas : todas.filter((l) => l.empresa === filtro);

  // empresa -> unidade -> linhas
  const grupos = new Map<string, Map<string, LinhaAdiantamento[]>>();
  for (const l of linhasFiltradas) {
    if (!grupos.has(l.empresa)) grupos.set(l.empresa, new Map());
    const porUnidade = grupos.get(l.empresa)!;
    if (!porUnidade.has(l.unidade)) porUnidade.set(l.unidade, []);
    porUnidade.get(l.unidade)!.push(l);
  }
  const ordem = empresasOrdem.filter((e) => grupos.has(e));

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

  const soNomes = searchParams.modo === "nomes";
  const href = (comp: string, emp: string = filtro, nomes: boolean = soNomes) =>
    `/departamento-pessoal/adiantamentos/relatorio?competencia=${comp}${emp !== "todas" ? `&empresa=${encodeURIComponent(emp)}` : ""}${nomes ? "&modo=nomes" : ""}`;
  const tituloEmpresa = filtro === "todas" ? "Todas as empresas" : filtro;

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
          {!tabelaFaltando && <GerarAdiantamentosBotao competencia={competencia} rotulo={rotuloCompetencia(competencia)} jaSalvo={jaSalvo} />}
          <ImprimirBotao />
        </div>
      </div>

      {tabelaFaltando && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          Para salvar os meses, rode o arquivo <b>migration_039_adiantamentos_mensais.sql</b> no Supabase. Enquanto isso, o relatório mostra a lista de hoje.
        </div>
      )}

      <div
        className={`rounded-xl border px-4 py-2.5 text-sm print:hidden ${jaSalvo ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-stone-300 bg-stone-50 text-stone-700"}`}
      >
        {jaSalvo ? (
          <>
            ✅ <b>{rotuloCompetencia(competencia)} salvo</b> em {dataHora(geradoEm as string)}. Esta lista não muda mais, mesmo que o cadastro mude.
          </>
        ) : (
          <>
            ⚠️ <b>Prévia:</b> {rotuloCompetencia(competencia)} ainda não foi gerado. Os dados abaixo são da lista de hoje. Toque em “Gerar e salvar” para guardar este mês.
          </>
        )}
      </div>

      {empresasOrdem.some((e) => empresasComDados.includes(e)) && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-sm font-semibold text-stone-600">Empresa:</span>
          {["todas", ...empresasOrdem.filter((e) => empresasComDados.includes(e))].map((e) => (
            <Link
              key={e}
              href={href(competencia, e)}
              aria-current={filtro === e ? "true" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold no-underline ${filtro === e ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
            >
              {e === "todas" ? "Todas as empresas" : e}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm font-semibold text-stone-600">Mostrar:</span>
        {[
          { nomes: false, rotulo: "Completo (cargo, matrícula, %, valor)" },
          { nomes: true, rotulo: "Só nomes" },
        ].map((o) => (
          <Link
            key={o.rotulo}
            href={href(competencia, filtro, o.nomes)}
            aria-current={soNomes === o.nomes ? "true" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold no-underline ${soNomes === o.nomes ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
          >
            {o.rotulo}
          </Link>
        ))}
      </div>

      <div className="hidden print:block">
        <p className="font-display text-2xl font-semibold uppercase">
          Relatório de adiantamentos · {rotuloCompetencia(competencia)} · {tituloEmpresa}
          {soNomes ? " · Só nomes" : ""}
        </p>
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
          <p className="text-sm text-stone-600">
            {jaSalvo || todas.length > 0 ? "Nenhum adiantamento nesta empresa." : "Ninguém está marcado para receber adiantamento. Marque na tela de Adiantamentos."}
          </p>
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
                {r.quantidade} {r.quantidade === 1 ? "colaborador" : "colaboradores"}
                {soNomes ? "" : ` · total ${moedaVT(r.total)}`}
              </p>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 text-left text-xs uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2">Colaborador</th>
                  {!soNomes && (
                    <>
                      <th className="px-4 py-2">Cargo</th>
                      <th className="px-4 py-2">Matrícula</th>
                      <th className="px-4 py-2 text-right">%</th>
                      <th className="px-4 py-2 text-right">Valor</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {unidades.map((un) => {
                  const linhas = (porUnidade.get(un) ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
                  return (
                    <Fragment key={un}>
                      <tr className="bg-stone-50">
                        <td colSpan={soNomes ? 1 : 5} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-stone-600">
                          {un} · {linhas.length}
                        </td>
                      </tr>
                      {linhas.map((l) => (
                        <tr key={l.id + l.nome} className="border-b border-brand-100 last:border-b-0">
                          <td className="px-4 py-2 font-semibold uppercase">{l.nome}</td>
                          {!soNomes && (
                            <>
                              <td className="px-4 py-2 uppercase text-stone-600">{l.cargo || "—"}</td>
                              <td className="px-4 py-2 text-stone-600">{l.matricula || "—"}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{l.pct ? `${l.pct}%` : "—"}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{l.valor === null ? "—" : moedaVT(l.valor)}</td>
                            </>
                          )}
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

      {quantidadeTotal > 0 && soNomes && (
        <p className="text-sm text-stone-600">
          Total {filtro === "todas" ? "geral" : `de ${filtro}`}: <b>{quantidadeTotal}</b> {quantidadeTotal === 1 ? "colaborador" : "colaboradores"}.
        </p>
      )}

      {quantidadeTotal > 0 && !soNomes && (
        <p className="text-sm text-stone-600">
          Total {filtro === "todas" ? "geral" : `de ${filtro}`}: <b>{moedaVT(valorTotal)}</b> para {quantidadeTotal} {quantidadeTotal === 1 ? "colaborador" : "colaboradores"}.
          {semValorTotal > 0 &&
            ` ${semValorTotal} ${semValorTotal === 1 ? "colaborador está" : "colaboradores estão"} sem valor: a unidade não tem % de adiantamento definido (ou falta o salário no cadastro).`}
          {" "}Valor = salário base × % da unidade. Quem for desligado ou afastado sai da lista sozinho.
        </p>
      )}
    </div>
  );
}
