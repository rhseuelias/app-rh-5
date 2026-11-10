"use client";

import { useState } from "react";
import { EMPRESAS_VT, OPERADORAS, ROTULO_OPERADORA, type OperadoraVT } from "@/lib/vale-transporte";

/** Escolhe a empresa (BSE MG, BSE SP, BABOON ou BDU) e abre o relatório em PDF para conferência.
 *  - "Separar por unidade": cada unidade da empresa vira uma parte do relatório (página nova) com o seu total.
 *  - "Só o resumo": gera apenas a página de resumo (carga a recarregar), sem as tabelas de cartões.
 *  - Concessionárias: escolha quais entram (BHBUS, SEMPARAR, ÓTIMO, CAJU). */
export default function RelatorioPdfVT({ competencia }: { competencia: string }) {
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_VT[0]);
  const [separar, setSeparar] = useState(false);
  const [soResumo, setSoResumo] = useState(false);
  const [ops, setOps] = useState<OperadoraVT[]>([...OPERADORAS]);

  const alternar = (o: OperadoraVT) => setOps((a) => (a.includes(o) ? a.filter((x) => x !== o) : [...a, o]));
  const semOperadora = ops.length === 0;
  const href =
    `/api/vale-transporte/pdf?competencia=${competencia}&empresa=${encodeURIComponent(empresa)}` +
    (separar ? "&separar=1" : "") +
    (soResumo ? "&resumo=1" : "") +
    (ops.length < OPERADORAS.length ? `&ops=${ops.join(",")}` : "") +
    "&inline=1";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-300 bg-white px-3 py-2">
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
      <label htmlFor="vt-pdf-resumo" className="flex items-center gap-1.5 text-sm text-slate-800">
        <input id="vt-pdf-resumo" type="checkbox" checked={soResumo} onChange={(e) => setSoResumo(e.target.checked)} />
        Só o resumo
      </label>
      <label htmlFor="vt-pdf-separar" className="flex items-center gap-1.5 text-sm text-slate-800">
        <input id="vt-pdf-separar" type="checkbox" checked={separar} onChange={(e) => setSeparar(e.target.checked)} />
        Separar por unidade
      </label>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-800">
        <span className="font-semibold">Concessionárias:</span>
        {OPERADORAS.map((o) => (
          <label key={o} className="flex items-center gap-1.5">
            <input type="checkbox" checked={ops.includes(o)} onChange={() => alternar(o)} />
            {ROTULO_OPERADORA[o]}
          </label>
        ))}
      </span>
      {semOperadora ? (
        <span className="text-xs text-red-700">Marque ao menos uma concessionária.</span>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className="btn-primary no-underline">
          Gerar PDF
        </a>
      )}
    </div>
  );
}
