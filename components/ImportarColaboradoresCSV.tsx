"use client";

import { useState, useTransition } from "react";
import { importarColaboradoresCSV, type ResultadoImportacaoColaboradores } from "@/lib/actions";

export default function ImportarColaboradoresCSV() {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoColaboradores | null>(null);

  function enviar(formData: FormData) {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await importarColaboradoresCSV(formData);
        setResultado(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao importar o CSV.");
      }
    });
  }

  return (
    <form action={enviar} className="space-y-3">
      <p className="text-xs text-slate-500">
        Envie o CSV com os dados da planilha (nome, admissão, cargo, departamento, empresa,
        unidade, salário etc.). Quem já estiver cadastrado (mesmo nome) é pulado
        automaticamente, pra não duplicar se você enviar o arquivo de novo.
      </p>
      <div>
        <label className="label">Arquivo CSV</label>
        <input type="file" name="arquivo" accept=".csv,text/csv" required className="input" />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {resultado && (
        <div className="text-sm space-y-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-emerald-700 font-medium">
            {resultado.criados} colaborador{resultado.criados === 1 ? "" : "es"} importado
            {resultado.criados === 1 ? "" : "s"} com sucesso.
          </p>
          {resultado.duplicados.length > 0 && (
            <p className="text-slate-600">
              <span className="font-medium">{resultado.duplicados.length} já existiam</span>{" "}
              (pulados): {resultado.duplicados.join(", ")}
            </p>
          )}
          {resultado.semEmpresaOuUnidade.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">
                {resultado.semEmpresaOuUnidade.length} importados sem empresa/unidade
              </span>{" "}
              (nome da empresa/unidade no arquivo não bateu com nenhuma cadastrada — edite
              manualmente na ficha de cada um): {resultado.semEmpresaOuUnidade.join(", ")}
            </p>
          )}
          {resultado.erros.length > 0 && (
            <p className="text-red-600">
              <span className="font-medium">{resultado.erros.length} com erro:</span>{" "}
              {resultado.erros.join("; ")}
            </p>
          )}
        </div>
      )}
      <button type="submit" disabled={isPending} className="btn-secondary text-sm">
        {isPending ? "Importando..." : "Importar CSV"}
      </button>
    </form>
  );
}
