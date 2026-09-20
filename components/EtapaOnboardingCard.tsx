"use client";

import type { OnboardingEtapa } from "@/types/db";
import { atualizarEtapaOnboarding } from "@/lib/actions";
import { useTransition } from "react";

export default function EtapaOnboardingCard({
  etapa,
  nomeColaborador,
}: {
  etapa: OnboardingEtapa;
  nomeColaborador: string;
}) {
  const [isPending, startTransition] = useTransition();

  function marcarConcluido() {
    const fd = new FormData();
    fd.set("id", etapa.id);
    fd.set("status", "concluido");
    fd.set("responsavel", etapa.responsavel ?? "");
    fd.set("prazo", etapa.prazo ?? "");
    startTransition(() => atualizarEtapaOnboarding(fd));
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3 text-sm border border-slate-100">
      <p className="font-medium text-slate-800">{nomeColaborador}</p>
      {etapa.prazo && (
        <p className="text-xs text-slate-500">
          prazo: {new Date(etapa.prazo).toLocaleDateString("pt-BR")}
        </p>
      )}
      <button
        disabled={isPending}
        onClick={marcarConcluido}
        className="text-xs text-brand-600 mt-2"
      >
        ✓ Concluir
      </button>
    </div>
  );
}
