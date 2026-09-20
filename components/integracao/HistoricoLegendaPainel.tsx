"use client";

import { useState } from "react";

type ItemHistorico = {
  label: string;
  valor: number;
  cor: string; // classe tailwind de background, ex: "bg-blue-500"
};

const LEGENDA: { label: string; cor: string }[] = [
  { label: "Não iniciado", cor: "bg-slate-400" },
  { label: "Em andamento", cor: "bg-amber-500" },
  { label: "Atrasado", cor: "bg-red-500" },
  { label: "Experiência (dias restantes)", cor: "bg-blue-500" },
  { label: "Efetivado(a)", cor: "bg-emerald-500" },
  { label: "Não efetivado(a)", cor: "bg-slate-500" },
];

export default function HistoricoLegendaPainel({ historico }: { historico: ItemHistorico[] }) {
  const [aba, setAba] = useState<"historico" | "legenda">("historico");

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-3 xl:sticky xl:top-4 self-start">
      <div className="flex bg-slate-100 rounded-full p-0.5">
        <button
          type="button"
          onClick={() => setAba("historico")}
          className={`flex-1 text-center text-[11.5px] font-bold py-1.5 rounded-full transition-colors ${
            aba === "historico" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 font-semibold"
          }`}
        >
          Histórico
        </button>
        <button
          type="button"
          onClick={() => setAba("legenda")}
          className={`flex-1 text-center text-[11.5px] font-bold py-1.5 rounded-full transition-colors ${
            aba === "legenda" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 font-semibold"
          }`}
        >
          Legenda
        </button>
      </div>

      {aba === "historico" ? (
        <div className="flex flex-col">
          {historico.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center justify-between py-2 px-1 ${
                i < historico.length - 1 ? "border-b border-slate-50" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-xs text-slate-600">
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.cor}`} />
                {item.label}
              </span>
              <span className="text-xs font-bold text-slate-900">{item.valor}</span>
            </div>
          ))}
          <p className="text-[10px] text-slate-300 leading-snug mt-2">
            Efetivados e Não efetivados continuam contados aqui mesmo depois de saírem do quadro — nada é
            apagado.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {LEGENDA.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-slate-600">
              <span className={`w-2 h-2 rounded-full shrink-0 ${item.cor}`} />
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
