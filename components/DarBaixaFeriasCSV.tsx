"use client";

import { useState, useTransition } from "react";
import { darBaixaFeriasCSV, type ResultadoBaixaFerias } from "@/lib/actions";

export default function DarBaixaFeriasCSV() {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoBaixaFerias | null>(null);

  function enviar(formData: FormData) {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await darBaixaFeriasCSV(formData);
        setResultado(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao importar o CSV.");
      }
    });
  }

  return (
    <form action={enviar} className="space-y-3">
      <p className="text-xs text-slate-500">
        Pra registrar de uma vez só quem já tirou férias fora do sistema: envie um CSV com as
        colunas <strong>Nome</strong>, <strong>Data Início</strong> e <strong>Data Fim</strong>{" "}
        (datas em dd/mm/aaaa — Data Fim é o último dia de férias, não o dia da volta ao trabalho).
        Uma coluna opcional <strong>Vendeu abono</strong> aceita sim/não. Cada linha já entra como
        férias concluída, descontando do período aquisitivo em aberto do colaborador.
      </p>
      <div>
        <label className="label">Arquivo CSV</label>
        <input type="file" name="arquivo" accept=".csv,text/csv" required className="input" />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {resultado && (
        <div className="text-sm space-y-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-emerald-700 font-medium">
            {resultado.processadas} período{resultado.processadas === 1 ? "" : "s"} de férias dado
            {resultado.processadas === 1 ? "" : "s"} baixa com sucesso.
          </p>
          {resultado.colaboradorNaoEncontrado.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">
                {resultado.colaboradorNaoEncontrado.length} nome(s) não encontrados
              </span>{" "}
              entre os colaboradores cadastrados (confira a grafia): {resultado.colaboradorNaoEncontrado.join(", ")}
            </p>
          )}
          {resultado.semPeriodoAberto.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">
                {resultado.semPeriodoAberto.length} sem período aquisitivo em aberto
              </span>{" "}
              (confira a data de admissão na ficha do colaborador): {resultado.semPeriodoAberto.join(", ")}
            </p>
          )}
          {resultado.semSaldo.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">{resultado.semSaldo.length} sem saldo suficiente</span>:{" "}
              {resultado.semSaldo.join("; ")}
            </p>
          )}
          {resultado.erros.length > 0 && (
            <p className="text-red-600">
              <span className="font-medium">{resultado.erros.length} com erro:</span> {resultado.erros.join("; ")}
            </p>
          )}
        </div>
      )}
      <button type="submit" disabled={isPending} className="btn-secondary text-sm">
        {isPending ? "Processando..." : "Dar baixa"}
      </button>
    </form>
  );
}
