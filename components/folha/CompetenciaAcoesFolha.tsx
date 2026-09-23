"use client";

import { useTransition } from "react";
import { fecharCompetenciaFolha, reabrirCompetenciaFolha } from "@/lib/actions-folha";

/** Botão de fechar/reabrir o mês da Folha. Fechar transforma o mês em
 * histórico (trava a edição); reabrir desfaz isso, se precisar corrigir
 * algo. Mesmo comportamento do Controle de Benefícios. */
export default function CompetenciaAcoesFolha({ competencia, fechado }: { competencia: string; fechado: boolean }) {
  const [isPending, startTransition] = useTransition();

  function fechar() {
    if (
      !confirm(
        `Fechar ${competencia}? O mês vira histórico pra TODAS as empresas — só dá pra consultar, não dá mais pra editar (dá pra reabrir depois, se precisar).`
      )
    ) {
      return;
    }
    startTransition(() => {
      fecharCompetenciaFolha(competencia);
    });
  }

  function reabrir() {
    startTransition(() => {
      reabrirCompetenciaFolha(competencia);
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
