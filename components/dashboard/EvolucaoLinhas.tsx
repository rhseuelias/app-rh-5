"use client";

import { useState } from "react";

export interface PontoSerie {
  mes: string;
  valor: number;
}

const COR_ABS = "#3d3d3d";
const COR_TURN = "#f0913f";

/** Gráfico de linhas (absenteísmo e turnover) com seletor 3m / 6m / 12m.
 * SVG puro, sem biblioteca. Série esperada: do mês mais antigo ao mais recente. */
export default function EvolucaoLinhas({
  absenteismo,
  turnover,
}: {
  absenteismo: PontoSerie[];
  turnover: PontoSerie[];
}) {
  const [meses, setMeses] = useState<3 | 6 | 12>(6);
  const abs = absenteismo.slice(-meses);
  const tur = turnover.slice(-meses);

  const W = 520;
  const H = 190;
  const esq = 34;
  const dir = 10;
  const topo = 10;
  const base = 26;
  const larguraUtil = W - esq - dir;
  const alturaUtil = H - topo - base;

  const maximo = Math.max(4, Math.ceil(Math.max(...abs.map((p) => p.valor), ...tur.map((p) => p.valor), 0) / 2) * 2);
  const ticks = [0, maximo / 2, maximo];
  const x = (i: number, n: number) => esq + (n <= 1 ? 0 : (i / (n - 1)) * larguraUtil);
  const y = (v: number) => topo + alturaUtil - (v / maximo) * alturaUtil;
  const caminho = (serie: PontoSerie[]) =>
    serie.map((p, i) => `${i === 0 ? "M" : "L"}${x(i, serie.length).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");

  const ultimoAbs = abs[abs.length - 1]?.valor ?? 0;
  const ultimoTur = tur[tur.length - 1]?.valor ?? 0;
  const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#5c5c5c]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-[2px]" style={{ background: COR_ABS }} />
            Absenteísmo <b className="text-[#262626] tabular-nums">{fmt(ultimoAbs)}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-[2px]" style={{ background: COR_TURN }} />
            Turnover <b className="text-[#262626] tabular-nums">{fmt(ultimoTur)}</b>
          </span>
        </div>
        <div className="inline-flex rounded-[8px] bg-[#f0e8df] p-[2px]" role="group" aria-label="Período">
          {([3, 6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMeses(n)}
              aria-pressed={meses === n}
              className={`rounded-[6px] px-2.5 py-1 text-[12px] font-semibold ${
                meses === n ? "bg-white text-[#262626] shadow-[0_1px_2px_rgba(61,40,20,.1)]" : "text-[#737373]"
              }`}
            >
              {n}m
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolução de absenteísmo e turnover">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={esq} x2={W - dir} y1={y(t)} y2={y(t)} stroke="#f4ebe1" strokeWidth={1} />
            <text x={esq - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#737373">
              {t}%
            </text>
          </g>
        ))}
        {abs.map((p, i) => (
          <text key={p.mes + i} x={x(i, abs.length)} y={H - 6} textAnchor="middle" fontSize={11} fill="#737373">
            {p.mes}
          </text>
        ))}
        <path d={caminho(tur)} fill="none" stroke={COR_TURN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={caminho(abs)} fill="none" stroke={COR_ABS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
