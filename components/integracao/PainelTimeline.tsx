"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { concluirEtapaAtual, finalizarTodasEtapas, voltarEtapa } from "@/lib/actions-integracao";
import type { CSSProperties, ReactNode } from "react";

export type EstadoEtapa = "done" | "progress" | "late" | "attention" | "pending" | "na";
export type StatusLinha = "dentro" | "andamento" | "atencao" | "atrasado" | "naoiniciado";
export type Tom = "green" | "blue" | "red" | "amber" | "gray";

export interface GrupoTimeline {
  nome: string;
  estado: EstadoEtapa;
  sub: string; // data curta (dd/mm) mostrada embaixo da barra
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
    detalhe: string; // "Líder · atrasada há 8 dias" / "RH · até 24/09" / "RH · sem prazo definido"
    atrasada: boolean;
    diasAtraso: number;
    prazoCurto: string;
    responsavelTipo: string; // LIDER | RH | FUNCIONARIO | SISTEMA
    responsavelCurto: string;
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
  pendencias: { nome: string; atrasada: boolean; resp: string }[];
  etapas: { nome: string; resp: string; estado: "done" | "progress" | "late" | "pending"; direita: string }[];
  movimentos: { data: string; texto: string; quem: string }[];
}

type Quick = "" | "atrasado" | "atencao" | "dentro" | "experiencia" | "novos";
type Filtros = { org: string; lider: string; etapa: string; periodo: string; q: string };
const VAZIO: Filtros = { org: "", lider: "", etapa: "", periodo: "", q: "" };

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";
const COLUNAS = "230px minmax(0,1fr) 200px 110px 36px";

const PILULA: Record<StatusLinha, { label: string; fundo: string; texto: string }> = {
  atrasado: { label: "Atrasado", fundo: "#fdecea", texto: "#b42318" },
  atencao: { label: "Atenção", fundo: "#fff3e6", texto: "#93440c" },
  andamento: { label: "Em andamento", fundo: "#f0e8df", texto: "#3d3d3d" },
  dentro: { label: "No prazo", fundo: "#e6f4ec", texto: "#1f7a52" },
  naoiniciado: { label: "Não iniciado", fundo: "#f4ebe1", texto: "#737373" },
};

