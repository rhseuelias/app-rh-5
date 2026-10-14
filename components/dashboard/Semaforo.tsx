import { MANROPE, P7, ST7, Icone, Selo, type K } from "./tema7";

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
      className="inline-flex flex-wrap items-center gap-x-[18px] gap-y-1 rounded-full border bg-white px-4 py-[7px] text-[12.5px]"
      style={{ borderColor: P7.bd, color: P7.ink, fontFamily: MANROPE }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icone k="good" /> Dentro da meta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icone k="warn" /> Atenção
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icone k="bad" /> Crítico
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
  const W = 232;
  const H = 138;
  const cx = W / 2;
  const cy = H - 18;
  const R = 92;
  const th = 16;
  const pt = (f: number, rr = R) => [cx + rr * Math.cos(Math.PI * (1 - f)), cy - rr * Math.sin(Math.PI * (1 - f))];
  const f = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const [x1, y1] = pt(f);
  const [a1, b1] = pt(meta / 100, R - th / 2 - 5);
  const [a2, b2] = pt(meta / 100, R + th / 2 + 5);
  const arco = `M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`;
  const faltam = pct !== null && pct < meta ? Math.round(meta - pct) : 0;

  return (
    <div>
      <div className="mb-1.5 text-[15px] font-extrabold" style={{ fontFamily: MANROPE, color: P7.ink }}>
        {titulo}
      </div>
      <div className="flex justify-center">
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
          <line x1={a1.toFixed(1)} y1={b1.toFixed(1)} x2={a2.toFixed(1)} y2={b2.toFixed(1)} stroke={P7.ink} strokeWidth="2.5" strokeLinecap="round" />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="38" fontWeight="800" fill={P7.ink} style={{ fontFamily: MANROPE }}>
            {pct === null ? "—" : `${fmt0(pct)}%`}
          </text>
          <text x={cx - R} y={cy + 15} textAnchor="middle" fontSize="11" fill={P7.lab} style={{ fontFamily: MANROPE }}>
            0
          </text>
          <text x={cx + R} y={cy + 15} textAnchor="middle" fontSize="11" fill={P7.lab} style={{ fontFamily: MANROPE }}>
            100
          </text>
        </svg>
      </div>
      <div className="mt-1.5 text-center">
        {k ? (
          <Selo k={k}>
            {k === "good" ? "Dentro da meta" : `${faltam} ${faltam === 1 ? "ponto abaixo" : "pontos abaixo"} da meta`}
          </Selo>
        ) : (
          <span className="text-[12px]" style={{ color: P7.sec }}>
            ainda não informado
          </span>
        )}
      </div>
      <div className="mt-2.5 text-center text-[12px] leading-[1.5]" style={{ color: P7.sec }}>
        Meta: acima de {meta}%{nota ? <><br />{nota}</> : null}
      </div>
    </div>
  );
}

/** Clima de cada empresa contra a meta: barras que saem da linha da meta (azul = acima, vermelho = abaixo). */
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
      <p className="text-[13px]" style={{ color: P7.sec }}>
        Nenhuma empresa com clima informado.
      </p>
    );
  const ordenados = [...comValor].sort((a, b) => b.pct - a.pct);
  const ALCANCE = 20; // pontos de cada lado da meta
  return (
    <div>
      <div className="relative mb-1 h-[16px]">
        <span
          className="absolute -translate-x-1/2 text-[11px] font-bold"
          style={{ left: "calc(190px + (100% - 190px) / 2)", color: P7.ink }}
        >
          meta: {meta}%
        </span>
      </div>
      <div className="space-y-1">
        {ordenados.map((it) => {
          const d = Math.round(it.pct - meta);
          const larg = Math.min(50, (Math.abs(it.pct - meta) / ALCANCE) * 50);
          const acima = d >= 0;
          return (
            <div key={it.nome} className="grid h-[36px] grid-cols-[190px_1fr] items-center">
              <span className="truncate pr-2 text-[12.5px]" style={{ color: P7.ink }}>
                {it.nome} · {Math.round(it.pct)}%
              </span>
              <span className="relative h-full">
                <span className="absolute inset-y-0 left-1/2 w-0 border-l-[1.5px] border-dashed" style={{ borderColor: P7.ink }} />
                <span
                  className="absolute top-[9px] h-[18px]"
                  style={{
                    background: acima ? P7.azul : "#e34948",
                    borderRadius: 5,
                    ...(acima ? { left: "50%" } : { right: "50%" }),
                    width: `${larg}%`,
                    minWidth: d === 0 ? 3 : undefined,
                  }}
                  title={`${it.nome}: ${Math.abs(d)} pontos ${acima ? "acima" : "abaixo"} da meta`}
                />
                <span
                  className="absolute top-[8px] text-[12.5px] font-bold"
                  style={{
                    color: P7.ink,
                    ...(acima ? { left: `calc(50% + ${larg}% + 8px)` } : { left: "calc(50% + 8px)" }),
                  }}
                >
                  {acima ? `+${d} pts` : `−${Math.abs(d)} pts`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-5 text-[12.5px]" style={{ color: P7.ink }}>
        <span>
          <i className="mr-[7px] inline-block h-[10px] w-[10px] rounded-[3px] align-middle" style={{ background: P7.azul }} />
          Acima da meta
        </span>
        <span>
          <i className="mr-[7px] inline-block h-[10px] w-[10px] rounded-[3px] align-middle" style={{ background: "#e34948" }} />
          Abaixo da meta
        </span>
      </div>
    </div>
  );
}
