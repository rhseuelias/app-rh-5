"use client";

import { atualizarStatusFerias } from "@/lib/actions";
import { useTransition } from "react";

export default function FeriasAcoes({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  function mudar(novo: string) {
    startTransition(() => atualizarStatusFerias(id, novo));
  }

  if (status === "concluido" || status === "cancelado") return null;

  return (
    <div className="flex gap-2 justify-end">
      {status === "planejada" && (
        <button disabled={isPending} onClick={() => mudar("aprovado")} className="text-xs text-brand-600">
          Confirmar
        </button>
      )}
      {status === "solicitado" && (
        <button disabled={isPending} onClick={() => mudar("aprovado")} className="text-xs text-brand-600">
          Aprovar
        </button>
      )}
      {status === "aprovado" && (
        <button disabled={isPending} onClick={() => mudar("concluido")} className="text-xs text-emerald-600">
          Marcar concluída
        </button>
      )}
      <button disabled={isPending} onClick={() => mudar("cancelado")} className="text-xs text-red-500">
        Cancelar
      </button>
    </div>
  );
}
