"use client";

import Link from "next/link";
import { useState } from "react";
import { Cartao, TituloCartao, CABECALHO_TABELA, LINK_SUTIL, INTER, TONS } from "./Blocos";
import type { EstadoEtapaVisual, LinhaIntegracao, SituacaoLinha } from "./integracao-dados";

const MAX_LINHAS = 8;
const COLUNAS = "200px 96px minmax(300px,1fr) 150px 140px";

const COR_ETAPA: Record<EstadoEtapaVisual, { background: string; borderColor: string }> = {
  feita: { background: "#2f9e6b", borderColor: "#2f9e6b" },
  atual: { background: "#fff", borderColor: "#3d3d3d" },
  atrasada: { background: "#d92d20", borderColor: "#d92d20" },
  futura: { background: "#fff", borderColor: "#e7ddd2" },
};

const ROTULO_ESTADO: Record<EstadoEtapaVisual, string> = {
  feita: "feita",
  atual: "em curso",
  atrasada: "atrasada",
  futura: "ainda não começou",
};

const SIT: Record<SituacaoLinha, { icone: string; rotulo: string; fg: string; bg: string }> = {
  atrasado: { icone: "✕", rotulo: "Atrasado", fg: TONS.red.fg, bg: TONS.red.bg },
  vence: { icone: "▲", rotulo: "Vence em breve", fg: TONS.orange.fg, bg: TONS.orange.bg },
  prazo: { icone: "✓", rotulo: "No prazo", fg: TONS.green.fg, bg: TONS.green.bg },
};

type Filtro = "todos" | SituacaoLinha;

