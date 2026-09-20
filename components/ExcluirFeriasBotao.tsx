"use client";

import { useTransition } from "react";
import { excluirFeriasCancelada } from "@/lib/actions";

/** Só aparece em registros de férias já cancelados — exclusão em definitivo do histórico. */
export default function ExcluirFeriasBotao({ id, colaboradorId }: { id: string; colaboradorId: string }) {
  const [isPending, startTransition] = useTransition();

  function excluir() {
    if (!confirm("Excluir esse registro cancelado do histórico? Essa ação não pode ser desfeita.")) return;
    startTransition(() => {
      excluirFeriasCancelada(id, colaboradorId);
    });
  }

  return (
    <button
      type="button"
      onClick={excluir}
      disabled={isPending}
      className="text-[11px] text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 whitespace-nowrap"
    >
      {isPending ? "excluindo…" : "excluir"}
    </button>
  );
}
