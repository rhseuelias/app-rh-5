"use client";

import { useTransition } from "react";
import { excluirFeriasHistorico } from "@/lib/actions";

/** Ícone de lixeira, discreto — exclui qualquer registro do histórico de férias, de qualquer status. */
export default function ExcluirHistoricoFeriasBotao({
  id,
  colaboradorId,
  status,
}: {
  id: string;
  colaboradorId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  function excluir() {
    const aviso =
      status === "concluido" || status === "aprovado"
        ? "Excluir esse registro do histórico? Se ele estava contando pro saldo do período aquisitivo, o período volta a ficar em aberto. Essa ação não pode ser desfeita."
        : "Excluir esse registro do histórico? Essa ação não pode ser desfeita.";
    if (!confirm(aviso)) return;
    startTransition(() => {
      excluirFeriasHistorico(id, colaboradorId);
    });
  }

  return (
    <button
      type="button"
      onClick={excluir}
      disabled={isPending}
      title="Excluir do histórico"
      aria-label="Excluir do histórico"
      className="shrink-0 grid place-items-center w-6 h-6 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {isPending ? (
        <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      )}
    </button>
  );
}
