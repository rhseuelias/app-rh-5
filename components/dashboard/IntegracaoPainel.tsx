"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Cartao7,
  Icone,
  Ponto,
  MANROPE,
  P7,
  RESP_COR,
  ST7,
  TXT_ATRASO,
  corEmpresa,
  nomeProprio,
  ROTULO_COLUNA,
  COR_ROTULO,
  LINK7,
  LINK7_STYLE,
  type K,
} from "./tema7";
import type { LinhaIntegracao, SituacaoLinha } from "./integracao-dados";

const MAX_LINHAS = 8;
const COLUNAS = "190px 90px minmax(240px,1fr) 170px 150px 16px";

const K_DA_SITUACAO: Record<SituacaoLinha, K | null> = { atrasado: "bad", vence: "warn", prazo: null };

type Filtro = "todos" | SituacaoLinha;

function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={aberto ? "M3.5 6l4.5 4.5L12.5 6" : "M6 3.5L10.5 8 6 12.5"}
        fill="none"
        stroke={P7.sec}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Linha do tempo de 11 barrinhas: concluída (verde-escuro), em andamento (azul), atrasada (vermelho), a fazer (cinza). */
function LinhaDoTempo({ linha }: { linha: LinhaIntegracao }) {
  const idxAtual = linha.etapas.findIndex((e) => e.estado !== "feita");
  return (
    <div className="flex h-[22px] items-center gap-[4px]" role="img" aria-label={`${linha.nome}: ${linha.feitas} de ${linha.etapas.length} etapas concluídas`}>
      {linha.etapas.map((e, i) => {
        const foco = i === idxAtual;
        const cor =
          e.estado === "feita" ? P7.deep : e.estado === "atrasada" ? ST7.bad : foco ? P7.azul : P7.futuro;
        return (
          <span
            key={i}
            title={`Etapa ${i + 1}: ${e.nome}`}
            className="flex-1"
            style={{ background: cor, height: foco ? 6 : 4, borderRadius: 99 }}
          />
        );
      })}
    </div>
  );
}

function Passo({ linha, i }: { linha: LinhaIntegracao; i: number }) {
  const e = linha.etapas[i];
  const idxAtual = linha.etapas.findIndex((x) => x.estado !== "feita");
  const foco = i === idxAtual;
  const n = i + 1;
  const respCor = RESP_COR[e.resp] ?? P7.futuro;
  let circ;
  if (e.estado === "feita")
    circ = (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: P7.deep }}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 7.3l2.8 2.8L11 4.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  else if (foco || e.estado === "atrasada")
    circ = (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
        style={{ background: e.estado === "atrasada" ? ST7.bad : P7.azul }}
      >
        {n}
      </span>
    );
  else
    circ = (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[11.5px] font-bold"
        style={{ borderColor: P7.futuro, color: P7.sec }}
      >
        {n}
      </span>
    );

  return (
    <div className="relative flex flex-col items-center gap-[5px] text-center">
      {circ}
      <div className="min-h-[29px] text-[11.5px] leading-[1.25]" style={{ color: P7.ink, fontWeight: foco ? 800 : 600 }}>
        {e.nome}
      </div>
      <div className="text-[11.5px]">
        {e.estado === "atrasada" ? (
          <b style={{ color: TXT_ATRASO }}>prazo {e.data}</b>
        ) : e.estado === "feita" ? (
          <span style={{ color: P7.sec }}>{e.data}</span>
        ) : (
          <span style={{ color: P7.sec }}>{e.data ? `até ${e.data}` : "—"}</span>
        )}
      </div>
      <div className="h-1 w-[22px] rounded-sm" style={{ background: respCor }} title={`Quem cuida: ${e.resp}`} />
    </div>
  );
}

