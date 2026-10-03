"use client";

import { useState, useTransition } from "react";
import { excluirCenario } from "@/lib/actions";

/** "Excluir" com confirmação em dois passos (apagar um cenário apaga também as férias simuladas dele). */
export default function ExcluirCenarioBotao({ cenarioId, nome }: { cenarioId: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, startTransition] = useTransition();

  const estilo = {
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    background: "transparent",
    border: 0,
    padding: 0,
    cursor: "pointer",
  } as const;

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} style={{ ...estilo, color: "#b42318" }} className="hover:underline">
        Excluir
      </button>
    );
  }

  return (
    <span className="flex items-center gap-3" style={{ fontSize: 12 }}>
      <span style={{ color: "#3d3d3d" }}>Excluir &quot;{nome}&quot;?</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            await excluirCenario(cenarioId);
          })
        }
        style={{ ...estilo, color: "#b42318", fontWeight: 600 }}
      >
        {pendente ? "Excluindo…" : "Sim, excluir"}
      </button>
      <button type="button" onClick={() => setConfirmando(false)} style={{ ...estilo, color: "#737373" }}>
        Não
      </button>
    </span>
  );
}
