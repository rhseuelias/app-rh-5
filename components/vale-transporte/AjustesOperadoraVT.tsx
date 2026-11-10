"use client";

import { useState } from "react";
import { salvarAjusteOperadoraVT } from "@/lib/actions-vale-transporte";
import { ROTULO_OPERADORA, campoVT, lerNumeroVT, moedaVT, type OperadoraVT } from "@/lib/vale-transporte";

/** Desconto de cargas não realizadas e taxa administrativa da concessionária (um valor por empresa e mês). Salva ao sair do campo. */
export default function AjustesOperadoraVT({
  competencia,
  rotuloMes,
  empresa,
  operadora,
  carga,
  descontoInicial,
  taxaInicial,
}: {
  competencia: string;
  rotuloMes: string;
  empresa: string;
  operadora: OperadoraVT;
  carga: number;
  descontoInicial: number;
  taxaInicial: number;
}) {
  const [desconto, setDesconto] = useState(campoVT(descontoInicial));
  const [taxa, setTaxa] = useState(campoVT(taxaInicial));
  const [salvo, setSalvo] = useState({ d: descontoInicial, t: taxaInicial });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const d = lerNumeroVT(desconto);
  const t = lerNumeroVT(taxa);
  const aPagar = Math.round((carga - (d ?? 0) + (t ?? 0)) * 100) / 100;

  async function salvar() {
    if (d === null || t === null) {
      setMsg({ ok: false, texto: "Confira os valores digitados." });
      return;
    }
    if (d === salvo.d && t === salvo.t) return;
    const r = await salvarAjusteOperadoraVT(competencia, empresa, operadora, d, t);
    if (r.ok) {
      setSalvo({ d, t });
      setMsg({ ok: true, texto: "Salvo." });
    } else {
      setMsg({ ok: false, texto: r.erro });
    }
  }

  return (
    <div className="mx-5 mt-3 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3">
      <div className="basis-full text-sm font-semibold text-[#2b2623]">
        Ajustes da concessionária · {empresa} · {ROTULO_OPERADORA[operadora]} · {rotuloMes}
      </div>
      <div>
        <label className="label" htmlFor={`vt-desc-${operadora}`}>
          Desconto de cargas não realizadas (R$)
        </label>
        <input
          id={`vt-desc-${operadora}`}
          inputMode="decimal"
          className="input !w-44 text-right"
          placeholder="0,00"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          onBlur={salvar}
        />
      </div>
      <div>
        <label className="label" htmlFor={`vt-taxa-${operadora}`}>
          Taxa administrativa (R$)
        </label>
        <input
          id={`vt-taxa-${operadora}`}
          inputMode="decimal"
          className="input !w-44 text-right"
          placeholder="0,00"
          value={taxa}
          onChange={(e) => setTaxa(e.target.value)}
          onBlur={salvar}
        />
      </div>
      <div className="text-sm text-[#2b2623]">
        Valor a pagar: <b className="text-lg">{moedaVT(aPagar)}</b>
        <div className="text-xs text-stone-500">
          carga {moedaVT(carga)} − desconto {moedaVT(d ?? 0)} + taxa {moedaVT(t ?? 0)}
        </div>
      </div>
      {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</span>}
    </div>
  );
}
