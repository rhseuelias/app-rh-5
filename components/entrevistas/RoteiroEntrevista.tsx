"use client";

import type { ReactNode } from "react";
import { fmtNota, notaCenario, resumir, type BlocoRoteiro, type PerguntaRoteiro, type RespRoteiro, type Roteiro } from "@/lib/roteiro";

const COR_NOTA: Record<number, string> = { 1: "#b42318", 2: "#c9763a", 3: "#7a7570", 4: "#15803d", 5: "#0f766e" };

function Nota({ id, resp, aoMudar, desligado }: { id: string; resp: RespRoteiro; aoMudar: (r: RespRoteiro) => void; desligado?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const ativo = resp.notas[id] === n;
        return (
          <button
            key={n}
            type="button"
            disabled={desligado}
            aria-pressed={ativo}
            aria-label={`Nota ${n}`}
            onClick={() => {
              const notas = { ...resp.notas };
              if (ativo) delete notas[id];
              else notas[id] = n;
              aoMudar({ ...resp, notas });
            }}
            className="w-9 h-9 rounded-md border font-display text-base"
            style={ativo ? { background: COR_NOTA[n], color: "#fff", borderColor: COR_NOTA[n] } : { background: "#fff", borderColor: "#e6d5c3" }}
          >
            {n}
          </button>
        );
      })}
      <span className="text-xs text-ink-500 ml-1">1 abaixo · 3 atende · 5 supera</span>
    </div>
  );
}

