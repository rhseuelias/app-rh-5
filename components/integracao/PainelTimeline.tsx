"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type EstadoEtapa = "done" | "progress" | "late" | "attention" | "pending" | "na";
export type StatusLinha = "dentro" | "andamento" | "atencao" | "atrasado" | "naoiniciado";
export type Tom = "green" | "blue" | "red" | "amber" | "gray";

export interface GrupoTimeline {
  nome: string;
  estado: EstadoEtapa;
  sub: string; // data curta (dd/mm) mostrada embaixo da bolinha
  dica: string; // texto do balão ao passar o mouse
}

export interface LinhaTimeline {
  id: string;
  colaboradorId: string;
  nome: string;
  cargo: string;
  empresaId: string | null;
  empresaNome: string;
  unidadeId: string | null;
  unidadeNome: string;
  lider: string;
  periodoChave: string; // "2026-09"
  periodoLabel: string; // "Set/2026"
  novo: boolean;
  statusGeral: "integracao" | "experiencia";
  status: StatusLinha;
  grupos: GrupoTimeline[];
  concluidas: number;
  etapaAtualGrupo: string | null;
  atual: {
    nome: string;
    responsavel: string;
    inicio: string;
    prazo: string;
    conclusao: string;
    situacao: string;
    situacaoTom: Tom;
    observacoes: string;
  } | null;
  responsavelAtual: string;
  previsao: string;
  pendencias: { categoria: string; itens: { nome: string; atrasada: boolean }[] }[];
  movimentos: { data: string; texto: string; quem: string }[];
}

type Quick = "" | "novos" | "andamento" | "dentro" | "atrasado" | "experiencia";
type Filtros = { org: string; lider: string; status: string; etapa: string; periodo: string; q: string };
const VAZIO: Filtros = { org: "", lider: "", status: "", etapa: "", periodo: "", q: "" };

const STATUS_INFO: Record<StatusLinha, { label: string; tom: Tom; barra: string }> = {
  dentro: { label: "Dentro do prazo", tom: "green", barra: "bg-emerald-600" },
  andamento: { label: "Em andamento", tom: "blue", barra: "bg-blue-600" },
  atencao: { label: "Atenção", tom: "amber", barra: "bg-amber-500" },
  atrasado: { label: "Atrasado", tom: "red", barra: "bg-red-600" },
  naoiniciado: { label: "Não iniciado", tom: "gray", barra: "bg-stone-400" },
};

const TOM: Record<Tom, string> = {
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-stone-200 text-stone-700",
};

const NO_CLASSE: Record<EstadoEtapa, string> = {
  done: "bg-emerald-600 border-emerald-600 text-white",
  progress: "bg-white border-blue-600",
  late: "bg-red-600 border-red-600 text-white",
  attention: "bg-amber-500 border-amber-500 text-white",
  pending: "bg-white border-brand-200",
  na: "bg-white border-dashed border-stone-300 text-stone-400",
};

const ICONES: Record<string, string> = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  chev: '<polyline points="6 9 12 15 18 9"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

function Icone({ n, size = 16 }: { n: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      dangerouslySetInnerHTML={{ __html: ICONES[n] ?? "" }}
    />
  );
}

