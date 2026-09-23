"use client";

import { useTransition } from "react";
import { fecharCompetencia, reabrirCompetencia } from "@/lib/actions-beneficios";

/** Botão de fechar/reabrir o mês. Fechar transforma o mês em histórico
 * (trava a edição); reabrir desfaz isso, se precisar corrigir algo. */
export default function CompetenciaAcoes({ competencia, fechado }: { competencia: string; fechado: boolean }) {
  const [isPending, startTransition] = useTransition();

  function fechar() {
    if (
      !confirm(
        `Fechar ${competencia}? O mês vira histórico pra TODAS as empresas (BDU, BABOON e BSE) — só dá pra consultar, não dá mais pra editar (dá pra reabrir depois, se precisar).`
      )
    ) {
      return;
    }
    startTransition(() => {
      fecharCompetencia(competencia);
    });
  }

  function reabrir() {
    startTransition(() => {
      reabrirCompetencia(competencia);
    });
  }

  return fechado ? (
    <button
      type="button"
      disabled={isPending}
      onClick={reabrir}
      className="btn-secondary !text-xs !py-1.5 disabled:opacity-50"
    >
      🔓 Reabrir este mês
    </button>
  ) : (
    <button
      type="button"
      disabled={isPending}
      onClick={fechar}
      className="btn-secondary !text-xs !py-1.5 disabled:opacity-50"
    >
      🔒 Fechar este mês
    </button>
  );
}
