"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { excluirCandidato } from "@/lib/actions-candidatos";

export default function CandidatoLinkAcoes({ id, token, nome }: { id: string; token: string; nome?: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const [avisoLocal, setAvisoLocal] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Usa NEXT_PUBLIC_SITE_URL quando o site estiver publicado (ver README,
  // seção 8) — assim o link copiado sempre aponta pro endereço público,
  // mesmo que o RH esteja olhando a tela local. Sem essa variável, cai no
  // endereço que o navegador está usando agora (que, rodando local, é
  // "localhost" — só funciona no próprio computador, nunca no celular de
  // quem recebe o link).
  function montarLink() {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    return `${base}/pre-cadastro/${token}`;
  }

  async function copiarLink() {
    const link = montarLink();
    setAvisoLocal(/^https?:\/\/(localhost|127\.0\.0\.1)/.test(link));
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      prompt("Copie o link do pré-cadastro:", link);
    }
  }

  function excluir() {
    if (
      !confirm(
        `Excluir o pré-cadastro${nome ? ` de "${nome}"` : ""}? O link enviado deixa de funcionar e os documentos anexados são apagados. Essa ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("candidato_id", id);
    startTransition(() => {
      excluirCandidato(fd);
    });
  }

  return (
    <div>
      <div className="flex gap-2 items-center">
        <button onClick={copiarLink} className="btn-secondary text-xs">
          {copiado ? "Link copiado!" : "🔗 Copiar link"}
        </button>
        <Link href={`/candidatos/${id}`} className="text-xs text-brand-600 hover:underline">
          Ver detalhes →
        </Link>
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="text-[11px] text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 whitespace-nowrap"
        >
          {isPending ? "excluindo…" : "excluir"}
        </button>
      </div>
      {avisoLocal && (
        <p className="text-[11px] text-amber-600 mt-1.5 max-w-xs leading-snug">
          ⚠️ Esse link é "localhost" — só abre no seu próprio computador, não vai funcionar no
          celular do colaborador. Pra funcionar em qualquer aparelho, o sistema precisa estar
          publicado na internet (veja o README, seção 8) — ou, pra um teste rápido na mesma
          rede Wi-Fi, use o IP do seu computador no lugar de "localhost".
        </p>
      )}
    </div>
  );
}