const ICONE_GRUPO = ["file", "activity", "folder", "book", "users", "award"];
const COLUNAS = "minmax(230px,1.5fr) repeat(6,minmax(92px,1fr)) 128px 140px 76px";

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export default function PainelTimeline({
  linhas,
  gruposNomes,
}: {
  linhas: LinhaTimeline[];
  gruposNomes: string[];
}) {
  const [rascunho, setRascunho] = useState<Filtros>(VAZIO);
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [quick, setQuick] = useState<Quick>("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [vw, setVw] = useState<number>(0);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setVw(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- opções dos filtros (só o que existe nos dados) ----
  const opcoesOrg = useMemo(() => {
    const emp = new Map<string, string>();
    const uni = new Map<string, string>();
    for (const l of linhas) {
      if (l.empresaId) emp.set(l.empresaId, l.empresaNome);
      if (l.unidadeId) uni.set(l.unidadeId, `${l.empresaNome} · ${l.unidadeNome}`);
    }
    return [
      ...Array.from(emp.entries()).map(([id, nome]) => ({ v: `e:${id}`, nome })),
      ...Array.from(uni.entries()).map(([id, nome]) => ({ v: `u:${id}`, nome })),
    ];
  }, [linhas]);
  const opcoesLider = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.lider).filter(Boolean))).sort(),
    [linhas]
  );
  const opcoesPeriodo = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) m.set(l.periodoChave, l.periodoLabel);
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [linhas]);

  // ---- indicadores (sobre todos os processos, não só os filtrados) ----
  const ind = useMemo(
    () => ({
      novos: linhas.filter((l) => l.novo).length,
      andamento: linhas.filter((l) => l.status === "andamento").length,
      dentro: linhas.filter((l) => l.status === "dentro").length,
      atrasado: linhas.filter((l) => l.status === "atrasado").length,
      experiencia: linhas.filter((l) => l.statusGeral === "experiencia").length,
    }),
    [linhas]
  );

  const visiveis = useMemo(() => {
    return linhas.filter((l) => {
      if (filtros.org) {
        const [t, id] = filtros.org.split(":");
        if (t === "e" && l.empresaId !== id) return false;
        if (t === "u" && l.unidadeId !== id) return false;
      }
      if (filtros.lider && l.lider !== filtros.lider) return false;
      if (filtros.status && l.status !== filtros.status) return false;
      if (filtros.etapa && l.etapaAtualGrupo !== filtros.etapa) return false;
      if (filtros.periodo && l.periodoChave !== filtros.periodo) return false;
      if (filtros.q && !norm(`${l.nome} ${l.cargo}`).includes(norm(filtros.q))) return false;
      if (quick === "novos" && !l.novo) return false;
      if ((quick === "andamento" || quick === "dentro" || quick === "atrasado") && l.status !== quick) return false;
      if (quick === "experiencia" && l.statusGeral !== "experiencia") return false;
      return true;
    });
  }, [linhas, filtros, quick]);

  function aplicar() {
    setFiltros(rascunho);
  }
  function limpar() {
    setRascunho(VAZIO);
    setFiltros(VAZIO);
    setQuick("");
  }
  function alternarQuick(q: Quick) {
    setQuick((atual) => (atual === q ? "" : q));
  }

  const indicadores: { k: Quick; label: string; n: number; icone: string; cor: string; alerta?: boolean }[] = [
    { k: "novos", label: "Novos", n: ind.novos, icone: "userplus", cor: "bg-blue-100 text-blue-700" },
    { k: "andamento", label: "Em andamento", n: ind.andamento, icone: "clock", cor: "bg-blue-100 text-blue-700" },
    { k: "dentro", label: "Dentro do prazo", n: ind.dentro, icone: "checkc", cor: "bg-emerald-100 text-emerald-700" },
    { k: "atrasado", label: "Atrasados", n: ind.atrasado, icone: "alert", cor: "bg-red-100 text-red-700", alerta: true },
    { k: "experiencia", label: "Em experiência", n: ind.experiencia, icone: "award", cor: "bg-brand-100 text-brand-700" },
  ];

  const temFiltro = quick !== "" || Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 bg-white border border-brand-200/70 rounded-xl shadow-card overflow-hidden">
        {indicadores.map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => alternarQuick(x.k)}
            aria-pressed={quick === x.k}
            className={`flex items-center gap-3 px-4 py-3 text-left border-r border-b md:border-b-0 border-brand-200/70 last:border-r-0 transition-colors hover:bg-brand-50 ${
              quick === x.k ? "bg-brand-50 shadow-[inset_0_-3px_0_#b85c12]" : ""
            }`}
          >
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${x.cor}`}>
              <Icone n={x.icone} size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-ink-600 truncate">{x.label}</span>
              <span
                className={`block text-2xl font-display font-semibold leading-tight ${
                  x.alerta && x.n > 0 ? "text-red-600" : "text-ink-900"
                }`}
              >
                {x.n}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div
        className="card !p-3 flex flex-wrap items-end gap-2.5"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") aplicar();
        }}
      >
        <Campo label="Empresa/Unidade">
          <select
            className="input !py-1.5 !text-sm"
            value={rascunho.org}
            onChange={(e) => setRascunho({ ...rascunho, org: e.target.value })}
          >
            <option value="">Todas</option>
            {opcoesOrg.map((o) => (
              <option key={o.v} value={o.v}>
                {o.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Líder">
          <select
            className="input !py-1.5 !text-sm"
            value={rascunho.lider}
            onChange={(e) => setRascunho({ ...rascunho, lider: e.target.value })}
          >
            <option value="">Todos</option>
            {opcoesLider.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Status">
          <select
            className="input !py-1.5 !text-sm"
            value={rascunho.status}
            onChange={(e) => setRascunho({ ...rascunho, status: e.target.value })}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_INFO) as StatusLinha[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_INFO[k].label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Etapa">
          <select
            className="input !py-1.5 !text-sm"
            value={rascunho.etapa}
            onChange={(e) => setRascunho({ ...rascunho, etapa: e.target.value })}
          >
            <option value="">Todas</option>
            {gruposNomes.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Período">
          <select
            className="input !py-1.5 !text-sm"
            value={rascunho.periodo}
            onChange={(e) => setRascunho({ ...rascunho, periodo: e.target.value })}
          >
            <option value="">Todos</option>
            {opcoesPeriodo.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Buscar colaborador" grow>
          <input
            className="input !py-1.5 !text-sm"
            type="search"
            placeholder="Nome ou cargo"
            value={rascunho.q}
            onChange={(e) => setRascunho({ ...rascunho, q: e.target.value })}
          />
        </Campo>
        <button type="button" onClick={aplicar} className="btn-cta !py-2 !px-4 !text-xs inline-flex items-center gap-1.5">
          <Icone n="filter" size={14} />
          Filtrar
        </button>
        {temFiltro && (
          <button type="button" onClick={limpar} className="text-sm text-brand-600 hover:text-brand-700 hover:underline pb-2">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Legenda e contagem */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
        <span>
          Mostrando {visiveis.length} de {linhas.length} colaborador{linhas.length !== 1 ? "es" : ""} em integração
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <Legenda cor="bg-emerald-600" texto="Concluída" />
          <Legenda cor="bg-blue-600" texto="Em andamento" />
          <Legenda cor="bg-amber-500" texto="Atenção" />
          <Legenda cor="bg-red-600" texto="Atrasada" />
          <Legenda cor="bg-white border-2 border-brand-200" texto="Pendente" />
        </span>
      </div>

      {/* Timeline */}
      <div ref={areaRef} className="bg-white border border-brand-200/70 rounded-xl shadow-card overflow-x-auto">
        <div className="min-w-[1130px]">
          <div
            className="grid items-center bg-brand-50 border-b border-brand-200/70 text-[11.5px] font-medium text-ink-600"
            style={{ gridTemplateColumns: COLUNAS }}
          >
            <div className="sticky left-0 z-[3] bg-brand-50 pl-4 py-2.5">Colaborador</div>
            {gruposNomes.map((g, i) => (
              <div key={g} className="py-2.5 flex items-center justify-center gap-1.5">
                <Icone n={ICONE_GRUPO[i] ?? "file"} size={14} />
                {g}
              </div>
            ))}
            <div className="py-2.5 text-center">Progresso</div>
            <div className="py-2.5 text-center">Status</div>
            <div className="py-2.5 text-center">Ações</div>
          </div>

          {linhas.length === 0 ? (
            <p className="p-8 text-sm text-ink-600 text-center">
              Nenhum processo de integração ainda — pra começar um, abra a ficha do colaborador e clique em
              &quot;Incluir no processo de integração&quot;.
            </p>
          ) : visiveis.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-600">
              <p className="font-medium text-ink-900">Nenhum colaborador encontrado</p>
              <p>Tente outros filtros ou limpe a busca.</p>
            </div>
          ) : (
            visiveis.map((l, idx) => {
              const st = STATUS_INFO[l.status];
              const open = aberto === l.id;
              return (
                <div key={l.id} className="border-b border-brand-200/70 last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setAberto(open ? null : l.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAberto(open ? null : l.id);
                      }
                    }}
                    className={`group grid items-center cursor-pointer transition-colors hover:bg-brand-50 ${open ? "bg-brand-50" : ""}`}
                    style={{ gridTemplateColumns: COLUNAS }}
                  >
                    <div
                      className={`sticky left-0 z-[2] flex items-center gap-2.5 pl-4 pr-2 py-2.5 h-full min-w-0 transition-colors group-hover:bg-brand-50 ${
                        open ? "bg-brand-50" : "bg-white"
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 ${
                          idx % 2 ? "bg-ink-800 text-brand-50" : "bg-brand-400 text-ink-900"
                        }`}
                      >
                        {iniciais(l.nome)}
                      </span>
                      <span className="min-w-0 flex flex-col">
                        <span className="text-sm font-medium text-ink-900 truncate">{l.nome}</span>
                        <span className="text-[11.5px] text-ink-600 truncate">
                          {l.cargo}
                          {l.empresaNome ? ` · ${l.empresaNome}` : ""}
                          {l.unidadeNome ? ` · ${l.unidadeNome}` : ""}
                        </span>
                      </span>
                    </div>

                    {l.grupos.map((g, i) => {
                      const anterior = i > 0 ? l.grupos[i - 1] : null;
                      return (
                        <div key={g.nome} className="relative flex flex-col items-center gap-0.5 pt-3 pb-2.5" title={g.dica}>
                          {i > 0 && (
                            <span
                              className={`absolute left-0 top-[22px] h-0.5 w-1/2 ${
                                anterior?.estado === "done" ? "bg-emerald-600" : "bg-brand-200"
                              }`}
                            />
                          )}
                          {i < l.grupos.length - 1 && (
                            <span
                              className={`absolute right-0 top-[22px] h-0.5 w-1/2 ${
                                g.estado === "done" ? "bg-emerald-600" : "bg-brand-200"
                              }`}
                            />
                          )}
                          <span
                            className={`relative z-[1] w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-xs font-semibold ${NO_CLASSE[g.estado]}`}
                          >
                            {g.estado === "done" && <Icone n="check" size={12} />}
                            {g.estado === "progress" && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                            {(g.estado === "late" || g.estado === "attention") && "!"}
                            {g.estado === "na" && "–"}
                          </span>
                          <span className={`text-[11px] min-h-[15px] whitespace-nowrap ${g.estado === "late" ? "text-red-600 font-medium" : "text-ink-600"}`}>
                            {g.sub}
                          </span>
                        </div>
                      );
                    })}

                    <div className="px-2.5 flex flex-col gap-1.5">
                      <span className="text-xs text-ink-800">{l.concluidas}/6 etapas</span>
                      <span className="block h-1.5 rounded-full bg-stone-200 overflow-hidden">
                        <span
                          className={`block h-full rounded-full ${st.barra}`}
                          style={{ width: `${Math.round((l.concluidas / 6) * 100)}%` }}
                        />
                      </span>
                    </div>

                    <div className="px-1.5 flex justify-center">
                      <Pilula tom={st.tom} texto={st.label} />
                    </div>

                    <div className="flex items-center justify-center gap-1.5">
                      <Link
                        href={`/onboarding/${l.colaboradorId}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Abrir ficha de ${l.nome}`}
                        title="Abrir ficha e avançar etapa"
                        className="w-[30px] h-[30px] rounded-lg border border-brand-200 bg-white flex items-center justify-center hover:bg-brand-50 hover:border-brand-300 transition-colors"
                      >
                        <Icone n="arrow" />
                      </Link>
                      <span className={`text-ink-600 transition-transform ${open ? "rotate-180" : ""}`}>
                        <Icone n="chev" />
                      </span>
                    </div>
                  </div>

                  {open && <Detalhe l={l} largura={vw} />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label className={`flex flex-col gap-0.5 min-w-[130px] ${grow ? "flex-[2_1_200px]" : "flex-[1_1_130px]"}`}>
      <span className="text-[11px] text-ink-600">{label}</span>
      {children}
    </label>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`inline-block w-2.5 h-2.5 rounded-full ${cor}`} />
      {texto}
    </span>
  );
}

function Pilula({ tom, texto }: { tom: Tom; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TOM[tom]}`}>
      <i className="w-[7px] h-[7px] rounded-full bg-current inline-block" />
      {texto}
    </span>
  );
}

