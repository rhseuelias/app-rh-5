"use client";

import { useState } from "react";
import Link from "next/link";

export default function CandidatoLinkAcoes({ id, token }: { id: string; token: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarLink() {
    const link = `${window.location.origin}/pre-cadastro/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      prompt("Copie o link do pré-cadastro:", link);
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <button onClick={copiarLink} className="btn-secondary text-xs">
        {copiado ? "Link copiado!" : "🔗 Copiar link"}
      </button>
      <Link href={`/candidatos/${id}`} className="text-xs text-brand-600 hover:underline">
        Ver detalhes →
      </Link>
    </div>
  );
}
