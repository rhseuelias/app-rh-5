"use client";

import { useState, useTransition } from "react";
import { gerarPrevisaoAnoTodos } from "@/lib/actions";

export default function GerarPrevisaoBotao() {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ criados: number; semVaga: string[] } | null>(null);

  function gerar() {
    setResultado(null);
    startTransition(async () => {
      const r = await gerarPrevisaoAnoTodos();
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button onClick={gerar} disabled={isPending} className="btn-primary whitespace-nowrap">
        {isPending ? "Gerando…" : "📅 Gerar previsão do próximo ano"}
      </button>
      {resultado && (
        <div className="text-xs text-right max-w-xs">
          {resultado.criados > 0 && (
            <p className="text-emerald-600">
              {resultado.criados} colaborador{resultado.criados !== 1 ? "es" : ""} com férias planejadas ✓
            </p>
          )}
          {resultado.semVaga.length > 0 && (
            <p className="text-amber-600 mt-1">
              Não achei data livre dentro do prazo pra: {resultado.semVaga.join(", ")} — programe manualmente.
            </p>
          )}
          {resultado.criados === 0 && resultado.semVaga.length === 0 && (
            <p className="text-slate-400">Todo mundo já tem férias marcadas ou não há período aquisitivo aberto.</p>
          )}
        </div>
      )}
    </div>
  );
}
