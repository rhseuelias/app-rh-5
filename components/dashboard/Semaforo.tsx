import { INTER, OSWALD, TONS, fmt1, type Tom } from "./Blocos";

/** Semáforo do Painel de RH: toda cor vem junto com um ícone e um texto
 * (✓ dentro da meta, ▲ atenção, ✕ crítico), para não depender só da cor. */

export type Sem = "bom" | "atencao" | "critico";

export const COR_SEM: Record<Sem, string> = {
  bom: "#2f9e6b",
  atencao: "#f0913f",
  critico: "#d92d20",
};

export const INFO_SEM: Record<Sem, { icone: string; rotulo: string; tom: Tom }> = {
  bom: { icone: "✓", rotulo: "Dentro da meta", tom: "green" },
  atencao: { icone: "▲", rotulo: "Atenção", tom: "orange" },
  critico: { icone: "✕", rotulo: "Crítico", tom: "red" },
};

/** Acima da meta = bom; até 10 pontos abaixo = atenção; mais que isso = crítico. */
export function semPorMeta(valor: number, meta: number): Sem {
  if (valor >= meta) return "bom";
  if (valor >= meta - 10) return "atencao";
  return "critico";
}

export function SeloSemaforo({ sem, texto }: { sem: Sem; texto?: string }) {
  const i = INFO_SEM[sem];
  const t = TONS[i.tom];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap"
      style={{ color: t.fg, background: t.bg }}
    >
      <span aria-hidden="true">{i.icone}</span>
      {texto ?? i.rotulo}
    </span>
  );
}

export function LegendaSemaforo() {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-full border border-[#f1e4d6] bg-white px-4 py-1.5 text-[12px] text-[#3d3d3d]"
      style={{ fontFamily: INTER }}
    >
      {(["bom", "atencao", "critico"] as Sem[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="font-bold" style={{ color: COR_SEM[s] }}>
            {INFO_SEM[s].icone}
          </span>
          {INFO_SEM[s].rotulo}
        </span>
      ))}
    </div>
  );
}

/** Medidor em meia-lua com a meta marcada por um traço. */
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
  const R = 48;
  const L = Math.PI * R;
  const f = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const ang = Math.PI * (1 - meta / 100);
  const x1 = 60 + 40 * Math.cos(ang);
  const y1 = 60 - 40 * Math.sin(ang);
  const x2 = 60 + 57 * Math.cos(ang);
  const y2 = 60 - 57 * Math.sin(ang);
  const arco = "M 12 60 A 48 48 0 0 1 108 60";

  return (
    <div className="flex flex-col items-center text-center">
      <p className="self-start text-[14px] font-semibold text-[#262626]">{titulo}</p>
      <svg
        viewBox="0 0 120 70"
        className="w-full max-w-[200px] mt-2"
        role="img"
        aria-label={
          pct === null ? `${titulo}: não informado` : `${titulo}: ${fmt1(pct)} por cento, meta ${meta} por cento`
        }
      >
        <path d={arco} fill="none" stroke="#f4ebe1" strokeWidth="11" strokeLinecap="round" />
        {pct !== null && sem && (
          <path
            d={arco}
            fill="none"
            stroke={COR_SEM[sem]}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${f * L} ${L}`}
          />
        )}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#262626" strokeWidth="2" />
        <text
          x="60"
          y="57"
          textAnchor="middle"
          fontSize="22"
          fontWeight="600"
          fill="#262626"
          style={{ fontFamily: OSWALD }}
        >
          {pct === null ? "—" : `${Math.round(pct)}%`}
        </text>
      </svg>
      <div className="mt-1 flex flex-col items-center gap-1">
        {sem ? <SeloSemaforo sem={sem} /> : <span className="text-[12px] text-[#737373]">não informado</span>}
        <p className="text-[12px] text-[#737373]">
          meta: acima de {meta}%{nota ? ` · ${nota}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Clima de cada empresa contra a meta: barra com traço na meta. */
export function ClimaPorEmpresa({
  itens,
  meta,
}: {
  itens: { nome: string; pct: number | null }[];
  meta: number;
}) {
  if (itens.length === 0) return <p className="text-[13px] text-[#737373]">Nenhuma empresa cadastrada.</p>;
  const ordenados = [...itens].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  return (
    <div className="space-y-3">
      {ordenados.map((it) => {
        const sem = it.pct === null ? null : semPorMeta(it.pct, meta);
        return (
          <div key={it.nome} className="grid grid-cols-[110px_1fr_92px] sm:grid-cols-[140px_1fr_104px] items-center gap-3">
            <span className="text-[13px] text-[#3d3d3d] truncate">{it.nome}</span>
            <span className="relative h-[10px] rounded-full" style={{ background: "#f4ebe1" }}>
              {it.pct !== null && sem && (
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, it.pct))}%`, background: COR_SEM[sem] }}
                />
              )}
              <span
                className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-black"
                style={{ left: `${meta}%` }}
                title={`Meta: ${meta}%`}
              />
            </span>
            <span className="text-right text-[13px] font-semibold tabular-nums" style={{ color: sem ? TONS[INFO_SEM[sem].tom].fg : "#737373" }}>
              {sem ? `${INFO_SEM[sem].icone} ` : ""}
              {it.pct === null ? "—" : `${fmt1(it.pct)}%`}
            </span>
          </div>
        );
      })}
      <p className="text-[12px] text-[#737373]">A linha preta marca a meta de {meta}%.</p>
    </div>
  );
}
