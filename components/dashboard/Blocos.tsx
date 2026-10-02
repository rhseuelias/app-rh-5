import type { CSSProperties, ReactNode } from "react";

/** Peças visuais do Painel de RH (dashboard). Só apresentação — sem dados. */

export const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
export const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";

export const TONS = {
  red: { fg: "#b42318", bg: "#fdecea" },
  orange: { fg: "#93440c", bg: "#ffe9d2" },
  green: { fg: "#1f7a52", bg: "#e6f4ec" },
  off: { fg: "#737373", bg: "#f4ebe1" },
} as const;
export type Tom = keyof typeof TONS;

/** Fonte dos títulos pequenos e textos: sempre Inter, nunca maiúsculas
 * (o app tem uma regra global que deixa h1/h2 em Oswald maiúsculo). */
const TITULO_ESTILO: CSSProperties = {
  fontFamily: INTER,
  textTransform: "none",
  letterSpacing: 0,
};

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`bg-white border border-[#f1e4d6] rounded-[12px] px-6 py-5 ${className}`}
      style={{ fontFamily: INTER }}
    >
      {children}
    </section>
  );
}

export function TituloCartao({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[14px] font-semibold text-[#262626] flex items-center gap-2" style={TITULO_ESTILO}>
        {children}
      </h2>
      {direita !== undefined && <div className="text-[12px] text-[#737373] shrink-0">{direita}</div>}
    </div>
  );
}

export function Pilula({
  tom,
  children,
  className = "",
}: {
  tom: Tom;
  children: ReactNode;
  className?: string;
}) {
  const t = TONS[tom];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[10px] px-2.5 py-0.5 text-[12px] font-semibold tabular-nums whitespace-nowrap ${className}`}
      style={{ color: t.fg, background: t.bg }}
    >
      {children}
    </span>
  );
}

/** Selo para números que ainda são de exemplo (o sistema não guarda esse dado). */
export function SeloExemplo() {
  return (
    <span
      className="inline-flex items-center rounded-[6px] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{ color: TONS.orange.fg, background: TONS.orange.bg }}
    >
      Exemplo
    </span>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-[#737373]">{children}</p>;
}

/** Cabeçalho de coluna de tabela: 11px, 600, maiúsculas. */
export const CABECALHO_TABELA =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737373]";

export const LINK_SUTIL = "text-[12px] font-semibold text-[#b85c12] hover:text-[#93440c]";

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase();
}

export const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");
