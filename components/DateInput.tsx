"use client";

import type { InputHTMLAttributes } from "react";
import { dataISOOuNula } from "@/lib/csv";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  onChange?: (value: string) => void;
};

/**
 * <input type="date"> que também aceita COLAR uma data (ex.: copiada de uma
 * planilha, de outro campo, ou digitada em "04/08/2022") — o campo de data
 * nativo do navegador às vezes rejeita colar, dependendo do navegador e do
 * fuso/idioma do sistema. Reconhece aaaa-mm-dd, dd/mm/aaaa e dd-mm-aaaa e já
 * converte pro formato que o campo espera. Funciona tanto controlado
 * (value + onChange) quanto dentro de um <form> comum (defaultValue + name).
 */
export default function DateInput({ onChange, ...props }: DateInputProps) {
  return (
    <input
      type="date"
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onPaste={(e) => {
        const texto = e.clipboardData.getData("text");
        const iso = dataISOOuNula(texto);
        if (!iso) return; // não reconheceu o formato — deixa o comportamento nativo
        e.preventDefault();
        if (onChange) {
          onChange(iso);
        } else {
          e.currentTarget.value = iso;
        }
      }}
      {...props}
    />
  );
}
