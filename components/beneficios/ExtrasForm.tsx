"use client";

import { useState, useTransition } from "react";
import type { BeneficioExtra } from "@/types/db";
import { salvarExtras } from "@/lib/actions-beneficios";
import { centavosParaReais, reaisParaDigitos } from "@/lib/formatadores";
import InputMoeda from "./InputMoeda";

/** Alimentação, Prêmio e Outros de 1 colaborador em 1 mês — pagos pelo
 * cartão CAJU, por isso ficam dentro do bloco do CAJU (junto com o
 * transporte de quem usa CAJU também pra isso). Um valor só por mês. */
export default function ExtrasForm({
  competencia,
  colaboradorId,
  mesFechado,
  extra,
}: {
  competencia: string;
  colaboradorId: string;
  mesFechado: boolean;
  extra?: BeneficioExtra;
}) {
  const [isPending, startTransition] = useTransition();
  const [alimentacaoDigitos, setAlimentacaoDigitos] = useState(reaisParaDigitos(extra?.alimentacao));
  const [premioDigitos, setPremioDigitos] = useState(reaisParaDigitos(extra?.premio));
  const [outrosDescricao, setOutrosDescricao] = useState(extra?.outros_descricao ?? "");
  const [outrosValorDigitos, setOutrosValorDigitos] = useState(reaisParaDigitos(extra?.outros_valor));

  function salvar() {
    const formData = new FormData();
    formData.set("competencia", competencia);
    formData.set("colaborador_id", colaboradorId);
    formData.set("alimentacao", String(centavosParaReais(alimentacaoDigitos)));
    formData.set("premio", String(centavosParaReais(premioDigitos)));
    formData.set("outros_descricao", outrosDescricao);
    formData.set("outros_valor", String(centavosParaReais(outrosValorDigitos)));
    startTransition(async () => {
      await salvarExtras(formData);
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[10px] text-slate-400">Alimentação</span>
        <InputMoeda digitos={alimentacaoDigitos} onChange={setAlimentacaoDigitos} disabled={mesFechado} />
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[10px] text-slate-400">Prêmio</span>
        <InputMoeda digitos={premioDigitos} onChange={setPremioDigitos} disabled={mesFechado} />
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[10px] text-slate-400">Outros</span>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            disabled={mesFechado}
            value={outrosDescricao}
            onChange={(e) => setOutrosDescricao(e.target.value)}
            placeholder="Descrição"
            className="input !w-28 !py-1.5 !px-2 !text-sm"
          />
          <InputMoeda digitos={outrosValorDigitos} onChange={setOutrosValorDigitos} disabled={mesFechado} />
        </div>
      </div>
      {!mesFechado && (
        <button
          type="button"
          disabled={isPending}
          onClick={salvar}
          className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1 disabled:opacity-50 self-end mb-0.5"
        >
          Salvar
        </button>
      )}
    </div>
  );
}
