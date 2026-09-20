"use client";

import { useTransition } from "react";
import { incluirNoProcessoIntegracao } from "@/lib/actions-integracao";

export default function IncluirNoProcessoBotao({ colaboradorId }: { colaboradorId: string }) {
  const [isPending, startTransition] = useTransition();

  function incluir() {
    const formData = new FormData();
    formData.set("colaborador_id", colaboradorId);
    startTransition(() => incluirNoProcessoIntegracao(formData));
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={incluir}
      className="text-xs text-brand-600 hover:underline inline-block"
    >
      {isPending ? "Incluindo..." : "➕ Incluir no processo de integração"}
    </button>
  );
}
