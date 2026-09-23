"use client";

import { useState } from "react";
import { centavosParaReais, formatarReaisDosDigitos, reaisParaDigitos } from "@/lib/formatadores";

/**
 * 1 célula editável da grade de Folha. "moeda" = campo em R$, formata em
 * tempo real (igual ao InputMoeda do Controle de Benefícios). "texto" =
 * campo livre, pra colunas como Adiantamento ("SIM") ou Desc. Transporte
 * ("4%"). Reporta a mudança pra cima a cada digitação — quem usa essa
 * célula guarda tudo num rascunho e só grava no banco quando aperta
 * "Salvar" (mesmo padrão do Controle de Benefícios).
 */
export default function CelulaLancamento({
  formato,
  valorInicial,
  valorTextoInicial,
  disabled,
  onChange,
}: {
  formato: "moeda" | "texto";
  valorInicial: number;
  valorTextoInitial: string | null;
  disabled?: boolean;
  onChange: (payload: { valor: number; valor_texto: string | null }) => void;
}) {
  const [digitos, setDigitos] = useState(reaisParaDigitos(valorInicial));
  const [texto, setTexto] = useState(valorTextoInicial ?? "");

  if (formato === "texto") {
    return (
      <input
        type="text"
        disabled={disabled}
        value={texto}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          onChange({ valor: 0, valor_texto: v || null });
        }}
        placeholder="—"
        className="input !w-24 !py-1.5 !px-2 !text-sm text-center"
      />
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={digitos ? formatarReaisDosDigitos(digitos) : ""}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "");
        setDigitos(d);
        onChange({ valor: centavosParaReais(d), valor_texto: null });
      }}
      placeholder="R$ 0,00"
      className="input !w-24 !py-1.5 !px-2 !text-sm text-right"
    />
  );
}
