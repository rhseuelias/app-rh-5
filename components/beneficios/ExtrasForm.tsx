"use client";

import { useEffect, useState } from "react";
import type { BeneficioExtra } from "@/types/db";
import { centavosParaReais, reaisParaDigitos } from "@/lib/formatadores";
import InputMoeda from "./InputMoeda";

/** Não salva sozinho: a cada mudança avisa o painel (via onChange), que
 * salva tudo de uma vez quando o usuário clica no botão "Salvar" no final. */
export default function ExtrasForm({
  competencia,
  colaboradorId,
  mesFechado,
  extra,
  onChange,
}: {
  competencia: string;
  colaboradorId: string;
  mesFechado: boolean;
  extra?: BeneficioExtra;
  onChange: (colaboradorId: string, campos: Record<string, string>) => void;
}) {
  const [alimentacaoDigitos, setAlimentacaoDigitos] = useState(reaisParaDigitos(extra?.alimentacao));
  const [premioDigitos, setPremioDigitos] = useState(reaisParaDigitos(extra?.premio));
  const [outrosDescricao, setOutrosDescricao] = useState(extra?.outros_descricao ?? "");
  const [outrosValorDigitos, setOutrosValorDigitos] = useState(reaisParaDigitos(extra?.outros_valor));

  useEffect(() => {
    onChange(colaboradorId, {
      competencia,
      colaborador_id: colaboradorId,
      alimentacao: String(centavosParaReais(alimentacaoDigitos)),
      premio: String(centavosParaReais(premioDigitos)),
      outros_descricao: outrosDescricao,
      outros_valor: String(centavosParaReais(outrosValorDigitos)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alimentacaoDigitos, premioDigitos, outrosDescricao, outrosValorDigitos]);

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
    </div>
  );
}
