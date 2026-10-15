"use client";

/** Abre a janela de impressão do navegador; lá dá para "Salvar como PDF". */
export default function BotaoImprimir({ texto = "Salvar em PDF / Imprimir" }: { texto?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full px-4 py-[8px] text-[12px] font-semibold text-white"
      style={{ background: "#0f5c55" }}
    >
      {texto}
    </button>
  );
}
