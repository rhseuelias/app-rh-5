"use client";

import { useState, useTransition } from "react";
import { gerarPrimeiroPeriodoAquisitivo } from "@/lib/actions";

/** Só aparece quando o colaborador ainda não tem NENHUM período aquisitivo (caso raro — dado legado ou cadastro sem data de admissão na época). */
export default function GerarPrimeiroPeriodoAquisitivoBotao({ colaboradorId }: { colaboradorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);

  function gerar() {
    setResultado(null);
    startTransition(async () => {
      const r = await gerarPrimeiroPeriodoAquisitivo(colaboradorId);
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={gerar} disabled={isPending} className="btn-secondary text-sm whitespace-nowrap">
        {isPending ? "Gerando…" : "🔄 Gerar período aquisitivo (com base na admissão)"}
      </button>
      {resultado && (
        <p className={`text-[11px] max-w-[280px] ${resultado.ok ? "text-emerald-600" : "text-amber-600"}`}>
          {resultado.mensagem}
        </p>
      )}
    </div>
  );
}
