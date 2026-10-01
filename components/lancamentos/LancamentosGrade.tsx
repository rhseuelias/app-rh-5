"use client";

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
  empresa: string;
  /** unidade de lotação (null = sem unidade cadastrada) */
  unidade: string | null;
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

// colunas fixas da grade: nº · funcionário · unidade · ponto/observações
const LARG_NUM = 44;
const LARG_NOME = 180;
const LARG_UNIDADE = 112;
const LARG_PONTO = 210;
const COLUNAS_FIXAS = 4;

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

// "OURO MINAS" -> "Ouro Minas"
function titulo(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length <= 2 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

// minúsculas e sem acento, mantendo o mesmo tamanho do texto (1 letra -> 1 letra)
function plano(s: string): string {
  return s
    .split("")
    .map((ch) => (ch.normalize("NFD").charAt(0) || ch).toLowerCase())
    .join("");
}

// destaca no nome a parte que bateu com a busca
function destacar(nome: string, termo: string) {
  if (!termo) return nome;
  const i = plano(nome).indexOf(termo);
  if (i < 0) return nome;
  return (
    <>
      {nome.slice(0, i)}
      <mark className="rounded-sm bg-yellow-200 px-0 text-inherit">{nome.slice(i, i + termo.length)}</mark>
      {nome.slice(i + termo.length)}
    </>
  );
}

function semUnidade(f: FuncionarioGrade): boolean {
  return !f.unidade || f.unidade.toUpperCase() === f.empresa.toUpperCase();
}

// "BSE-Savassi" para quem tem unidade; só o nome da empresa para os demais
function rotuloUnidade(f: FuncionarioGrade): string {
  return semUnidade(f) ? f.empresa : `${f.empresa}-${titulo(f.unidade as string)}`;
}

function casaFiltro(f: FuncionarioGrade, chave: string): boolean {
  if (chave === "todas") return true;
  if (chave.startsWith("e:")) return f.empresa === chave.slice(2);
  if (chave.startsWith("s:")) return f.empresa === chave.slice(2) && semUnidade(f);
  if (chave.startsWith("u:")) {
    const [emp, uni] = chave.slice(2).split("|");
    return f.empresa === emp && f.unidade === uni;
  }
  return true;
}

type Selecao = { id: string; k: string | null; n: number } | null;
type Rascunho = { id?: string; nome: string; cod: string; grupo: GrupoRubrica; formato: FormatoRubrica };
type EstadoSalvar = { tipo: "parado" | "salvando" | "salvo" | "erro"; msg?: string };
type Chip = { chave: string; rotulo: string; n: number; grupo?: boolean };

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
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);
  const [gaveta, setGaveta] = useState(false);
  const [modal, setModal] = useState<{ d: Rascunho; confirmar: boolean; uso?: string } | null>(null);
  const [estado, setEstado] = useState<EstadoSalvar>({ tipo: "parado" });
  const [aviso, setAviso] = useState("");
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarAviso(t: string) {
    setAviso(t);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(""), 4500);
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT");
      if (e.key === "/" && !digitando && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        buscaRef.current?.focus();
        buscaRef.current?.select();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    if (!gaveta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !modal) setGaveta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gaveta, modal]);

  // ------------------------------------------------------------------ dados
  const empresas = useMemo(() => {
    const s: string[] = [];
    funcionarios.forEach((f) => {
      if (!s.includes(f.empresa)) s.push(f.empresa);
    });
    return s;
  }, [funcionarios]);

  // botões do alto: todas · empresa · unidades (BSE-Savassi, BSE-Pampulha…)
  const chips = useMemo(() => {
    const lista: Chip[] = [{ chave: "todas", rotulo: "Todas as unidades", n: funcionarios.length, grupo: true }];
    for (const e of empresas) {
      const doEmp = funcionarios.filter((f) => f.empresa === e);
      const unidades = Array.from(new Set(doEmp.filter((f) => !semUnidade(f)).map((f) => f.unidade as string))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
      if (unidades.length === 0) {
        lista.push({ chave: `e:${e}`, rotulo: e, n: doEmp.length });
        continue;
      }
      lista.push({ chave: `e:${e}`, rotulo: `${e} (todas)`, n: doEmp.length, grupo: true });
      for (const u of unidades) {
        lista.push({ chave: `u:${e}|${u}`, rotulo: `${e}-${titulo(u)}`, n: doEmp.filter((f) => f.unidade === u).length });
      }
      const sem = doEmp.filter(semUnidade).length;
      if (sem > 0) lista.push({ chave: `s:${e}`, rotulo: `${e}-sem unidade`, n: sem });
    }
    return lista;
  }, [empresas, funcionarios]);

  const termo = plano(busca.trim());

  const grupos = useMemo(() => {
    let n = 0;
    return empresas
      .map((e) => {
        // "base" = todos da empresa no filtro de unidade (os subtotais usam a base inteira)
        const base = funcionarios.filter((f) => f.empresa === e && casaFiltro(f, filtro));
        const visiveis = termo ? base.filter((f) => plano(f.nome).includes(termo)) : base;
        const linhas = visiveis.map((f) => ({ f, n: ++n }));
        return { empresa: e, linhas, base };
      })
      .filter((g) => g.linhas.length > 0);
  }, [empresas, funcionarios, filtro, termo]);

  const totalVisiveis = useMemo(() => grupos.reduce((a, g) => a + g.linhas.length, 0), [grupos]);
  const totalNoFiltro = useMemo(() => funcionarios.filter((f) => casaFiltro(f, filtro)).length, [funcionarios, filtro]);

  const cols = `${LARG_NUM}px ${LARG_NOME}px ${LARG_UNIDADE}px ${LARG_PONTO}px ${rubs
    .map((r) => FORMATOS[r.formato].largura + "px")
    .join(" ")}`;
  const larguraTotal = LARG_NUM + LARG_NOME + LARG_UNIDADE + LARG_PONTO + rubs.reduce((a, r) => a + FORMATOS[r.formato].largura, 0);
  const leftNome = LARG_NUM;
  const leftUnidade = LARG_NUM + LARG_NOME;

  const bandas = useMemo(() => {
    const b: { g: GrupoRubrica; n: number }[] = [];
    rubs.forEach((r) => {
      const ult = b[b.length - 1];
      if (ult && ult.g === r.grupo) ult.n++;
      else b.push({ g: r.grupo, n: 1 });
    });
    return b;
  }, [rubs]);

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

  // Enter na busca: pula direto para a primeira célula de valor do primeiro resultado
  function irParaPrimeiroResultado() {
    for (let ci = 2; ci <= rubs.length + 1; ci++) {
      const alvo = document.querySelector<HTMLElement>(`[data-cell="1:${ci}"]:not([disabled])`);
      if (alvo) {
        alvo.focus();
        (alvo as HTMLInputElement).select?.();
        return;
      }
    }
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

  const statusTexto =
    estado.tipo === "salvando" ? "Salvando…" : estado.tipo === "salvo" ? "Tudo salvo ✓" : estado.tipo === "erro" ? "Erro ao salvar" : "";

  return (
    <div className="space-y-2">
      {/* barra do topo */}
      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-ink-900 text-white px-5 py-3">
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
          onClick={() => setGaveta(true)}
          className="rounded-md border border-white/30 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-white/10"
        >
          Colunas da folha
        </button>
      </div>

      {/* faixa de sincronização (compacta) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] text-slate-700">
        <span>
          Funcionários vêm de <b>Colaboradores</b>: entram os ativos (CLT e estágio) e saem ao serem demitidos.
        </span>
        {movimentos.map((m, i) => (
          <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold" style={{ color: m.sinal === "+" ? COR_OK : COR_D }}>
            {m.sinal === "+" ? "+" : "−"} {m.nome}
          </span>
        ))}
      </div>

      {/* busca: escolher a unidade e procurar pelo nome */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="sel-unidade" className="sr-only">
          Unidade
        </label>
        <select
          id="sel-unidade"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="input !w-auto !py-1.5 !text-[12.5px]"
        >
          {chips.map((c) => (
            <option key={c.chave} value={c.chave}>
              {c.rotulo} ({c.n})
            </option>
          ))}
        </select>
        <div className="relative min-w-[240px] max-w-lg flex-1">
          <input
            ref={buscaRef}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                irParaPrimeiroResultado();
              } else if (e.key === "Escape") {
                setBusca("");
              }
            }}
            placeholder="Buscar funcionário pelo nome…  (tecla / )"
            aria-label="Buscar funcionário pelo nome"
            className="input !py-1.5 !pr-8 !text-[12.5px]"
          />
          {busca && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                buscaRef.current?.focus();
              }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-ink-900"
            >
              ✕
            </button>
          )}
        </div>
        <span className="text-[11.5px] text-stone-500" aria-live="polite">
          {busca.trim() ? `${totalVisiveis} encontrado${totalVisiveis === 1 ? "" : "s"} de ${totalNoFiltro}` : `${totalNoFiltro} funcionários`}
        </span>
        <span className="text-[11px] text-stone-400">Enter pula para a primeira linha</span>
      </div>

      {/* botões por unidade (letra pequena para sobrar espaço à planilha) */}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por unidade">
        {chips.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() => setFiltro(c.chave)}
            aria-pressed={filtro === c.chave}
            className={`rounded-full border px-2 py-0.5 text-[9px] leading-snug transition-colors ${c.grupo ? "border-dashed" : ""} ${
              filtro === c.chave ? "bg-ink-900 text-white border-ink-900" : "bg-white text-ink-900 border-stone-300 hover:bg-brand-50"
            }`}
          >
            {c.rotulo} · {c.n}
          </button>
        ))}
      </div>

      {/* grade ocupando toda a largura */}
      <div className="overflow-auto rounded-xl border border-stone-300 bg-white" style={{ maxHeight: "calc(100vh - 262px)", minHeight: 340 }}>
        {totalVisiveis === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            {busca.trim() ? (
              <>
                <p>
                  Nenhum funcionário encontrado para “{busca.trim()}” {filtro === "todas" ? "" : "nesta unidade"}.
                </p>
                <button type="button" onClick={() => setBusca("")} className="mt-2 text-blue-700 hover:underline">
                  Limpar busca
                </button>
              </>
            ) : (
              <p>Nenhum funcionário ativo na folha para este filtro.</p>
            )}
          </div>
        ) : (
          <div style={{ minWidth: larguraTotal }}>
            {/* faixa de grupos */}
            <div className="sticky top-0 z-30 grid bg-white" style={{ gridTemplateColumns: cols, height: 22 }}>
              <div className="sticky left-0 z-40 bg-white" style={{ gridColumn: `span ${COLUNAS_FIXAS}` }} />
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
            <div className="sticky z-30 grid border-b border-stone-300 bg-stone-50" style={{ gridTemplateColumns: cols, top: 22, minHeight: 48 }}>
              <div className="sticky left-0 z-40 border-r border-stone-200 bg-stone-50" />
              <div className="sticky z-40 border-r border-stone-200 bg-stone-50 px-2 py-1.5 text-[10.5px] font-semibold" style={{ left: leftNome }}>
                <span style={{ fontFamily: MONO, color: "#8A877F" }}>A </span>FUNCIONÁRIO
              </div>
              <div
                className="sticky z-40 border-r border-stone-300 bg-stone-50 px-2 py-1.5 text-[10.5px] font-semibold"
                style={{ left: leftUnidade }}
              >
                UNIDADE
              </div>
              <div className="border-r border-stone-200 px-2 py-1.5 text-[10.5px] font-semibold">
                PONTO / OBSERVAÇÕES
                <span className="block text-[10px] font-normal text-stone-500">texto livre do mês</span>
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
                <div className="grid border-b border-stone-200 bg-[#FAF9F6]" style={{ gridTemplateColumns: cols, height: 30 }}>
                  <div
                    className="sticky left-0 z-20 flex items-center bg-[#FAF9F6] px-3 text-[11px] font-bold tracking-wide text-ink-800"
                    style={{ gridColumn: "span 2" }}
                  >
                    {g.empresa.toUpperCase()} · {termo ? `${g.linhas.length} de ${g.base.length}` : g.linhas.length}
                  </div>
                  <div className="sticky z-20 border-r border-stone-300 bg-[#FAF9F6]" style={{ left: leftUnidade }} />
                  <div />
                  {rubs.map((r) => {
                    let v = "";
                    if (r.formato === "moeda") {
                      const s = g.base.reduce((a, f) => a + num(vals[f.id]?.[r.id]), 0);
                      v = s ? fmt(s) : "–";
                    } else if (r.formato === "sim_nao") {
                      const k = g.base.filter((f) => vals[f.id]?.[r.id] === "SIM").length;
                      v = k ? `${k} sim` : "";
                    }
                    return (
                      <div
                        key={r.id}
                        className="flex items-center px-2 text-[11.5px] font-semibold"
                        style={{ justifyContent: r.formato === "moeda" ? "flex-end" : "center", color: GRUPOS[r.grupo].cor, fontFamily: MONO }}
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
                    <div key={f.id} className="grid border-b border-stone-100" style={{ gridTemplateColumns: cols, height: 30, background: fundo }}>
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
                        style={{ left: leftNome, background: fundo }}
                        title={f.nome}
                      >
                        <span className="truncate">{destacar(f.nome, termo)}</span>
                        {f.novo && <span className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-bold text-emerald-700">NOVO</span>}
                      </button>
                      <div
                        className="sticky z-10 flex items-center overflow-hidden border-r border-stone-300 px-2 text-[11.5px] text-stone-600"
                        style={{ left: leftUnidade, background: fundo }}
                        title={rotuloUnidade(f)}
                      >
                        <span className="truncate">{rotuloUnidade(f)}</span>
                      </div>
                      <div className="border-r border-stone-100" style={{ boxShadow: ativa && sel?.k === "ponto" ? `inset 0 0 0 2px ${COR_P}` : "none" }}>
                        <input
                          data-cell={`${n}:1`}
                          value={ponto[f.id] ?? ""}
                          disabled={mesFechado}
                          title={ponto[f.id] ? ponto[f.id] : "Observações de ponto deste mês"}
                          aria-label={`Ponto e observações de ${f.nome}`}
                          placeholder="observação do ponto…"
                          onFocus={() => escolher(f.id, "ponto", n)}
                          onChange={(e) => setPonto((p) => ({ ...p, [f.id]: e.target.value }))}
                          onBlur={() => salvarPonto(f.id)}
                          onKeyDown={(e) => teclar(e, n, 1)}
                          className="h-full w-full bg-transparent px-2 text-[12px] outline-none placeholder:text-stone-300 disabled:cursor-not-allowed"
                        />
                      </div>
                      {rubs.map((r, ri) => {
                        const v = vals[f.id]?.[r.id] ?? "";
                        const ci = ri + 2;
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

      {/* gaveta "Colunas da folha": só aparece quando você pede, sem tirar espaço da planilha */}
      {gaveta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Fechar painel de colunas" onClick={() => setGaveta(false)} className="absolute inset-0 cursor-default bg-black/30" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Colunas da folha"
            className="relative h-full w-[380px] max-w-full space-y-4 overflow-y-auto bg-[#FBFAF7] p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p role="heading" aria-level={2} className="text-[15px] font-semibold">
                  Colunas da folha
                </p>
                <p className="text-xs text-stone-500">
                  Crie, edite, reordene ou exclua proventos, descontos e espelhamento. As letras se ajustam sozinhas.
                </p>
              </div>
              <button type="button" onClick={() => setGaveta(false)} aria-label="Fechar painel" className="text-stone-500 hover:text-ink-900">
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
          </aside>
        </div>
      )}

      {/* modal de coluna */}
      {modal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.d.id ? "Editar coluna" : "Nova coluna"}
            className="w-full max-w-[460px] space-y-4 rounded-[10px] bg-white p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)]"
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
                  style={{ borderColor: COR_D, background: modal.confirmar ? COR_D : "#fff", color: modal.confirmar ? "#fff" : COR_D }}
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
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] max-w-[92vw] -translate-x-1/2 rounded-lg bg-ink-900 px-4 py-2.5 text-[13px] text-white shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}
