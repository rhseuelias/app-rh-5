"use client";

import { formatarReaisDosDigitos } from "@/lib/formatadores";

/**
 * Campo de valor em R$ para uso dentro de tabelas/linhas editáveis do
 * Controle de Benefícios — formata em tempo real (ex.: digitando "150000"
 * vira "R$ 1.500,00"), sem setinhas de aumentar/diminuir, digitação 100%
 * manual. Trabalha em "dígitos" (string só de números, em centavos); quem
 * usa esse campo converte pra reais na hora de salvar, com
 * `centavosParaReais` (lib/formatadores.ts).
 */
export default function InputMoeda({
  digitos,
  onChange,
  disabled,
  className = "",
  placeholder = "R$ 0,00",
}: {
  digitos: string;
  onChange: (digitos: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className={`input !w-24 !py-1.5 !px-2 !text-sm text-right ${className}`}
      placeholder={placeholder}
      value={digitos ? formatarReaisDosDigitos(digitos) : ""}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}
