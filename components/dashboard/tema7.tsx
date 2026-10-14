import type { CSSProperties, ReactNode } from "react";

/** Visual do "Modelo 7 — Semáforo e Metas": fundo verde-água claro, fonte Manrope,
 * azul/laranja para CLT/PJ, cor própria para cada empresa e semáforo com ícone. */

export const MANROPE = "'Manrope', 'Inter', ui-sans-serif, system-ui, sans-serif";

export const P7 = {
  bg: "#eaf1f0",
  card: "#ffffff",
  bd: "#d3dfdd",
  ink: "#12302c",
  sec: "#3f5a56",
  lab: "#5b7470",
  grid: "#e3ebe9",
  track: "#e3ebe9",
  deep: "#0f5c55",
  futuro: "#c3d1ce",
  azul: "#2a78d6",
  laranja: "#eb6834",
  verde: "#1baf7a",
} as const;

export type K = "good" | "warn" | "bad";
export const ST7: Record<K, string> = { good: "#0ca30c", warn: "#fab219", bad: "#d03b3b" };
export const BG7: Record<K, string> = { good: "#e3f3e3", warn: "#fff1d0", bad: "#fbe4e4" };
export const TXT_ATRASO = "#a52828";

export const RESP_COR: Record<string, string> = {
  RH: P7.azul,
  Líder: P7.laranja,
  Colaborador: P7.verde,
  Sistema: P7.futuro,
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cor de cada empresa (pelo nome). */
export function corEmpresa(nome: string): string {
  const n = norm(nome);
  if (n.includes("franq")) return "#eda100";
  if (n.startsWith("bse")) return "#1baf7a";
  if (n.startsWith("bdu")) return "#e87ba4";
  if (n.startsWith("baboon")) return "#6250d6";
  return "#5b7470";
}

export function Icone({ k, size = 16 }: { k: K; size?: number }) {
  const c = ST7[k];
  if (k === "good")
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <circle cx="8" cy="8" r="7" fill={c} />
        <path d="M4.6 8.3l2.3 2.3 4.5-4.7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (k === "warn")
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <path d="M8 1.5L15 14H1z" fill={c} stroke={c} strokeWidth="1" strokeLinejoin="round" />
        <path d="M8 6v4M8 11.7v.1" stroke="#1a1a19" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="7" fill={c} />
      <path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Selo({ k, children }: { k: K; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-[3px] pl-1.5 pr-[11px] text-[12px] font-semibold whitespace-nowrap"
      style={{ color: P7.ink, background: BG7[k] }}
    >
      <Icone k={k} />
      {children}
    </span>
  );
}

export function Cartao7({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`rounded-[16px] border bg-white px-6 py-[22px] ${className}`}
      style={{ borderColor: P7.bd, color: P7.ink, fontFamily: MANROPE, ...style }}
    >
      {children}
    </section>
  );
}

export function Titulo7({
  children,
  sub,
  direita,
  tamanho = 16,
}: {
  children: ReactNode;
  sub?: ReactNode;
  direita?: ReactNode;
  tamanho?: number;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <div className="font-extrabold" style={{ fontFamily: MANROPE, fontSize: tamanho, color: P7.ink, textTransform: "none", letterSpacing: 0 }}>
          {children}
        </div>
        {sub && (
          <div className="mt-[3px] text-[12.5px]" style={{ color: P7.lab }}>
            {sub}
          </div>
        )}
      </div>
      {direita && (
        <div className="text-[12.5px]" style={{ color: P7.sec }}>
          {direita}
        </div>
      )}
    </div>
  );
}

export function Ponto({ cor, redondo = false }: { cor: string; redondo?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mr-[7px] inline-block h-[10px] w-[10px] align-middle"
      style={{ background: cor, borderRadius: redondo ? "50%" : 3 }}
    />
  );
}

export const ROTULO_COLUNA =
  "text-[11px] font-bold uppercase tracking-[0.07em]";
export const COR_ROTULO: CSSProperties = { color: P7.lab };

export const LINK7 = "text-[12.5px] font-bold hover:underline";
export const LINK7_STYLE: CSSProperties = { color: P7.deep };
