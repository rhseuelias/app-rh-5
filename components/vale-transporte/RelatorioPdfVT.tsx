"use client";

import { useState } from "react";

/** Escolhe "Todas as unidades" (ou uma só) e abre o relatório em PDF para conferência. */
export default function RelatorioPdfVT({ competencia, unidades }: { competencia: string; unidades: string[] }) {
  const [unidade, setUnidade] = useState("");
  const href = `/api/vale-transporte/pdf?competencia=${competencia}${unidade ? `&unidade=${encodeURIComponent(unidade)}` : ""}&inline=1`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-300 bg-white px-3 py-2">
      <label htmlFor="vt-pdf-unidade" className="text-sm font-semibold text-slate-800">
        Relatório em PDF
      </label>
      <select
        id="vt-pdf-unidade"
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
        value={unidade}
        onChange={(e) => setUnidade(e.target.value)}
      >
        <option value="">Todas as unidades</option>
        {unidades.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn-primary no-underline">
        Gerar PDF
      </a>
    </div>
  );
}
