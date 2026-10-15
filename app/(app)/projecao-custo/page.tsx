import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import {
  custoMensalColaborador,
  custoDetalhado,
  percentualFolhaSobreFaturamento,
  LIMITE_SAUDAVEL_FOLHA_PCT,
} from "@/lib/calculos";
import { corDaEmpresa } from "@/lib/empresa-cores";
import EmpresaForm from "@/components/EmpresaForm";
import UnidadesForm from "@/components/UnidadesForm";
import FranquiasBSE, { type Franquia } from "@/components/projecao/FranquiasBSE";
import { cadastroEmpresaCompleto } from "@/lib/dados-empresa";
import RelatorioExecutivo from "@/components/projecao/RelatorioExecutivo";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

export default async function ProjecaoCustoPage({
  searchParams,
}: {
  searchParams?: { relatorio?: string };
}) {
  const supabase = createClient();

  const [{ data: colaboradores }, { data: empresas }, { data: unidades }, { data: franquias, error: erroFranquias }] =
    await Promise.all([
    supabase.from("colaboradores").select("*").in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("franquias_bse").select("*").order("nome", { ascending: true }),
  ]);

  const listaColaboradores = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = (empresas ?? []) as Empresa[];
  const listaUnidades = (unidades ?? []) as Unidade[];
  const listaFranquias = (franquias ?? []) as Franquia[];

  // Perfil "assistente" não vê custos: sem relatório executivo.
  const assistente = await souAssistente();
  if (searchParams?.relatorio === "1" && !assistente) {
    return <RelatorioExecutivo colaboradores={listaColaboradores} empresas={listaEmpresas} />;
  }

  // Se as colunas de dados cadastrais ainda não existem no banco (migration_032 não rodada),
  // avisa na tela em vez de falhar em silêncio.
  const cadastroPronto = listaEmpresas.length === 0 || "razao_social" in listaEmpresas[0];

  const porEmpresa = listaEmpresas.map((empresa) => {
    const colaboradoresDaEmpresa = listaColaboradores.filter((c) => c.empresa_id === empresa.id);
    const custoTotal = colaboradoresDaEmpresa.reduce((acc, c) => acc + custoMensalColaborador(c), 0);
    const pct = percentualFolhaSobreFaturamento(custoTotal, empresa.faturamento_mensal);

    const detalhado = colaboradoresDaEmpresa.reduce(
      (acc, c) => {
        const d = custoDetalhado(c);
        acc.remuneracao += d.remuneracao;
        acc.beneficios += d.beneficios;
        acc.tributos += d.tributos;
        acc.passivoTrabalhista += d.passivoTrabalhista;
        return acc;
      },
      { remuneracao: 0, beneficios: 0, tributos: 0, passivoTrabalhista: 0 }
    );

    return { empresa, custoTotal, pct, headcount: colaboradoresDaEmpresa.length, detalhado };
  });

  const semEmpresa = listaColaboradores.filter((c) => !c.empresa_id);
  const custoSemEmpresa = semEmpresa.reduce((acc, c) => acc + custoMensalColaborador(c), 0);

  const custoTotalGeral = listaColaboradores.reduce((acc, c) => acc + custoMensalColaborador(c), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projeção de Custo</h1>
          <p className="text-slate-500 text-sm">
            Custo de folha (remuneração + encargos + passivo trabalhista) por empresa
          </p>
        </div>
        {!assistente && (
          <a
            href="/projecao-custo?relatorio=1"
            className="rounded-full px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "#0f5c55" }}
          >
            Relatório executivo
          </a>
        )}
      </div>

      <div className="card">
        <p className="text-sm text-slate-500">Custo total de folha (todas as empresas)</p>
        <p className="text-3xl font-semibold text-slate-900 mt-1">
          {custoTotalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Inclui remuneração, benefícios, INSS patronal (20%), FGTS (8%) e passivo trabalhista
          proporcional (13º, férias, 1/3 e multa rescisória).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {porEmpresa.map(({ empresa, custoTotal, pct, headcount, detalhado }, i) => {
          const cor = corDaEmpresa(empresa.nome, i);
          return (
            <div
              key={empresa.id}
              className="card"
              style={{ borderTopWidth: 8, borderTopStyle: "solid", borderTopColor: cor.cor }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2"
                    style={{ background: cor.bg, color: cor.cor }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: cor.cor }} />
                    {empresa.nome}
                  </span>
                  <h2 className="font-medium text-slate-900">{empresa.nome}</h2>
                  <p className="text-xs text-slate-400">{headcount} colaboradores</p>
                </div>
                {pct !== null && (
                  <span
                    className={`badge ${
                      pct <= LIMITE_SAUDAVEL_FOLHA_PCT
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {pct.toFixed(1)}% do faturamento
                  </span>
                )}
              </div>
              <p className="text-2xl font-semibold text-slate-900 mt-3">
                {custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Faturamento cadastrado:{" "}
                {empresa.faturamento_mensal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 mt-4 border-t border-slate-100 pt-3">
                <dt>Remuneração</dt>
                <dd className="text-right text-slate-700">
                  {detalhado.remuneracao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </dd>
                <dt>Benefícios</dt>
                <dd className="text-right text-slate-700">
                  {detalhado.beneficios.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </dd>
                <dt>Tributos (INSS + FGTS)</dt>
                <dd className="text-right text-slate-700">
                  {detalhado.tributos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </dd>
                <dt>Passivo trabalhista</dt>
                <dd className="text-right text-slate-700">
                  {detalhado.passivoTrabalhista.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </dd>
              </dl>

              <p className="text-xs text-slate-400 mt-3 border-t border-slate-100 pt-3">
                {listaUnidades.filter((u) => u.empresa_id === empresa.id).length} filial(is)/unidade(s).{" "}
                <a href="#empresas-unidades" className="text-brand-600 hover:underline">
                  Dados e filiais: Empresas / Unidades ↓
                </a>
              </p>
            </div>
          );
        })}
      </div>

      {semEmpresa.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            {semEmpresa.length} colaborador(es) sem empresa vinculada — custo de{" "}
            {custoSemEmpresa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} não
            entra em nenhum indicador acima.
          </p>
        </div>
      )}

      <FranquiasBSE franquias={listaFranquias} tabelaFaltando={Boolean(erroFranquias)} />

      <div id="empresas-unidades" className="card scroll-mt-6">
        <h2 className="font-medium text-slate-900">Empresas / Unidades</h2>
        <p className="text-sm text-slate-500 mb-3">
          Cadastre aqui os dados de cada empresa e unidade (razão social, CNPJ e endereço). Eles servem de fonte para
          os documentos do app, como o Aviso Prévio, e saem preenchidos sozinhos.
        </p>

        {!cadastroPronto && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-4">
            Falta liberar os campos de endereço no Supabase. Rode o arquivo <strong>migration_032_cadastro_empresas.sql</strong>{" "}
            no SQL Editor do Supabase e depois recarregue esta página. Enquanto isso, o endereço não é gravado.
          </div>
        )}

        <div className="space-y-4">
          {listaEmpresas.map((e) => {
            const unidadesDaEmpresa = listaUnidades.filter((u) => u.empresa_id === e.id);
            const completo = cadastroEmpresaCompleto(e);
            return (
              <details key={e.id} className="border border-slate-100 rounded-lg p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700 flex items-center gap-2 flex-wrap">
                  <span>{e.nome}</span>
                  <span className="text-xs font-normal text-slate-400">
                    {unidadesDaEmpresa.length} unidade{unidadesDaEmpresa.length !== 1 ? "s" : ""}
                  </span>
                  {completo ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Dados completos</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-800">Faltam dados</span>
                  )}
                </summary>
                <div className="mt-3">
                  <EmpresaForm empresa={e} unidadesCount={unidadesDaEmpresa.length} />
                </div>
                <UnidadesForm empresaId={e.id} unidades={unidadesDaEmpresa} />
              </details>
            );
          })}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-brand-600">+ Cadastrar nova empresa/unidade</summary>
          <div className="mt-3">
            <EmpresaForm />
          </div>
        </details>
      </div>
    </div>
  );
}
