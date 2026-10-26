"use client";

import { useState } from "react";
import { P7, Ponto } from "./tema7";

type Item = { nome: string; por: Record<string, number>; total: number };
type Cor = { chave: string; nome: string; cor: string };

/** Ranking de saídas por cargo ou por unidade; cada barra mostra a divisão por iniciativa. */
export default function RankingSaidas({ cargo, unidade, cores }: { cargo: Item[]; unidade: Item[]; cores: Cor[] }) {
  const [modo, setModo] = useState<"cargo" | "unidade">("cargo");
  const itens = modo === "cargo" ? cargo : unidade;
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
          {cores.map((c) => (<span key={c.chave}><Ponto cor={c.cor} />{c.nome}</span>))}
        </div>
        <div className="inline-flex overflow-hidden rounded-[8px] border text-[12px] font-semibold" style={{ borderColor: P7.bd }}>
          {(["cargo", "unidade"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m} className="px-3 py-1"
              style={{ background: modo === m ? P7.deep : "#fff", color: modo === m ? "#fff" : P7.sec }}>
              {m === "cargo" ? "Por cargo" : "Por unidade"}
            </button>
          ))}
        </div>
      </div>
      {itens.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: P7.sec }}>Sem dados para mostrar.</p>
      ) : (
        <ol className="flex flex-col gap-[10px]">
          {itens.map((it, idx) => (
            <li key={it.nome} className="grid items-center gap-x-3" style={{ gridTemplateColumns: "22px minmax(0,200px) minmax(0,1fr) 28px" }}>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: P7.lab }}>{idx + 1}º</span>
              <span className="truncate text-[12.5px]" title={it.nome}>{it.nome}</span>
              <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-[6px]" style={{ width: `${(it.total / max) * 100}%`, minWidth: 24 }}>
                {cores.map((c) => {
                  const n = it.por[c.chave] ?? 0;
                  return n > 0 ? (
                    <div key={c.chave} className="flex items-center justify-center text-[11px] font-bold"
                      style={{ width: `${(n / it.total) * 100}%`, background: c.cor, color: c.chave === "outro" ? P7.ink : "#fff" }} title={`${c.nome}: ${n}`}>
                      {n}
                    </div>
                  ) : null;
                })}
              </div>
              <span className="text-right text-[12.5px] font-extrabold tabular-nums">{it.total}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
