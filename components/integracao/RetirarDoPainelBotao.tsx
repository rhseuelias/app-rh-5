"use client";

import { useTransition } from "react";
import { arquivarProcessoIntegracao } from "@/lib/actions-integracao";

export default function RetirarDoPainelBotao({ processoId }: { processoId: string }) {
  const [isPending, startTransition] = useTransition();

  function clicar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmou = window.confirm(
      "Retirar este colaborador do Painel de Integração?\n\n" +
        "Os registros e todo o histórico do processo NÃO serão apagados — ele só deixa de aparecer aqui no painel."
    );
    if (!confirmou) return;
    startTransition(() => {
      arquivarProcessoIntegracao(processoId);
    });
  }

  return (
    <button
      type="button"
      onClick={clicar}
      disabled={isPending}
      title="Retirar do painel (mantém os registros)"
      aria-label="Retirar do painel"
      className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      🗑️
    </button>
  );
}
