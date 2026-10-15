import { FS, MANROPE, P7, ST7, Icone, Selo, ROTULO_COLUNA, type K } from "./tema7";

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
  const th = 14;
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
        <line x1={a1.toFixed(1)} y1={b1.toFixed(1)} x2={a2.toFixed(1)} y2={b2.toFixed(1)} stroke={P7.ink} strokeWidth="2.5" strokeLinecap="round" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={FS.kpiMedio + 4} fontWeight="800" fill={P7.ink} style={{ fontFamily: MANROPE }}>
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

/** Clima de cada empresa/unidade contra a meta: barras que saem da linha da meta (azul = acima, vermelho = abaixo). */
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
  const ALCANCE = 20; // pontos de cada lado da meta
  const COL = 150;
  return (
    <div>
      <div className="relative mb-1 h-[14px]">
        <span
          className="absolute -translate-x-1/2 text-[10.5px] font-bold"
          style={{ left: `calc(${COL}px + (100% - ${COL}px) / 2)`, color: P7.ink }}
        >
          meta {meta}%
        </span>
      </div>
      <div>
        {ordenados.map((it) => {
          const d = Math.round(it.pct - meta);
          const larg = Math.min(50, (Math.abs(it.pct - meta) / ALCANCE) * 50);
          const acima = d >= 0;
          return (
            <div key={it.nome} className="grid h-[30px] items-center" style={{ gridTemplateColumns: `${COL}px 1fr` }}>
              <span className="truncate pr-2 text-[12.5px]" style={{ color: P7.ink }}>
                {it.nome} · <b>{Math.round(it.pct)}%</b>
              </span>
              <span className="relative h-full">
                <span className="absolute inset-y-0 left-1/2 w-0 border-l-[1.5px] border-dashed" style={{ borderColor: P7.ink }} />
                <span
                  className="absolute top-[7px] h-[16px]"
                  style={{
                    background: acima ? P7.azul : "#e34948",
                    borderRadius: 4,
                    ...(acima ? { left: "50%" } : { right: "50%" }),
                    width: `${larg}%`,
                    minWidth: d === 0 ? 3 : undefined,
                  }}
                  title={`${it.nome}: ${Math.abs(d)} pontos ${acima ? "acima" : "abaixo"} da meta`}
                />
                <span
                  className="absolute top-[6px] text-[11.5px] font-bold"
                  style={{
                    color: P7.ink,
                    ...(acima ? { left: `calc(50% + ${larg}% + 6px)` } : { left: "calc(50% + 6px)" }),
                  }}
                >
                  {acima ? `+${d} pts` : `−${Math.abs(d)} pts`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-[11.5px]" style={{ color: P7.ink }}>
        <span>
          <i className="mr-[6px] inline-block h-[9px] w-[9px] rounded-[3px] align-middle" style={{ background: P7.azul }} />
          Acima da meta
        </span>
        <span>
          <i className="mr-[6px] inline-block h-[9px] w-[9px] rounded-[3px] align-middle" style={{ background: "#e34948" }} />
          Abaixo da meta
        </span>
      </div>
    </div>
  );
}
