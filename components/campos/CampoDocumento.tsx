"use client";

import { useState } from "react";
import { apenasDigitos, formatarCNPJ, formatarCPF } from "@/lib/formatadores";

/**
 * Campo de CPF ou CNPJ — formata automaticamente com pontos, barra e traço
 * enquanto o usuário digita.
 */
export default function CampoDocumento({
  label,
  name,
  tipo,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  tipo: "cpf" | "cnpj";
  defaultValue?: string | null;
  required?: boolean;
}) {
  const [valor, setValor] = useState(
    defaultValue ? (tipo === "cpf" ? formatarCPF(defaultValue) : formatarCNPJ(defaultValue)) : ""
  );

  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        name={name}
        required={required}
        className="input"
        placeholder={tipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
        value={valor}
        onChange={(e) => {
          const digitos = apenasDigitos(e.target.value);
          setValor(tipo === "cpf" ? formatarCPF(digitos) : formatarCNPJ(digitos));
        }}
      />
    </div>
  );
}
