"use client";

import { useState } from "react";

// Baixa o Excel "Movimento Variável" (modelo da contabilidade) e mostra avisos/erros na tela.
export default function BotaoBaixarExcel({ competencia, escopo }: { competencia: string; escopo: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  async function baixar() {
    setGerando(true);
    setErro(null);
    setAvisos([]);
    try {
      const url = `/api/folha/movimento-variavel?competencia=${encodeURIComponent(competencia)}&escopo=${encodeURIComponent(escopo)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const t = (await res.text()).trim();
        setErro(t || "Não foi possível gerar o Excel.");
        return;
      }
      const nome = decodeURIComponent(res.headers.get("X-Nome-Arquivo") ?? "MovVariavel.xlsx");
      try {
        const lista = JSON.parse(decodeURIComponent(res.headers.get("X-Avisos") ?? "[]"));
        if (Array.isArray(lista)) setAvisos(lista.filter((x): x is string => typeof x === "string"));
      } catch {
        /* sem avisos */
      }
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
      setErro("Não foi possível gerar o Excel. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={baixar}
          disabled={gerando}
          title="Planilha no modelo da contabilidade (CPF, Nome, Matrícula e uma coluna por verba), para importar em outro sistema"
          className="btn-secondary !text-sm !py-2 disabled:opacity-60"
        >
          {gerando ? "Gerando Excel..." : "⬇ Baixar Excel"}
        </button>
        {erro && <span className="text-sm text-red-700">{erro}</span>}
      </span>
      {avisos.length > 0 && (
        <span className="max-w-md rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <b>Arquivo baixado. Confira:</b>
          {avisos.map((a) => (
            <span key={a} className="block">
              {a}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
