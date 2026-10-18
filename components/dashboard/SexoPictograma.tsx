import { MANROPE, P7 } from "./tema7";

/** Feminino e masculino em bonequinhos (Modelo 5): cada boneco é 1 pessoa. */

const FEM = "#c2417a";
const MAS = "#0f5c55";
const COLS = 16;
const MAX_BONECOS = 160;

const nPct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

export default function SexoPictograma({ fem, mas, sem }: { fem: number; mas: number; sem: number }) {
  const total = fem + mas;
  const unidade = Math.max(1, Math.ceil(total / MAX_BONECOS));
  const nF = Math.round(fem / unidade);
  const nM = Math.round(mas / unidade);
  const n = nF + nM;
  const linhas = Math.max(1, Math.ceil(n / COLS));

  if (total === 0)
    return (
      <p className="text-[12.5px]" style={{ color: P7.sec }}>
        Ainda não há sexo informado nos cadastros deste filtro.
      </p>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4" style={{ fontFamily: MANROPE, color: P7.ink }}>
      <svg
        viewBox={`0 0 ${COLS * 25} ${linhas * 27}`}
        className="w-full max-w-[420px]"
        role="img"
        aria-label={`${fem} mulheres e ${mas} homens`}
      >
        <defs>
          <symbol id="boneco-sexo" viewBox="0 0 20 34">
            <circle cx="10" cy="6" r="5" />
            <path d="M2 33 V19 a8 8 0 0 1 16 0 V33 Z" />
          </symbol>
        </defs>
        {Array.from({ length: n }).map((_, k) => (
          <use
            key={k}
            href="#boneco-sexo"
            x={(k % COLS) * 25}
            y={Math.floor(k / COLS) * 27}
            width="20"
            height="26"
            fill={k < nF ? FEM : MAS}
          />
        ))}
      </svg>
      <div>
        <div className="my-1 flex items-baseline gap-1.5">
          <i className="inline-block h-[14px] w-[14px] shrink-0 self-center rounded-[4px]" style={{ background: FEM }} />
          <b className="text-[34px] font-extrabold tabular-nums">{fem}</b>
          <span className="text-[16px] font-semibold">Feminino</span>
          <small className="text-[15px] font-semibold" style={{ color: P7.lab }}>{nPct(fem, total)}%</small>
        </div>
        <div className="my-1 flex items-baseline gap-1.5">
          <i className="inline-block h-[14px] w-[14px] shrink-0 self-center rounded-[4px]" style={{ background: MAS }} />
          <b className="text-[34px] font-extrabold tabular-nums">{mas}</b>
          <span className="text-[16px] font-semibold">Masculino</span>
          <small className="text-[15px] font-semibold" style={{ color: P7.lab }}>{nPct(mas, total)}%</small>
        </div>
        <p className="mt-2 text-[12.5px]" style={{ color: P7.lab }}>
          {unidade === 1 ? "Cada boneco = 1 pessoa." : `Cada boneco = cerca de ${unidade} pessoas.`}
          {sem > 0 && ` ${sem} sem sexo informado.`}
        </p>
      </div>
    </div>
  );
}