function Detalhe({ l, largura }: { l: LinhaTimeline; largura: number }) {
  const st = STATUS_INFO[l.status];
  const abrirFicha = `/onboarding/${l.colaboradorId}`;
  return (
    <div
      className="sticky left-0 bg-brand-50 border-t border-brand-200/70 px-5 py-4"
      style={{ width: largura > 0 ? largura : "100%" }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-3.5 mb-3.5 border-b border-brand-200/70">
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <span className="w-8 h-8 rounded-full bg-brand-400 text-ink-900 text-[12px] font-semibold flex items-center justify-center">
            {iniciais(l.nome)}
          </span>
          <div>
            <p className="text-sm font-medium text-ink-900">{l.nome}</p>
            <p className="text-xs text-ink-600">{l.cargo}</p>
          </div>
        </div>
        <div className="min-w-[170px]">
          <p className="text-xs text-ink-800 mb-1">{l.concluidas}/6 etapas</p>
          <span className="block h-1.5 rounded-full bg-stone-200 overflow-hidden">
            <span className={`block h-full rounded-full ${st.barra}`} style={{ width: `${Math.round((l.concluidas / 6) * 100)}%` }} />
          </span>
        </div>
        <Pilula tom={st.tom} texto={st.label} />
        <div>
          <p className="text-[11.5px] text-ink-600">Responsável</p>
          <p className="text-sm text-ink-900">{l.responsavelAtual}</p>
        </div>
        <div>
          <p className="text-[11.5px] text-ink-600">Previsão de conclusão</p>
          <p className="text-sm text-ink-900">{l.previsao}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.25fr_1.2fr_1fr_.95fr] gap-y-5">
        <div className="xl:pr-5">
          <h4 className="text-sm font-semibold text-ink-900 mb-2.5">Detalhes da etapa atual</h4>
          {l.atual ? (
            <>
              <span className="inline-block bg-blue-100 text-blue-800 rounded-md px-2.5 py-0.5 text-xs font-medium mb-2">
                {l.atual.nome}
              </span>
              <dl className="grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-1.5 text-[12.5px]">
                <dt className="text-ink-600">Responsável</dt>
                <dd>{l.atual.responsavel}</dd>
                <dt className="text-ink-600">Início</dt>
                <dd>{l.atual.inicio}</dd>
                <dt className="text-ink-600">Prazo</dt>
                <dd>{l.atual.prazo}</dd>
                <dt className="text-ink-600">Conclusão</dt>
                <dd>{l.atual.conclusao}</dd>
                <dt className="text-ink-600">Situação</dt>
                <dd>
                  <Pilula tom={l.atual.situacaoTom} texto={l.atual.situacao} />
                </dd>
                <dt className="text-ink-600">Observações</dt>
                <dd>{l.atual.observacoes || "—"}</dd>
              </dl>
            </>
          ) : (
            <p className="text-xs text-ink-600">Todas as etapas concluídas.</p>
          )}
        </div>

        <div className="xl:px-5 xl:border-l border-brand-200/70">
          <h4 className="text-sm font-semibold text-ink-900 mb-2.5 flex items-center gap-1.5">
            <Icone n="alert" size={15} />
            Pendências
          </h4>
          {l.pendencias.map((p) => (
            <div key={p.categoria} className="mb-2.5">
              <p className="text-[12.5px] font-medium text-ink-900">
                {p.categoria}{" "}
                <span className={`font-normal ${p.itens.length ? "text-red-700" : "text-ink-600"}`}>
                  ({p.itens.length} pendente{p.itens.length !== 1 ? "s" : ""})
                </span>
              </p>
              {p.itens.length === 0 ? (
                <p className="text-xs text-ink-600 mt-1">Nenhuma pendência</p>
              ) : (
                p.itens.map((it) => (
                  <div
                    key={it.nome}
                    className="flex items-center justify-between gap-2 bg-white border border-brand-200/70 rounded-lg px-2.5 py-1.5 mt-1.5 text-xs"
                  >
                    <span>{it.nome}</span>
                    <Pilula tom={it.atrasada ? "red" : "amber"} texto={it.atrasada ? "Atrasada" : "Pendente"} />
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        <div className="xl:px-5 xl:border-l border-brand-200/70">
          <h4 className="text-sm font-semibold text-ink-900 mb-2.5 flex items-center gap-1.5">
            <Icone n="clock" size={15} />
            Última movimentação
          </h4>
          {l.movimentos.length === 0 ? (
            <p className="text-xs text-ink-600">Sem movimentações ainda.</p>
          ) : (
            <ul className="text-[12.5px]">
              {l.movimentos.map((m, i) => (
                <li key={i} className="relative pl-[18px] pb-3">
                  <span className="absolute left-[3px] top-1.5 w-2 h-2 rounded-full bg-brand-600" />
                  {i < l.movimentos.length - 1 && (
                    <span className="absolute left-[6.5px] top-4 -bottom-0.5 w-px bg-brand-200" />
                  )}
                  <span className="text-[11.5px] text-ink-600">{m.data}</span>
                  <br />
                  {m.texto} <span className="text-[11.5px] text-ink-600">· {m.quem}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="xl:pl-5 xl:border-l border-brand-200/70">
          <h4 className="text-sm font-semibold text-ink-900 mb-2.5 flex items-center gap-1.5">
            <Icone n="activity" size={15} />
            Ações rápidas
          </h4>
          <div className="flex flex-col gap-2">
            <Link
              href={abrirFicha}
              className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-800 text-brand-50 px-3 py-2 text-[13px] font-medium hover:bg-ink-900 transition-colors"
            >
              <Icone n="arrow" />
              Avançar etapa
            </Link>
            <Link
              href={abrirFicha}
              className="flex items-center gap-2.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition-colors"
            >
              <Icone n="eye" />
              Ver detalhes
            </Link>
            <Link
              href={abrirFicha}
              className="flex items-center gap-2.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition-colors"
            >
              <Icone n="settings" />
              Editar processo e observações
            </Link>
          </div>
          <p className="text-[11px] text-ink-600 mt-2.5">
            Estas ações abrem a ficha do colaborador, onde o processo é atualizado.
          </p>
        </div>
      </div>
    </div>
  );
}
