"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gerarAdiantamentosMes } from "@/lib/actions-adiantamentos";

/** Gera e salva os adiantamentos do mês. Se o mês já estava salvo, pergunta antes de substituir. */
export default function GerarAdiantamentosBotao({ competencia, rotulo, jaSalvo }: { competencia: string; rotulo: string; jaSalvo: boolean }) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    if (jaSalvo && !window.confirm(`${rotulo} já está salvo. Gerar de novo substitui a lista salva pela lista de hoje. Continuar?`)) return;
    setErro("");
    setGerando(true);
    const r = await gerarAdiantamentosMes(competencia);
    setGerando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <button type="button" onClick={gerar} disabled={gerando} className="btn-cta !py-2 !px-5 disabled:opacity-60">
        {gerando ? "Salvando…" : jaSalvo ? "Gerar de novo e salvar" : `Gerar e salvar ${rotulo}`}
      </button>
      {erro && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
