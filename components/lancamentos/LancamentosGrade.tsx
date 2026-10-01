"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  contarUsoColunaFolha,
  criarColunaFolha,
  editarColunaFolha,
  excluirColunaFolha,
  moverColunaFolha,
  salvarCelulaLancamento,
  salvarPontoLancamento,
} from "@/lib/actions-lancamentos";

export type GrupoRubrica = "provento" | "desconto" | "espelhamento";
export type FormatoRubrica = "moeda" | "texto" | "sim_nao";

export interface RubricaGrade {
  id: string;
  nome: string;
  codigo: string | null;
  grupo: GrupoRubrica;
  formato: FormatoRubrica;
  automatico: boolean;
}

export interface FuncionarioGrade {
  id: string;
  nome: string;
  email: string | null;
  empresa: string;
  regime: string;
  novo: boolean;
}

export interface MovimentoGrade {
  sinal: "+" | "-";
  nome: string;
}

export interface OpcaoMes {
  valor: string;
  rotulo: string;
}

const COR_P = "#2F62B0";
const COR_D = "#B04A3A";
const COR_E = "#5F5C55";
const COR_OK = "#2E7D4F";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const GRUPOS: Record<GrupoRubrica, { rotulo: string; curto: string; cor: string }> = {
  provento: { rotulo: "PROVENTOS", curto: "Provento", cor: COR_P },
  desconto: { rotulo: "DESCONTOS", curto: "Desconto", cor: COR_D },
  espelhamento: { rotulo: "ESPELHAMENTO", curto: "Espelhamento", cor: COR_E },
};
const ORDEM_GRUPO: Record<GrupoRubrica, number> = { provento: 0, desconto: 1, espelhamento: 2 };