function Pergunta({ p, num, roteiro, resp, aoMudar, desligado }: { p: PerguntaRoteiro; num: number; roteiro: Roteiro; resp: RespRoteiro; aoMudar: (r: RespRoteiro) => void; desligado?: boolean }) {
  return (
    <div className="border-t border-brand-100 pt-3 space-y-2">
      <div className="flex gap-2">
        <span className="font-display text-ink-500 min-w-[1.5rem]">{num}</span>
        <b className="font-semibold">{p.texto}</b>
      </div>
      <div className="flex flex-wrap gap-1">
        {p.comps.map((c) => (
          <span key={c} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${p.doCargo ? "bg-teal-50 text-teal-800" : "bg-brand-100 text-brand-700"}`}>
            {c}
          </span>
        ))}
        {p.doCargo && <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-ink-900 text-white">Do cargo</span>}
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5 text-xs">
        <div className="rounded-md bg-green-50 text-green-800 px-2 py-1.5">
          <b>Ouça:</b> {p.bom}
        </div>
        <div className="rounded-md bg-red-50 text-red-800 px-2 py-1.5">
          <b>Atenção:</b> {p.alerta}
        </div>
      </div>
      {p.extra === "citadas" && (
        <div className="text-sm space-y-1">
          <span className="text-ink-500">Responsabilidades do cargo que o candidato citou sozinho:</span>
          {roteiro.responsabilidades.map((g, i) => (
            <label key={i} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                disabled={desligado}
                checked={!!resp.cit[`cit.${i}`]}
                onChange={(e) => aoMudar({ ...resp, cit: { ...resp.cit, [`cit.${i}`]: e.target.checked } })}
              />
              {g}
            </label>
          ))}
        </div>
      )}
      {p.extra === "matriz" && (
        <div className="text-sm space-y-1.5">
          <span className="text-ink-500">Domínio de cada responsabilidade do cargo:</span>
          {roteiro.responsabilidades.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2">
              <span>{g}</span>
              <span className="inline-flex rounded-md border border-brand-200 overflow-hidden">
                {(["Nunca fez", "Já fez", "Domina"] as const).map((l, v) => {
                  const ativo = resp.mx[`mx.${i}`] === v;
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={desligado}
                      aria-pressed={ativo}
                      onClick={() => aoMudar({ ...resp, mx: { ...resp.mx, [`mx.${i}`]: v as 0 | 1 | 2 } })}
                      className="px-2.5 py-1 border-r last:border-r-0 border-brand-200"
                      style={ativo ? { background: v === 0 ? "#b42318" : v === 1 ? "#7a7570" : "#0f766e", color: "#fff" } : { background: "#fff" }}
                    >
                      {l}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      <Nota id={p.id} resp={resp} aoMudar={aoMudar} desligado={desligado} />
      <textarea
        className="input !py-1.5"
        rows={1}
        disabled={desligado}
        placeholder="Anote a resposta (opcional)"
        value={resp.txt[p.id] ?? ""}
        onChange={(e) => aoMudar({ ...resp, txt: { ...resp.txt, [p.id]: e.target.value } })}
      />
    </div>
  );
}

function Bloco({ b, num0, roteiro, resp, aoMudar, mediaBloco, desligado, indice }: { b: BlocoRoteiro; num0: number; roteiro: Roteiro; resp: RespRoteiro; aoMudar: (r: RespRoteiro) => void; mediaBloco: number | null; desligado?: boolean; indice: number }) {
  return (
    <section className="rounded-xl border border-brand-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-base uppercase">
          Bloco {indice + 1} · {b.titulo}
        </b>
        <span className="font-display text-base tabular-nums">{fmtNota(mediaBloco)}</span>
      </div>
      {b.objetivo && <span className="block text-sm text-ink-500">Objetivo: {b.objetivo}</span>}
      {b.perguntas.map((p, i) => (
        <Pergunta key={p.id} p={p} num={num0 + i + 1} roteiro={roteiro} resp={resp} aoMudar={aoMudar} desligado={desligado} />
      ))}
      {b.cenarios && b.cenarios.length > 0 && (
        <div className="rounded-lg border border-dashed border-teal-700 p-3 space-y-3">
          <b>Avaliação prática: cenários do cargo</b>
          <span className="block text-sm text-ink-500">Leia a situação e marque o que o candidato disse. A nota sai sozinha.</span>
          {b.cenarios.map((c, i) => {
            const marcados = resp.cen[`cen.${i}`] ?? [];
            return (
              <div key={i} className="space-y-1.5 border-t border-brand-100 pt-2">
                <div className="flex gap-2">
                  <span className="font-display text-ink-500">C{i + 1}</span>
                  <b className="font-semibold">{c.titulo}</b>
                </div>
                {c.sinais.map((s, j) => (
                  <label key={j} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={desligado}
                      checked={!!marcados[j]}
                      onChange={(e) => {
                        const novo = c.sinais.map((_, k) => (k === j ? e.target.checked : !!marcados[k]));
                        aoMudar({ ...resp, cen: { ...resp.cen, [`cen.${i}`]: novo } });
                      }}
                    />
                    {s}
                  </label>
                ))}
                <span className="font-display text-sm">Nota do cenário: {fmtNota(notaCenario(marcados, c.sinais.length))}</span>
              </div>
            );
          })}
        </div>
      )}
      {b.apresentacao && (
        <div className="rounded-lg border border-dashed border-brand-500 p-3 space-y-1.5">
          <b>Apresentação da função ao candidato</b>
          <span className="block text-sm text-ink-500">Marque o que já foi apresentado.</span>
          {b.apresentacao.itens.map((a, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                disabled={desligado}
                checked={!!resp.aps[`ap.${i}`]}
                onChange={(e) => aoMudar({ ...resp, aps: { ...resp.aps, [`ap.${i}`]: e.target.checked } })}
              />
              {a}
            </label>
          ))}
          {b.apresentacao.indicadores.length > 0 && (
            <div className="text-sm pt-1">
              <span className="text-ink-500">Indicadores do cargo para citar:</span>
              <ul className="list-disc pl-5">
                {b.apresentacao.indicadores.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Fala({ texto, tom }: { texto: string; tom: "rh" | "tec" }) {
  return <p className={`rounded-r-md bg-brand-50 px-3 py-2 italic text-ink-600 border-l-[3px] ${tom === "tec" ? "border-teal-700" : "border-brand-500"}`}>“{texto}”</p>;
}

function Barra({ valor, cor }: { valor: number | null; cor: string }) {
  return (
    <div className="h-2 rounded bg-brand-100 overflow-hidden col-span-2">
      <i className="block h-full rounded" style={{ width: `${valor ? valor * 20 : 0}%`, background: cor }} />
    </div>
  );
}

export function ResumoRoteiro({ roteiro, resp }: { roteiro: Roteiro; resp: RespRoteiro }) {
  const r = resumir(roteiro, resp);
  const tec = roteiro.etapa === "Etapa técnica";
  const cor = tec ? "#0f766e" : "#c9763a";
  const sug =
    r.sugestao === "Avançar" ? "bg-green-100 text-green-800" : r.sugestao === "Manter em avaliação" ? "bg-amber-100 text-amber-800" : r.sugestao ? "bg-red-100 text-red-800" : "bg-brand-50 text-ink-500";
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-3 space-y-2">
      <b className="font-display uppercase">Resumo da etapa</b>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl tabular-nums">{fmtNota(r.geral)}</span>
        <span className="text-ink-500">média de 5 · {r.respondidas} de {r.total} perguntas</span>
      </div>
      <div className={`rounded-lg px-3 py-2 font-semibold ${sug}`}>{r.sugestao ? `Sugestão: ${r.sugestao.toLowerCase()}` : "Avalie as perguntas para ver a sugestão"}</div>
      {r.requisitosNao > 0 && <div className="rounded-lg px-3 py-2 font-semibold bg-red-100 text-red-800">{r.requisitosNao} requisito(s) do cargo não atendido(s)</div>}
      <b className="block text-sm">Por bloco</b>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {r.porBloco.map((b) => (
          <div key={b.id} className="contents">
            <span>{b.titulo}</span>
            <b className="tabular-nums">{fmtNota(b.media)}</b>
            <Barra valor={b.media} cor={cor} />
          </div>
        ))}
      </div>
      {r.porCompetencia.length > 0 && (
        <>
          <b className="block text-sm">{roteiro.cargoEncontrado ? "Competências do cargo" : "Competências"}</b>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            {r.porCompetencia.map((c) => (
              <div key={c.nome} className="contents">
                <span>{c.nome}</span>
                <b className="tabular-nums">{fmtNota(c.media)}</b>
                <Barra valor={c.media} cor={cor} />
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-ink-500">A nota e a sugestão ajudam na decisão. Quem decide é o RH.</p>
    </div>
  );
}

export default function RoteiroEntrevista({
  roteiro,
  resp,
  aoMudar,
  supervisor,
  desligado,
  rodape,
}: {
  roteiro: Roteiro;
  resp: RespRoteiro;
  aoMudar: (r: RespRoteiro) => void;
  supervisor?: boolean;
  desligado?: boolean;
  rodape?: ReactNode;
}) {
  const tec = roteiro.etapa === "Etapa técnica";
  const r = resumir(roteiro, resp);
  let num0 = 0;
  return (
    <div className="space-y-3">
      {!roteiro.cargoEncontrado && (
        <p className="rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-sm">
          A descrição deste cargo ainda não está cadastrada em Descrição de Cargos. O roteiro mostra só as perguntas gerais. Cadastre o cargo para ver as perguntas dele.
        </p>
      )}
      <Fala texto={tec ? roteiro.abertura : roteiro.abertura} tom={tec ? "tec" : "rh"} />
      {roteiro.requisitos.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-white p-3 space-y-2">
          <b>Checagem rápida dos requisitos do cargo</b>
          {roteiro.requisitos.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{q.texto}</span>
              <span className="inline-flex rounded-md border border-brand-200 overflow-hidden">
                {([["Sim", 1], ["Não", 0]] as const).map(([l, v]) => {
                  const ativo = resp.req[q.id] === v;
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={desligado}
                      aria-pressed={ativo}
                      onClick={() => {
                        const req = { ...resp.req };
                        if (ativo) delete req[q.id];
                        else req[q.id] = v;
                        aoMudar({ ...resp, req });
                      }}
                      className="px-3 py-1 border-r last:border-r-0 border-brand-200"
                      style={ativo ? { background: v ? "#15803d" : "#b42318", color: "#fff" } : { background: "#fff" }}
                    >
                      {l}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-ink-900 text-white px-3 py-2">
        <span className="font-display text-xl tabular-nums">{fmtNota(r.geral)}</span>
        <span className="text-sm">{r.respondidas} de {r.total} perguntas avaliadas</span>
        {r.sugestao && <span className="text-sm text-brand-300 ml-auto">Sugestão: {r.sugestao.toLowerCase()}</span>}
      </div>
      {roteiro.blocos.map((b, i) => {
        const n0 = num0;
        num0 += b.perguntas.length;
        return <Bloco key={b.id} b={b} num0={n0} roteiro={roteiro} resp={resp} aoMudar={aoMudar} mediaBloco={r.porBloco[i].media} desligado={desligado} indice={i} />;
      })}
      <div className="rounded-xl border border-brand-200 bg-white p-3 space-y-2">
        <b className="font-display uppercase">Encerramento</b>
        <Fala texto={roteiro.encerramento} tom={tec ? "tec" : "rh"} />
        {roteiro.perguntaOpcional && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Pergunta opcional sobre crenças</summary>
            <p className="text-ink-500 mt-1">
              Use somente quando houver finalidade legítima para a vaga e trate a informação com cuidado. Esta pergunta não vale nota e não deve eliminar o candidato: “{roteiro.perguntaOpcional}”
            </p>
          </details>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-semibold">{supervisor || tec ? "Parecer do supervisor: experiência, conhecimento técnico e necessidade de treinamento" : "Registro do RH: informações que o supervisor precisa aprofundar"}</span>
          <textarea className="input" rows={4} disabled={desligado} value={resp.parecer ?? ""} onChange={(e) => aoMudar({ ...resp, parecer: e.target.value })} />
        </label>
      </div>
      <ResumoRoteiro roteiro={roteiro} resp={resp} />
      {rodape}
    </div>
  );
}
