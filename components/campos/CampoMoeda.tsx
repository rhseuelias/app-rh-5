"use client";

import { useState } from "react";
import { centavosParaReais, formatarReaisDosDigitos, reaisParaDigitos } from "@/lib/formatadores";

/**
 * Campo de valor em R$ — formata automaticamente enquanto o usuário digita
 * (ex.: digitando "150000" vira "R$ 1.500,00"). Por baixo dos panos, guarda
 * o valor real num input escondido (mesmo "name" do campo no banco), então
 * funciona igual a um input normal dentro do formulário.
 */
export default function CampoMoeda({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  hint?: string;
}) {
  const [digitos, setDigitos] = useState(reaisParaDigitos(defaultValue));

  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        placeholder="R$ 0,00"
        value={digitos ? formatarReaisDosDigitos(digitos) : ""}
        onChange={(e) => setDigitos(apenasNumeros(e.target.value))}
      />
      <input type="hidden" name={name} value={digitos ? centavosParaReais(digitos).toFixed(2) : "0"} />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function apenasNumeros(v: string): string {
  return v.replace(/\D/g, "");
}
