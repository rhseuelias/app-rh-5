"use client";

import { useState } from "react";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PCT = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

/**
 * Previsão de crescimento: quanto custa contratar mais N pessoas, usando a média
 * entre o custo de um CLT e o de um PJ (ponderada pela proporção atual de cada um).
 */
export default function PrevisaoCrescimento({
  mediaClt, mediaPj, nClt, nPj, custoAtual, faturamento, limitePct,
}: {
  mediaClt: number; mediaPj: number; nClt: number; nPj: number; custoAtual: number; faturamento: number; limitePct: number;
}) {
  const [qtd, setQtd] = useState(50);
  const [pctPj, setPctPj] = useState(Math.round((nPj / Math.max(1, nClt + nPj)) * 100));
  const media = (mediaClt * (100 - pctPj) + mediaPj * pctPj) / 100;
  const custoNovos = media * qtd;
  const custoFuturo = custoAtual + custoNovos;
  const pctAtual = faturamento > 0 ? (custoAtual / faturamento) * 100 : null;
  const pctFuturo = faturamento > 0 ? (custoFuturo / faturamento) * 100 : null;
  const ok = pctFuturo !== null && pctFuturo <= limitePct;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-900">Previsão de crescimento</h2>
          <p className="text-sm text-slate-500">Quanto custa contratar mais pessoas, com a média entre CLT e PJ</p>
        </div>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="text-slate-500">
            Novos colaboradores
            <input type="number" min={0} max={500} value={qtd} onChange={(e) => setQtd(Math.max(0, Number(e.target.value) || 0))}
              className="input mt-1 block w-28" />
          </label>
          <label className="text-slate-500">
            % PJ entre os novos: <b className="text-slate-800">{pctPj}%</b>
            <input type="range" min={0} max={100} step={5} value={pctPj} onChange={(e) => setPctPj(Number(e.target.value))}
              className="mt-2 block w-40" />
          </label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Custo médio de um CLT</p>
          <p className="text-lg font-semibold text-slate-900">{BRL(mediaClt)}</p>
          <p className="text-xs text-slate-400">{nClt} hoje</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Custo médio de um PJ</p>
          <p className="text-lg font-semibold text-slate-900">{BRL(mediaPj)}</p>
          <p className="text-xs text-slate-400">{nPj} hoje</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#dcece9" }}>
          <p className="text-xs" style={{ color: "#0a4a44" }}>Média CLT + PJ ({100 - pctPj}% / {pctPj}%)</p>
          <p className="text-lg font-semibold" style={{ color: "#0a4a44" }}>{BRL(media)}</p>
          <p className="text-xs" style={{ color: "#0a4a44" }}>por colaborador novo</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-4">
        <div><dt className="text-xs text-slate-400">Custo dos {qtd} novos, por mês</dt><dd className="font-semibold text-slate-900">{BRL(custoNovos)}</dd></div>
        <div><dt className="text-xs text-slate-400">Folha hoje</dt><dd className="font-semibold text-slate-900">{BRL(custoAtual)}</dd></div>
        <div><dt className="text-xs text-slate-400">Folha com os novos</dt><dd className="font-semibold text-slate-900">{BRL(custoFuturo)}</dd></div>
        <div>
          <dt className="text-xs text-slate-400">% do faturamento (hoje → depois)</dt>
          <dd className="font-semibold" style={{ color: ok ? "#0b7a0b" : "#a52828" }}>
            {pctAtual === null || pctFuturo === null ? "—" : `${PCT(pctAtual)} → ${PCT(pctFuturo)}`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-400">
        A média usa o custo real do cadastro (CLT com encargos e passivo; PJ pela nota fiscal). O faturamento é o cadastrado hoje, sem crescimento; limite saudável da folha: {limitePct}%.
      </p>
    </div>
  );
}
