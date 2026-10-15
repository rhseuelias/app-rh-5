import type { CSSProperties, ReactNode } from "react";

/** Visual do "Modelo 7 — Semáforo e Metas": fundo verde-água claro, fonte Manrope,
 * azul/laranja para CLT/PJ, cor própria para cada empresa e semáforo com ícone. */

export const MANROPE = "'Manrope', 'Inter', ui-sans-serif, system-ui, sans-serif";

export const P7 = {
  bg: "#eaf1f0",
  card: "#ffffff",
  bd: "#e1e9e7",
  ink: "#12302c",
  sec: "#3f5a56",
  lab: "#5b7470",
  grid: "#edf2f1",
  track: "#edf2f1",
  deep: "#0f5c55",
  futuro: "#c3d1ce",
  azul: "#2a78d6",
  laranja: "#eb6834",
  verde: "#1baf7a",
} as const;

/** Escala de letras do painel (tudo em Manrope): poucos tamanhos, usados sempre do mesmo jeito. */
export const FS = {
  pagina: 26, // título "Dashboard"
  kpi: 40, // número principal (total)
  kpiMedio: 28, // número dos cartões das empresas e dos medidores
  titulo: 14, // título de cada quadro
  corpo: 12.5, // texto e linhas de tabela
  apoio: 11.5, // legendas e textos de apoio
  rotulo: 10.5, // cabeçalhos de coluna e rótulos em maiúsculas
} as const;

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);
/** "JOÃO DA SILVA" -> "João da Silva" (os nomes vêm do cadastro em maiúsculas). */
export function nomeProprio(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export type K = "good" | "warn" | "bad";
export const ST7: Record<K, string> = { good: "#0ca30c", warn: "#fab219", bad: "#d03b3b" };
export const BG7: Record<K, string> = { good: "#eef7ee", warn: "#fff6df", bad: "#fceeee" };
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

export function Icone({ k, size = 14 }: { k: K; size?: number }) {
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
      className="inline-flex items-center gap-1.5 rounded-full py-[2px] pl-1.5 pr-2.5 text-[11.5px] font-medium whitespace-nowrap"
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
      className={`rounded-[14px] border bg-white px-6 py-5 ${className}`}
      style={{ borderColor: P7.bd, color: P7.ink, fontFamily: MANROPE, boxShadow: "0 1px 2px rgba(18,48,44,0.04)", ...style }}
    >
      {children}
    </section>
  );
}

export function Titulo7({
  children,
  sub,
  direita,
  tamanho = FS.titulo,
}: {
  children: ReactNode;
  sub?: ReactNode;
  direita?: ReactNode;
  tamanho?: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <div className="font-semibold" style={{ fontFamily: MANROPE, fontSize: tamanho, color: P7.ink, textTransform: "none", letterSpacing: 0 }}>
          {children}
        </div>
        {sub && (
          <div className="mt-[2px] text-[11.5px]" style={{ color: P7.lab }}>
            {sub}
          </div>
        )}
      </div>
      {direita && (
        <div className="text-[11.5px]" style={{ color: P7.sec }}>
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
  "text-[10.5px] font-semibold uppercase tracking-[0.08em]";
export const COR_ROTULO: CSSProperties = { color: P7.lab };

export const LINK7 = "text-[11.5px] font-semibold hover:underline";
export const LINK7_STYLE: CSSProperties = { color: P7.deep };
