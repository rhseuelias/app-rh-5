"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Cartao7, Titulo7, Ponto, P7, LINK7, LINK7_STYLE } from "./tema7";

/** Cores: as 4 da iniciativa valem em todas as abas; os tons de verde-água são o ano (2024 claro, mais recente escuro). */
const COR_INI = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const NOME_INI = ["Colaborador", "Empresa", "Acordo", "Término / outros"];
const TONS_ANO = ["#b7d6d2", "#4f9d96", "#0f5c55", "#0a3f3a", "#082c29", "#061f1d"];
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);

export interface LinhaIni { nome: string; por: number[] }
export interface LinhaTipo { nome: string; ini: number; anos: number[] }
export interface LinhaGrupo { nome: string; anos: number[] }

const COLUNAS = "minmax(90px,190px) minmax(0,1fr) 34px";

function Barra({ valores, cores, escuras = [], largura = 100, textos }: { valores: number[]; cores: string[]; escuras?: number[]; largura?: number; textos?: string[] }) {
  const t = soma(valores);
  return (
    <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-[6px]" style={{ width: `${largura}%`, minWidth: 26, background: P7.track }}>
      {valores.map((n, i) =>
        n > 0 ? (
          <div key={i} className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-bold"
            style={{ width: `${(n / t) * 100}%`, background: cores[i], color: escuras.includes(i) ? P7.ink : "#fff" }}
            title={textos?.[i] ? `${textos[i]}: ${n}` : String(n)}>
            {n / t >= 0.09 ? n : ""}
          </div>
        ) : null
      )}
    </div>
  );
}

function Linha({ nome, total, children }: { nome: string; total: number; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-3" style={{ gridTemplateColumns: COLUNAS }}>
      <span className="truncate text-[12.5px]" title={nome}>{nome}</span>
      {children}
      <span className="text-right text-[12.5px] font-extrabold tabular-nums">{total}</span>
    </div>
  );
}

function LegIni() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
      {NOME_INI.map((n, i) => (<span key={n}><Ponto cor={COR_INI[i]} />{n}</span>))}
    </div>
  );
}

export default function DesligamentosAbas({
  ini, cargo, unidade, tipos, grupos, anos, nomeGrupo,
}: {
  ini: LinhaIni[]; cargo: LinhaIni[]; unidade: LinhaIni[]; tipos: LinhaTipo[]; grupos: LinhaGrupo[]; anos: string[]; nomeGrupo: "empresa" | "unidade";
}) {
  const [aba, setAba] = useState(0);
  const [modo, setModo] = useState<"cargo" | "unidade">("cargo");
  const abas = ["Iniciativa", "Por cargo", "Tipo de rescisão", nomeGrupo === "empresa" ? "Por empresa" : "Por unidade"];
  const ranking = modo === "cargo" ? cargo : unidade;
  const maxR = Math.max(1, ...ranking.map((r) => soma(r.por)));
  const maxT = Math.max(1, ...tipos.map((t) => soma(t.anos)));
  const maxG = Math.max(1, ...grupos.map((g) => soma(g.anos)));
  const tomAno = (i: number) => TONS_ANO[Math.min(i, TONS_ANO.length - 1)];

  const titulos = [
    ["Iniciativa, por ano", "Cada barra soma 100% do ano; número dentro = quantidade"],
    ["Ranking de saídas", "Barra mais longa = mais saídas; cores = iniciativa"],
    ["Tipo de rescisão, por ano", "A cor mostra a iniciativa do tipo; do claro ao forte = do ano mais antigo ao mais recente"],
    [nomeGrupo === "empresa" ? "Desligamentos por empresa" : "Desligamentos por unidade", "Saídas separadas por ano (do claro ao escuro)"],
  ];

  return (
    <Cartao7>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {abas.map((a, i) => (
            <button key={a} type="button" onClick={() => setAba(i)} aria-pressed={aba === i}
              className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold"
              style={{ borderColor: aba === i ? P7.deep : P7.bd, background: aba === i ? P7.deep : "#fff", color: aba === i ? "#fff" : P7.sec }}>
              {a}
            </button>
          ))}
        </div>
        <Link href="/desligamentos" className={LINK7} style={LINK7_STYLE}>Abrir módulo</Link>
      </div>
      <Titulo7 sub={titulos[aba][1]}>{titulos[aba][0]}</Titulo7>

      {aba === 0 && (
        <>
          <LegIni />
          <div className="flex flex-col gap-[10px]">
            {ini.map((r) => (
              <Linha key={r.nome} nome={r.nome} total={soma(r.por)}>
                <Barra valores={r.por} cores={COR_INI} escuras={[3]} textos={NOME_INI} />
              </Linha>
            ))}
          </div>
        </>
      )}

      {aba === 1 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
              {NOME_INI.map((n, i) => (<span key={n}><Ponto cor={COR_INI[i]} />{n}</span>))}
            </div>
            <div className="inline-flex overflow-hidden rounded-[8px] border text-[12px] font-semibold" style={{ borderColor: P7.bd }}>
              {(["cargo", "unidade"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m} className="px-3 py-1"
                  style={{ background: modo === m ? P7.deep : "#fff", color: modo === m ? "#fff" : P7.sec }}>
                  {m === "cargo" ? "Por cargo" : "Por unidade"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-[10px]">
            {ranking.length === 0 && <p className="text-[12.5px]" style={{ color: P7.sec }}>Sem dados para mostrar.</p>}
            {ranking.map((r, i) => (
              <Linha key={r.nome} nome={`${i + 1}º  ${r.nome}`} total={soma(r.por)}>
                <Barra valores={r.por} cores={COR_INI} escuras={[3]} textos={NOME_INI} largura={(soma(r.por) / maxR) * 100} />
              </Linha>
            ))}
          </div>
        </>
      )}

      {aba === 2 && (
        <>
          <LegIni />
          <div className="flex flex-col gap-[10px]">
            {tipos.map((t) => (
              <Linha key={t.nome} nome={t.nome} total={soma(t.anos)}>
                <div style={{ width: `${(soma(t.anos) / maxT) * 100}%`, minWidth: 26 }}>
                  <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-[6px]" style={{ background: P7.track }}>
                    {t.anos.map((n, i) =>
                      n > 0 ? (
                        <div key={i} className="flex min-w-0 items-center justify-center text-[11px] font-bold"
                          style={{ width: `${(n / soma(t.anos)) * 100}%`, background: COR_INI[t.ini], opacity: Math.min(1, 0.5 + i * 0.25), color: t.ini === 3 ? P7.ink : "#fff" }}
                          title={`${anos[i]}: ${n}`}>
                          {n / soma(t.anos) >= 0.15 ? n : ""}
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              </Linha>
            ))}
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: P7.lab }}>Em cada barra: {anos.join(", ")} (do mais fraco ao mais forte).</p>
        </>
      )}

      {aba === 3 && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
            {anos.map((y, i) => (<span key={y}><Ponto cor={tomAno(i)} />{y}</span>))}
          </div>
          <div className="flex flex-col gap-[10px]">
            {grupos.map((g) => (
              <Linha key={g.nome} nome={g.nome} total={soma(g.anos)}>
                <Barra valores={g.anos} cores={g.anos.map((_, i) => tomAno(i))} escuras={[0]} largura={(soma(g.anos) / maxG) * 100} textos={anos} />
              </Linha>
            ))}
          </div>
        </>
      )}
    </Cartao7>
  );
}
