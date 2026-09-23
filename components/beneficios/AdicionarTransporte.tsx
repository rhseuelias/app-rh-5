"use client";

import { useState, useTransition } from "react";
import { salvarTransporte } from "@/lib/actions-beneficios";

/** Cria uma linha nova (zerada) de transporte de um tipo, pra um colaborador
 * escolhido — depois ela aparece na tabela como uma LinhaTransporteForm,
 * já pronta pra preencher os valores. Permite o mesmo colaborador ganhar
 * uma 2ª linha do mesmo tipo (valor diferente) ou de outro tipo.
 * Quando só existe 1 colaborador possível (caso do CAJU, onde cada linha já
 * é de 1 colaborador só), não faz sentido mostrar o seletor de nome — nesse
 * caso aparece só o botão. */
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
      {colaboradores.length > 1 && (
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
      )}
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
