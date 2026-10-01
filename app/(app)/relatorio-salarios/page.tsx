import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { adicionaisDe, totalizar, SEM_UNIDADE, MESES } from "@/lib/relatorio-salarios";
import { corDaEmpresa } from "@/lib/empresa-cores";
import ImprimirBotao from "@/components/ImprimirBotao";

export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function RelatorioSalariosPage({
  searchParams,
}: {
  searchParams: { empresa?: string; unidade?: string };
}) {
  const supabase = createClient();
  const [{ data: colaboradores }, { data: empresas }, { data: unidades }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*")
      .eq("tipo", "CLT")
      .in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const clt = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = ((empresas ?? []) as Empresa[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const cltPorEmpresa = (id: string | null) => clt.filter((c) => (c.empresa_id ?? null) === id);
  const semEmpresa = cltPorEmpresa(null);

  // "grupo" = resumo do Grupo todo; senão, uma empresa (a primeira, se nada for escolhido)
  const escolhida = searchParams.empresa;
  const modoGrupo = escolhida === "grupo";
  const empresaAtual =
    (escolhida && listaEmpresas.find((e) => e.id === escolhida)) || (modoGrupo ? null : listaEmpresas[0] ?? null);

  const agora = new Date();
  const competencia = `${MESES[agora.getMonth()]}/${agora.getFullYear()}`;

  // link do botão "Baixar Excel": baixa o mesmo que está na tela (empresa e unidade escolhidas)
  const hrefExcel = modoGrupo
    ? "/api/relatorio-salarios/excel?empresa=grupo"
    : `/api/relatorio-salarios/excel?empresa=${empresaAtual?.id ?? ""}${
        searchParams.unidade ? `&unidade=${encodeURIComponent(searchParams.unidade)}` : ""
      }`;

  // ---------- abas ----------
  const abas = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {listaEmpresas.map((e, i) => {
        const ativa = !modoGrupo && empresaAtual?.id === e.id;
        const cor = corDaEmpresa(e.nome, i);
        return (
          <Link
            key={e.id}
            href={`/relatorio-salarios?empresa=${e.id}`}
            className={`rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors ${
              ativa ? "text-white border-transparent" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
            style={ativa ? { background: cor.cor } : undefined}
          >
            {e.nome}
          </Link>
        );
      })}
      <Link
        href="/relatorio-salarios?empresa=grupo"
        className={`rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors ${
          modoGrupo ? "bg-ink-900 text-white border-ink-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
        }`}
      >
        Resumo do Grupo
      </Link>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <a href={hrefExcel} className="btn-secondary !text-sm !py-2 !px-5 print:hidden">
          📊 Baixar Excel
        </a>
        <ImprimirBotao />
      </div>
    </div>
  );

  // ---------- RESUMO DO GRUPO ----------
  if (modoGrupo) {
    const linhas = [
      ...listaEmpresas.map((e) => ({ nome: e.nome, lista: cltPorEmpresa(e.id) })),
      ...(semEmpresa.length > 0 ? [{ nome: "Sem empresa vinculada", lista: semEmpresa }] : []),
    ].map((l) => ({ ...l, t: totalizar(l.lista) }));
    const geral = totalizar(clt);

    return (
      <div className="space-y-5">
        <div className="print:hidden">
          <h1 className="text-2xl font-semibold text-slate-900">Relatório de Salários e Custo</h1>
          <p className="text-slate-500 text-sm">Para apresentar à diretoria — colaboradores CLT, por empresa e por unidade.</p>
        </div>
        {abas}
        <article className="card !p-0 overflow-hidden">
          <Cabecalho titulo="Resumo do Grupo Seu Elias" competencia={competencia} />
          <div className="p-5 sm:p-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-900 text-white text-left">
                  <th className="py-3 px-3">Empresa</th>
                  <th className="py-3 px-3 text-right">CLT</th>
                  <th className="py-3 px-3 text-right">Salários</th>
                  <th className="py-3 px-3 text-right">Adicionais</th>
                  <th className="py-3 px-3 text-right">Folha</th>
                  <th className="py-3 px-3 text-right">Custo total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.nome} className="border-b border-slate-100 even:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{l.nome}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{l.lista.length}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{brl(l.t.salarios)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{brl(l.t.adicionais)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{brl(l.t.folha)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold">{brl(l.t.custo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-brand-50 font-extrabold border-t-2 border-brand-600">
                  <td className="py-3 px-3">TOTAL DO GRUPO</td>
                  <td className="py-3 px-3 text-right tabular-nums">{clt.length}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(geral.salarios)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(geral.adicionais)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(geral.folha)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(geral.custo)}</td>
                </tr>
              </tfoot>
            </table>
            <Rodape />
          </div>
        </article>
      </div>
    );
  }

  // ---------- UMA EMPRESA ----------
  if (!empresaAtual) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold text-slate-900">Relatório de Salários e Custo</h1>
        <div className="card text-slate-400 text-center py-10">Nenhuma empresa cadastrada ainda.</div>
      </div>
    );
  }

  const listaEmpresa = cltPorEmpresa(empresaAtual.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // ---------- unidades da empresa (ex.: as 7 unidades da BSE) ----------
  const nomeUnidadePorId: Record<string, string> = Object.fromEntries(
    ((unidades ?? []) as Unidade[]).map((u) => [u.id, u.nome])
  );
  const opcoesUnidade = Array.from(new Set(listaEmpresa.map((c) => c.unidade_id ?? SEM_UNIDADE)))
    .map((id) => ({ id, nome: id === SEM_UNIDADE ? "Sem unidade" : nomeUnidadePorId[id] ?? "Unidade" }))
    .sort((a, b) =>
      a.id === SEM_UNIDADE ? 1 : b.id === SEM_UNIDADE ? -1 : a.nome.localeCompare(b.nome, "pt-BR")
    );
  const temVariasUnidades = opcoesUnidade.length > 1;
  // null = "todas as unidades" (o padrão): o relatório mostra todas, uma depois da outra
  const unidadeEscolhida = temVariasUnidades
    ? opcoesUnidade.find((o) => o.id === searchParams.unidade) ?? null
    : null;
  const mostrarGrupos = temVariasUnidades && !unidadeEscolhida;

  const lista = unidadeEscolhida
    ? listaEmpresa.filter((c) => (c.unidade_id ?? SEM_UNIDADE) === unidadeEscolhida.id)
    : listaEmpresa;
  const grupos = (unidadeEscolhida ? [unidadeEscolhida] : opcoesUnidade).map((o) => {
    const doGrupo = lista.filter((c) => (c.unidade_id ?? SEM_UNIDADE) === o.id);
    return { ...o, lista: doGrupo, t: totalizar(doGrupo) };
  });
  const titulo = unidadeEscolhida
    ? `${empresaAtual.nome} — ${unidadeEscolhida.nome}`
    : mostrarGrupos
      ? `${empresaAtual.nome} — todas as unidades`
      : empresaAtual.nome;

  const t = totalizar(lista);
  const pct = (v: number) => (t.custo > 0 ? (v / t.custo) * 100 : 0);
  const media = lista.length > 0 ? t.custo / lista.length : 0;
  const salMedio = lista.length > 0 ? t.salarios / lista.length : 0;

  const hrefUnidade = (id?: string) =>
    `/relatorio-salarios?empresa=${empresaAtual.id}${id ? `&unidade=${id}` : ""}`;

  const chipsUnidade = temVariasUnidades ? (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-sm font-semibold text-slate-600 mr-1">Unidade:</span>
      <Link
        href={hrefUnidade()}
        className={`rounded-full px-3.5 py-1.5 text-sm font-bold border-2 transition-colors ${
          !unidadeEscolhida ? "bg-ink-900 text-white border-ink-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
        }`}
      >
        Todas as unidades
      </Link>
      {opcoesUnidade.map((o) => {
        const ativa = unidadeEscolhida?.id === o.id;
        return (
          <Link
            key={o.id}
            href={hrefUnidade(o.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold border-2 transition-colors ${
              ativa ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            {o.nome}
          </Link>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900">Relatório de Salários e Custo</h1>
        <p className="text-slate-500 text-sm">Para apresentar à diretoria — colaboradores CLT, por empresa e por unidade.</p>
      </div>
      {abas}
      {chipsUnidade}

      <article className="card !p-0 overflow-hidden">
        <Cabecalho titulo={titulo} competencia={competencia} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5 sm:px-6 bg-brand-50 border-b border-slate-200">
          <Kpi rotulo="Colaboradores CLT" valor={String(lista.length)} />
          <Kpi rotulo="Total de salários" valor={brl(t.salarios)} />
          <Kpi rotulo="Total de adicionais" valor={brl(t.adicionais)} />
          <Kpi rotulo="Custo total mensal da empresa" valor={brl(t.custo)} destaque />
        </div>

        <div className="p-5 sm:p-6">
          {mostrarGrupos && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink-800 mb-2">Resumo por unidade</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-900 text-white text-left">
                      <th className="py-3 px-3">Unidade</th>
                      <th className="py-3 px-3 text-right">CLT</th>
                      <th className="py-3 px-3 text-right">Salários</th>
                      <th className="py-3 px-3 text-right">Adicionais</th>
                      <th className="py-3 px-3 text-right">Custo total</th>
                      <th className="py-3 px-3 text-right">% do custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.id} className="border-b border-slate-100 even:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{g.nome}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{g.lista.length}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{brl(g.t.salarios)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{brl(g.t.adicionais)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold">{brl(g.t.custo)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{pct(g.t.custo).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-brand-50 font-extrabold border-t-2 border-brand-600">
                      <td className="py-3 px-3">TOTAL — {empresaAtual.nome}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{lista.length}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{brl(t.salarios)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{brl(t.adicionais)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{brl(t.custo)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold text-ink-800 mb-2">Relação de colaboradores</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-900 text-white text-left">
                  <th className="py-3 px-3">Nome</th>
                  <th className="py-3 px-3">Cargo</th>
                  <th className="py-3 px-3 text-right">Salário</th>
                  <th className="py-3 px-3 text-right">Adicionais</th>
                  <th className="py-3 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.id}>
                    {mostrarGrupos && g.lista.length > 0 && (
                      <tr className="bg-brand-100">
                        <td colSpan={5} className="py-2 px-3 font-extrabold text-brand-700">
                          {g.nome} · {g.lista.length} colaborador{g.lista.length === 1 ? "" : "es"}
                        </td>
                      </tr>
                    )}
                    {g.lista.map((c) => {
                      const ad = adicionaisDe(c);
                      return (
                        <tr key={c.id} className="border-b border-slate-100 even:bg-slate-50 align-top">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{c.nome}</td>
                          <td className="py-2.5 px-3 text-slate-600">{c.cargo ?? "—"}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{brl(c.salario_base ?? 0)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {brl(ad.total)}
                            <span className="block text-xs text-slate-500">
                              comissão/aux. {brl(ad.comissaoAux)} · benef. {brl(ad.beneficios)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                            {brl((c.salario_base ?? 0) + ad.total)}
                          </td>
                        </tr>
                      );
                    })}
                    {mostrarGrupos && g.lista.length > 0 && (
                      <tr className="bg-slate-100 font-bold border-b-2 border-slate-300">
                        <td className="py-2.5 px-3" colSpan={2}>
                          Subtotal {g.nome}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{brl(g.t.salarios)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{brl(g.t.adicionais)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{brl(g.t.folha)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhum colaborador CLT ativo nesta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-brand-50 font-extrabold border-t-2 border-brand-600">
                  <td className="py-3 px-3" colSpan={2}>
                    TOTAL — {lista.length} colaborador{lista.length === 1 ? "" : "es"}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(t.salarios)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(t.adicionais)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{brl(t.folha)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 items-start">
            <div>
              <h2 className="text-lg font-semibold text-ink-800 mb-2">Do pagamento ao custo real</h2>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-sm">
                <Linha rotulo="Salários + adicionais (folha)" valor={brl(t.folha)} forte />
                <Linha rotulo="INSS patronal (20%)" valor={brl(t.inss)} />
                <Linha rotulo="FGTS (8%)" valor={brl(t.fgts)} />
                <Linha rotulo="Provisões (13º, férias, ⅓ férias, multa FGTS)" valor={brl(t.passivo)} />
                <div className="flex justify-between gap-3 px-4 py-3 bg-ink-900 text-white font-extrabold">
                  <span>Custo total mensal</span>
                  <span className="text-gold-400">{brl(t.custo)}</span>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-ink-800 mb-2">Para onde vai o dinheiro</h2>
              <div className="h-4 rounded-full overflow-hidden flex bg-slate-200">
                <span style={{ width: `${pct(t.salarios)}%`, background: "#178a7b" }} />
                <span style={{ width: `${pct(t.adicionais)}%`, background: "#3fcab5" }} />
                <span style={{ width: `${pct(t.tributos)}%`, background: "#202856" }} />
                <span style={{ width: `${pct(t.passivo)}%`, background: "#f3c34c" }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                <Legenda cor="#178a7b" texto={`Salários ${pct(t.salarios).toFixed(0)}%`} />
                <Legenda cor="#3fcab5" texto={`Adicionais ${pct(t.adicionais).toFixed(0)}%`} />
                <Legenda cor="#202856" texto={`Encargos ${pct(t.tributos).toFixed(0)}%`} />
                <Legenda cor="#f3c34c" texto={`Provisões ${pct(t.passivo).toFixed(0)}%`} />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-sm mt-4">
                <Linha rotulo="Custo médio por colaborador" valor={brl(media)} forte />
                <Linha rotulo="Salário médio" valor={brl(salMedio)} forte />
              </div>
            </div>
          </div>

          <Rodape />
        </div>
      </article>
    </div>
  );
}

function Cabecalho({ titulo, competencia }: { titulo: string; competencia: string }) {
  return (
    <div className="bg-gradient-to-br from-ink-900 to-ink-700 text-white px-5 sm:px-6 py-5 flex flex-wrap justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold">{titulo}</h2>
        <p className="text-slate-300 text-sm mt-0.5">
          Relatório de salários e custo — colaboradores CLT · Competência: {competencia}
        </p>
      </div>
      <div className="text-right text-sm text-slate-300">
        <b className="block text-gold-400">Para a Diretoria</b>
        Emitido pelo RH · Grupo Seu Elias
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${destaque ? "bg-ink-900 border-ink-900" : "bg-white border-brand-100"}`}>
      <p className={`text-xs font-bold ${destaque ? "text-slate-300" : "text-slate-600"}`}>{rotulo}</p>
      <p className={`text-2xl font-bold mt-0.5 ${destaque ? "text-gold-400" : "text-ink-900"}`}>{valor}</p>
    </div>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5 border-b border-slate-200 last:border-b-0">
      <span>{rotulo}</span>
      <span className={forte ? "font-bold" : ""}>{valor}</span>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function Rodape() {
  return (
    <p className="text-xs text-slate-500 mt-5">
      Adicionais = comissão, auxílios, vale-transporte, VA/VR e assistências. Provisões = 13º, férias, ⅓ de férias e multa
      rescisória do FGTS, divididos por mês. Considera só colaboradores CLT ativos ou em experiência.
    </p>
  );
}
