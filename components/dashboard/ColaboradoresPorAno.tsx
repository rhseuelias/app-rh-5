import EditorAnosAnteriores, { type AnoEditavel } from "./EditorAnosAnteriores";
import { Cartao7, Titulo7, Ponto, P7, MANROPE, FS } from "./tema7";

/** Quantos colaboradores a empresa tinha no fim de cada ano (CLT, PJ e Estágio) e quanto cresceu de um ano para o outro. */

export interface PontoAno {
  ano: number;
  clt: number;
  pj: number;
  est: number;
  /** true = ano atual (valor de hoje) */
  hoje?: boolean;
  /** true = número digitado à mão (no lugar do automático) */
  manual?: boolean;
  /** true = projeção do próximo ano (estimativa, não é dado real) */
  proj?: boolean;
}

const COR_CLT = P7.azul;
const COR_PJ = P7.laranja;
const COR_EST = "#9fb5b1";

/** Linha do total ao longo dos anos. O trecho pontilhado e o círculo vazio são a projeção. */
function Sparkline({ serie, total }: { serie: PontoAno[]; total: (p: PontoAno) => number }) {
  if (serie.length < 2) return null;
  const W = 880;
  const H = 90;
  const vals = serie.map(total);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const xs = (i: number) => 12 + ((W - 24) * i) / (serie.length - 1);
  const ys = (v: number) => H - 14 - ((H - 30) * (v - min)) / span;
  const temProj = !!serie[serie.length - 1].proj;
  const nReais = temProj ? serie.length - 1 : serie.length;
  const reais = vals.slice(0, nReais).map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const iU = nReais - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mb-3 block w-full" role="img" aria-label="Linha do total de colaboradores por ano">
      <polyline points={reais} fill="none" stroke={P7.deep} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {temProj && (
        <line
          x1={xs(iU)} y1={ys(vals[iU])} x2={xs(iU + 1)} y2={ys(vals[iU + 1])}
          stroke={P7.deep} strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round"
        />
      )}
      <circle cx={xs(iU)} cy={ys(vals[iU])} r="5.5" fill={P7.deep} stroke="#fff" strokeWidth="2" />
      {temProj && <circle cx={xs(iU + 1)} cy={ys(vals[iU + 1])} r="5.5" fill="#fff" stroke={P7.deep} strokeWidth="2" />}
    </svg>
  );
}

