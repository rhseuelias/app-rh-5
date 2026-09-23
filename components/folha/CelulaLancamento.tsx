"use client";

import { useState } from "react";
import { centavosParaReais, formatarReais, formatarReaisDosDigitos, reaisParaDigitos } from "@/lib/formatadores";

/**
 * 1 célula editável da grade de Folha. "moeda" = campo em R$, formata em
 * tempo real (igual ao InputMoeda do Controle de Benefícios). "texto" =
 * campo livre. "sim_nao" = seletor Sim/Não, pra colunas como Adiantamento
 * e Desc. Transporte. Quando calculoAutomatico=true, a célula é só leitura
 * (o valor final é sempre recalculado pelo servidor ao salvar — hoje só a
 * Quebra de Caixa). Reporta a mudança pra cima a cada digitação — quem usa
 * essa célula guarda tudo num rascunho e só grava no banco quando aperta
 * "Concluir" (mesmo padrão do Controle de Benefícios).
 */
export default function CelulaLancamento({
  formato,
  valorInicial,
  valorTextoInicial,
  calculoAutomatico,
  disabled,
  onChange,
}: {
  formato: "moeda" | "texto" | "sim_nao";
  valorInicial: number;
  valorTextoInicial: string | null;
  calculoAutomatico?: boolean;
  disabled?: boolean;
  onChange: (payload: { valor: number; valor_texto: string | null }) => void;
}) {
  const [digitos, setDigitos] = useState(reaisParaDigitos(valorInicial));
  const [texto, setTexto] = useState(valorTextoInicial ?? "");

  if (calculoAutomatico) {
    return (
      <input
        type="text"
        disabled
        readOnly
        value={formatarReais(valorInicial)}
        title="Calculado automaticamente — não dá pra editar"
        className="input !w-24 !py-1.5 !px-2 !text-sm text-right !bg-slate-50 !text-slate-500"
      />
    );
  }

  if (formato === "sim_nao") {
    return (
      <select
        disabled={disabled}
        value={texto}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          onChange({ valor: 0, valor_texto: v || null });
        }}
        className="input !w-24 !py-1.5 !px-2 !text-sm text-center"
      >
        <option value=""></option>
        <option value="Sim">Sim</option>
        <option value="Não">Não</option>
      </select>
    );
  }

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
