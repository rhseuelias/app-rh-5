import { Cartao7, MANROPE, P7, Ponto, ROTULO_COLUNA, TXT_ATRASO, corEmpresa } from "./tema7";

/** Topo do Dashboard — "Modelo 3": rosca com o total (CLT x PJ x Estágio), feminino e masculino
 * em dois blocos de cor, e um ranking com o peso de cada empresa no total. */

const COR_CLT = P7.azul;
const COR_PJ = P7.laranja;
const COR_EST = "#9fb5b1";
const FEM = "#c2417a";
const MAS = "#0f5c55";

export type LinhaTotal = { chave: string; nome: string; clt: number; pj: number; estagio: number };

const nPct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
const pct1 = (v: number, t: number) => (t > 0 ? ((v / t) * 100).toFixed(1).replace(".", ",") : "0,0");

export default function TotalRoscaRanking({
  total,
  saldoMes,
  emFranquias,
  clt,
  pj,
  est,
  fem,
  mas,
  sem,
  linhas,
}: {
  total: number;
  saldoMes: number;
  emFranquias: number;
  clt: number;
  pj: number;
  est: number;
  fem: number;
  mas: number;
  sem: number;
  linhas: LinhaTotal[];
}) {
  // rosca: cada fatia em % do total (pathLength = 100)
  const fatias = [
    { v: clt, cor: COR_CLT, nome: "CLT" },
    { v: pj, cor: COR_PJ, nome: "PJ" },
    { v: est, cor: COR_EST, nome: "Estágio" },
  ].filter((f) => f.v > 0);
  let acumulado = 0;
  const arcos = fatias.map((f) => {
    const p = total > 0 ? (f.v / total) * 100 : 0;
    const arco = { ...f, p, inicio: acumulado };
    acumulado += p;
    return arco;
  });

  const totalSexo = fem + mas;
  const totalGeral = linhas.reduce((s, l) => s + l.clt + l.pj + l.estagio, 0);

  const rotulo = `${ROTULO_COLUNA}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ fontFamily: MANROPE }}>
      <Cartao7 className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className={rotulo} style={{ color: P7.lab }}>
            Total de colaboradores
          </div>
          <div className="text-[11.5px]" style={{ color: P7.sec }}>
            <b style={{ color: saldoMes > 0 ? "#0b7a0b" : saldoMes < 0 ? TXT_ATRASO : P7.sec }}>
              {saldoMes > 0 ? `+${saldoMes}` : saldoMes} no mês
            </b>
            {emFranquias > 0 ? ` · ${emFranquias} em franquias` : ""}
          </div>
        </div>

        {total === 0 ? (
          <p className="text-[12.5px]" style={{ color: P7.sec }}>
            Sem colaboradores neste filtro.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <svg
              viewBox="0 0 160 160"
              className="h-[190px] w-[190px] shrink-0"
              role="img"
              aria-label={`${total} colaboradores: ${clt} CLT, ${pj} PJ${est > 0 ? `, ${est} estágio` : ""}`}
            >
              <g transform="rotate(-90 80 80)" fill="none" strokeWidth="26">
                <circle cx="80" cy="80" r="56" stroke={P7.track} />
                {arcos.map((a) => (
                  <circle
                    key={a.nome}
                    cx="80"
                    cy="80"
                    r="56"
                    stroke={a.cor}
                    pathLength="100"
                    strokeDasharray={`${a.p} ${100 - a.p}`}
                    strokeDashoffset={-a.inicio}
                  >
                    <title>{`${a.nome}: ${a.v} (${nPct(a.v, total)}%)`}</title>
                  </circle>
                ))}
              </g>
              <text x="80" y="88" textAnchor="middle" fontFamily={MANROPE} fontWeight={800} fontSize="38" fill={P7.ink}>
                {total}
              </text>
              <text x="80" y="106" textAnchor="middle" fontFamily={MANROPE} fontSize="11" fill={P7.lab}>
                pessoas
              </text>
            </svg>
            <div className="flex flex-col gap-3">
              {[
                { v: clt, cor: COR_CLT, nome: "CLT", mostra: true },
                { v: pj, cor: COR_PJ, nome: "PJ", mostra: true },
                { v: est, cor: COR_EST, nome: "Estágio", mostra: est > 0 },
              ]
                .filter((x) => x.mostra)
                .map((x) => (
                  <div key={x.nome} className="flex items-center gap-2.5 text-[12.5px]" style={{ color: P7.ink }}>
                    <span className="inline-block h-[14px] w-[14px] shrink-0 rounded-[4px]" style={{ background: x.cor }} aria-hidden="true" />
                    <b className="w-[44px] text-[24px] font-extrabold leading-none tabular-nums">{x.v}</b>
                    <span>
                      {x.nome} · {nPct(x.v, total)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: P7.grid }}>
          <div className={rotulo} style={{ color: P7.lab }}>
            Feminino e masculino
          </div>
          {totalSexo === 0 ? (
            <p className="text-[12.5px]" style={{ color: P7.sec }}>
              Ainda não há sexo informado nos cadastros deste filtro.
            </p>
          ) : (
            <>
              <div className="flex items-stretch gap-2">
                <div className="min-w-0 rounded-[12px] px-4 py-3 text-white" style={{ flex: Math.max(fem, 1), background: FEM }}>
                  <div className="text-[28px] font-extrabold leading-none tabular-nums">{fem}</div>
                  <div className="mt-1 text-[12.5px] font-semibold">Feminino · {nPct(fem, totalSexo)}%</div>
                </div>
                <div className="min-w-0 rounded-[12px] px-4 py-3 text-white" style={{ flex: Math.max(mas, 1), background: MAS }}>
                  <div className="text-[28px] font-extrabold leading-none tabular-nums">{mas}</div>
                  <div className="mt-1 text-[12.5px] font-semibold">Masculino · {nPct(mas, totalSexo)}%</div>
                </div>
              </div>
              {sem > 0 && (
                <p className="text-[11.5px]" style={{ color: P7.lab }}>
                  {sem} sem sexo informado.
                </p>
              )}
            </>
          )}
        </div>
      </Cartao7>

      <Cartao7 className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className={rotulo} style={{ color: P7.lab }}>
            Peso de cada empresa no total
          </div>
          <div className="flex gap-3 text-[11.5px]" style={{ color: P7.sec }}>
            <span>
              <Ponto cor={COR_CLT} />
              CLT
            </span>
            <span>
              <Ponto cor={COR_PJ} />
              PJ
            </span>
            <span>
              <Ponto cor={COR_EST} />
              Est.
            </span>
          </div>
        </div>

        {totalGeral === 0 ? (
          <p className="text-[12.5px]" style={{ color: P7.sec }}>
            Sem colaboradores neste filtro.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {linhas.map((l) => {
              const t = l.clt + l.pj + l.estagio;
              return (
                <div key={l.chave} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-bold" style={{ color: P7.ink }}>
                      <Ponto cor={corEmpresa(l.nome)} redondo />
                      {l.nome}
                    </span>
                    <span className="whitespace-nowrap text-[12px]" style={{ color: P7.sec }}>
                      <b className="text-[24px] font-extrabold leading-none tabular-nums" style={{ color: P7.ink }}>
                        {t}
                      </b>{" "}
                      · {pct1(t, totalGeral)}% do total
                    </span>
                  </div>
                  <div className="flex h-[16px] overflow-hidden rounded-[8px]" style={{ background: P7.track }}>
                    <div style={{ width: `${(l.clt / totalGeral) * 100}%`, background: COR_CLT }} title={`${l.clt} CLT`} />
                    <div style={{ width: `${(l.pj / totalGeral) * 100}%`, background: COR_PJ }} title={`${l.pj} PJ`} />
                    <div style={{ width: `${(l.estagio / totalGeral) * 100}%`, background: COR_EST }} title={`${l.estagio} Estágio`} />
                  </div>
                  <div className="text-[11.5px]" style={{ color: P7.sec }}>
                    {l.clt} CLT · {l.pj} PJ{l.estagio > 0 ? ` · ${l.estagio} Est.` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-auto text-[11.5px]" style={{ color: P7.lab }}>
          A barra inteira equivale a todos os colaboradores.
        </p>
      </Cartao7>
    </div>
  );
}
