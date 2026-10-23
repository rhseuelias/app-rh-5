"use client";

import type { ReactNode } from "react";

/**
 * Formulário de filtros que atualiza a tela sozinho: ao mudar uma lista ou uma data,
 * envia o formulário na hora (sem botão "Aplicar filtros").
 * Campos de texto (ex.: busca por nome) continuam enviando só com Enter.
 */
export default function FormAuto({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      className={className}
      onChange={(e) => {
        const alvo = e.target as HTMLInputElement | HTMLSelectElement;
        const ehLista = alvo.tagName === "SELECT";
        const ehData = alvo.tagName === "INPUT" && (alvo as HTMLInputElement).type === "date";
        if (!ehLista && !ehData) return;
        // data pela metade (ex.: só o dia digitado) fica vazia: espera ficar completa
        if (ehData && !(alvo as HTMLInputElement).value) return;
        e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
