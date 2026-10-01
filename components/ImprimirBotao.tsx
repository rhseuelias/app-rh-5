"use client";

/** Botão que abre a janela de impressão do navegador — de lá dá pra
 * imprimir ou escolher "Salvar como PDF" pra levar à reunião. */
export default function ImprimirBotao() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-cta !py-2 !px-5 print:hidden"
    >
      🖨️ Imprimir / Salvar PDF
    </button>
  );
}
