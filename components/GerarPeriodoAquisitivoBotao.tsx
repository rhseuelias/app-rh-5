"use client";

import { useState, useTransition } from "react";
import { gerarPeriodoAquisitivoManual } from "@/lib/actions";

export default function GerarPeriodoAquisitivoBotao({ colaboradorId }: { colaboradorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);

  function gerar() {
    setResultado(null);
    startTransition(async () => {
      const r = await gerarPeriodoAquisitivoManual(colaboradorId);
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={gerar} disabled={isPending} className="btn-secondary text-sm whitespace-nowrap">
        {isPending ? "Gerando…" : "🔄 Gerar período aquisitivo"}
      </button>
      {resultado && (
        <p className={`text-[11px] max-w-[260px] text-right ${resultado.ok ? "text-emerald-600" : "text-amber-600"}`}>
          {resultado.mensagem}
        </p>
      )}
    </div>
  );
}
