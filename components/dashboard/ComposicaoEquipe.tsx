// Topo do Dashboard: total de colaboradores, composição CLT x PJ,
// cartões por empresa e dois gráficos (barras CLT x PJ e participação).
// Componente simples, sem bibliotecas de gráfico.

export type TemaCartao = "pessego" | "creme" | "grafite" | "branco" | "pedra";

export interface CartaoEmpresa {
  chave: string;
  nome: string;
  total: number;
  clt: number;
  pj: number;
  estagio: number;
  tema: TemaCartao;
  nota?: string; // linha extra pequena (ex.: "Nenhuma franquia cadastrada")
}

const COR_CLT = "#E8833A";
const COR_PJ = "#FFD5AA";
const COR_ESTAGIO = "#3D3D3D";

const ESTILO_CARTAO: Record<TemaCartao, string> = {
  pessego: "bg-brand-400 text-ink-900 border-brand-400",
  creme: "bg-brand-100 text-ink-900 border-brand-200",
  grafite: "bg-ink-800 text-brand-50 border-ink-800",
  branco: "bg-white text-ink-900 border-brand-200",
  pedra: "bg-stone-100 text-ink-900 border-stone-200",
};

const COR_FATIA: Record<TemaCartao, string> = {
  pessego: "#F0913F",
  creme: "#FFD5AA",
  grafite: "#3D3D3D",
  branco: "#C9B8A6",
  pedra: "#8F8479",
};

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

export default function ComposicaoEquipe({
  total,
  clt,
  pj,
  estagio,
  noSistema,
  emFranquias,
  cartoes,
  fonteDisplay,
}: {
  total: number;
  clt: number;
  pj: number;
  estagio: number;
  noSistema: number;
  emFranquias: number;
  cartoes: CartaoEmpresa[];
  fonteDisplay: string;
}) {
  const maiorTotal = Math.max(1, ...cartoes.map((c) => c.total));

  // rosca de participação
  let acumulado = 0;
  const fatias = cartoes
    .filter((c) => c.total > 0)
    .map((c) => {
      const inicio = acumulado;
      acumulado += (c.total / Math.max(total, 1)) * 100;
      return `${COR_FATIA[c.tema]} ${inicio}% ${acumulado}%`;
    });
  const gradiente = fatias.length > 0 ? `conic-gradient(${fatias.join(", ")})` : "conic-gradient(#EBCFB2 0 100%)";

  return (
    <div className="space-y-4">
      {/* Faixa com o total e a composição da equipe */}
      <div className="rounded-xl bg-brand-100 px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p style={{ fontFamily: fonteDisplay }} className="text-5xl font-semibold leading-none text-ink-900">
            {total}
          </p>
          <p className="text-sm text-ink-600 mt-1">Colaboradores</p>
          {emFranquias > 0 && (
            <p className="text-xs text-ink-600 mt-0.5">
              {noSistema} no sistema + {emFranquias} em franquias
            </p>
          )}
        </div>
        <div className="flex-1 min-w-[240px]">
          <p className="text-sm font-medium text-ink-900 mb-1.5">Composição da equipe</p>
          <div className="flex h-3 rounded-full overflow-hidden" style={{ background: COR_PJ }}>
            <div style={{ width: `${pct(clt, total)}%`, background: COR_CLT }} />
            <div style={{ width: `${pct(pj, total)}%`, background: COR_PJ }} />
            {estagio > 0 && <div style={{ width: `${pct(estagio, total)}%`, background: COR_ESTAGIO }} />}
          </div>
          <div className="flex justify-between text-xs text-ink-800 mt-1.5">
            <span>
              CLT {clt} ({pct(clt, total)}%)
            </span>
            <span>
              PJ {pj} ({pct(pj, total)}%)
            </span>
            {estagio > 0 && (
              <span>
                Estágio {estagio} ({pct(estagio, total)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cartões por empresa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {cartoes.map((c) => (
          <div key={c.chave} className={`rounded-xl border px-4 py-3 ${ESTILO_CARTAO[c.tema]}`}>
            <p className="text-sm font-medium">{c.nome}</p>
            <p style={{ fontFamily: fonteDisplay }} className="text-3xl font-semibold leading-tight">
              {c.total}
              <span className="text-sm font-normal ml-2" style={{ fontFamily: "'Inter', sans-serif" }}>
                ({pct(c.total, total)}%)
              </span>
            </p>
            <p className="text-xs">
              CLT {c.clt} – PJ {c.pj}
              {c.estagio > 0 && <> – Estágio {c.estagio}</>}
            </p>
            {c.nota && <p className="text-[11px] opacity-80 mt-0.5">{c.nota}</p>}
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="card">
          <h2 style={{ fontFamily: fonteDisplay }} className="font-semibold text-ink-900 text-lg mb-3">
            Composição CLT × PJ por empresa
          </h2>
          <div className="flex items-end gap-4 h-28 px-1.5 border-b border-brand-200/70">
            {cartoes.map((c) => (
              <div key={c.chave} className="flex-1 h-full flex flex-col justify-end items-center text-xs">
                <span className="font-medium mb-0.5">{c.total}</span>
                <div className="w-full max-w-[44px] flex flex-col" style={{ height: `${(c.total / maiorTotal) * 82}%` }}>
                  {c.estagio > 0 && <div style={{ flex: c.estagio, background: COR_ESTAGIO }} />}
                  <div style={{ flex: c.pj, background: COR_PJ }} />
                  <div style={{ flex: c.clt, background: COR_CLT }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 px-1.5 pt-1 text-[11px] text-ink-600 text-center">
            {cartoes.map((c) => (
              <span key={c.chave} className="flex-1 truncate">
                {c.nome.replace("BSE ", "")}
              </span>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-ink-800">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COR_CLT }} />
              CLT
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COR_PJ }} />
              PJ
            </span>
            {cartoes.some((c) => c.estagio > 0) && (
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COR_ESTAGIO }} />
                Estágio
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontFamily: fonteDisplay }} className="font-semibold text-ink-900 text-lg mb-3">
            Participação por empresa
          </h2>
          <div className="flex items-center gap-5">
            <div className="relative w-28 h-28 rounded-full shrink-0" style={{ background: gradiente }}>
              <div className="absolute inset-[26px] rounded-full bg-white flex flex-col items-center justify-center leading-tight">
                <span style={{ fontFamily: fonteDisplay }} className="text-lg font-semibold text-ink-900">
                  {total}
                </span>
                <span className="text-[10px] text-ink-600">colaboradores</span>
              </div>
            </div>
            <ul className="text-sm space-y-1.5">
              {cartoes.map((c) => (
                <li key={c.chave} className="flex items-center gap-2">
                  <i className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COR_FATIA[c.tema] }} />
                  <span className="text-ink-800">{c.nome}</span>
                  <span className="font-medium text-ink-900 ml-auto pl-3">{pct(c.total, total)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
