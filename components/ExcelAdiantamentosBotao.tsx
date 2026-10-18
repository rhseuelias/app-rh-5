"use client";

import { useState } from "react";

export default function ExcelAdiantamentosBotao({ competencia, empresa, soNomes }: { competencia: string; empresa: string; soNomes: boolean }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setGerando(true);
    setErro(null);
    try {
      const q = `competencia=${encodeURIComponent(competencia)}${empresa !== "todas" ? `&empresa=${encodeURIComponent(empresa)}` : ""}${soNomes ? "&modo=nomes" : ""}`;
      const res = await fetch(`/api/adiantamentos/excel?${q}`);
      if (!res.ok) {
        setErro("Não foi possível gerar o Excel.");
        return;
      }
      const blob = await res.blob();
      const nome = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "adiantamentos.xlsx";
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível gerar o Excel. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={baixar} disabled={gerando} className="btn-secondary !text-sm !py-2 disabled:opacity-60">
        {gerando ? "Gerando Excel..." : "⬇ Gerar Excel"}
      </button>
      {erro && <span className="text-sm text-red-700">{erro}</span>}
    </span>
  );
}
