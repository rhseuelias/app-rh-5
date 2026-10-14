"use client";

import { useMemo, useState, type ReactNode } from "react";
import { corDaEmpresa } from "@/lib/empresa-cores";
import { EMPRESAS_SEL } from "@/lib/entrevistas";
import { criarCargo, excluirCargo, salvarCargo, type RespostaCargo } from "@/lib/actions-cargos";
import { cargoCompleto, type CargoDesc } from "@/lib/cargos";

const linhas = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
const juntar = (a: string[]) => a.join("\n");

function Ponto({ empresa }: { empresa: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDaEmpresa(empresa, 0).cor }} />;
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-ink-700">{rotulo}</span>
      {children}
    </label>
  );
}

function JanelaModal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="bg-[#faf6f0] rounded-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto p-6 space-y-4">
        <h2 className="text-2xl">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lista = (a: string[]) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

/** Abre o documento numa nova janela, no padrão do PDF da empresa, e chama a impressão (Salvar como PDF). */
function baixarPdf(c: CargoDesc) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.");
    return;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Descrição de cargo - ${esc(c.cargo)}</title>
<style>
@page{size:A4;margin:14mm}
body{font:12px/1.4 Calibri,Arial,sans-serif;color:#111;margin:0}
.cab{background:#1f2b4d;color:#fff;display:flex;align-items:center;gap:14px;padding:10px 14px;border:1px solid #1f2b4d}
.logo{width:46px;height:46px;border:1.5px solid #fff;border-radius:50%;display:grid;place-items:center;font:italic 700 11px Georgia,serif;text-align:center;line-height:1}
.cab h1{flex:1;text-align:center;font-size:17px;letter-spacing:.08em;margin:0 46px 0 0}
h2{font-size:12px;margin:14px 0 4px;text-transform:uppercase}
.box{border:1px solid #333;padding:5px 8px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px 7px;vertical-align:top;text-align:left}
th{background:#eee}.k{width:24%;text-align:center;vertical-align:middle;text-transform:uppercase}
ul{margin:0;padding-left:16px}
.col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-top:10px}
tr,.box{page-break-inside:avoid}
</style></head><body>
<div class="cab"><div class="logo">Seu<br>Elias</div><h1>DESCRIÇÃO DE CARGO</h1></div>
<h2>Identificação do cargo:</h2>
<table><tr><td><b>CARGO:</b> ${esc(c.cargo)}</td><td><b>DEPARTAMENTO:</b> ${esc(c.departamento)}</td></tr><tr><td><b>CBO:</b> ${esc(c.cbo)}</td><td><b>IDENTIFICADOR INTERNO:</b> ${esc(c.identificador)}</td></tr></table>
<h2>Missão do cargo:</h2><div class="box">${esc(c.missao)}</div>
<h2>Descrição sumária:</h2><div class="box">${esc(c.sumaria)}</div>
<h2>Descrição das responsabilidades:</h2>
<table>${c.resp.map((r) => `<tr><td class="k">${esc(r.titulo)}</td><td>${lista(r.itens)}</td></tr>`).join("")}</table>
<h2>Resultados esperados:</h2>
<div class="col"><div><b>Consideramos que o profissional está desempenhando bem sua função quando:</b>${lista(c.sucesso)}</div>
<table><tr><th>Responsabilidade</th><th>Resultado esperado</th></tr>${c.resultados.map((r) => `<tr><td>${esc(r.resp)}</td><td>${esc(r.res)}</td></tr>`).join("")}</table></div>
<h2>Indicadores de desempenho:</h2>
<table><tr><th>Indicador</th><th>Meta sugerida</th><th>Frequência</th></tr>${c.indicadores.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.meta)}</td><td>${esc(r.freq)}</td></tr>`).join("")}</table>
<h2>Requisitos do cargo:</h2>
<div class="col"><div class="box"><p><b>Escolaridade mínima:</b><br>${esc(c.escolaridade)}</p><p><b>Experiência:</b><br>${esc(c.experiencia)}</p><p><b>Habilitação:</b><br>${esc(c.habilitacao)}</p></div>
<div class="box"><b>Conhecimentos técnicos:</b>${lista(c.tecnicos)}<p><b>Competências comportamentais:</b></p>${lista(c.comportamentais)}</div></div>
<h2>Termo de ciência</h2>
<p>Declaro que recebi, li e compreendi a descrição do meu cargo, incluindo minhas responsabilidades, atividades, resultados esperados, indicadores e comportamentos esperados.</p>
<p>Estou ciente de que meu desempenho será avaliado considerando o que faço, os resultados que entrego e a forma como trabalho.</p>
<div class="sig"><div>Colaborador: ______________________________</div><div>Assinatura: ______________________________</div><div>Gestor: ______________________________</div><div>Assinatura: ______________________________</div><div>Data: ____ / ______ / ______</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function ModalNovo({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (c: CargoDesc) => void }) {
  const [cargo, setCargo] = useState("");
  const [empresa, setEmpresa] = useState<string>("BSE");
  const [departamento, setDepartamento] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!cargo.trim()) return setMsg("Informe o nome do cargo.");
    setSalvando(true);
    const campos = { cargo: cargo.trim(), empresa, departamento: departamento.trim() || null };
    const r = await criarCargo(campos);
    setSalvando(false);
    if (!r.ok) return setMsg(r.erro);
    aoCriar({
      id: r.id as string, cbo: null, identificador: null, missao: null, sumaria: null, resp: [], sucesso: [], resultados: [], indicadores: [],
      escolaridade: null, experiencia: null, habilitacao: null, tecnicos: [], comportamentais: [], cenarios: [], ...campos,
    } as CargoDesc);
  }
  return (
    <JanelaModal titulo="Novo cargo" aoFechar={aoFechar}>
      <Campo rotulo="Cargo">
        <input name="cargo" className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Empresa">
          <select className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            {EMPRESAS_SEL.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Departamento">
          <input name="departamento" className="input" value={departamento} onChange={(e) => setDepartamento(e.target.value)} />
        </Campo>
      </div>
      <p className="text-sm text-ink-500">Depois de criar, preencha missão, responsabilidades, resultados, indicadores e requisitos na tela do cargo.</p>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Criar cargo"}
        </button>
      </div>
    </JanelaModal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-brand-100 space-y-2">
      <h4 className="font-display text-sm uppercase tracking-wider">{titulo}</h4>
      {children}
    </section>
  );
}
const Vazio = () => <span className="text-ink-500">Não preenchido</span>;
const Lista = ({ itens }: { itens: string[] }) =>
  itens.length ? (
    <ul className="list-disc pl-5 space-y-0.5">
      {itens.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  ) : (
    <Vazio />
  );

/** Documento do cargo (somente leitura). */
function Documento({ c }: { c: CargoDesc }) {
  return (
    <article className="card !p-0 overflow-hidden">
      <div className="bg-[#1f2b4d] text-white flex items-center gap-4 px-5 py-3">
        <div className="w-11 h-11 rounded-full border-[1.5px] border-white grid place-items-center text-[11px] italic font-bold text-center leading-none shrink-0">
          Seu
          <br />
          Elias
        </div>
        <h2 className="flex-1 text-center text-lg tracking-widest uppercase text-white">Descrição de cargo</h2>
        <span className="w-11 shrink-0" />
      </div>
      <Secao titulo="Identificação do cargo">
        <div className="grid sm:grid-cols-2 border border-brand-200 rounded-lg overflow-hidden text-sm">
          <div className="px-3 py-2 border-b sm:border-r border-brand-200"><b>Cargo:</b> {c.cargo}</div>
          <div className="px-3 py-2 border-b border-brand-200"><b>Departamento:</b> {c.departamento}</div>
          <div className="px-3 py-2 sm:border-r border-brand-200"><b>CBO:</b> {c.cbo}</div>
          <div className="px-3 py-2"><b>Identificador interno:</b> {c.identificador}</div>
        </div>
      </Secao>
      <Secao titulo="Missão do cargo">
        <p className="border border-brand-200 rounded-lg px-3 py-2 text-sm">{c.missao || <Vazio />}</p>
      </Secao>
      <Secao titulo="Descrição sumária">
        <p className="border border-brand-200 rounded-lg px-3 py-2 text-sm">{c.sumaria || <Vazio />}</p>
      </Secao>
      <Secao titulo="Descrição das responsabilidades">
        {c.resp.length ? (
          <div className="border border-brand-200 rounded-lg overflow-hidden text-sm">
            {c.resp.map((r, i) => (
              <div key={i} className="grid sm:grid-cols-[170px_1fr] border-b last:border-b-0 border-brand-200">
                <div className="bg-brand-50 px-3 py-2 font-semibold uppercase text-xs tracking-wide flex items-center">{r.titulo}</div>
                <div className="px-3 py-2">
                  <Lista itens={r.itens} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Vazio />
        )}
      </Secao>
      <Secao titulo="Resultados esperados">
        {c.resultados.length || c.sucesso.length ? (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <b>Consideramos que o profissional está desempenhando bem sua função quando:</b>
              <Lista itens={c.sucesso} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-brand-50 text-left text-xs uppercase tracking-wide">
                    <th className="border border-brand-200 px-2 py-1.5">Responsabilidade</th>
                    <th className="border border-brand-200 px-2 py-1.5">Resultado esperado</th>
                  </tr>
                </thead>
                <tbody>
                  {c.resultados.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-brand-200 px-2 py-1.5 align-top">{r.resp}</td>
                      <td className="border border-brand-200 px-2 py-1.5 align-top">{r.res}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Vazio />
        )}
      </Secao>
      <Secao titulo="Indicadores de desempenho">
        {c.indicadores.length ? (
          <div className="overflow-x-auto text-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-brand-50 text-left text-xs uppercase tracking-wide">
                  <th className="border border-brand-200 px-2 py-1.5">Indicador</th>
                  <th className="border border-brand-200 px-2 py-1.5">Meta sugerida</th>
                  <th className="border border-brand-200 px-2 py-1.5">Frequência</th>
                </tr>
              </thead>
              <tbody>
                {c.indicadores.map((r, i) => (
                  <tr key={i}>
                    <td className="border border-brand-200 px-2 py-1.5">{r.nome}</td>
                    <td className="border border-brand-200 px-2 py-1.5">{r.meta}</td>
                    <td className="border border-brand-200 px-2 py-1.5">{r.freq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio />
        )}
      </Secao>
      <Secao titulo="Requisitos do cargo">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <p><b>Escolaridade mínima:</b><br />{c.escolaridade || "—"}</p>
            <p><b>Experiência:</b><br />{c.experiencia || "—"}</p>
            <p><b>Habilitação:</b><br />{c.habilitacao || "—"}</p>
          </div>
          <div className="space-y-2">
            <b>Conhecimentos técnicos:</b>
            <Lista itens={c.tecnicos} />
            <p className="pt-1"><b>Competências comportamentais:</b></p>
            <Lista itens={c.comportamentais} />
          </div>
        </div>
      </Secao>
      <Secao titulo="Cenários práticos (entrevista técnica)">
        {c.cenarios.length ? (
          <div className="space-y-2 text-sm">
            {c.cenarios.map((x, i) => (
              <div key={i} className="border border-brand-200 rounded-lg px-3 py-2">
                <b>{x.titulo}</b>
                <Lista itens={x.sinais} />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-ink-500">Sem cenários. Eles aparecem no roteiro da entrevista técnica deste cargo.</span>
        )}
      </Secao>
      <Secao titulo="Termo de ciência">
        <p className="text-sm text-ink-600">
          Declaro que recebi, li e compreendi a descrição do meu cargo, incluindo minhas responsabilidades, atividades, resultados esperados, indicadores e comportamentos esperados. Estou ciente de que meu desempenho será avaliado considerando o que faço, os resultados que entrego e a forma como trabalho.
        </p>
        <p className="text-xs text-ink-500">O espaço para assinatura do colaborador e do gestor sai no PDF.</p>
      </Secao>
    </article>
  );
}

/** Edição do cargo, bloco por bloco, na mesma ordem do documento. */
function Editor({ c, aoSalvar, aoCancelar, salvando, erro }: { c: CargoDesc; aoSalvar: (d: CargoDesc) => void; aoCancelar: () => void; salvando: boolean; erro: string | null }) {
  const [d, setD] = useState<CargoDesc>(c);
  const set = <K extends keyof CargoDesc>(k: K, v: CargoDesc[K]) => setD((p) => ({ ...p, [k]: v }));
  const txt = (k: "missao" | "sumaria" | "escolaridade" | "experiencia" | "habilitacao", rotulo: string, linhasN = 2) => (
    <Campo rotulo={rotulo}>
      <textarea className="input" rows={linhasN} value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
    </Campo>
  );
  return (
    <div className="card space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Cargo">
          <input name="cargo" className="input" value={d.cargo} onChange={(e) => set("cargo", e.target.value)} />
        </Campo>
        <Campo rotulo="Empresa">
          <select className="input" value={d.empresa} onChange={(e) => set("empresa", e.target.value)}>
            {EMPRESAS_SEL.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Departamento">
          <input name="departamento" className="input" value={d.departamento ?? ""} onChange={(e) => set("departamento", e.target.value)} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="CBO">
            <input name="cbo" className="input" value={d.cbo ?? ""} onChange={(e) => set("cbo", e.target.value)} />
          </Campo>
          <Campo rotulo="Identificador interno">
            <input name="identificador" className="input" value={d.identificador ?? ""} onChange={(e) => set("identificador", e.target.value)} />
          </Campo>
        </div>
      </div>
      {txt("missao", "Missão do cargo", 3)}
      {txt("sumaria", "Descrição sumária", 2)}

      <div className="space-y-2">
        <h4 className="font-display text-sm uppercase tracking-wider">Descrição das responsabilidades</h4>
        {d.resp.map((r, i) => (
          <div key={i} className="rounded-xl border border-brand-200 bg-white p-3 space-y-2">
            <div className="flex gap-2">
              <input
                name="resp_titulo"
                className="input flex-1"
                placeholder="Grupo (ex.: Recepcionar clientes)"
                value={r.titulo}
                onChange={(e) => set("resp", d.resp.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
              />
              <button type="button" className="btn-secondary !px-3 text-red-700" onClick={() => set("resp", d.resp.filter((_, j) => j !== i))}>
                Remover
              </button>
            </div>
            <textarea
              className="input"
              rows={4}
              placeholder="Uma atividade por linha"
              value={juntar(r.itens)}
              onChange={(e) => set("resp", d.resp.map((x, j) => (j === i ? { ...x, itens: e.target.value.split("\n") } : x)))}
            />
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => set("resp", [...d.resp, { titulo: "", itens: [] }])}>
          + Grupo de responsabilidades
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="font-display text-sm uppercase tracking-wider">Resultados esperados</h4>
        <Campo rotulo="Está desempenhando bem quando (uma frase por linha)">
          <textarea className="input" rows={5} value={juntar(d.sucesso)} onChange={(e) => set("sucesso", e.target.value.split("\n"))} />
        </Campo>
        {d.resultados.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <input name="res_resp" className="input" placeholder="Responsabilidade" value={r.resp} onChange={(e) => set("resultados", d.resultados.map((x, j) => (j === i ? { ...x, resp: e.target.value } : x)))} />
            <input name="res_res" className="input" placeholder="Resultado esperado" value={r.res} onChange={(e) => set("resultados", d.resultados.map((x, j) => (j === i ? { ...x, res: e.target.value } : x)))} />
            <button type="button" className="btn-secondary !px-3 text-red-700" aria-label="Remover linha" onClick={() => set("resultados", d.resultados.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => set("resultados", [...d.resultados, { resp: "", res: "" }])}>
          + Resultado
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="font-display text-sm uppercase tracking-wider">Indicadores de desempenho</h4>
        {d.indicadores.map((r, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
            <input name="ind_nome" className="input" placeholder="Indicador" value={r.nome} onChange={(e) => set("indicadores", d.indicadores.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <input name="ind_meta" className="input" placeholder="Meta" value={r.meta} onChange={(e) => set("indicadores", d.indicadores.map((x, j) => (j === i ? { ...x, meta: e.target.value } : x)))} />
            <input name="ind_freq" className="input" placeholder="Frequência" value={r.freq} onChange={(e) => set("indicadores", d.indicadores.map((x, j) => (j === i ? { ...x, freq: e.target.value } : x)))} />
            <button type="button" className="btn-secondary !px-3 text-red-700" aria-label="Remover linha" onClick={() => set("indicadores", d.indicadores.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => set("indicadores", [...d.indicadores, { nome: "", meta: "", freq: "" }])}>
          + Indicador
        </button>
      </div>

      <div className="space-y-3">
        <h4 className="font-display text-sm uppercase tracking-wider">Requisitos do cargo</h4>
        <div className="grid md:grid-cols-2 gap-3">
          {txt("escolaridade", "Escolaridade mínima")}
          {txt("habilitacao", "Habilitação")}
        </div>
        {txt("experiencia", "Experiência", 3)}
        <div className="grid md:grid-cols-2 gap-3">
          <Campo rotulo="Conhecimentos técnicos (um por linha)">
            <textarea className="input" rows={5} value={juntar(d.tecnicos)} onChange={(e) => set("tecnicos", e.target.value.split("\n"))} />
          </Campo>
          <Campo rotulo="Competências comportamentais (uma por linha)">
            <textarea className="input" rows={5} value={juntar(d.comportamentais)} onChange={(e) => set("comportamentais", e.target.value.split("\n"))} />
          </Campo>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-display text-sm uppercase tracking-wider">Cenários práticos (entrevista técnica)</h4>
        <p className="text-sm text-ink-500">Situações reais do cargo. O supervisor marca o que o candidato respondeu e a nota sai sozinha.</p>
        {d.cenarios.map((x, i) => (
          <div key={i} className="rounded-xl border border-brand-200 bg-white p-3 space-y-2">
            <div className="flex gap-2">
              <input
                name="cenario_titulo"
                className="input flex-1"
                placeholder="Situação (ex.: Cliente alterado reclama da demora)"
                value={x.titulo}
                onChange={(e) => set("cenarios", d.cenarios.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)))}
              />
              <button type="button" className="btn-secondary !px-3 text-red-700" onClick={() => set("cenarios", d.cenarios.filter((_, j) => j !== i))}>
                Remover
              </button>
            </div>
            <textarea
              className="input"
              rows={4}
              placeholder="O que se espera ouvir do candidato, um item por linha"
              value={juntar(x.sinais)}
              onChange={(e) => set("cenarios", d.cenarios.map((y, j) => (j === i ? { ...y, sinais: e.target.value.split("\n") } : y)))}
            />
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => set("cenarios", [...d.cenarios, { titulo: "", sinais: [] }])}>
          + Cenário
        </button>
      </div>

      {erro && <p className="text-sm text-red-700">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={aoCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={salvando}
          onClick={() =>
            aoSalvar({
              ...d,
              resp: d.resp.map((r) => ({ titulo: r.titulo.trim(), itens: r.itens.map((x) => x.trim()).filter(Boolean) })).filter((r) => r.titulo || r.itens.length),
              sucesso: linhas(juntar(d.sucesso)),
              resultados: d.resultados.filter((r) => r.resp.trim() || r.res.trim()),
              indicadores: d.indicadores.filter((r) => r.nome.trim()),
              tecnicos: linhas(juntar(d.tecnicos)),
              comportamentais: linhas(juntar(d.comportamentais)),
              cenarios: d.cenarios.map((x) => ({ titulo: x.titulo.trim(), sinais: x.sinais.map((y) => y.trim()).filter(Boolean) })).filter((x) => x.titulo),
            })
          }
        >
          {salvando ? "Salvando…" : "Salvar cargo"}
        </button>
      </div>
    </div>
  );
}

export default function CargosTela({ iniciais }: { iniciais: CargoDesc[] }) {
  const [cargos, setCargos] = useState(iniciais);
  const [filtro, setFiltro] = useState<string>("Todas");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const aberto = cargos.find((c) => c.id === abertoId) ?? null;
  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      cargos
        .filter((c) => (filtro === "Todas" || c.empresa === filtro) && (!q || `${c.cargo} ${c.departamento ?? ""}`.toLowerCase().includes(q)))
        .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.cargo.localeCompare(b.cargo)),
    [cargos, filtro, q],
  );
  const completos = cargos.filter(cargoCompleto).length;

  async function salvar(d: CargoDesc) {
    setSalvando(true);
    setErro(null);
    const { id, ...campos } = d;
    const r: RespostaCargo = await salvarCargo(id, campos as unknown as Record<string, unknown>);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setCargos((p) => p.map((c) => (c.id === id ? d : c)));
    setEditando(false);
    setAviso("Cargo salvo");
  }
  async function excluir(id: string) {
    const r = await excluirCargo(id);
    setConfirmaExcluir(false);
    if (!r.ok) return setErro(r.erro);
    setCargos((p) => p.filter((c) => c.id !== id));
    setAbertoId(null);
    setAviso("Cargo excluído");
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-ink-500">Pessoas e cargos</p>
          <h1 className="text-4xl">Descrição de Cargos</h1>
        </div>
        {!aberto && (
          <button type="button" className="btn-cta" onClick={() => setNovo(true)}>
            + Novo cargo
          </button>
        )}
      </header>

      {aviso && (
        <div className="rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-2 flex justify-between">
          <span>{aviso}</span>
          <button type="button" className="font-semibold" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}

      {!aberto && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {["Todas", ...EMPRESAS_SEL].map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={filtro === e}
                  onClick={() => setFiltro(e)}
                  className={`rounded-full border px-4 py-1.5 flex items-center gap-2 ${filtro === e ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
                >
                  {e !== "Todas" && <Ponto empresa={e} />}
                  {e === "Todas" ? "Todas as empresas" : e}
                </button>
              ))}
            </div>
            <input type="search" name="busca" className="input !w-64 max-w-full" placeholder="Buscar cargo ou departamento" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <p className="text-ink-500">
            <b className="text-ink-900">{cargos.length}</b> cargos · <b className="text-ink-900">{completos}</b> com descrição completa · <b className="text-ink-900">{cargos.length - completos}</b> em rascunho
          </p>
          {filtrados.length === 0 && <p className="card text-ink-500">Nenhum cargo encontrado. Use "+ Novo cargo" para cadastrar.</p>}
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {filtrados.map((c) => {
              const ok = cargoCompleto(c);
              return (
                <button key={c.id} type="button" onClick={() => { setAbertoId(c.id); setEditando(false); setErro(null); }} className="card !p-3 text-left space-y-1.5 hover:border-brand-500 min-w-0">
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <Ponto empresa={c.empresa} />
                    {c.empresa}
                  </span>
                  <h3 className="text-base uppercase leading-tight break-words">{c.cargo}</h3>
                  <span className="block text-sm text-ink-500">{c.departamento || "Sem departamento"}</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{ok ? "Completa" : "Rascunho"}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {aberto && (
        <div className="space-y-3">
          <button type="button" className="btn-secondary" onClick={() => { setAbertoId(null); setEditando(false); }}>
            ← Todos os cargos
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="flex items-center gap-2 text-base font-semibold">
                <Ponto empresa={aberto.empresa} />
                {aberto.empresa}
              </span>
              <h2 className="text-3xl uppercase">{aberto.cargo}</h2>
            </div>
            {!editando && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => { setEditando(true); setErro(null); }}>
                  Editar
                </button>
                <button type="button" className="btn-secondary" onClick={() => baixarPdf(aberto)}>
                  Baixar PDF
                </button>
                <button type="button" className="btn-secondary text-red-700" onClick={() => setConfirmaExcluir(true)}>
                  Excluir cargo
                </button>
              </div>
            )}
          </div>
          {erro && !editando && <p className="text-sm text-red-700">{erro}</p>}
          {editando ? <Editor key={aberto.id} c={aberto} aoSalvar={salvar} aoCancelar={() => setEditando(false)} salvando={salvando} erro={erro} /> : <Documento c={aberto} />}
        </div>
      )}

      {novo && (
        <ModalNovo
          aoFechar={() => setNovo(false)}
          aoCriar={(c) => {
            setCargos((p) => [...p, c]);
            setNovo(false);
            setAbertoId(c.id);
            setEditando(true);
          }}
        />
      )}
      {confirmaExcluir && aberto && (
        <JanelaModal titulo="Excluir cargo?" aoFechar={() => setConfirmaExcluir(false)}>
          <p>
            Tem certeza que deseja excluir a descrição do cargo <b>{aberto.cargo}</b> ({aberto.empresa})?
          </p>
          <p className="text-sm text-ink-500">Isso não pode ser desfeito.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmaExcluir(false)}>
              Não, voltar
            </button>
            <button type="button" className="btn-primary !bg-red-700 !border-red-700" onClick={() => excluir(aberto.id)}>
              Sim, excluir
            </button>
          </div>
        </JanelaModal>
      )}
    </div>
  );
}
