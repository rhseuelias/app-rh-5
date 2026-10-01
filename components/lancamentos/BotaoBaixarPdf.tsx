"use client";

import { useState } from "react";

// Baixa o PDF do relatório analítico e mostra o erro na tela se algo falhar.
export default function BotaoBaixarPdf({ competencia, escopo }: { competencia: string; escopo: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setGerando(true);
    setErro(null);
    try {
      const url = `/api/folha/relatorio-analitico?competencia=${encodeURIComponent(competencia)}&escopo=${encodeURIComponent(escopo)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const t = (await res.text()).trim();
        setErro(t || "Não foi possível gerar o PDF.");
        return;
      }
      const nome = decodeURIComponent(res.headers.get("X-Nome-Arquivo") ?? "Relatorio Analitico Folha.pdf");
      const blob = await res.blob();
      const link = document.createElement("a");
      const endereco = URL.createObjectURL(blob);
      link.href = endereco;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(endereco);
    } catch {
      setErro("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" onClick={baixar} disabled={gerando} className="btn-cta !text-sm !py-2 disabled:opacity-60">
        {gerando ? "Gerando PDF..." : "⬇ Baixar PDF"}
      </button>
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </span>
  );
}