export default function ColaboradoresPorAno({
  dados,
  escopo,
  tabelaPronta = true,
}: {
  dados: PontoAno[];
  /** "todas" ou id da empresa; null = sem edição (ex.: filtro de franquias) */
  escopo: string | null;
  tabelaPronta?: boolean;
}) {
  const total = (p: PontoAno) => p.clt + p.pj + p.est;

  // Projeção do próximo ano: soma ao total de hoje a média dos aumentos dos últimos (até) 3 anos.
  // A faixa vai do menor ao maior aumento desses anos. O CLT/PJ/Estágio segue a mesma proporção de hoje.
  const ult = dados[dados.length - 1];
  const variacoes = dados.slice(1).map((p, i) => total(p) - total(dados[i])).slice(-3);
  let projecao: PontoAno | null = null;
  let faixa: [number, number] = [0, 0];
  let mediaAumento = 0;
  const base = ult ? total(ult) : 0;
  if (ult && variacoes.length >= 1 && base > 0) {
    mediaAumento = Math.round(variacoes.reduce((a, v) => a + v, 0) / variacoes.length);
    const alvo = Math.max(0, base + mediaAumento);
    const clt = Math.round((alvo * ult.clt) / base);
    const pj = Math.round((alvo * ult.pj) / base);
    projecao = { ano: ult.ano + 1, clt, pj, est: Math.max(0, alvo - clt - pj), proj: true };
    faixa = [Math.max(0, base + Math.min(...variacoes)), Math.max(0, base + Math.max(...variacoes))];
  }
  const serie = projecao ? [...dados, projecao] : dados;
  const maximo = Math.max(1, ...serie.map(total), faixa[1]);

  if (dados.length === 0 || maximo <= 1)
    return (
      <Cartao7>
        <Titulo7 sub="Colaboradores no fim de cada ano">Crescimento de colaboradores por ano</Titulo7>
        <p className="text-[12.5px]" style={{ color: P7.sec }}>
          Ainda não há datas de admissão suficientes para montar o gráfico.
        </p>
        {escopo && (
          <EditorAnosAnteriores
            escopo={escopo}
            tabelaPronta={tabelaPronta}
            anos={dados.filter((p) => !p.hoje).map<AnoEditavel>((p) => ({ ano: p.ano, clt: p.clt, pj: p.pj, est: p.est, manual: !!p.manual }))}
          />
        )}
      </Cartao7>
    );

  const primeiro = total(dados[0]);
  const ultimo = total(dados[dados.length - 1]);
  const saldo = ultimo - primeiro;
  const pctTotal = primeiro > 0 ? Math.round((saldo / primeiro) * 100) : null;
  const corSaldo = saldo > 0 ? "#0b7a0b" : saldo < 0 ? "#a52828" : P7.sec;

  return (
    <Cartao7>
      <Titulo7
        sub="Colaboradores no fim de cada ano, incluindo as franquias do ano atual"
        direita={
          <span>
            Desde {dados[0].ano}:{" "}
            <b style={{ color: corSaldo }}>
              {saldo > 0 ? `+${saldo}` : saldo}
              {pctTotal !== null ? ` (${pctTotal > 0 ? "+" : ""}${pctTotal}%)` : ""}
            </b>
          </span>
        }
      >
        Crescimento de colaboradores por ano
      </Titulo7>

      <Sparkline serie={serie} total={total} />

      <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(122px, 1fr))" }}>
        {serie.map((p, i) => {
          const t = total(p);
          const ant = i > 0 ? total(serie[i - 1]) : null;
          const delta = ant === null ? null : t - ant;
          const pct = ant && ant > 0 ? Math.round(((t - ant) / ant) * 100) : null;
          const corDelta = delta === null ? P7.lab : delta > 0 ? "#0b7a0b" : delta < 0 ? "#a52828" : P7.sec;
          return (
            <div
              key={p.ano}
              className="rounded-[12px] px-3 pb-[10px] pt-3"
              style={{
                background: p.proj ? "#ffffff" : "#f4f8f7",
                border: p.proj ? "2px dashed #c4d2cf" : "2px solid transparent",
                fontFamily: MANROPE,
                color: P7.ink,
              }}
              title={`${p.ano}${p.proj ? " (projeção)" : ""}: ${p.clt} CLT · ${p.pj} PJ${p.est > 0 ? ` · ${p.est} estágio` : ""} = ${t}`}
            >
              <div className="text-[12.5px] font-bold" style={{ color: P7.lab }}>
                {p.ano}
                {p.proj ? " · projeção" : p.hoje ? " · hoje" : ""}
              </div>
              <div className="text-[32px] font-extrabold leading-[1.15] tabular-nums">{t}</div>
              <div className="my-1.5 flex h-[8px] gap-[2px]">
                {p.clt > 0 && <span className="block rounded-[2px]" style={{ flex: p.clt, background: COR_CLT }} />}
                {p.pj > 0 && <span className="block rounded-[2px]" style={{ flex: p.pj, background: COR_PJ }} />}
                {p.est > 0 && <span className="block rounded-[2px]" style={{ flex: p.est, background: COR_EST }} />}
              </div>
              <div className="text-[12.5px]" style={{ color: P7.sec }}>
                <b style={{ color: COR_CLT }}>{p.clt}</b> CLT · <b style={{ color: COR_PJ }}>{p.pj}</b> PJ
                {p.est > 0 && (
                  <>
                    {" "}· <b>{p.est}</b> Est.
                  </>
                )}
              </div>
              <div className="mt-0.5 text-[12.5px] font-bold tabular-nums" style={{ color: corDelta }}>
                {delta === null ? "início" : `${delta > 0 ? "+" : ""}${delta}${pct !== null ? ` · ${pct > 0 ? "+" : ""}${pct}%` : ""}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-[9px] text-[12.5px]" style={{ borderColor: P7.grid, color: P7.ink }}>
        <span><Ponto cor={COR_CLT} />CLT</span>
        <span><Ponto cor={COR_PJ} />PJ</span>
        <span><Ponto cor={COR_EST} />Estágio</span>
        {projecao && (
          <span>
            <span aria-hidden="true" className="mr-[7px] inline-block h-[10px] w-[10px] align-middle" style={{ borderRadius: 3, border: `2px dashed ${P7.deep}`, opacity: 0.6 }} />
            Projeção
          </span>
        )}
        <span style={{ color: P7.sec }}>O número colorido embaixo de cada ano é o aumento em relação ao ano anterior.</span>
      </div>

      {projecao && (
        <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: P7.sec }}>
          <b style={{ color: P7.ink }}>Projeção para {projecao.ano}:</b> cerca de <b>{total(projecao)}</b> colaboradores
          (média dos aumentos dos últimos {variacoes.length} {variacoes.length === 1 ? "ano" : "anos"}:{" "}
          {mediaAumento > 0 ? "+" : ""}
          {mediaAumento} por ano). Entre {faixa[0]} e {faixa[1]}, se o ritmo seguir entre o menor e o maior aumento recente. É uma estimativa, não uma garantia.
        </p>
      )}

      {escopo && (
        <EditorAnosAnteriores
          escopo={escopo}
          tabelaPronta={tabelaPronta}
          anos={dados
            .filter((p) => !p.hoje)
            .map<AnoEditavel>((p) => ({ ano: p.ano, clt: p.clt, pj: p.pj, est: p.est, manual: !!p.manual }))}
        />
      )}
    </Cartao7>
  );
}
