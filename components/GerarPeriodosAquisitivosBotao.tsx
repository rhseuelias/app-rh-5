"use client";

import { useState, useTransition } from "react";
import { gerarPeriodosAquisitivosFaltantes } from "@/lib/actions";

export default function GerarPeriodosAquisitivosBotao() {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ criados: number; semDataAdmissao: string[] } | null>(null);

  function gerar() {
    setResultado(null);
    startTransition(async () => {
      const r = await gerarPeriodosAquisitivosFaltantes();
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button onClick={gerar} disabled={isPending} className="btn-secondary text-sm whitespace-nowrap">
        {isPending ? "Gerando…" : "🔄 Gerar períodos aquisitivos faltantes"}
      </button>
      {resultado && (
        <div className="text-xs text-right max-w-sm">
          {resultado.criados > 0 && (
            <p className="text-emerald-600">
              {resultado.criados} período{resultado.criados !== 1 ? "s" : ""} aquisitivo{resultado.criados !== 1 ? "s" : ""} gerado{resultado.criados !== 1 ? "s" : ""} ✓
            </p>
          )}
          {resultado.semDataAdmissao.length > 0 && (
            <p className="text-amber-600 mt-1">
              Sem data de admissão cadastrada: {resultado.semDataAdmissao.join(", ")} — complete a ficha antes.
            </p>
          )}
          {resultado.criados === 0 && resultado.semDataAdmissao.length === 0 && (
            <p className="text-slate-400">Todo mundo já tem período aquisitivo aberto.</p>
          )}
        </div>
      )}
    </div>
  );
}
