"use client";

import { useState } from "react";

/** Previsão de crescimento só em quantidade: quadro de hoje, novos (divididos em CLT e PJ) e quadro previsto. */
export default function PrevisaoCrescimento({ nClt, nPj }: { nClt: number; nPj: number }) {
  const [qtd, setQtd] = useState(50);
  const [pctPj, setPctPj] = useState(Math.round((nPj / Math.max(1, nClt + nPj)) * 100));
  const hoje = nClt + nPj;
  const novosPj = Math.round((qtd * pctPj) / 100);
  const novosClt = qtd - novosPj;
  const caixa = (titulo: string, valor: number, sub: string, destaque = false) => (
    <div className="rounded-xl p-3" style={{ background: destaque ? "#dcece9" : "#f8fafc" }}>
      <p className="text-xs" style={{ color: destaque ? "#0a4a44" : "#64748b" }}>{titulo}</p>
      <p className="text-2xl font-semibold" style={{ color: destaque ? "#0a4a44" : "#0f172a" }}>{valor}</p>
      <p className="text-xs" style={{ color: destaque ? "#0a4a44" : "#94a3b8" }}>{sub}</p>
    </div>
  );
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-900">Previsão de crescimento</h2>
          <p className="text-sm text-slate-500">Quantidade de colaboradores, com a média entre CLT e PJ</p>
        </div>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="text-slate-500">
            Novos colaboradores
            <input type="number" min={0} max={500} value={qtd} onChange={(e) => setQtd(Math.max(0, Number(e.target.value) || 0))} className="input mt-1 block w-28" />
          </label>
          <label className="text-slate-500">
            % PJ entre os novos: <b className="text-slate-800">{pctPj}%</b>
            <input type="range" min={0} max={100} step={5} value={pctPj} onChange={(e) => setPctPj(Number(e.target.value))} className="mt-2 block w-40" />
          </label>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {caixa("Hoje", hoje, `${nClt} CLT · ${nPj} PJ`)}
        {caixa("Novos previstos", qtd, `${novosClt} CLT · ${novosPj} PJ`)}
        {caixa("Quadro previsto", hoje + qtd, `${nClt + novosClt} CLT · ${nPj + novosPj} PJ`, true)}
      </div>
      <p className="mt-2 text-xs text-slate-400">Por padrão, os novos seguem a proporção atual de CLT e PJ. Arraste a barra para testar outra divisão.</p>
    </div>
  );
}
