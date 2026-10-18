import type { CSSProperties } from "react";
import { MANROPE, P7, nomeProprio } from "./tema7";
import { semPorMeta } from "./Semaforo";

/** Clima e treinamento em quadrados (Modelo 5): dois quadrados grandes (clima organizacional e treinamento)
 * e um quadrado para cada unidade/empresa. Quem está dentro da meta fica em verde (mais escuro = clima maior);
 * abaixo da meta fica amarelo (até 10 pontos) ou vermelho (mais de 10), sempre com ícone e texto. */

const DEEP = "#0f5c55";

function mix(c1: string, c2: string, t: number): string {
  const a = [1, 3, 5].map((i) => parseInt(c1.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(c2.slice(i, i + 2), 16));
  return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, "0")).join("");
}

const sinal = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");

function TileGrande({ titulo, valor, meta }: { titulo: string; valor: number | null; meta: number }) {
  if (valor === null)
    return (
      <div
        className="flex flex-col rounded-[12px] px-[14px] py-3"
        style={{ background: "#eef2f1", color: P7.lab, border: "1px dashed #c4d2cf", fontFamily: MANROPE }}
      >
        <small className="text-[13px] font-bold">{titulo}</small>
        <b className="text-[40px] font-extrabold leading-[1.2]">—</b>
        <span className="text-[12.5px]">ainda não informado</span>
      </div>
    );
  const v = Math.round(valor);
  const sem = semPorMeta(valor, meta);
  const estilo: Record<typeof sem, { bg: string; fg: string; texto: string }> = {
    bom: { bg: DEEP, fg: "#ffffff", texto: `✓ dentro da meta (${meta}%)` },
    atencao: { bg: "#fab219", fg: P7.ink, texto: `! ${meta - v} ${meta - v === 1 ? "ponto abaixo" : "pontos abaixo"} da meta (${meta}%)` },
    critico: { bg: "#d03b3b", fg: "#ffffff", texto: `✕ ${meta - v} pontos abaixo da meta (${meta}%)` },
  };
  const e = estilo[sem];
  return (
    <div className="flex flex-col rounded-[12px] px-[14px] py-3" style={{ background: e.bg, color: e.fg, fontFamily: MANROPE }}>
      <small className="text-[13px] font-bold">{titulo}</small>
      <b className="text-[40px] font-extrabold leading-[1.2]">{v}%</b>
      <span className="text-[12.5px]">{e.texto}</span>
    </div>
  );
}

export default function ClimaTreinamento({
  climaMedio,
  treinoMedio,
  metaClima,
  metaTreinamento,
  itens,
}: {
  climaMedio: number | null;
  treinoMedio: number | null;
  metaClima: number;
  metaTreinamento: number;
  itens: { nome: string; pct: number | null }[];
}) {
  const comValor = (itens.filter((i) => i.pct !== null) as { nome: string; pct: number }[]).sort((a, b) => b.pct - a.pct);
  const base = metaClima - 2;
  return (
    <div>
      <div className="mb-[10px] grid grid-cols-1 gap-[10px] sm:grid-cols-2">
        <TileGrande titulo="Clima organizacional" valor={climaMedio} meta={metaClima} />
        <TileGrande titulo="Treinamento" valor={treinoMedio} meta={metaTreinamento} />
      </div>

      {comValor.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: P7.sec }}>
          Nenhuma unidade/empresa com clima informado.
        </p>
      ) : (
        <>
          <div className="grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {comValor.map((it) => {
              const v = Math.round(it.pct);
              const d = v - metaClima;
              const sem = semPorMeta(it.pct, metaClima);
              let bg: string;
              let fg: string;
              let linha: string;
              if (sem === "bom") {
                const t = Math.max(0, Math.min(1, (it.pct - base) / (100 - base)));
                bg = mix("#dcece9", DEEP, t);
                fg = t > 0.45 ? "#ffffff" : P7.ink;
                linha = d === 0 ? "✓ na meta" : `✓ ${sinal(d)} pts da meta`;
              } else if (sem === "atencao") {
                bg = "#fde7b0";
                fg = P7.ink;
                linha = `! ${sinal(d)} pts da meta`;
              } else {
                bg = "#f6c9c8";
                fg = P7.ink;
                linha = `✕ ${sinal(d)} pts da meta`;
              }
              const st: CSSProperties = { background: bg, color: fg, fontFamily: MANROPE };
              return (
                <div
                  key={it.nome}
                  className="flex min-w-0 flex-col rounded-[12px] px-[14px] py-3"
                  style={st}
                  title={`${nomeProprio(it.nome)}: ${v}% (meta ${metaClima}%, ${sinal(d)} pontos)`}
                >
                  <small className="truncate text-[13px] font-bold">{nomeProprio(it.nome)}</small>
                  <b className="text-[28px] font-extrabold leading-[1.2]">{v}%</b>
                  <span className="text-[12.5px]">{linha}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-[10px] text-[12.5px]" style={{ color: P7.sec }}>
            Quanto mais escuro o quadrado verde, maior o clima. Amarelo e vermelho estão abaixo da meta.
          </p>
        </>
      )}
    </div>
  );
}
