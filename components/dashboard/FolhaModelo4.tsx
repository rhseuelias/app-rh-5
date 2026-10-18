import { MANROPE, P7, ST7, Ponto } from "./tema7";

/** Custo da folha sobre o faturamento em barras deitadas (Modelo 4): da maior para a menor, com a linha
 * preta do limite e, ao lado, quanto falta para chegar nele (ou quanto passou). */

export interface ItemFolha {
  id: string;
  nome: string;
  cor: string;
  custo: number;
  fat: number;
  pct: number;
}

const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");
const reais = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const COLUNAS = "sm:grid-cols-[140px_minmax(0,1fr)_200px]";

export default function FolhaModelo4({ itens, limite, escala }: { itens: ItemFolha[]; limite: number; escala: number }) {
  const ordem = [...itens].sort((a, b) => b.pct - a.pct);
  const posLimite = (limite / escala) * 100;
  return (
    <div style={{ fontFamily: MANROPE, color: P7.ink }}>
      <div className={`hidden gap-x-3 sm:grid ${COLUNAS}`}>
        <span />
        <div className="relative h-[20px] text-[12.5px]" style={{ color: P7.lab }}>
          <span className="absolute left-0">0%</span>
          <span className="absolute -translate-x-1/2 font-bold" style={{ left: `${posLimite}%`, color: P7.ink }}>
            limite {limite}%
          </span>
          <span className="absolute right-0">{escala}%</span>
        </div>
        <span />
      </div>
      {ordem.map((it) => {
        const bom = it.pct <= limite;
        const cor = bom ? ST7.good : ST7.bad;
        const w = Math.min(100, (it.pct / escala) * 100);
        const dentro = w > 82; // rótulo cabe melhor dentro da barra quando ela é muito comprida
        const dif = Math.abs(limite - it.pct);
        return (
          <div
            key={it.id}
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-1 py-[6px] ${COLUNAS}`}
            title={`${it.nome}: R$ ${reais(it.custo)} de R$ ${reais(it.fat)} = ${fmt1(it.pct)}% do faturamento (limite ${limite}%)`}
          >
            <span className="truncate text-[15.5px] font-bold">
              <Ponto cor={it.cor} redondo />
              {it.nome}
            </span>
            <div className="relative h-[22px] rounded-[4px]" style={{ background: "#f1f5f4" }}>
              <div className="h-[22px] rounded-r-[4px]" style={{ width: `${w}%`, background: cor }} />
              <b
                className="absolute top-0 whitespace-nowrap text-[16px] font-extrabold leading-[22px]"
                style={dentro ? { right: `calc(${100 - w}% + 8px)`, color: "#ffffff" } : { left: `calc(${w}% + 8px)` }}
              >
                {fmt1(it.pct)}%
              </b>
              <i
                className="absolute -top-[4px] -bottom-[4px] w-[3px] rounded-[2px]"
                style={{ left: `${posLimite}%`, marginLeft: -1.5, background: P7.ink }}
              />
            </div>
            <span className="text-[13.5px]" style={{ color: bom ? P7.sec : "#a52828", fontWeight: bom ? 400 : 700 }}>
              {bom ? `faltam ${fmt1(dif)} pts p/ o limite` : `passou ${fmt1(dif)} pts do limite`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
