"use client";

import { useState, useTransition } from "react";
import {
  importarColaboradoresCSV,
  importarFichasGoogleFormsCSV,
  type ResultadoImportacaoColaboradores,
  type ResultadoImportacaoFichas,
} from "@/lib/actions";

type TipoImportacao = "CLT" | "PJ" | "planilha";

const OPCOES: { valor: TipoImportacao; titulo: string; descricao: string }[] = [
  {
    valor: "CLT",
    titulo: "Ficha de Admissão — CLT",
    descricao: "Respostas do formulário CLT do Google Forms",
  },
  {
    valor: "PJ",
    titulo: "Ficha de Admissão — PJ",
    descricao: "Respostas do formulário PJ do Google Forms",
  },
  {
    valor: "planilha",
    titulo: "Planilha de salários",
    descricao: "Formato antigo (nome, admissão, cargo, salário...)",
  },
];

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export default function ImportarColaboradoresCSV() {
  const [isPending, startTransition] = useTransition();
  const [tipo, setTipo] = useState<TipoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoColaboradores | null>(null);
  const [resultadoFichas, setResultadoFichas] = useState<ResultadoImportacaoFichas | null>(null);

  function escolher(novo: TipoImportacao) {
    setTipo(novo);
    setErro(null);
    setResultado(null);
    setResultadoFichas(null);
  }

  function enviar(formData: FormData) {
    if (!tipo) {
      setErro("Escolha primeiro se o arquivo é CLT, PJ ou a planilha de salários.");
      return;
    }
    setErro(null);
    setResultado(null);
    setResultadoFichas(null);
    startTransition(async () => {
      if (tipo === "planilha") {
        try {
          setResultado(await importarColaboradoresCSV(formData));
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Falha ao importar o CSV.");
        }
        return;
      }

      formData.set("tipo", tipo);
      const r = await importarFichasGoogleFormsCSV(formData);
      if (r.ok) setResultadoFichas(r.resultado);
      else setErro(r.erro);
    });
  }

  const doGoogleForms = tipo === "CLT" || tipo === "PJ";

  return (
    <form action={enviar} className="space-y-5">
      <fieldset>
        <legend className="text-base font-semibold text-slate-800 mb-2">
          1. Que arquivo você vai importar?
        </legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
          {OPCOES.map((opcao) => {
            const selecionada = tipo === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                role="radio"
                aria-checked={selecionada}
                onClick={() => escolher(opcao.valor)}
                className={`text-left rounded-2xl border-2 p-4 transition-colors ${
                  selecionada
                    ? "border-brand-600 bg-brand-50"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selecionada ? "border-brand-600" : "border-slate-400"
                    }`}
                  >
                    {selecionada && <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                  </span>
                  <span className="text-base font-semibold text-slate-900">{opcao.titulo}</span>
                </span>
                <span className="block text-sm text-slate-600 mt-1 ml-7">{opcao.descricao}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {tipo && (
        <div className="space-y-3">
          <p className="text-base font-semibold text-slate-800">2. Envie o arquivo CSV</p>

          {doGoogleForms ? (
            <div className="text-sm text-slate-600 space-y-1.5 bg-slate-50 rounded-xl p-3">
              <p>
                <strong>Como baixar:</strong> no Google Forms, abra o formulário{" "}
                <strong>Ficha de Admissão — {tipo}</strong>, vá em <strong>Respostas</strong>, clique
                nos <strong>três pontinhos (⋮)</strong> e depois em <strong>Baixar respostas (.csv)</strong>.
              </p>
              <p>
                O Google baixa um arquivo <strong>.zip</strong>. Dê dois cliques nele pra abrir e envie
                aqui o arquivo <strong>.csv</strong> que estiver dentro.
              </p>
              <p>
                Quem ainda não tem cadastro entra como <strong>{tipo}</strong>. Quem já estiver
                cadastrado (mesmo {tipo === "PJ" ? "CNPJ" : "CPF"} ou mesmo nome) não é duplicado: a
                ficha dele é <strong>atualizada</strong> com as respostas do formulário. Pergunta
                deixada em branco não apaga o que já estava na ficha.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">
              CSV com os dados da planilha (nome, admissão, cargo, departamento, empresa, unidade,
              salário etc.). Quem já estiver cadastrado (mesmo nome) é pulado automaticamente.
            </p>
          )}

          <div>
            <label className="label" htmlFor="arquivo-importacao">
              Arquivo CSV
            </label>
            <input
              id="arquivo-importacao"
              type="file"
              name="arquivo"
              accept=".csv,text/csv"
              required
              className="input"
            />
          </div>

          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending
              ? "Importando..."
              : doGoogleForms
                ? `Importar como ${tipo}`
                : "Importar planilha"}
          </button>
        </div>
      )}

      {erro && (
        <p className="text-base text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{erro}</p>
      )}

      {resultadoFichas && (
        <div className="text-sm space-y-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-base text-emerald-800 font-semibold">
            {plural(resultadoFichas.criados, "colaborador novo cadastrado", "colaboradores novos cadastrados")}{" "}
            como {resultadoFichas.tipo}.
          </p>
          {resultadoFichas.dependentesCriados > 0 && (
            <p className="text-slate-700">
              {plural(resultadoFichas.dependentesCriados, "dependente cadastrado", "dependentes cadastrados")}{" "}
              junto.
            </p>
          )}
          {resultadoFichas.atualizados.length > 0 && (
            <p className="text-base text-emerald-800 font-semibold">
              {plural(
                resultadoFichas.atualizados.length,
                "já estava cadastrado e teve a ficha atualizada",
                "já estavam cadastrados e tiveram a ficha atualizada"
              )}
              : <span className="font-normal">{resultadoFichas.atualizados.join(", ")}</span>
            </p>
          )}
          {resultadoFichas.semEmpresaOuUnidade.length > 0 && (
            <p className="text-amber-800">
              <span className="font-medium">Empresa ou unidade não encontrada</span> (o nome respondido
              no formulário não bateu com nenhuma cadastrada — ajuste na ficha de cada um):{" "}
              {resultadoFichas.semEmpresaOuUnidade.join(", ")}
            </p>
          )}
          {resultadoFichas.avisos.length > 0 && (
            <div className="text-amber-800">
              <p className="font-medium">Conferir:</p>
              <ul className="list-disc ml-5">
                {resultadoFichas.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </div>
          )}
          {resultadoFichas.perguntasSemCampo.length > 0 && (
            <p className="text-slate-600">
              Perguntas sem campo próprio no cadastro (as respostas foram para as Observações):{" "}
              {resultadoFichas.perguntasSemCampo.join(", ")}
            </p>
          )}
          {resultadoFichas.erros.length > 0 && (
            <p className="text-red-700">
              <span className="font-medium">{resultadoFichas.erros.length} com erro:</span>{" "}
              {resultadoFichas.erros.join("; ")}
            </p>
          )}
        </div>
      )}

      {resultado && (
        <div className="text-sm space-y-1.5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-base text-emerald-800 font-semibold">
            {plural(resultado.criados, "colaborador importado", "colaboradores importados")} com sucesso.
          </p>
          {resultado.duplicados.length > 0 && (
            <p className="text-slate-700">
              <span className="font-medium">{resultado.duplicados.length} já existiam</span> (pulados):{" "}
              {resultado.duplicados.join(", ")}
            </p>
          )}
          {resultado.semEmpresaOuUnidade.length > 0 && (
            <p className="text-amber-800">
              <span className="font-medium">
                {resultado.semEmpresaOuUnidade.length} importados sem empresa/unidade
              </span>{" "}
              (nome da empresa/unidade no arquivo não bateu com nenhuma cadastrada — edite manualmente
              na ficha de cada um): {resultado.semEmpresaOuUnidade.join(", ")}
            </p>
          )}
          {resultado.erros.length > 0 && (
            <p className="text-red-700">
              <span className="font-medium">{resultado.erros.length} com erro:</span>{" "}
              {resultado.erros.join("; ")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
