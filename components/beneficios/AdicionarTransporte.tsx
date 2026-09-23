"use client";

import { useState, useTransition } from "react";
import { salvarTransporte } from "@/lib/actions-beneficios";

/** Cria uma linha nova (zerada) de transporte de um tipo, pra um colaborador
 * escolhido — depois ela aparece na tabela como uma LinhaTransporteForm,
 * já pronta pra preencher os valores. Permite o mesmo colaborador ganhar
 * uma 2ª linha do mesmo tipo (valor diferente) ou de outro tipo. */
export default function AdicionarTransporte({
  competencia,
  tipo,
  colaboradores,
}: {
  competencia: string;
  tipo: string;
  colaboradores: { id: string; nome: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [colaboradorId, setColaboradorId] = useState(colaboradores[0]?.id ?? "");

  if (colaboradores.length === 0) return null;

  function adicionar() {
    if (!colaboradorId) return;
    const formData = new FormData();
    formData.set("competencia", competencia);
    formData.set("colaborador_id", colaboradorId);
    formData.set("tipo", tipo);
    formData.set("modo", "km");
    startTransition(async () => {
      await salvarTransporte(formData);
    });
  }

  return (
    <div className="flex items-center gap-2 p-3 flex-wrap">
      <select
        value={colaboradorId}
        onChange={(e) => setColaboradorId(e.target.value)}
        className="input !w-auto !py-1.5 !px-2 !text-sm"
      >
        {colaboradores.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isPending}
        onClick={adicionar}
        className="btn-secondary !text-xs !py-1.5 disabled:opacity-50"
      >
        ＋ Adicionar {tipo}
      </button>
    </div>
  );
}
