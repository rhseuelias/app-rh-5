"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Nome de colaborador que vira link para a área do colaborador (/colaboradores/[id]).
 * Use em qualquer lugar do app onde o nome aparece e o id do colaborador está à mão.
 * `dentroDeLinhaClicavel`: use quando o nome está dentro de uma linha que também reage ao clique,
 * para o clique no nome abrir o colaborador sem disparar a ação da linha.
 */
export default function NomeColaborador({
  id,
  children,
  className = "",
  dentroDeLinhaClicavel = false,
}: {
  id: string | null | undefined;
  children: ReactNode;
  className?: string;
  dentroDeLinhaClicavel?: boolean;
}) {
  if (!id) return <>{children}</>;
  return (
    <Link
      href={`/colaboradores/${id}`}
      title="Abrir a área do colaborador"
      className={`hover:underline ${className}`}
      onClick={dentroDeLinhaClicavel ? (e) => e.stopPropagation() : undefined}
      onKeyDown={dentroDeLinhaClicavel ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </Link>
  );
}