export default function IntegracaoPainel({
  linhas,
  hojeTexto,
}: {
  linhas: LinhaIntegracao[];
  hojeTexto: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [empresa, setEmpresa] = useState<string>("todas");
  const [aberta, setAberta] = useState<string | null>(null);

  const emIntegracao = linhas.filter((l) => l.fase === "integracao").length;
  const emExperiencia = linhas.length - emIntegracao;
  const empresas = Array.from(new Set(linhas.map((l) => l.empresa))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const conta = (s: SituacaoLinha) => linhas.filter((l) => l.situacao === s).length;

  const filtradas = linhas.filter(
    (l) => (filtro === "todos" || l.situacao === filtro) && (empresa === "todas" || l.empresa === empresa)
  );
  const visiveis = filtradas.slice(0, MAX_LINHAS);

  const chip = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
      ativo ? "text-white" : "hover:brightness-95"
    }`;
  const chipStyle = (ativo: boolean) => ({ background: ativo ? P7.deep : P7.bg, color: ativo ? "#fff" : P7.ink, fontFamily: MANROPE });

  return (
    <Cartao7>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[14px] font-bold" style={{ fontFamily: MANROPE, color: P7.ink }}>
          Processo de integração
        </div>
        <div className="text-[11.5px]" style={{ color: P7.sec }}>
          <b>{emIntegracao}</b> em integração · <b>{emExperiencia}</b> em experiência · hoje é {hojeTexto}
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: P7.sec }}>
          Ninguém em processo de integração no momento.
        </p>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFiltro("todos")} className={chip(filtro === "todos")} style={chipStyle(filtro === "todos")}>
                Todos <b>{linhas.length}</b>
              </button>
              <button type="button" onClick={() => setFiltro("atrasado")} className={chip(filtro === "atrasado")} style={chipStyle(filtro === "atrasado")}>
                <Icone k="bad" /> Atrasados <b>{conta("atrasado")}</b>
              </button>
              <button type="button" onClick={() => setFiltro("vence")} className={chip(filtro === "vence")} style={chipStyle(filtro === "vence")}>
                <Icone k="warn" /> Vencem em até 3 dias <b>{conta("vence")}</b>
              </button>
              <button type="button" onClick={() => setFiltro("prazo")} className={chip(filtro === "prazo")} style={chipStyle(filtro === "prazo")}>
                <Icone k="good" /> No prazo <b>{conta("prazo")}</b>
              </button>
            </div>
            {empresas.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold" style={{ color: P7.lab }}>
                  Empresa
                </span>
                {empresas.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmpresa(empresa === e ? "todas" : e)}
                    className={chip(empresa === e)}
                    style={chipStyle(empresa === e)}
                  >
                    <span className="h-[10px] w-[10px] rounded-full" style={{ background: corEmpresa(e) }} />
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={`mb-1.5 grid gap-x-3 ${ROTULO_COLUNA}`} style={{ gridTemplateColumns: COLUNAS, ...COR_ROTULO }}>
                <div>Colaborador</div>
                <div>Quem cuida</div>
                <div>Linha do tempo · {linhas[0]?.etapas.length || 11} etapas</div>
                <div>Etapa atual</div>
                <div>Prazo</div>
                <div />
              </div>

              {visiveis.length === 0 && (
                <p className="border-t py-4 text-[12.5px]" style={{ borderColor: P7.grid, color: P7.sec }}>
                  Ninguém neste filtro.
                </p>
              )}

              {visiveis.map((l) => {
                const k = K_DA_SITUACAO[l.situacao];
                const expandida = aberta === l.id;
                return (
                  <div key={l.id}>
                    <button
                      type="button"
                      onClick={() => setAberta(expandida ? null : l.id)}
                      aria-expanded={expandida}
                      className="grid h-[34px] w-full items-center gap-x-3 border-t text-left"
                      style={{
                        gridTemplateColumns: COLUNAS,
                        borderColor: P7.grid,
                        fontFamily: MANROPE,
                        ...(expandida ? { background: P7.bg, borderRadius: "10px 10px 0 0", padding: "0 10px", margin: "0 -10px", width: "calc(100% + 20px)" } : {}),
                      }}
                    >
                      <span className="truncate text-[12.5px] font-semibold" style={{ color: P7.ink }}>
                        <Ponto cor={corEmpresa(l.empresa)} redondo />
                        {nomeProprio(l.nome)}
                      </span>
                      <span className="whitespace-nowrap text-[12.5px]" style={{ color: P7.ink }}>
                        <Ponto cor={RESP_COR[l.quem] ?? P7.futuro} />
                        {l.quem}
                      </span>
                      <span>
                        <LinhaDoTempo linha={l} />
                      </span>
                      <span className="truncate text-[12.5px]" style={{ color: P7.ink }}>
                        <span className="mr-1.5 tabular-nums" style={{ color: P7.lab }}>
                          {Math.min(l.feitas + 1, l.etapas.length)}/{l.etapas.length}
                        </span>
                        {l.etapaAtual}
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]" style={{ color: P7.ink }}>
                        {k && <Icone k={k} />}
                        {l.prazoData && <span className="font-semibold">{l.prazoData}</span>}
                        <span style={{ color: l.situacao === "atrasado" ? TXT_ATRASO : P7.sec, fontWeight: k ? 600 : 400 }}>
                          {l.prazoData ? "· " : ""}
                          {l.prazoRel}
                        </span>
                      </span>
                      <span>
                        <Chevron aberto={expandida} />
                      </span>
                    </button>

                    {expandida && (
                      <div className="mb-1.5 overflow-x-auto" style={{ background: P7.bg, borderRadius: "0 0 10px 10px", padding: "14px 10px", margin: "0 -10px 6px" }}>
                        <div className="min-w-[880px]">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2.5">
                            <div className="text-[12.5px]" style={{ color: P7.ink }}>
                              <b>{nomeProprio(l.nome)}</b> · {[l.cargo, l.empresa].filter(Boolean).join(" · ")}
                            </div>
                            <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: P7.ink }}>
                              {l.cronometro && (
                                <>
                                  {k && <Icone k={k} />}
                                  <span>{l.cronometro}</span>
                                </>
                              )}
                              <Link href={`/onboarding/${l.colaboradorId}`} className={`${LINK7} ml-3`} style={LINK7_STYLE}>
                                Abrir processo ›
                              </Link>
                            </div>
                          </div>
                          <div className="relative">
                            <div className="absolute top-[10px] h-[3px] rounded-sm" style={{ left: "4.545%", right: "4.545%", background: P7.futuro }}>
                              <div
                                className="h-[3px] rounded-sm"
                                style={{
                                  width: `${l.etapas.length > 1 ? (l.feitas / (l.etapas.length - 1)) * 100 : 0}%`,
                                  maxWidth: "100%",
                                  background: P7.deep,
                                }}
                              />
                            </div>
                            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${l.etapas.length}, minmax(0, 1fr))` }}>
                              {l.etapas.map((_, i) => (
                                <Passo key={i} linha={l} i={i} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-[11px] text-[11.5px]"
            style={{ borderColor: P7.grid, color: P7.sec }}
          >
            <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <span><Ponto cor={P7.deep} />Concluída</span>
              <span><Ponto cor={P7.azul} />Em andamento</span>
              <span><Ponto cor={ST7.bad} />Atrasada</span>
              <span><Ponto cor={P7.futuro} />A fazer</span>
              <span style={{ color: P7.lab }}>|</span>
              <span>Quem cuida:</span>
              <span><Ponto cor={RESP_COR.RH} />RH</span>
              <span><Ponto cor={RESP_COR["Líder"]} />Líder</span>
              <span><Ponto cor={RESP_COR.Colaborador} />Colaborador</span>
            </span>
            <span>
              Mostrando {visiveis.length} de {filtradas.length} · os mais urgentes primeiro ·{" "}
              <Link href="/onboarding" className="font-bold hover:underline" style={LINK7_STYLE}>
                Ver painel completo
              </Link>
            </span>
          </div>
        </>
      )}
    </Cartao7>
  );
}
