"use client";

import { useState, useTransition } from "react";
import { corrigirPeriodosAquisitivosDatas } from "@/lib/actions";

export default function CorrigirPeriodosAquisitivosBotao({ colaboradorId }: { colaboradorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ corrigidos: number; total: number } | null>(null);

  function corrigir() {
    if (
      !confirm(
        "Isso vai revisar os períodos aquisitivos desse colaborador e corrigir o dia de fim (e o limite de concessão) dos que ainda estiverem com o cálculo antigo, errado. Períodos já ajustados manualmente não são alterados. Confirma?"
      )
    ) {
      return;
    }
    setResultado(null);
    startTransition(async () => {
      const r = await corrigirPeriodosAquisitivosDatas(colaboradorId);
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={corrigir}
        disabled={isPending}
        className="btn-secondary text-sm whitespace-nowrap"
      >
        {isPending ? "Corrigindo…" : "🛠️ Corrigir datas"}
      </button>
      {resultado && (
        <p className="text-[11px] text-emerald-600 max-w-[220px] text-right leading-snug">
          {resultado.corrigidos} de {resultado.total} período{resultado.total === 1 ? "" : "s"} corrigido
          {resultado.corrigidos === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
