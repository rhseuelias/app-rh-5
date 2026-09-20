"use client";

import { useState } from "react";
import type { Colaborador } from "@/types/db";
import { adicionarPeriodoSimulado } from "@/lib/actions";
import { differenceInCalendarDays } from "date-fns";

export default function AdicionarPeriodoSimuladoForm({
  cenarioId,
  colaboradores,
}: {
  cenarioId: string;
  colaboradores: Colaborador[];
}) {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const dias = inicio && fim ? differenceInCalendarDays(new Date(fim), new Date(inicio)) + 1 : 0;

  return (
    <form action={adicionarPeriodoSimulado} className="flex flex-wrap gap-2 items-end pt-2 border-t border-slate-100 mt-2">
      <input type="hidden" name="cenario_id" value={cenarioId} />
      <select name="colaborador_id" required className="input !w-auto !text-xs !py-1.5">
        <option value="">Colaborador</option>
        {colaboradores.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>
      <input
        type="date" name="data_inicio" required className="input !w-auto !text-xs !py-1.5"
        value={inicio} onChange={(e) => setInicio(e.target.value)}
      />
      <input
        type="date" name="data_fim" required className="input !w-auto !text-xs !py-1.5"
        value={fim} onChange={(e) => setFim(e.target.value)}
      />
      <input type="hidden" name="dias" value={dias > 0 ? dias : 0} />
      {dias > 0 && <span className="text-xs text-slate-400">{dias} dias</span>}
      <button type="submit" className="btn-secondary !text-xs !py-1.5 !px-3">+ Adicionar ao cenário</button>
    </form>
  );
}