export default function IntegracaoPainel({ linhas }: { linhas: LinhaIntegracao[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [empresa, setEmpresa] = useState<string>("todas");
  const [aberta, setAberta] = useState<string | null>(null);

  const emIntegracao = linhas.filter((l) => l.fase === "integracao").length;
  const emExperiencia = linhas.length - emIntegracao;
  const empresas = Array.from(new Set(linhas.map((l) => l.empresa))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const conta = (s: SituacaoLinha) => linhas.filter((l) => l.situacao === s).length;
  const filtros: { chave: Filtro; rotulo: string; n: number }[] = [
    { chave: "todos", rotulo: "Todos", n: linhas.length },
    { chave: "atrasado", rotulo: "Atrasados", n: conta("atrasado") },
    { chave: "vence", rotulo: "Vencem em até 3 dias", n: conta("vence") },
    { chave: "prazo", rotulo: "No prazo", n: conta("prazo") },
  ];

  const filtradas = linhas.filter(
    (l) => (filtro === "todos" || l.situacao === filtro) && (empresa === "todas" || l.empresa === empresa)
  );
  const visiveis = filtradas.slice(0, MAX_LINHAS);

  const chip = (ativo: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
      ativo
        ? "border-[#262626] bg-[#262626] text-white"
        : "border-[#e7ddd2] bg-white text-[#3d3d3d] hover:border-[#262626]"
    }`;

  return (
    <Cartao>
      <TituloCartao
        direita={
          <Link href="/onboarding" className={LINK_SUTIL}>
            Ver painel completo
          </Link>
        }
      >
        Processo de integração
      </TituloCartao>

      {linhas.length === 0 ? (
        <p className="text-[13px] text-[#737373]">Ninguém em processo de integração no momento.</p>
      ) : (
        <>
          <p className="text-[13px] text-[#3d3d3d] mb-3">
            <b className="text-[#262626]">{emIntegracao}</b> em integração ·{" "}
            <b className="text-[#262626]">{emExperiencia}</b> em experiência
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {filtros.map((f) => (
              <button key={f.chave} type="button" onClick={() => setFiltro(f.chave)} className={chip(filtro === f.chave)}>
                {f.rotulo} {f.n}
              </button>
            ))}
            {empresas.length > 1 && (
              <>
                <span className="mx-1 h-4 w-px bg-[#e7ddd2]" aria-hidden="true" />
                {empresas.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmpresa(empresa === e ? "todas" : e)}
                    className={chip(empresa === e)}
                  >
                    {e}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div
                className={`grid gap-3 border-b border-[#f4ebe1] pb-2 ${CABECALHO_TABELA}`}
                style={{ gridTemplateColumns: COLUNAS }}
              >
                <div>Colaborador</div>
                <div>Quem cuida</div>
                <div>Linha do tempo · {linhas[0]?.etapas.length || 11} etapas</div>
                <div>Etapa atual</div>
                <div className="text-right">Prazo</div>
              </div>

              {visiveis.length === 0 && (
                <p className="py-4 text-[13px] text-[#737373]">Ninguém neste filtro.</p>
              )}

              {visiveis.map((l) => {
                const s = SIT[l.situacao];
                const expandida = aberta === l.id;
                return (
                  <div key={l.id} className="border-b border-[#f4ebe1] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setAberta(expandida ? null : l.id)}
                      aria-expanded={expandida}
                      className="grid w-full items-center gap-3 py-3 text-left hover:bg-[#fffaf4]"
                      style={{ gridTemplateColumns: COLUNAS, fontFamily: INTER }}
                    >
                      <div className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#262626] truncate">
                          <span aria-hidden="true" className="mr-1 text-[#737373]">{expandida ? "▾" : "▸"}</span>
                          {l.nome}
                        </span>
                        <span className="block text-[12px] text-[#737373] truncate pl-4">
                          {[l.cargo, l.empresa].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <div className="text-[13px] text-[#3d3d3d]">{l.quem}</div>
                      <div className="flex items-center">
                        {l.etapas.map((e, i) => (
                          <span key={i} className="flex items-center flex-1 last:flex-none" title={`${e.nome}: ${ROTULO_ESTADO[e.estado]}`}>
                            <span
                              className="block w-3 h-3 rounded-full border-2 shrink-0"
                              style={COR_ETAPA[e.estado]}
                            />
                            {i < l.etapas.length - 1 && (
                              <span
                                className="h-[2px] flex-1"
                                style={{ background: e.estado === "feita" ? "#2f9e6b" : "#f0e8df" }}
                              />
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="text-[13px] text-[#262626] truncate">{l.etapaAtual}</div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap"
                          style={{ color: s.fg, background: s.bg }}
                        >
                          <span aria-hidden="true">{s.icone}</span>
                          {s.rotulo}
                        </span>
                        <span className="text-[12px] text-[#737373] tabular-nums">{l.prazoTexto}</span>
                      </div>
                    </button>

                    {expandida && (
                      <div className="mb-3 rounded-[10px] bg-[#fffaf4] border border-[#f1e4d6] px-4 py-3">
                        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                          {l.etapas.map((e, i) => (
                            <li key={i} className="flex items-center gap-2 text-[12.5px]">
                              <span
                                className="block w-3 h-3 rounded-full border-2 shrink-0"
                                style={COR_ETAPA[e.estado]}
                              />
                              <span className="text-[#262626] truncate">
                                {i + 1}. {e.nome}
                              </span>
                              <span className="ml-auto text-[#737373] tabular-nums whitespace-nowrap">
                                {e.resp}
                                {e.data ? ` · ${e.estado === "feita" ? "feita" : "até"} ${e.data}` : ""}
                              </span>
                            </li>
                          ))}
                        </ol>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] text-[#737373]">{l.cronometro ?? `${l.feitas} etapas feitas`}</span>
                          <Link href={`/onboarding/${l.colaboradorId}`} className={LINK_SUTIL}>
                            Abrir processo ›
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#737373]">
            <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
              {(["feita", "atual", "atrasada", "futura"] as EstadoEtapaVisual[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="block w-3 h-3 rounded-full border-2" style={COR_ETAPA[k]} />
                  {k === "feita" ? "Feita" : k === "atual" ? "Em curso" : k === "atrasada" ? "Atrasada" : "Ainda não começou"}
                </span>
              ))}
            </span>
            <span>
              Mostrando {visiveis.length} de {filtradas.length}
            </span>
          </div>
        </>
      )}
    </Cartao>
  );
}
