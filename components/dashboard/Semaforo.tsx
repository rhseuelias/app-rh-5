import { MANROPE, P7, ST7, Icone, Selo, ROTULO_COLUNA, nomeProprio, type K } from "./tema7";

/** Semáforo do Painel de RH (visual do modelo 7). Toda cor vem com ícone e texto. */

export type Sem = "bom" | "atencao" | "critico";

const K_DE: Record<Sem, K> = { bom: "good", atencao: "warn", critico: "bad" };

/** Acima da meta = bom; até 10 pontos abaixo = atenção; mais que isso = crítico. */
export function semPorMeta(valor: number, meta: number): Sem {
  if (valor >= meta) return "bom";
  if (valor >= meta - 10) return "atencao";
  return "critico";
}

const fmt0 = (v: number) => String(Math.round(v));

export function LegendaSemaforo() {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-full border bg-white px-3.5 py-[6px] text-[11.5px]"
      style={{ borderColor: P7.bd, color: P7.ink, fontFamily: MANROPE }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icone k="good" size={14} /> Dentro da meta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icone k="warn" size={14} /> Atenção
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icone k="bad" size={14} /> Crítico
      </span>
    </div>
  );
}

/** Medidor em meia-lua com a meta marcada por um traço preto. */
export function Gauge({
  titulo,
  pct,
  meta,
  nota,
}: {
  titulo: string;
  pct: number | null;
  meta: number;
  nota?: string;
}) {
  const sem = pct === null ? null : semPorMeta(pct, meta);
  const k = sem ? K_DE[sem] : null;
  const W = 200;
  const H = 112;
  const cx = W / 2;
  const cy = H - 14;
  const R = 78;
  const th = 8;
  const pt = (f: number, rr = R) => [cx + rr * Math.cos(Math.PI * (1 - f)), cy - rr * Math.sin(Math.PI * (1 - f))];
  const f = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const [x1, y1] = pt(f);
  const [a1, b1] = pt(meta / 100, R - th / 2 - 4);
  const [a2, b2] = pt(meta / 100, R + th / 2 + 4);
  const arco = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`;
  const faltam = pct !== null && pct < meta ? Math.round(meta - pct) : 0;

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`mb-1 self-start ${ROTULO_COLUNA}`} style={{ color: P7.lab, fontFamily: MANROPE }}>
        {titulo}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="max-w-full"
        role="img"
        aria-label={pct === null ? `${titulo}: não informado` : `${titulo}: ${fmt0(pct)} por cento, meta ${meta} por cento`}
      >
        <path d={arco} fill="none" stroke={P7.track} strokeWidth={th} strokeLinecap="round" />
        {pct !== null && f > 0 && k && (
          <path
            d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`}
            fill="none"
            stroke={ST7[k]}
            strokeWidth={th}
            strokeLinecap="round"
          />
        )}
        <line x1={a1.toFixed(1)} y1={b1.toFixed(1)} x2={a2.toFixed(1)} y2={b2.toFixed(1)} stroke={P7.ink} strokeWidth="1.5" strokeLinecap="round" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={28} fontWeight="700" fill={P7.ink} style={{ fontFamily: MANROPE }}>
          {pct === null ? "—" : `${fmt0(pct)}%`}
        </text>
      </svg>
      <div className="mt-1.5">
        {k ? (
          <Selo k={k}>
            {k === "good" ? "Dentro da meta" : `${faltam} ${faltam === 1 ? "ponto abaixo" : "pontos abaixo"} da meta`}
          </Selo>
        ) : (
          <span className="text-[11.5px]" style={{ color: P7.sec }}>
            ainda não informado
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[11.5px] leading-[1.45]" style={{ color: P7.lab }}>
        Meta: acima de {meta}%{nota ? ` · ${nota}` : ""}
      </div>
    </div>
  );
}

/**
 * Clima de cada empresa/unidade contra a meta. A linha pontilhada do meio é a meta:
 * quem está acima sobe (azul), quem está abaixo desce (vermelho). Cada coluna mostra o valor,
 * o nome e a diferença em pontos.
 */
export function ClimaPorEmpresa({
  itens,
  meta,
}: {
  itens: { nome: string; pct: number | null }[];
  meta: number;
}) {
  const comValor = itens.filter((i) => i.pct !== null) as { nome: string; pct: number }[];
  if (comValor.length === 0)
    return (
      <p className="text-[12.5px]" style={{ color: P7.sec }}>
        Nenhuma empresa com clima informado.
      </p>
    );
  const ordenados = [...comValor].sort((a, b) => b.pct - a.pct);
  const ALCANCE = 20; // pontos que cabem para cada lado da meta
  const MEIA = 84; // altura (px) de cada lado
  const ACIMA = "#5b9be0";
  const ABAIXO = "#e66a69";
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: ordenados.length * 64 }}>
        <div className="relative" style={{ height: MEIA * 2 }}>
          {/* faixas suaves: acima e abaixo da meta */}
          <div className="absolute inset-x-0 top-0 rounded-t-[8px]" style={{ height: MEIA, background: "#f3f8fd" }} />
          <div className="absolute inset-x-0 bottom-0 rounded-b-[8px]" style={{ height: MEIA, background: "#fdf4f4" }} />
          <div className="absolute inset-x-0 border-t border-dashed" style={{ top: MEIA, borderColor: P7.ink, opacity: 0.55 }} />
          <span
            className="absolute left-2 text-[10.5px] font-medium"
            style={{ top: MEIA + 3, color: P7.lab }}
          >
            meta {meta}%
          </span>
          <div className="absolute inset-0 flex">
            {ordenados.map((it) => {
              const d = Math.round(it.pct - meta);
              const acima = d >= 0;
              const alt = Math.max(3, Math.min(MEIA - 20, (Math.abs(it.pct - meta) / ALCANCE) * (MEIA - 20)));
              const cor = acima ? ACIMA : ABAIXO;
              return (
                <div
                  key={it.nome}
                  className="relative min-w-0 flex-1"
                  title={`${nomeProprio(it.nome)}: ${Math.round(it.pct)}% (${acima ? "+" : "−"}${Math.abs(d)} pontos da meta)`}
                >
                  <span
                    className="absolute left-1/2 w-[14px] -translate-x-1/2"
                    style={{
                      background: cor,
                      height: alt,
                      opacity: 0.85,
                      ...(acima
                        ? { bottom: MEIA, borderRadius: "7px 7px 2px 2px" }
                        : { top: MEIA, borderRadius: "2px 2px 7px 7px" }),
                    }}
                  />
                  <span
                    className="absolute left-0 right-0 text-center text-[12.5px] font-semibold tabular-nums"
                    style={{
                      color: P7.ink,
                      ...(acima ? { bottom: MEIA + alt + 4 } : { top: MEIA + alt + 4 }),
                    }}
                  >
                    {Math.round(it.pct)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex">
          {ordenados.map((it) => {
            const d = Math.round(it.pct - meta);
            return (
              <div key={it.nome} className="min-w-0 flex-1 px-0.5 text-center">
                <div className="truncate text-[11.5px] font-medium" style={{ color: P7.ink }} title={nomeProprio(it.nome)}>
                  {nomeProprio(it.nome)}
                </div>
                <div className="text-[11.5px] tabular-nums" style={{ color: d >= 0 ? "#2f6fb8" : "#b84343" }}>
                  {d >= 0 ? `+${d}` : `−${Math.abs(d)}`} pts
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