const COR_BARRA: Record<EstadoEtapa, string> = {
  done: "#2f9e6b",
  progress: "#3d3d3d",
  attention: "#f0913f",
  late: "#d92d20",
  pending: "#f0e8df",
  na: "transparent",
};

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [quick, setQuick] = useState<Quick>("");
  const [aberto, setAberto] = useState<string | null>(null);

  // ---- opções dos filtros (só o que existe nos dados) ----
  const opcoesEmpresa = useMemo(() => {
    const emp = new Map<string, string>();
    const uni = new Map<string, string>();
    for (const l of linhas) {
      if (l.empresaId) emp.set(l.empresaId, l.empresaNome);
      if (l.unidadeId) uni.set(l.unidadeId, `${l.empresaNome} · ${l.unidadeNome}`);
    }
    return {
      empresas: Array.from(emp.entries()).map(([id, nome]) => ({ v: `e:${id}`, nome })),
      unidades: Array.from(uni.entries()).map(([id, nome]) => ({ v: `u:${id}`, nome })),
    };
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

  // ---- contadores (sobre todos os processos, não só os filtrados) ----
  const ind = useMemo(
    () => ({
      todos: linhas.length,
      atrasado: linhas.filter((l) => l.status === "atrasado").length,
      atencao: linhas.filter((l) => l.status === "atencao").length,
      dentro: linhas.filter((l) => l.status === "dentro" || l.status === "andamento").length,
      experiencia: linhas.filter((l) => l.statusGeral === "experiencia").length,
      novos: linhas.filter((l) => l.novo).length,
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
      if (filtros.etapa && l.etapaAtualGrupo !== filtros.etapa) return false;
      if (filtros.periodo && l.periodoChave !== filtros.periodo) return false;
      if (filtros.q && !norm(`${l.nome} ${l.cargo}`).includes(norm(filtros.q))) return false;
      if (quick === "atrasado" && l.status !== "atrasado") return false;
      if (quick === "atencao" && l.status !== "atencao") return false;
      if (quick === "dentro" && l.status !== "dentro" && l.status !== "andamento") return false;
      if (quick === "experiencia" && l.statusGeral !== "experiencia") return false;
      if (quick === "novos" && !l.novo) return false;
      return true;
    });
  }, [linhas, filtros, quick]);

  const contadores: { k: Quick; label: string; n: number; ponto: string }[] = [
    { k: "", label: "Todos", n: ind.todos, ponto: "#a39a91" },
    { k: "atrasado", label: "Atrasados", n: ind.atrasado, ponto: "#d92d20" },
    { k: "atencao", label: "Atenção", n: ind.atencao, ponto: "#f0913f" },
    { k: "dentro", label: "No prazo", n: ind.dentro, ponto: "#2f9e6b" },
    { k: "experiencia", label: "Em experiência", n: ind.experiencia, ponto: "#3d3d3d" },
    { k: "novos", label: "Novos (7 dias)", n: ind.novos, ponto: "#93440c" },
  ];

  const temFiltro = Object.values(filtros).some(Boolean) || quick !== "";

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: INTER, color: "#262626" }}>
      {/* Contadores */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {contadores.map((c) => {
          const sel = quick === c.k;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setQuick(c.k)}
              aria-pressed={sel}
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 10,
                border: sel ? "1px solid #262626" : "1px solid #f1e4d6",
                background: sel ? "#262626" : "#fff",
                color: sel ? "#fff" : "#262626",
                cursor: "pointer",
                fontFamily: INTER,
              }}
            >
              <span className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.ponto, display: "inline-block" }} />
                {c.label}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 6,
                  fontFamily: OSWALD,
                  fontWeight: 600,
                  fontSize: 26,
                  lineHeight: 1,
                  color: sel
                    ? "#fff"
                    : c.n === 0
                    ? "#a39a91"
                    : c.k === "atrasado"
                    ? "#b42318"
                    : "#262626",
                }}
              >
                {c.n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.6fr_repeat(4,1fr)] gap-2.5 items-center">
        <div
          className="flex items-center gap-2"
          style={{ border: "1px solid #e7ddd2", background: "#fff", borderRadius: 8, padding: "0 12px", height: 38 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a39a91" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por nome ou cargo"
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontSize: 13, fontFamily: INTER }}
          />
        </div>
        <Seletor rotulo="Empresa" valor={filtros.org} aoMudar={(v) => setFiltros({ ...filtros, org: v })} vazio="Todas">
          {opcoesEmpresa.empresas.map((o) => (
            <option key={o.v} value={o.v}>
              {o.nome}
            </option>
          ))}
          {opcoesEmpresa.unidades.length > 0 && (
            <optgroup label="Unidades">
              {opcoesEmpresa.unidades.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.nome}
                </option>
              ))}
            </optgroup>
          )}
        </Seletor>
        <Seletor rotulo="Líder" valor={filtros.lider} aoMudar={(v) => setFiltros({ ...filtros, lider: v })} vazio="Todos">
          {opcoesLider.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Etapa" valor={filtros.etapa} aoMudar={(v) => setFiltros({ ...filtros, etapa: v })} vazio="Todas">
          {gruposNomes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Seletor>
        <Seletor rotulo="Período" valor={filtros.periodo} aoMudar={(v) => setFiltros({ ...filtros, periodo: v })} vazio="Todos">
          {opcoesPeriodo.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Seletor>
      </div>
      {temFiltro && (
        <div style={{ fontSize: 12, color: "#5c5c5c" }} className="flex items-center gap-3 -mt-2">
          <span>
            Mostrando {visiveis.length} de {linhas.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setFiltros(VAZIO);
              setQuick("");
            }}
            style={{ fontSize: 12, fontWeight: 600, color: "#b85c12", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
            className="hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: "#fff", border: "1px solid #f1e4d6", borderRadius: 12, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 1000 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLUNAS,
                columnGap: 16,
                padding: "14px 20px 10px",
                alignItems: "center",
              }}
            >
              <span style={CABECALHO}>Colaborador</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 4 }}>
                {gruposNomes.map((g) => (
                  <span
                    key={g}
                    title={g}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#5c5c5c",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
              <span style={CABECALHO}>Etapa atual</span>
              <span style={CABECALHO}>Status</span>
              <span />
            </div>

            {linhas.length === 0 ? (
              <p style={{ padding: 32, fontSize: 13, color: "#5c5c5c", textAlign: "center", borderTop: "1px solid #f4ebe1" }}>
                Nenhum processo de integração ainda. Para começar um, use &quot;+ Incluir colaborador&quot; ou abra a ficha
                do colaborador.
              </p>
            ) : visiveis.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#5c5c5c", borderTop: "1px solid #f4ebe1" }}>
                <p style={{ fontWeight: 600, color: "#262626" }}>Nenhum colaborador encontrado</p>
                <p>Tente outros filtros ou limpe a busca.</p>
              </div>
            ) : (
              visiveis.map((l, idx) => {
                const pil = PILULA[l.status];
                const open = aberto === l.id;
                return (
                  <div key={l.id} style={{ borderTop: "1px solid #f4ebe1" }}>
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
                      style={{
                        display: "grid",
                        gridTemplateColumns: COLUNAS,
                        columnGap: 16,
                        alignItems: "center",
                        padding: "16px 20px",
                        cursor: "pointer",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 600,
                            background: idx % 2 ? "#262626" : "#fff3e6",
                            color: idx % 2 ? "#fff" : "#93440c",
                          }}
                        >
                          {iniciais(l.nome)}
                        </span>
                        <span className="min-w-0 flex flex-col">
                          <span style={{ fontSize: 14, fontWeight: 600, textTransform: "none" }} className="truncate" title={l.nome}>
                            {l.nome}
                          </span>
                          <span style={{ fontSize: 12, color: "#737373" }} className="truncate">
                            {l.cargo || "Cargo não informado"}
                            {l.empresaNome ? ` · ${l.empresaNome}` : ""}
                            {l.unidadeNome ? ` · ${l.unidadeNome}` : ""}
                          </span>
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 4 }}>
                        {l.grupos.map((g) => (
                          <div key={g.nome} title={g.dica} className="flex flex-col gap-1.5 min-w-0">
                            <span
                              style={{
                                display: "block",
                                height: 6,
                                borderRadius: 3,
                                background: COR_BARRA[g.estado],
                                border: g.estado === "na" ? "1px dashed #d9d2ca" : undefined,
                                boxSizing: "border-box",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                minHeight: 14,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: g.estado === "late" ? "#b42318" : g.estado === "attention" ? "#93440c" : "#5c5c5c",
                              }}
                            >
                              {g.estado === "progress" ? "em curso" : g.sub}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="min-w-0 flex flex-col">
                        <span style={{ fontSize: 13, fontWeight: 600 }} className="truncate" title={l.atual?.nome}>
                          {l.atual ? l.atual.nome : "Concluído"}
                        </span>
                        <span
                          style={{ fontSize: 12, color: l.atual?.atrasada ? "#b42318" : "#737373" }}
                          className="truncate"
                          title={l.atual?.detalhe}
                        >
                          {l.atual ? l.atual.detalhe : "todas as etapas feitas"}
                        </span>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "3px 10px",
                            borderRadius: 10,
                            whiteSpace: "nowrap",
                            background: pil.fundo,
                            color: pil.texto,
                          }}
                        >
                          {pil.label}
                        </span>
                      </div>

                      <span
                        aria-hidden="true"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          border: "1px solid #e7ddd2",
                          background: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          color: "#3d3d3d",
                        }}
                      >
                        {open ? "▲" : "▼"}
                      </span>
                    </div>

                    {open && <Detalhe l={l} />}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          style={{ borderTop: "1px solid #f4ebe1", padding: "12px 20px", fontSize: 12, color: "#737373" }}
        >
          <span>Ordenado por urgência: atrasados primeiro</span>
          <span className="flex flex-wrap items-center gap-4">
            <Legenda cor="#2f9e6b" texto="Concluída" />
            <Legenda cor="#3d3d3d" texto="Em andamento" />
            <Legenda cor="#f0913f" texto="Atenção" />
            <Legenda cor="#d92d20" texto="Atrasada" />
            <Legenda cor="#f0e8df" texto="Pendente" />
          </span>
        </div>
      </div>
    </div>
  );
}

const CABECALHO: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#737373",
};

function Seletor({
  rotulo,
  valor,
  aoMudar,
  vazio,
  children,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  vazio: string;
  children: ReactNode;
}) {
  return (
    <label
      className="flex items-center gap-1.5 relative"
      style={{ border: "1px solid #e7ddd2", background: "#fff", borderRadius: 8, padding: "0 30px 0 12px", height: 38, fontSize: 13 }}
    >
      <span style={{ color: "#737373", whiteSpace: "nowrap" }}>{rotulo}:</span>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-label={rotulo}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: "none",
          background: "transparent",
          appearance: "none",
          WebkitAppearance: "none",
          fontFamily: INTER,
          fontSize: 13,
          fontWeight: 600,
          color: "#262626",
          cursor: "pointer",
        }}
      >
        <option value="">{vazio}</option>
        {children}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#737373"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ position: "absolute", right: 12, pointerEvents: "none" }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </label>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i style={{ display: "inline-block", width: 14, height: 4, borderRadius: 2, background: cor }} />
      {texto}
    </span>
  );
}

const SUBTITULO: CSSProperties = { ...CABECALHO, marginBottom: 10 };

function Detalhe({ l }: { l: LinhaTimeline }) {
  const abrirFicha = `/onboarding/${l.colaboradorId}`;
  const botao: CSSProperties = {
    fontFamily: INTER,
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #e7ddd2",
    background: "#fff",
    color: "#262626",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  };

  return (
    <div
      style={{ background: "#fffcf9", padding: "4px 20px 24px 68px", fontSize: 13 }}
      className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr] gap-8"
    >
      {/* Etapas do processo */}
      <div>
        <div style={SUBTITULO}>Etapas do processo</div>
        <div className="flex flex-col" style={{ gap: 11 }}>
          {l.etapas.map((e, i) => {
            const ponto: CSSProperties =
              e.estado === "done"
                ? { background: "#2f9e6b" }
                : e.estado === "late"
                ? { background: "#d92d20" }
                : e.estado === "progress"
                ? { background: "#fff", border: "2px solid #262626" }
                : { background: "#fff", border: "1.5px solid #d9d2ca" };
            return (
              <div key={i} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "12px minmax(0,1fr) auto" }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", boxSizing: "border-box", ...ponto }} />
                <span className="truncate" style={{ color: e.estado === "pending" ? "#737373" : "#262626", fontWeight: 500 }}>
                  {e.nome} <span style={{ fontSize: 12, fontWeight: 400, color: "#737373" }}>· {e.resp}</span>
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    color: e.estado === "late" ? "#d92d20" : e.direita === "—" ? "#a39a91" : "#5c5c5c",
                  }}
                >
                  {e.direita}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pendências + ações */}
      <div>
        <div style={SUBTITULO}>Pendências</div>
        {l.pendencias.length === 0 ? (
          <p style={{ fontSize: 12, color: "#737373" }}>Nenhuma pendência.</p>
        ) : (
          <div className="flex flex-col">
            {l.pendencias.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3"
                style={{ padding: "8px 0", borderTop: i === 0 ? "1px solid #f1e4d6" : "1px solid #f4ebe1" }}
              >
                <span style={{ fontWeight: 500 }}>{p.nome}</span>
                <span style={{ fontSize: 12, color: p.atrasada ? "#b42318" : "#737373", fontWeight: p.atrasada ? 600 : 400 }}>
                  {p.atrasada ? "atrasada" : p.resp}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
          <AcoesEtapa l={l} botao={botao} />
          <BotaoCobrar l={l} estilo={botao} />
          <Link href={abrirFicha} style={botao}>
            Abrir ficha
          </Link>
        </div>
      </div>

      {/* Últimas movimentações */}
      <div>
        <div style={SUBTITULO}>Últimas movimentações</div>
        {l.movimentos.length === 0 ? (
          <p style={{ fontSize: 12, color: "#737373" }}>Sem movimentações ainda.</p>
        ) : (
          <div className="flex flex-col">
            {l.movimentos.map((m, i) => (
              <div
                key={i}
                className="grid gap-3"
                style={{ gridTemplateColumns: "44px minmax(0,1fr)", padding: "9px 0", borderTop: i === 0 ? "1px solid #f1e4d6" : "1px solid #f4ebe1" }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "#93440c", fontVariantNumeric: "tabular-nums" }}>{m.data}</span>
                <span className="flex flex-col">
                  <span>{m.texto}</span>
                  <span style={{ fontSize: 12, color: "#737373" }}>{m.quem}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Cobrar líder / RH / funcionário": copia uma mensagem pronta para colar no WhatsApp ou no e-mail. */
function BotaoCobrar({ l, estilo }: { l: LinhaTimeline; estilo: CSSProperties }) {
  const [estado, setEstado] = useState<"" | "copiado" | "erro">("");
  const a = l.atual;
  if (!a || a.responsavelTipo === "SISTEMA") return null;

  const alvo = a.responsavelTipo === "LIDER" ? "líder" : a.responsavelTipo === "FUNCIONARIO" ? "funcionário" : "RH";
  const nomeAlvo = a.responsavelTipo === "LIDER" ? l.lider : a.responsavelTipo === "FUNCIONARIO" ? l.nome : "";

  function mensagem(): string {
    const situacao = a!.atrasada
      ? `está atrasada há ${a!.diasAtraso} dia${a!.diasAtraso !== 1 ? "s" : ""}`
      : a!.prazoCurto
      ? `tem prazo até ${a!.prazoCurto}`
      : "está pendente";
    const saudacao = nomeAlvo ? `Olá, ${nomeAlvo.split(" ")[0]}!` : "Olá!";
    return `${saudacao} A etapa "${a!.nome}" da integração de ${l.nome} ${situacao}. Pode atualizar no sistema? Obrigado.`;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem());
      setEstado("copiado");
    } catch {
      setEstado("erro");
    }
    setTimeout(() => setEstado(""), 3500);
  }

  return (
    <button type="button" onClick={copiar} style={estilo} title="Copia uma mensagem pronta para colar no WhatsApp ou e-mail">
      {estado === "copiado" ? "Mensagem copiada" : estado === "erro" ? "Não consegui copiar" : `Cobrar ${alvo}`}
    </button>
  );
}

/** Concluir etapa · Voltar etapa · Finalizar todas as etapas */
function AcoesEtapa({ l, botao }: { l: LinhaTimeline; botao: CSSProperties }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function rodar(acao: (processoId: string, colaboradorId: string) => Promise<{ ok: boolean; mensagem: string }>) {
    setMsg(null);
    iniciar(async () => {
      try {
        const r = await acao(l.id, l.colaboradorId);
        setMsg({ ok: r.ok, texto: r.mensagem });
      } catch {
        setMsg({ ok: false, texto: "Não consegui fazer isso agora. Tente de novo." });
      }
    });
  }

  const desligado: CSSProperties = pendente ? { opacity: 0.6, cursor: "wait" } : {};
  return (
    <>
      <button
        type="button"
        disabled={pendente}
        onClick={() => rodar(concluirEtapaAtual)}
        style={{ ...botao, background: "#262626", borderColor: "#262626", color: "#fff", ...desligado }}
      >
        Concluir etapa
      </button>
      <button type="button" disabled={pendente} onClick={() => rodar(voltarEtapa)} style={{ ...botao, ...desligado }}>
        Voltar etapa
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          if (window.confirm(`Finalizar todas as etapas de ${l.nome}?\n\nA avaliação dos 90 dias fica por sua conta (precisa do resultado).`)) {
            rodar(finalizarTodasEtapas);
          }
        }}
        style={{ ...botao, ...desligado }}
      >
        Finalizar todas as etapas
      </button>
      {msg && (
        <span role="status" style={{ flexBasis: "100%", fontSize: 12, fontWeight: 600, color: msg.ok ? "#1f7a52" : "#b42318" }}>
          {msg.texto}
        </span>
      )}
    </>
  );
}