const FORMATOS: Record<FormatoRubrica, { rotulo: string; exemplo: string; largura: number }> = {
  moeda: { rotulo: "Valor R$", exemplo: "1.250,00", largura: 108 },
  texto: { rotulo: "Texto livre", exemplo: "abc…", largura: 170 },
  sim_nao: { rotulo: "Sim / Não", exemplo: "☐ ☑", largura: 100 },
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function num(s: string | undefined | null): number {
  if (!s) return 0;
  let t = String(s).replace(/[R$\s]/g, "");
  if (!/^-?[\d.,]+$/.test(t)) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function letra(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function ordenar(lista: RubricaGrade[]): RubricaGrade[] {
  return lista
    .map((r, i) => ({ r, i }))
    .sort((a, b) => ORDEM_GRUPO[a.r.grupo] - ORDEM_GRUPO[b.r.grupo] || a.i - b.i)
    .map((x) => x.r);
}

type Selecao = { id: string; k: string | null; n: number } | null;
type Rascunho = { id?: string; nome: string; cod: string; grupo: GrupoRubrica; formato: FormatoRubrica };
type EstadoSalvar = { tipo: "parado" | "salvando" | "salvo" | "erro"; msg?: string };

export default function LancamentosGrade({
  competencia,
  periodo,
  mesFechado,
  opcoesMes,
  rubricas,
  funcionarios,
  valoresIniciais,
  pontoIniciais,
  movimentos,
}: {
  competencia: string;
  periodo: string;
  mesFechado: boolean;
  opcoesMes: OpcaoMes[];
  rubricas: RubricaGrade[];
  funcionarios: FuncionarioGrade[];
  valoresIniciais: Record<string, Record<string, string>>;
  pontoIniciais: Record<string, string>;
  movimentos: MovimentoGrade[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rubsBase, setRubsBase] = useState<RubricaGrade[]>(rubricas);
  useEffect(() => setRubsBase(rubricas), [rubricas]);
  const rubs = useMemo(() => ordenar(rubsBase), [rubsBase]);

  const [vals, setVals] = useState(valoresIniciais);
  const [ponto, setPonto] = useState(pontoIniciais);
  const salvos = useRef<Record<string, string>>(
    Object.fromEntries(Object.entries(valoresIniciais).flatMap(([c, v]) => Object.entries(v).map(([r, x]) => [`${c}:${r}`, x])))
  );
  const pontoSalvo = useRef<Record<string, string>>({ ...pontoIniciais });

  const [sel, setSel] = useState<Selecao>(null);
  const [filtro, setFiltro] = useState<string>("todas");
  const [painelColunas, setPainelColunas] = useState(false);
  const [modal, setModal] = useState<{ d: Rascunho; confirmar: boolean; uso?: string } | null>(null);
  const [estado, setEstado] = useState<EstadoSalvar>({ tipo: "parado" });
  const [aviso, setAviso] = useState("");
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarAviso(t: string) {
    setAviso(t);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(""), 4500);
  }

  // ------------------------------------------------------------------ dados
  const empresas = useMemo(() => {
    const s: string[] = [];
    funcionarios.forEach((f) => {
      if (!s.includes(f.empresa)) s.push(f.empresa);
    });
    return s;
  }, [funcionarios]);

  const grupos = useMemo(() => {
    const vis = empresas.filter((e) => filtro === "todas" || filtro === e);
    let n = 0;
    return vis
      .map((e) => {
        const lista = funcionarios.filter((f) => f.empresa === e).map((f) => ({ f, n: ++n }));
        return { empresa: e, linhas: lista };
      })
      .filter((g) => g.linhas.length > 0);
  }, [empresas, funcionarios, filtro]);

  const planas = useMemo(() => grupos.flatMap((g) => g.linhas), [grupos]);
  const cols = `44px 180px ${rubs.map((r) => FORMATOS[r.formato].largura + "px").join(" ")}`;
  const larguraTotal = 44 + 180 + rubs.reduce((a, r) => a + FORMATOS[r.formato].largura, 0);

  const bandas = useMemo(() => {
    const b: { g: GrupoRubrica; n: number }[] = [];
    rubs.forEach((r) => {
      const ult = b[b.length - 1];
      if (ult && ult.g === r.grupo) ult.n++;
      else b.push({ g: r.grupo, n: 1 });
    });
    return b;
  }, [rubs]);

  function somaGrupo(id: string, g: GrupoRubrica): number {
    return rubs.filter((r) => r.grupo === g && r.formato === "moeda").reduce((a, r) => a + num(vals[id]?.[r.id]), 0);
  }

  // --------------------------------------------------------------- salvando
  async function salvarCelula(colabId: string, rub: RubricaGrade, valor: string) {
    const chave = `${colabId}:${rub.id}`;
    if ((salvos.current[chave] ?? "") === valor) return;
    setEstado({ tipo: "salvando" });
    const r = await salvarCelulaLancamento(competencia, colabId, rub.id, rub.formato, valor);
    if (r.ok) {
      salvos.current[chave] = valor;
      setEstado({ tipo: "salvo" });
    } else {
      setEstado({ tipo: "erro", msg: r.erro });
      mostrarAviso(r.erro);
    }
  }

  function mudarValor(colabId: string, rubId: string, v: string) {
    setVals((p) => ({ ...p, [colabId]: { ...(p[colabId] ?? {}), [rubId]: v } }));
  }

  function aoSair(colabId: string, rub: RubricaGrade, atual: string) {
    let v = atual;
    if (rub.formato === "moeda") {
      const t = atual.trim();
      v = t && /^-?[\d.,]+$/.test(t) ? fmt(num(t)) : t;
      if (v !== atual) mudarValor(colabId, rub.id, v);
    }
    void salvarCelula(colabId, rub, v);
  }

  function alternar(colabId: string, rub: RubricaGrade, atual: string, n: number) {
    if (mesFechado) return;
    const novo = atual === "SIM" ? "" : "SIM";
    mudarValor(colabId, rub.id, novo);
    escolher(colabId, rub.id, n);
    void salvarCelula(colabId, rub, novo);
  }

  function salvarPonto(colabId: string) {
    const texto = ponto[colabId] ?? "";
    if ((pontoSalvo.current[colabId] ?? "") === texto) return;
    setEstado({ tipo: "salvando" });
    void salvarPontoLancamento(competencia, colabId, texto).then((r) => {
      if (r.ok) {
        pontoSalvo.current[colabId] = texto;
        setEstado({ tipo: "salvo" });
      } else {
        setEstado({ tipo: "erro", msg: r.erro });
        mostrarAviso(r.erro);
      }
    });
  }

  // ------------------------------------------------------ seleção / teclado
  function escolher(id: string, k: string | null, n: number) {
    setSel((s) => (s && s.id === id && s.k === k ? s : { id, k, n }));
  }

  function teclar(e: React.KeyboardEvent<HTMLElement>, n: number, ci: number) {
    const el = e.target as HTMLInputElement;
    let dr = 0;
    let dc = 0;
    if (e.key === "Enter") dr = e.shiftKey ? -1 : 1;
    else if (e.key === "ArrowDown") dr = 1;
    else if (e.key === "ArrowUp") dr = -1;
    else if (e.key === "ArrowRight" && (el.selectionStart == null || el.selectionStart === el.value.length)) dc = 1;
    else if (e.key === "ArrowLeft" && (el.selectionEnd == null || el.selectionEnd === 0)) dc = -1;
    else return;
    if (el.tagName === "BUTTON" && e.key === "Enter") {
      e.preventDefault();
      el.click();
      return;
    }
    e.preventDefault();
    for (let i = 1; i < 120; i++) {
      const alvo = document.querySelector<HTMLElement>(`[data-cell="${n + dr * i}:${ci + dc * i}"]`);
      if (alvo) {
        alvo.focus();
        (alvo as HTMLInputElement).select?.();
        return;
      }
      if (dc) return;
    }
  }

  // ---------------------------------------------------------------- colunas
  function abrirColuna(r: RubricaGrade | null, grupo?: GrupoRubrica) {
    setModal({
      d: r
        ? { id: r.id, nome: r.nome, cod: r.codigo ?? "", grupo: r.grupo, formato: r.formato }
        : { nome: "", cod: "", grupo: grupo ?? "provento", formato: "moeda" },
      confirmar: false,
    });
  }

  function mudarRascunho(p: Partial<Rascunho>) {
    setModal((m) => (m ? { ...m, d: { ...m.d, ...p } } : m));
  }

  function salvarColuna() {
    if (!modal) return;
    const d = modal.d;
    if (!d.nome.trim()) {
      mostrarAviso("Dê um nome para a coluna.");
      return;
    }
    startTransition(async () => {
      const dados = { nome: d.nome, codigo: d.cod, categoria: d.grupo, formato: d.formato };
      const r = d.id ? await editarColunaFolha(d.id, dados) : await criarColunaFolha(dados);
      if (!r.ok) {
        mostrarAviso(r.erro);
        return;
      }
      const nome = d.nome.trim().toUpperCase();
      const extra = "aviso" in r && r.aviso ? " " + r.aviso : "";
      mostrarAviso(
        d.id ? `Coluna "${nome}" atualizada.${extra}` : `Coluna "${nome}" criada em ${GRUPOS[d.grupo].rotulo.toLowerCase()}.`
      );
      setModal(null);
      router.refresh();
    });
  }

  function excluirColuna() {
    if (!modal || !modal.d.id) return;
    const id = modal.d.id;
    const nome = modal.d.nome;
    if (!modal.confirmar) {
      setModal({ ...modal, confirmar: true, uso: "Verificando lançamentos..." });
      void contarUsoColunaFolha(id).then((u) => {
        const uso = u.erro
          ? `Não consegui contar os lançamentos (${u.erro}).`
          : u.lancamentos === 0
          ? "Não há lançamentos nessa coluna."
          : `${u.lancamentos} lançamento(s) em ${u.meses} mês(es), inclusive de meses já fechados, serão apagados.`;
        setModal((m) => (m && m.d.id === id ? { ...m, uso } : m));
      });
      return;
    }
    startTransition(async () => {
      const r = await excluirColunaFolha(id);
      if (!r.ok) {
        mostrarAviso(r.erro);
        return;
      }
      mostrarAviso(`Coluna "${nome}" excluída.`);
      setModal(null);
      router.refresh();
    });
  }

  function mover(id: string, d: number) {
    startTransition(async () => {
      const r = await moverColunaFolha(id, d);
      if (!r.ok) mostrarAviso(r.erro);
      router.refresh();
    });
  }

  // ------------------------------------------------------------------ ficha
  const idxSel = Math.max(
    0,
    planas.findIndex((x) => x.f.id === sel?.id)
  );
  const atual = planas[idxSel];
  function irPara(d: number) {
    const x = planas[Math.max(0, Math.min(planas.length - 1, idxSel + d))];
    if (x) escolher(x.f.id, sel?.k ?? null, x.n);
  }

  const statusTexto =
    estado.tipo === "salvando" ? "Salvando…" : estado.tipo === "salvo" ? "Tudo salvo ✓" : estado.tipo === "erro" ? "Erro ao salvar" : "";

  return (
    <div className="space-y-3">
      {/* barra do topo */}
      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-ink-900 text-white px-5 py-3.5">
        <p role="heading" aria-level={1} className="text-[15px] font-semibold">
          Lançamentos da folha
        </p>
        <select
          aria-label="Mês da folha"
          value={competencia}
          onChange={(e) => router.push(`/departamento-pessoal/lancamentos?competencia=${e.target.value}`)}
          className="rounded-md border border-white/25 bg-transparent px-2.5 py-1 text-[12.5px] text-white"
          style={{ fontFamily: MONO }}
        >
          {opcoesMes.map((o) => (
            <option key={o.valor} value={o.valor} className="text-ink-900">
              {o.rotulo.toUpperCase()}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-white/65">{periodo}</span>
        {mesFechado && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs">🔒 mês fechado</span>}
        <span className="flex-1" />
        <span className="text-xs text-white/70" aria-live="polite">
          {statusTexto}
        </span>
        <span className="text-[12.5px] text-white/65">
          {empresas.length} empresa{empresas.length === 1 ? "" : "s"} · {funcionarios.length} funcionários · {rubs.length} colunas
        </span>
        <button
          type="button"
          onClick={() => setPainelColunas((v) => !v)}
          className={`rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            painelColunas ? "bg-white text-ink-900 border-white" : "border-white/30 text-white hover:bg-white/10"
          }`}
        >
          Colunas da folha
        </button>
      </div>

      {/* faixa de sincronização */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 px-4 py-2 text-[12.5px] text-slate-700">
        <span>
          Funcionários vêm de <b>Colaboradores</b>. Entram na folha os ativos (CLT e estágio) e saem ao serem demitidos.
        </span>
        {movimentos.map((m, i) => (
          <span
            key={i}
            className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: m.sinal === "+" ? COR_OK : COR_D }}
          >
            {m.sinal === "+" ? "+" : "−"} {m.nome}
          </span>
        ))}
      </div>

      {/* filtro por empresa */}
      <div className="flex flex-wrap gap-1.5">
        {[{ k: "todas", l: `Todas as empresas · ${funcionarios.length}` }, ...empresas.map((e) => ({ k: e, l: `${e} · ${funcionarios.filter((f) => f.empresa === e).length}` }))].map(
          (c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setFiltro(c.k)}
              className={`rounded-full border px-3.5 py-1 text-[12.5px] transition-colors ${
                filtro === c.k ? "bg-ink-900 text-white border-ink-900" : "bg-white text-ink-900 border-stone-300 hover:bg-brand-50"
              }`}
            >
              {c.l}
            </button>
          )
        )}
      </div>

      <div className="flex gap-3 items-start">
        {/* grade */}
        <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-stone-300 bg-white" style={{ maxHeight: "68vh" }}>
          {planas.length === 0 ? (
            <p className="p-8 text-sm text-slate-500">Nenhum funcionário ativo na folha.</p>
          ) : (
            <div style={{ minWidth: larguraTotal }}>
              {/* faixa de grupos */}
              <div className="sticky top-0 z-30 grid bg-white" style={{ gridTemplateColumns: cols, height: 24 }}>
                <div className="sticky left-0 z-40 bg-white" style={{ gridColumn: "span 2" }} />
                {bandas.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center text-[10.5px] font-bold tracking-[0.1em] text-white"
                    style={{ gridColumn: `span ${b.n}`, background: GRUPOS[b.g].cor }}
                  >
                    {GRUPOS[b.g].rotulo}
                  </div>
                ))}
              </div>

              {/* cabeçalho das colunas */}
              <div
                className="sticky z-30 grid border-b border-stone-300 bg-stone-50"
                style={{ gridTemplateColumns: cols, top: 24, minHeight: 48 }}
              >
                <div className="sticky left-0 z-40 bg-stone-50 border-r border-stone-200" />
                <div className="sticky z-40 bg-stone-50 border-r border-stone-200 px-2 py-1.5 text-[10.5px] font-semibold" style={{ left: 44 }}>
                  <span style={{ fontFamily: MONO, color: "#8A877F" }}>A </span>FUNCIONÁRIO
                </div>
                {rubs.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => abrirColuna(r)}
                    title="Clique para editar a coluna"
                    className="flex flex-col gap-0.5 border-r border-stone-200 px-2 py-1.5 hover:bg-white"
                    style={{
                      alignItems: r.formato === "moeda" ? "flex-end" : r.formato === "sim_nao" ? "center" : "flex-start",
                      textAlign: r.formato === "moeda" ? "right" : r.formato === "sim_nao" ? "center" : "left",
                    }}
                  >
                    <span className="text-[10.5px] font-semibold leading-tight">
                      <span style={{ fontFamily: MONO, color: GRUPOS[r.grupo].cor }}>{letra(i + 1)} </span>
                      {r.nome}
                    </span>
                    <span className="text-[10px] text-stone-500" style={{ fontFamily: MONO }}>
                      {r.codigo ? `cód. ${r.codigo} · ` : ""}
                      {FORMATOS[r.formato].rotulo}
                    </span>
                  </button>
                ))}
              </div>

              {grupos.map((g) => (
                <div key={g.empresa}>
                  {/* linha da empresa com subtotais */}
                  <div className="grid border-b border-stone-200 bg-[#FAF9F6]" style={{ gridTemplateColumns: cols, height: 32 }}>
                    <div
                      className="sticky left-0 z-20 flex items-center bg-[#FAF9F6] px-3 text-[11px] font-bold tracking-wide text-ink-800"
                      style={{ gridColumn: "span 2" }}
                    >
                      {g.empresa.toUpperCase()} · {g.linhas.length}
                    </div>
                    {rubs.map((r) => {
                      let v = "";
                      if (r.formato === "moeda") {
                        const s = g.linhas.reduce((a, x) => a + num(vals[x.f.id]?.[r.id]), 0);
                        v = s ? fmt(s) : "–";
                      } else if (r.formato === "sim_nao") {
                        const k = g.linhas.filter((x) => vals[x.f.id]?.[r.id] === "SIM").length;
                        v = k ? `${k} sim` : "";
                      }
                      return (
                        <div
                          key={r.id}
                          className="flex items-center px-2 text-[11.5px] font-semibold"
                          style={{
                            justifyContent: r.formato === "moeda" ? "flex-end" : "center",
                            color: GRUPOS[r.grupo].cor,
                            fontFamily: MONO,
                          }}
                        >
                          {v}
                        </div>
                      );
                    })}
                  </div>

                  {g.linhas.map(({ f, n }) => {
                    const ativa = sel?.id === f.id;
                    const fundo = ativa ? "#EEF3FB" : "#FFFFFF";
                    return (
                      <div
                        key={f.id}
                        className="grid border-b border-stone-100"
                        style={{ gridTemplateColumns: cols, height: 30, background: fundo }}
                      >
                        <div
                          className="sticky left-0 z-10 flex items-center justify-center text-[11px]"
                          style={{
                            background: fundo,
                            color: ativa ? COR_P : "#8A877F",
                            fontFamily: MONO,
                            boxShadow: ativa ? `inset 3px 0 0 ${COR_P}` : "none",
                          }}
                        >
                          {n}
                        </div>
                        <button
                          type="button"
                          onClick={() => escolher(f.id, null, n)}
                          className="sticky z-10 flex items-center gap-1.5 border-r border-stone-200 px-2 text-left text-[12.5px] font-medium"
                          style={{ left: 44, background: fundo }}
                          title={f.nome}
                        >
                          <span className="truncate">{f.nome}</span>
                          {f.novo && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-bold text-emerald-700">NOVO</span>
                          )}
                          {(ponto[f.id] ?? "") !== "" && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Tem observação de ponto" />
                          )}
                        </button>
                        {rubs.map((r, ri) => {
                          const v = vals[f.id]?.[r.id] ?? "";
                          const ci = ri + 1;
                          const celulaAtiva = ativa && sel?.k === r.id;
                          const anel = celulaAtiva ? `inset 0 0 0 2px ${COR_P}` : "none";
                          if (r.formato === "sim_nao") {
                            const marcado = v === "SIM";
                            return (
                              <div key={r.id} className="flex items-center justify-center border-r border-stone-100" style={{ boxShadow: anel }}>
                                <button
                                  type="button"
                                  data-cell={`${n}:${ci}`}
                                  role="checkbox"
                                  aria-checked={marcado}
                                  aria-label={`${r.nome} de ${f.nome}`}
                                  disabled={mesFechado || r.automatico}
                                  onFocus={() => escolher(f.id, r.id, n)}
                                  onClick={() => alternar(f.id, r, v, n)}
                                  onKeyDown={(e) => teclar(e, n, ci)}
                                  className="flex h-[18px] w-[18px] items-center justify-center rounded border text-[12px] font-bold text-white"
                                  style={{
                                    background: marcado ? GRUPOS[r.grupo].cor : "#fff",
                                    borderColor: marcado ? GRUPOS[r.grupo].cor : "#BDBAB2",
                                  }}
                                >
                                  {marcado ? "✓" : ""}
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div key={r.id} className="border-r border-stone-100" style={{ boxShadow: anel }}>
                              <input
                                data-cell={`${n}:${ci}`}
                                value={v}
                                disabled={mesFechado || r.automatico}
                                title={r.automatico ? "Coluna calculada pelo sistema (não dá para editar aqui)" : undefined}
                                aria-label={`${r.nome} de ${f.nome}`}
                                onFocus={() => escolher(f.id, r.id, n)}
                                onChange={(e) => mudarValor(f.id, r.id, e.target.value)}
                                onBlur={(e) => aoSair(f.id, r, e.target.value)}
                                onKeyDown={(e) => teclar(e, n, ci)}
                                inputMode={r.formato === "moeda" ? "decimal" : "text"}
                                className="h-full w-full bg-transparent px-2 text-[12.5px] outline-none disabled:cursor-not-allowed"
                                style={{
                                  textAlign: r.formato === "moeda" ? "right" : "left",
                                  fontFamily: r.formato === "moeda" ? MONO : "Inter, sans-serif",
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* painel direito */}
        <aside className="w-[340px] shrink-0 rounded-xl border border-stone-300 bg-[#FBFAF7]" style={{ maxHeight: "68vh", overflowY: "auto" }}>
          {painelColunas ? (
            <div className="p-4 space-y-4" style={{ width: "100%" }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p role="heading" aria-level={2} className="text-[15px] font-semibold">
                    Colunas da folha
                  </p>
                  <p className="text-xs text-stone-500">
                    Crie, edite, reordene ou exclua proventos, descontos e espelhamento. As letras se ajustam sozinhas.
                  </p>
                </div>
                <button type="button" onClick={() => setPainelColunas(false)} aria-label="Fechar painel" className="text-stone-500 hover:text-ink-900">
                  ✕
                </button>
              </div>
              {(["provento", "desconto", "espelhamento"] as GrupoRubrica[]).map((g) => {
                const itens = rubs.map((r, i) => ({ r, i })).filter((x) => x.r.grupo === g);
                return (
                  <div key={g}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: GRUPOS[g].cor }}>
                        {GRUPOS[g].rotulo} · {itens.length}
                      </span>
                      <button type="button" onClick={() => abrirColuna(null, g)} className="text-xs font-medium text-blue-700 hover:underline">
                        + Nova
                      </button>
                    </div>
                    <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
                      {itens.length === 0 && <li className="px-3 py-2 text-xs text-stone-400">Nenhuma coluna.</li>}
                      {itens.map((x, pos) => (
                        <li key={x.r.id} className="flex items-center gap-2 px-3 py-1.5">
                          <span className="w-6 text-[11px] font-semibold" style={{ fontFamily: MONO, color: GRUPOS[g].cor }}>
                            {letra(x.i + 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium">{x.r.nome}</span>
                            <span className="block text-[10.5px] text-stone-500" style={{ fontFamily: MONO }}>
                              {x.r.codigo ? `cód. ${x.r.codigo} · ` : ""}
                              {FORMATOS[x.r.formato].rotulo}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={pos === 0 || isPending}
                            onClick={() => mover(x.r.id, -1)}
                            aria-label="Subir coluna"
                            className="px-1 text-stone-500 hover:text-ink-900 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={pos === itens.length - 1 || isPending}
                            onClick={() => mover(x.r.id, 1)}
                            aria-label="Descer coluna"
                            className="px-1 text-stone-500 hover:text-ink-900 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button type="button" onClick={() => abrirColuna(x.r)} className="text-xs text-blue-700 hover:underline">
                            Editar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : atual ? (
            <div className="p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wide text-stone-500">LINHA {atual.n}</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => irPara(-1)} aria-label="Funcionário anterior" className="rounded border border-stone-300 px-2 text-sm hover:bg-white">
                    ↑
                  </button>
                  <button type="button" onClick={() => irPara(1)} aria-label="Próximo funcionário" className="rounded border border-stone-300 px-2 text-sm hover:bg-white">
                    ↓
                  </button>
                </span>
              </div>
              <div>
                <p className="text-[22px] font-semibold leading-tight">{atual.f.nome}</p>
                <p className="text-xs text-stone-500">
                  {atual.f.empresa} · {atual.f.regime}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-[10.5px] font-bold tracking-[0.08em] text-stone-500">E-MAIL</p>
                <p className="break-all text-[12.5px]">{atual.f.email || "sem e-mail"}</p>
                <Link href={`/colaboradores/${atual.f.id}`} className="text-xs text-blue-700 hover:underline">
                  Editar em Colaboradores →
                </Link>
              </div>
              <div>
                <p className="mb-0.5 text-[10.5px] font-bold tracking-[0.08em] text-stone-500">PONTO / OBSERVAÇÕES</p>
                <textarea
                  value={ponto[atual.f.id] ?? ""}
                  onChange={(e) => setPonto((p) => ({ ...p, [atual.f.id]: e.target.value }))}
                  onBlur={() => salvarPonto(atual.f.id)}
                  disabled={mesFechado}
                  rows={4}
                  placeholder="Observações de ponto deste mês…"
                  className="input !text-[12.5px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[10.5px] font-bold tracking-[0.08em] text-stone-500">LANÇAMENTOS DO MÊS</p>
                {rubs.filter((r) => (vals[atual.f.id]?.[r.id] ?? "") !== "").length === 0 ? (
                  <p className="text-xs text-stone-400">Nenhum valor lançado.</p>
                ) : (
                  <ul className="space-y-1">
                    {rubs.map((r, i) => ({ r, i })).filter((x) => (vals[atual.f.id]?.[x.r.id] ?? "") !== "").map((x) => (
                      <li key={x.r.id} className="flex items-baseline gap-2 text-[12.5px]">
                        <span className="w-6 text-[11px] font-semibold" style={{ fontFamily: MONO, color: GRUPOS[x.r.grupo].cor }}>
                          {letra(x.i + 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{x.r.nome}</span>
                        <span style={{ fontFamily: MONO }}>{vals[atual.f.id]?.[x.r.id]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-1 border-t border-stone-200 pt-3 text-[13px]">
                <p className="flex justify-between font-semibold" style={{ color: COR_P }}>
                  <span>PROVENTOS</span>
                  <span style={{ fontFamily: MONO }}>{fmt(somaGrupo(atual.f.id, "provento"))}</span>
                </p>
                <p className="flex justify-between font-semibold" style={{ color: COR_D }}>
                  <span>DESCONTOS</span>
                  <span style={{ fontFamily: MONO }}>{fmt(somaGrupo(atual.f.id, "desconto"))}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-stone-500">Nenhum funcionário selecionado.</p>
          )}
        </aside>
      </div>

      {/* modal de coluna */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.d.id ? "Editar coluna" : "Nova coluna"}
            className="w-full max-w-[460px] rounded-[10px] bg-white p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{modal.d.id ? "Editar coluna" : "Nova coluna"}</h3>

            <div>
              <label className="label" htmlFor="col-nome">
                NOME DA COLUNA
              </label>
              <input
                id="col-nome"
                value={modal.d.nome}
                onChange={(e) => mudarRascunho({ nome: e.target.value })}
                className="input"
                placeholder="Ex.: AUXÍLIO CRECHE"
              />
            </div>
            <div>
              <label className="label" htmlFor="col-cod">
                CÓDIGO DA VERBA (opcional)
              </label>
              <input
                id="col-cod"
                value={modal.d.cod}
                onChange={(e) => mudarRascunho({ cod: e.target.value })}
                className="input"
                style={{ fontFamily: MONO }}
                placeholder="Ex.: 995"
              />
            </div>
            <div>
              <p className="label">GRUPO</p>
              <div className="flex gap-2">
                {(["provento", "desconto", "espelhamento"] as GrupoRubrica[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => mudarRascunho({ grupo: g })}
                    className="flex-1 rounded-md border px-2 py-1.5 text-[12.5px] font-medium"
                    style={{
                      borderColor: modal.d.grupo === g ? GRUPOS[g].cor : "#D6D3CB",
                      background: modal.d.grupo === g ? GRUPOS[g].cor : "#fff",
                      color: modal.d.grupo === g ? "#fff" : "#1D1D1B",
                    }}
                  >
                    {GRUPOS[g].curto}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">FORMA DE PREENCHIMENTO</p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FORMATOS) as FormatoRubrica[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => mudarRascunho({ formato: k })}
                    className="rounded-md border px-2 py-2 text-left"
                    style={{ borderColor: modal.d.formato === k ? "#1D1D1B" : "#D6D3CB", background: modal.d.formato === k ? "#F4F3EF" : "#fff" }}
                  >
                    <span className="block text-[12.5px] font-semibold">{FORMATOS[k].rotulo}</span>
                    <span className="block text-[11px] text-stone-500" style={{ fontFamily: MONO }}>
                      {FORMATOS[k].exemplo}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {modal.confirmar && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">
                Excluir <b>{modal.d.nome}</b>? A coluna sai da folha. {modal.uso}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {modal.d.id && (
                <button
                  type="button"
                  onClick={excluirColuna}
                  disabled={isPending}
                  className="rounded-md border px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
                  style={{
                    borderColor: COR_D,
                    background: modal.confirmar ? COR_D : "#fff",
                    color: modal.confirmar ? "#fff" : COR_D,
                  }}
                >
                  {modal.confirmar ? "Confirmar exclusão" : "Excluir coluna"}
                </button>
              )}
              <span className="flex-1" />
              <button type="button" onClick={() => setModal(null)} className="btn-secondary !text-[13px] !py-1.5">
                Cancelar
              </button>
              <button type="button" onClick={salvarColuna} disabled={isPending} className="btn-primary !text-[13px] !py-1.5 disabled:opacity-50">
                {isPending ? "Salvando..." : modal.d.id ? "Salvar" : "Criar coluna"}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] max-w-[92vw] -translate-x-1/2 rounded-lg bg-ink-900 px-4 py-2.5 text-[13px] text-white shadow-lg"
        >
          {aviso}
        </div>
      )}
    </div>
  );
}
