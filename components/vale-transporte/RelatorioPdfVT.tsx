"use client";

import { useState } from "react";
import { EMPRESAS_VT } from "@/lib/vale-transporte";

/** Escolhe a empresa (BSE MG, BSE SP, BABOON ou BDU) e abre o relatório em PDF para conferência.
 *  Com "Separar por unidade", cada unidade da empresa vira uma parte do relatório (uma página nova) com o seu total. */
export default function RelatorioPdfVT({ competencia }: { competencia: string }) {
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_VT[0]);
  const [separar, setSeparar] = useState(false);
  const href = `/api/vale-transporte/pdf?competencia=${competencia}&empresa=${encodeURIComponent(empresa)}${separar ? "&separar=1" : ""}&inline=1`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-300 bg-white px-3 py-2">
      <label htmlFor="vt-pdf-empresa" className="text-sm font-semibold text-slate-800">
        Relatório em PDF
      </label>
      <select
        id="vt-pdf-empresa"
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
        value={empresa}
        onChange={(e) => setEmpresa(e.target.value)}
      >
        {EMPRESAS_VT.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      <label htmlFor="vt-pdf-separar" className="flex items-center gap-1.5 text-sm text-slate-800">
        <input id="vt-pdf-separar" type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} />
        Separar por unidade
      </label>
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn-primary no-underline">
        Gerar PDF
      </a>
    </div>
  );
}
