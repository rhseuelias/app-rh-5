import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, TipoColaborador, Unidade } from "@/types/db";
import { formatarDataBR } from "@/lib/calculos";
import { hojeBrasilia } from "@/lib/desligamento";
import { corDaEmpresa } from "@/lib/empresa-cores";
import ImprimirBotao from "@/components/ImprimirBotao";
import NomeColaborador from "@/components/NomeColaborador";

export const dynamic = "force-dynamic";

// Relatório de todos os colaboradores: por unidade e, dentro de cada unidade,
// separado em CLT, PJ e Estagiários(as). Não mostra salário nem custo, então
// qualquer perfil pode abrir. Para PDF, use o botão "Imprimir / Salvar PDF".

type Pessoa = Pick<
  Colaborador,
  | "id"
  | "nome"
  | "tipo"
  | "cargo"
  | "departamento"
  | "data_admissao"
  | "contrato_inicio"
  | "status"
  | "data_desligamento"
  | "empresa_id"
  | "unidade_id"
>;

const GRUPOS: { tipo: TipoColaborador; titulo: string }[] = [
  { tipo: "CLT", titulo: "CLT" },
  { tipo: "PJ", titulo: "PJ" },
  { tipo: "Estagio", titulo: "Estagiários(as)" },
];

const STATUS_LABEL: Record<string, string> = {
  experiencia: "Experiência",
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_COR: Record<string, string> = {
  experiencia: "bg-amber-50 text-amber-700",
  ativo: "bg-emerald-50 text-emerald-700",
  afastado: "bg-slate-100 text-slate-600",
  desligado: "bg-red-50 text-red-700",
};

interface Secao {
  chave: string;
  empresa: Empresa | null;
  corIndice: number;
  /** nome da unidade; null quando a empresa não tem unidades cadastradas */
  unidadeNome: string | null;
  titulo: string;
  pessoas: Pessoa[];
}

const emOrdem = (a: Pessoa, b: Pessoa) => a.nome.localeCompare(b.nome, "pt-BR");
const contar = (lista: Pessoa[], tipo: TipoColaborador) => lista.filter((p) => p.tipo === tipo).length;

function endereco(empresa?: string, desligados?: boolean) {
  const q = new URLSearchParams();
  if (empresa) q.set("empresa", empresa);
  if (desligados) q.set("desligados", "1");
  const texto = q.toString();
  return `/colaboradores/relatorio${texto ? `?${texto}` : ""}`;
}

export default async function RelatorioColaboradoresPage({
  searchParams,
}: {
  searchParams: { empresa?: string; desligados?: string };
}) {
  const supabase = createClient();
  const [{ data }, { data: empresasData }, { data: unidadesData }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select(
        "id, nome, tipo, cargo, departamento, data_admissao, contrato_inicio, status, data_desligamento, empresa_id, unidade_id"
      ),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const empresas = ((empresasData ?? []) as Empresa[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const unidades = (unidadesData ?? []) as Unidade[];
  const incluirDesligados = searchParams.desligados === "1";
  const empresaFiltro = empresas.find((e) => e.id === searchParams.empresa) ?? null;

  const pessoas = ((data ?? []) as Pessoa[])
    .filter((p) => incluirDesligados || p.status !== "desligado")
    .filter((p) => !empresaFiltro || p.empresa_id === empresaFiltro.id)
    .sort(emOrdem);

  // ---------- agrupa por unidade (ou por empresa, quando não há unidade) ----------
  const unidadePorId = new Map(unidades.map((u) => [u.id, u]));
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));

  const grupos = new Map<string, Pessoa[]>();
  for (const p of pessoas) {
    const chave =
      p.unidade_id && unidadePorId.has(p.unidade_id)
        ? `u:${p.unidade_id}`
        : p.empresa_id && empresaPorId.has(p.empresa_id)
          ? `e:${p.empresa_id}`
          : "sem";
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }

  const secoes: Secao[] = [];
  empresas.forEach((emp, i) => {
    const unidadesDaEmpresa = unidades
      .filter((u) => u.empresa_id === emp.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    for (const u of unidadesDaEmpresa) {
      const lista = grupos.get(`u:${u.id}`);
      if (lista?.length) {
        secoes.push({ chave: `u:${u.id}`, empresa: emp, corIndice: i, unidadeNome: u.nome, titulo: u.nome, pessoas: lista });
      }
    }
    const semUnidade = grupos.get(`e:${emp.id}`);
    if (semUnidade?.length) {
      const nomeUnidade = unidadesDaEmpresa.length > 0 ? "Sem unidade definida" : null;
      secoes.push({
        chave: `e:${emp.id}`,
        empresa: emp,
        corIndice: i,
        unidadeNome: nomeUnidade,
        titulo: nomeUnidade ?? emp.nome,
        pessoas: semUnidade,
      });
    }
  });
  // unidades que não pertencem a nenhuma empresa da lista
  for (const u of unidades.filter((x) => !x.empresa_id || !empresaPorId.has(x.empresa_id))) {
    const lista = grupos.get(`u:${u.id}`);
    if (lista?.length) {
      secoes.push({ chave: `u:${u.id}`, empresa: null, corIndice: 0, unidadeNome: u.nome, titulo: u.nome, pessoas: lista });
    }
  }
  const semVinculo = grupos.get("sem");
  if (semVinculo?.length) {
    secoes.push({
      chave: "sem",
      empresa: null,
      corIndice: 0,
      unidadeNome: null,
      titulo: "Sem empresa/unidade vinculada",
      pessoas: semVinculo,
    });
  }

  const emitidoEm = formatarDataBR(hojeBrasilia());
  const filtroTexto = `${empresaFiltro ? empresaFiltro.nome : "Todas as empresas"} · ${
    incluirDesligados ? "incluindo desligados" : "sem desligados"
  }`;

  return (
    <div className="space-y-5" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <div className="print:hidden space-y-1">
        <Link href="/colaboradores" className="text-sm text-brand-600 hover:underline">
          ← Voltar para Colaboradores
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Relatório de Colaboradores</h1>
        <p className="text-slate-500 text-sm">
          Todos os colaboradores por unidade, com CLT, PJ e Estagiários(as) separados dentro de cada unidade.
        </p>
      </div>

      {/* filtros e botão de PDF (não saem na impressão) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={endereco(undefined, incluirDesligados)}
          className={`rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors ${
            !empresaFiltro
              ? "bg-ink-900 text-white border-ink-900"
              : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
          }`}
        >
          Todas as empresas
        </Link>
        {empresas.map((e, i) => {
          const ativa = empresaFiltro?.id === e.id;
          const cor = corDaEmpresa(e.nome, i);
          return (
            <Link
              key={e.id}
              href={endereco(e.id, incluirDesligados)}
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
          href={endereco(empresaFiltro?.id, !incluirDesligados)}
          className={`rounded-full px-4 py-2 text-sm font-medium border-2 transition-colors ${
            incluirDesligados
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          {incluirDesligados ? "✓ Incluindo desligados" : "Incluir desligados"}
        </Link>
        <div className="ml-auto">
          <ImprimirBotao />
        </div>
      </div>

      {/* ---------- cabeçalho + resumo ---------- */}
      <article className="card !p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-ink-900 to-ink-700 text-white px-5 sm:px-6 py-5 flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Relatório de Colaboradores</h2>
            <p className="text-slate-300 text-sm mt-0.5">{filtroTexto}</p>
          </div>
          <div className="text-right text-sm text-slate-300">
            <b className="block text-gold-300">Grupo Seu Elias</b>
            Emitido pelo RH em {emitidoEm}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi rotulo="Total de colaboradores" valor={pessoas.length} destaque />
            <Kpi rotulo="CLT" valor={contar(pessoas, "CLT")} />
            <Kpi rotulo="PJ" valor={contar(pessoas, "PJ")} />
            <Kpi rotulo="Estagiários(as)" valor={contar(pessoas, "Estagio")} />
          </div>

          {secoes.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nenhum colaborador encontrado para este filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-900 text-white text-left">
                    <th className="py-2.5 px-3">Empresa</th>
                    <th className="py-2.5 px-3">Unidade</th>
                    <th className="py-2.5 px-3 text-right">CLT</th>
                    <th className="py-2.5 px-3 text-right">PJ</th>
                    <th className="py-2.5 px-3 text-right">Estagiários(as)</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {secoes.map((s) => (
                    <tr key={s.chave} className="border-b border-slate-100 even:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-900">{s.empresa?.nome ?? "—"}</td>
                      <td className="py-2 px-3 text-slate-700">{s.unidadeNome ?? "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{contar(s.pessoas, "CLT")}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{contar(s.pessoas, "PJ")}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{contar(s.pessoas, "Estagio")}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold">{s.pessoas.length}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-50 font-extrabold border-t-2 border-brand-600">
                    <td className="py-2.5 px-3" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{contar(pessoas, "CLT")}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{contar(pessoas, "PJ")}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{contar(pessoas, "Estagio")}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{pessoas.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </article>

      {/* ---------- uma seção por unidade (na impressão, cada unidade começa numa folha) ---------- */}
      {secoes.map((s) => {
        const cor = s.empresa ? corDaEmpresa(s.empresa.nome, s.corIndice) : { cor: "#64748b", bg: "#f1f5f9" };
        return (
          <section
            key={s.chave}
            className="card !p-0 overflow-hidden"
            style={{ borderTopWidth: 8, borderTopStyle: "solid", borderTopColor: cor.cor, breakBefore: "page" }}
          >
            <div className="px-5 sm:px-6 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                {s.empresa && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-1.5"
                    style={{ background: cor.bg, color: cor.cor }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: cor.cor }} />
                    {s.empresa.nome}
                  </span>
                )}
                <h2 className="text-xl font-bold text-slate-900">{s.titulo}</h2>
              </div>
              <p className="text-sm text-slate-500 text-right">
                <b className="text-slate-800">{s.pessoas.length}</b> colaborador{s.pessoas.length !== 1 ? "es" : ""}
                <br />
                CLT {contar(s.pessoas, "CLT")} · PJ {contar(s.pessoas, "PJ")} · Estagiários(as){" "}
                {contar(s.pessoas, "Estagio")}
              </p>
            </div>

            <div className="px-5 sm:px-6 pb-5 space-y-5">
              {GRUPOS.map((g) => {
                const lista = s.pessoas.filter((p) => p.tipo === g.tipo);
                if (lista.length === 0) return null;
                return (
                  <div key={g.tipo} className="overflow-x-auto" style={{ breakInside: "avoid-page" }}>
                    <h3 className="text-sm font-bold text-ink-800 mb-1.5">
                      {g.titulo} <span className="font-medium text-slate-400">({lista.length})</span>
                    </h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-ink-900 text-white text-left text-xs">
                          <th className="py-2 px-3 w-10">Nº</th>
                          <th className="py-2 px-3">Nome</th>
                          <th className="py-2 px-3">Cargo</th>
                          <th className="py-2 px-3">Departamento</th>
                          <th className="py-2 px-3">{g.tipo === "PJ" ? "Início do contrato" : "Admissão"}</th>
                          <th className="py-2 px-3">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((p, i) => (
                          <tr key={p.id} className="border-b border-slate-100 even:bg-slate-50">
                            <td className="py-1.5 px-3 text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="py-1.5 px-3 font-medium text-slate-900">
                              <NomeColaborador id={p.id}>{p.nome}</NomeColaborador>
                            </td>
                            <td className="py-1.5 px-3 text-slate-700">{p.cargo ?? "—"}</td>
                            <td className="py-1.5 px-3 text-slate-700">{p.departamento ?? "—"}</td>
                            <td className="py-1.5 px-3 text-slate-700 tabular-nums">
                              {formatarDataBR(g.tipo === "PJ" ? p.contrato_inicio ?? p.data_admissao : p.data_admissao)}
                            </td>
                            <td className="py-1.5 px-3">
                              <span className={`badge !text-[11px] !px-2.5 !py-0.5 ${STATUS_COR[p.status] ?? ""}`}>
                                {STATUS_LABEL[p.status] ?? p.status}
                              </span>
                              {p.status === "desligado" && p.data_desligamento && (
                                <span className="ml-1.5 text-[11px] text-slate-400">
                                  em {formatarDataBR(p.data_desligamento)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${destaque ? "bg-ink-900 border-ink-900" : "bg-white border-brand-100"}`}>
      <p className={`text-xs font-bold ${destaque ? "text-slate-300" : "text-slate-600"}`}>{rotulo}</p>
      <p className={`text-2xl font-bold mt-0.5 ${destaque ? "text-gold-300" : "text-ink-900"}`}>{valor}</p>
    </div>
  );
}
