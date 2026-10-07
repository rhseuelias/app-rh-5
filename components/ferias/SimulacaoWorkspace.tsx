"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConfigSimulacao, DiaSemana, EstrategiaSimulacao, ModeloDivisaoFerias } from "@/types/db";
import { MODELOS_DIVISAO, ESTRATEGIAS_SIMULACAO, periodosDoModelo } from "@/lib/simulacao-ferias";
import {
  atualizarConfigCenario,
  atualizarUnidadesCenario,
  definirFeriasManualCenario,
  gerarAutomaticoParaRestantes,
  regenerarAutomaticos,
  limparCenario,
  promoverCenario,
  duplicarCenario,
  removerDefinicaoColaborador,
} from "@/lib/actions";
import DateInput from "@/components/DateInput";
import { fDM, fDMA, somarDias } from "@/lib/ferias-regras";
import BotaoPdf from "@/components/BotaoPdf";

/* ------------------------------------------------------------------ */
/* Tipos (a página servidor monta tudo e entrega pronto)               */
/* ------------------------------------------------------------------ */

export interface PeriodoSim {
  id: string;
  ini: string; // YYYY-MM-DD
  fim: string;
  dias: number;
  origem: "manual" | "automatica";
  problema: boolean; // conflito ou data inválida
}

export interface PessoaSim {
  id: string;
  nome: string;
  unidade: string;
  periodoId: string;
  periodoLabel: string; // "12/05/2025 a 11/05/2026"
  limite: string; // YYYY-MM-DD
  saldo: number; // dias que ainda podem ser tirados
  periodos: PeriodoSim[];
  reais: { ini: string; fim: string }[]; // férias oficiais (só para contexto no calendário)
}

export interface PendenciaSim {
  tipo: "Conflito" | "Data inválida" | "Concentração" | "Após o limite";
  texto: string;
  bloqueia: boolean;
}

export interface CenarioSim {
  id: string;
  nome: string;
  status: "rascunho" | "aprovado";
  ano: number;
  empresa: string;
  unidade: string | null;
}

interface Props {
  cenario: CenarioSim;
  cenarios: { id: string; nome: string; ano: number | null }[];
  config: ConfigSimulacao;
  pessoas: PessoaSim[];
  pendencias: PendenciaSim[];
  custo: number;
  mostrarValores: boolean;
  unidadesDisponiveis: { id: string; nome: string }[];
  unidadesSelecionadas: string[];
}

/* ------------------------------------------------------------------ */
/* Estilos                                                             */
/* ------------------------------------------------------------------ */

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";

const ROTULO: CSSProperties = {
  fontFamily: INTER,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#737373",
};

const BTN_SEC: CSSProperties = {
  fontFamily: INTER,
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #e7ddd2",
  background: "#fff",
  color: "#262626",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const CARTAO: CSSProperties = {
  background: "#fff",
  border: "1px solid #f1e4d6",
  borderRadius: 12,
};

const COR_MANUAL = { fundo: "#3d3d3d", texto: "#fff" };
const COR_AUTO = { fundo: "#ffe9d2", texto: "#93440c", barra: "#fbb26e" };
const ANEL = "0 0 0 2px #d92d20";

const DIAS_SEMANA: { k: DiaSemana; t: string; nome: string; bloqueado: boolean }[] = [
  { k: "segunda", t: "S", nome: "Segunda", bloqueado: false },
  { k: "terca", t: "T", nome: "Terça", bloqueado: false },
  { k: "quarta", t: "Q", nome: "Quarta", bloqueado: false },
  { k: "quinta", t: "Q", nome: "Quinta", bloqueado: false },
  { k: "sexta", t: "S", nome: "Sexta", bloqueado: true },
  { k: "sabado", t: "S", nome: "Sábado", bloqueado: true },
  { k: "domingo", t: "D", nome: "Domingo", bloqueado: true },
];

const CHIP_MODELO: Record<ModeloDivisaoFerias, string> = {
  "30": "30",
  "15_15": "15 + 15",
  "20_10": "20 + 10",
  "14_16": "14 + 16",
  "14_10_6": "14+10+6",
  personalizado: "Outro",
};

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/* ------------------------------------------------------------------ */
/* Regras (estado local da coluna da esquerda)                         */
/* ------------------------------------------------------------------ */

interface Regras {
  modelo: ModeloDivisaoFerias;
  p: string[]; // dias do modelo "Outro" (até 3)
  dias: DiaSemana[];
  intMin: number;
  intMax: number;
  capU: number | null;
  capD: number | null;
  estrategia: EstrategiaSimulacao;
  pesos: { dataLimite: number; cobertura: number; distribuicao: number; preferencias: number };
}

function regrasIniciais(c: ConfigSimulacao): Regras {
  const livres = new Set(DIAS_SEMANA.filter((d) => !d.bloqueado).map((d) => d.k));
  return {
    modelo: c.modelo,
    p: [0, 1, 2].map((i) => (c.periodosPersonalizados[i] ? String(c.periodosPersonalizados[i]) : "")),
    dias: c.diasPreferenciais.filter((d) => livres.has(d)),
    intMin: c.intervaloMinMeses,
    intMax: c.intervaloMaxMeses,
    capU: c.capacidadeMaxUnidade,
    capD: c.capacidadeMaxDepartamento,
    estrategia: c.estrategia,
    pesos: { ...c.pesos },
  };
}

function montarForm(cenarioId: string, r: Regras): FormData {
  const fd = new FormData();
  fd.set("cenario_id", cenarioId);
  fd.set("modelo", r.modelo);
  r.p.forEach((v, i) => fd.set(`p${i + 1}`, v || "0"));
  r.dias.forEach((d) => fd.append("dias_preferenciais", d));
  fd.set("intervalo_min", String(r.intMin));
  fd.set("intervalo_max", String(r.intMax));
  if (r.capU != null) fd.set("capacidade_unidade", String(r.capU));
  if (r.capD != null) fd.set("capacidade_departamento", String(r.capD));
  fd.set("estrategia", r.estrategia);
  fd.set("peso_data_limite", String(r.pesos.dataLimite));
  fd.set("peso_cobertura", String(r.pesos.cobertura));
  fd.set("peso_distribuicao", String(r.pesos.distribuicao));
  fd.set("peso_preferencias", String(r.pesos.preferencias));
  return fd;
}

type ResumoGeracao = Awaited<ReturnType<typeof gerarAutomaticoParaRestantes>>;

function textoResumo(r: ResumoGeracao): string {
  const partes: string[] = [];
  if (r.criados > 0) partes.push(`${r.criados} colaborador${r.criados !== 1 ? "es" : ""} programado${r.criados !== 1 ? "s" : ""}`);
  if (r.saldoInsuficiente.length > 0) partes.push(`Saldo insuficiente para o modelo: ${r.saldoInsuficiente.join(", ")}`);
  if (r.incompletos.length > 0) partes.push(`Sem data válida para todos os períodos: ${r.incompletos.join(", ")}`);
  if (partes.length === 0) partes.push("Nada para gerar.");
  return partes.join(" · ");
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export default function SimulacaoWorkspace({
  cenario,
  cenarios,
  config,
  pessoas,
  pendencias,
  custo,
  mostrarValores,
  unidadesDisponiveis,
  unidadesSelecionadas,
}: Props) {
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  const aprovado = cenario.status === "aprovado";

  const [regras, setRegras] = useState<Regras>(() => regrasIniciais(config));
  const [statusSalvar, setStatusSalvar] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [visao, setVisao] = useState<"lista" | "calendario">("lista");
  const [aviso, setAviso] = useState<string | null>(null);
  const [definindo, setDefinindo] = useState<PessoaSim | null>(null);
  const [confirmaLimpar, setConfirmaLimpar] = useState(false);
  const [confirmaAprovar, setConfirmaAprovar] = useState(false);
  const [confirmaSemFixas, setConfirmaSemFixas] = useState(false);
  const [buscaFixa, setBuscaFixa] = useState("");

  /* ---- salvar regras (com atraso, para não gravar a cada clique) ---- */
  const primeira = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef<Promise<void> | null>(null);
  const regrasRef = useRef(regras);
  regrasRef.current = regras;

  async function salvar() {
    setStatusSalvar("salvando");
    const p = atualizarConfigCenario(montarForm(cenario.id, regrasRef.current))
      .then(() => setStatusSalvar("salvo"))
      .catch(() => setStatusSalvar("erro"));
    emVoo.current = p;
    await p;
  }

  async function garantirSalvo() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await salvar();
    } else if (emVoo.current) {
      await emVoo.current;
    }
  }

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (aprovado) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void salvar();
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regras]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  function mudar(parcial: Partial<Regras>) {
    setRegras((r) => ({ ...r, ...parcial }));
  }

  /* ---- números ---- */
  const resumo = useMemo(() => {
    let completos = 0;
    let parciais = 0;
    let indefinidos = 0;
    let semData = 0;
    for (const p of pessoas) {
      const sim = p.periodos.reduce((s, x) => s + x.dias, 0);
      const falta = Math.max(0, p.saldo - sim);
      semData += falta;
      if (p.periodos.length === 0 && p.saldo > 0) indefinidos++;
      else if (falta > 0) parciais++;
      else completos++;
    }
    const bloqueantes = pendencias.filter((x) => x.bloqueia);
    const conflitos = bloqueantes.filter((x) => x.tipo === "Conflito").length;
    const invalidas = bloqueantes.filter((x) => x.tipo === "Data inválida").length;
    const concentr = bloqueantes.filter((x) => x.tipo === "Concentração").length;
    const subPend = [
      conflitos ? `${conflitos} conflito${conflitos !== 1 ? "s" : ""}` : "",
      invalidas ? `${invalidas} data${invalidas !== 1 ? "s" : ""} inválida${invalidas !== 1 ? "s" : ""}` : "",
      concentr ? `${concentr} de concentração` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const nenhumaFerias = pessoas.every((p) => p.periodos.length === 0);
    return { completos, parciais, indefinidos, semData, bloqueantes: bloqueantes.length, subPend, nenhumaFerias };
  }, [pessoas, pendencias]);

  // passo 1: quem já tem data fixa (definida manualmente) — a simulação mantém e considera essas datas
  const fixas = useMemo(() => pessoas.filter((p) => p.periodos.some((x) => x.origem === "manual")), [pessoas]);
  const candidatosFixa = useMemo(() => {
    const q = semAcento(buscaFixa.trim());
    if (!q) return [];
    return pessoas.filter((p) => !p.periodos.some((x) => x.origem === "manual") && semAcento(p.nome).includes(q)).slice(0, 6);
  }, [pessoas, buscaFixa]);

  const total = pessoas.length;
  const pctCompleto = total ? (resumo.completos / total) * 100 : 0;
  const pctParcial = total ? (resumo.parciais / total) * 100 : 0;
  const padraoModelo = useMemo(() => {
    const cfg = { ...config, modelo: regras.modelo, periodosPersonalizados: regras.p.map(Number).filter((n) => n > 0) };
    return periodosDoModelo(cfg);
  }, [config, regras.modelo, regras.p]);

  /* ---- ações ---- */
  function gerar(modo: "gerar" | "regenerar", colaboradorId?: string) {
    startTransition(async () => {
      await garantirSalvo();
      const r = modo === "gerar" ? await gerarAutomaticoParaRestantes(cenario.id, colaboradorId) : await regenerarAutomaticos(cenario.id);
      setAviso(textoResumo(r));
      router.refresh();
    });
  }

  function limparPessoa(id: string) {
    startTransition(async () => {
      await removerDefinicaoColaborador(cenario.id, id);
      setAviso("Definição removida");
      router.refresh();
    });
  }

  function limparTudo() {
    setConfirmaLimpar(false);
    startTransition(async () => {
      await limparCenario(cenario.id);
      setAviso("Simulação limpa");
      router.refresh();
    });
  }

  function aprovar() {
    setConfirmaAprovar(false);
    startTransition(async () => {
      await garantirSalvo();
      await promoverCenario(cenario.id);
      setAviso("Cenário aprovado. As férias já estão no mapa oficial.");
      router.refresh();
    });
  }

  function duplicar() {
    startTransition(async () => {
      await duplicarCenario(cenario.id);
    });
  }

  const textoCusto = mostrarValores ? moeda(custo) : "—";

  /* ---------------------------------------------------------------- */

  return (
    <div style={{ fontFamily: INTER, color: "#262626" }} className="max-w-[1320px] mx-auto flex flex-col gap-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/ferias" style={{ fontSize: 12, fontWeight: 500, color: "#b85c12" }} className="hover:underline">
            ← Férias
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              style={{
                margin: 0,
                fontFamily: OSWALD,
                fontWeight: 600,
                fontSize: 32,
                lineHeight: 1,
                textTransform: "uppercase",
                letterSpacing: ".02em",
              }}
            >
              Simulação de férias
            </h1>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 10,
                background: aprovado ? "#e6f4ec" : "#f0e8df",
                color: aprovado ? "#1f7a52" : "#5c5c5c",
              }}
            >
              {aprovado ? "Aprovado" : "Rascunho"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#5c5c5c" }}>
            Planejamento {cenario.ano} · {cenario.nome} · {cenario.empresa}
            {cenario.unidade ? ` · ${cenario.unidade}` : ""} ·{" "}
            {aprovado ? "já está no mapa oficial" : "não altera o mapa oficial até aprovar"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cenario.id}
            onChange={(e) => {
              const v = e.target.value;
              router.push(v === "__todos" ? "/ferias/simulacao" : `/ferias/simulacao?cenario=${v}`);
            }}
            style={{ ...BTN_SEC, fontWeight: 500, maxWidth: 260 }}
            aria-label="Trocar de cenário"
          >
            {cenarios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {c.ano ?? "—"}
              </option>
            ))}
            <option value="__todos">Ver todos os cenários…</option>
          </select>
          <button type="button" onClick={duplicar} disabled={ocupado} style={{ ...BTN_SEC, opacity: ocupado ? 0.6 : 1 }}>
            Duplicar
          </button>
          <BotaoPdf href={`/api/ferias/simulacao/${cenario.id}/pdf`} style={BTN_SEC} titulo="Simulação de férias — PDF">
            PDF
          </BotaoPdf>
          <a href={`/api/ferias/simulacao/${cenario.id}/excel`} style={BTN_SEC}>
            Excel
          </a>
        </div>
      </div>

      {/* Grade: regras + conteúdo */}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* ------------------ Regras do cenário ------------------ */}
        <div style={{ ...CARTAO, padding: 20, gap: 22 }} className="flex flex-col xl:sticky xl:top-5">
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 14, fontWeight: 600 }}>Regras do cenário</div>
            <span style={{ fontSize: 11, color: statusSalvar === "erro" ? "#b42318" : "#737373" }}>
              {aprovado
                ? "somente leitura"
                : statusSalvar === "salvando"
                ? "salvando…"
                : statusSalvar === "salvo"
                ? "salvo"
                : statusSalvar === "erro"
                ? "não salvou"
                : ""}
            </span>
          </div>

          {unidadesDisponiveis.length > 1 && (
            <SeletorUnidades
              cenarioId={cenario.id}
              disponiveis={unidadesDisponiveis}
              selecionadas={unidadesSelecionadas}
              bloqueado={aprovado}
            />
          )}

          <fieldset disabled={aprovado} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} className="flex flex-col gap-[22px]">
            {/* Divisão */}
            <Bloco titulo="Divisão">
              <div className="grid grid-cols-3 gap-1.5">
                {MODELOS_DIVISAO.map((m) => {
                  const ativo = regras.modelo === m.valor;
                  return (
                    <button
                      key={m.valor}
                      type="button"
                      onClick={() => mudar({ modelo: m.valor })}
                      style={{
                        fontFamily: INTER,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "8px 0",
                        borderRadius: 6,
                        border: 0,
                        cursor: aprovado ? "default" : "pointer",
                        fontVariantNumeric: "tabular-nums",
                        background: ativo ? "#262626" : "#f4ebe1",
                        color: ativo ? "#fff" : "#3d3d3d",
                      }}
                    >
                      {CHIP_MODELO[m.valor]}
                    </button>
                  );
                })}
              </div>
              {regras.modelo === "personalizado" && (
                <div className="flex items-center gap-2 mt-1" style={{ fontSize: 12, color: "#5c5c5c" }}>
                  {[0, 1, 2].map((i) => (
                    <input
                      key={i}
                      type="number"
                      min={0}
                      max={30}
                      value={regras.p[i]}
                      placeholder={`${i + 1}º`}
                      onChange={(e) => {
                        const p = [...regras.p];
                        p[i] = e.target.value;
                        mudar({ p });
                      }}
                      style={campoNumero(52)}
                    />
                  ))}
                  <span>dias</span>
                </div>
              )}
              {regras.modelo === "personalizado" && (
                <span style={{ fontSize: 11, color: "#737373" }}>Até 3 períodos, um com 14 dias ou mais, os outros com 5 ou mais.</span>
              )}
            </Bloco>

            {/* Prioridade */}
            <Bloco titulo="Prioridade">
              <div className="flex flex-col gap-1">
                {ESTRATEGIAS_SIMULACAO.map((e) => {
                  const ativo = regras.estrategia === e.valor;
                  return (
                    <div
                      key={e.valor}
                      role="radio"
                      aria-checked={ativo}
                      tabIndex={0}
                      onClick={() => mudar({ estrategia: e.valor })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") mudar({ estrategia: e.valor });
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "16px 1fr",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: aprovado ? "default" : "pointer",
                        background: ativo ? "#faf7f3" : "transparent",
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          boxSizing: "border-box",
                          marginTop: 1,
                          border: ativo ? "4.5px solid #262626" : "1.5px solid #c9c2ba",
                          background: "#fff",
                        }}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{e.label}</span>
                        <span style={{ fontSize: 12, lineHeight: 1.35, color: "#5c5c5c" }}>{e.descricao}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {regras.estrategia === "personalizada" && (
                <div className="flex flex-col gap-2 mt-1 px-2.5">
                  {(
                    [
                      ["dataLimite", "Data-limite"],
                      ["cobertura", "Cobertura da equipe"],
                      ["distribuicao", "Distribuição no ano"],
                      ["preferencias", "Preferências"],
                    ] as const
                  ).map(([k, nome]) => (
                    <label key={k} style={{ fontSize: 12, color: "#3d3d3d" }}>
                      <span className="flex justify-between">
                        <span>{nome}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", color: "#737373" }}>{regras.pesos[k]}%</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={regras.pesos[k]}
                        onChange={(e) => mudar({ pesos: { ...regras.pesos, [k]: Number(e.target.value) } })}
                        style={{ width: "100%", accentColor: "#262626" }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </Bloco>

            {/* Dia da semana */}
            <Bloco titulo="Começar de preferência em">
              <div className="grid grid-cols-7 gap-1">
                {DIAS_SEMANA.map((d) => {
                  const ativo = regras.dias.includes(d.k);
                  return (
                    <button
                      key={d.k}
                      type="button"
                      title={d.bloqueado ? `${d.nome}: bloqueado pela CLT` : d.nome}
                      disabled={d.bloqueado}
                      onClick={() =>
                        mudar({ dias: ativo ? regras.dias.filter((x) => x !== d.k) : [...regras.dias, d.k] })
                      }
                      style={{
                        fontFamily: INTER,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "7px 0",
                        borderRadius: 6,
                        border: 0,
                        cursor: d.bloqueado || aprovado ? "default" : "pointer",
                        background: d.bloqueado ? "#f4ebe1" : ativo ? "#262626" : "#f4ebe1",
                        color: d.bloqueado ? "#c9c2ba" : ativo ? "#fff" : "#3d3d3d",
                      }}
                    >
                      {d.t}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 12, color: "#737373" }}>
                Sexta, sábado e domingo são bloqueados pela CLT.
                {regras.dias.length === 0 ? " Sem preferência marcada: qualquer dia permitido." : ""}
              </span>
            </Bloco>

            {/* Intervalo */}
            <Bloco titulo="Intervalo entre períodos">
              <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
                <input
                  type="number"
                  min={1}
                  max={11}
                  value={regras.intMin}
                  onChange={(e) => {
                    const v = Math.min(11, Math.max(1, Number(e.target.value) || 1));
                    mudar({ intMin: v, intMax: Math.max(v, regras.intMax) });
                  }}
                  style={campoNumero(56)}
                />
                <span style={{ color: "#5c5c5c" }}>a</span>
                <input
                  type="number"
                  min={1}
                  max={11}
                  value={regras.intMax}
                  onChange={(e) => {
                    const v = Math.min(11, Math.max(1, Number(e.target.value) || 1));
                    mudar({ intMax: v, intMin: Math.min(v, regras.intMin) });
                  }}
                  style={campoNumero(56)}
                />
                <span style={{ color: "#5c5c5c" }}>meses</span>
              </div>
            </Bloco>

            {/* Capacidade */}
            <div className="flex flex-col gap-3">
              <Passo
                titulo="Fora ao mesmo tempo"
                sub="máximo por unidade"
                valor={regras.capU}
                aoMudar={(v) => mudar({ capU: v })}
              />
              <Passo
                titulo="Fora ao mesmo tempo"
                sub="máximo por departamento"
                valor={regras.capD}
                aoMudar={(v) => mudar({ capD: v })}
              />
            </div>
          </fieldset>

          {!aprovado && (
            <div className="flex flex-col gap-2" style={{ paddingTop: 4, borderTop: "1px solid #f4ebe1" }}>
              <div style={{ ...ROTULO, marginTop: 14 }}>Passo 2 · Simular os demais</div>
              <div style={{ fontSize: 12, color: "#5c5c5c", lineHeight: 1.45 }}>
                {fixas.length > 0
                  ? `As ${fixas.length} data${fixas.length !== 1 ? "s" : ""} fixa${fixas.length !== 1 ? "s" : ""} ficam como estão e entram na conta de conflitos e de pessoas fora ao mesmo tempo.`
                  : "Antes de simular, defina no passo 1 quem já tem data fixa."}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (fixas.length === 0 && !confirmaSemFixas) {
                    setConfirmaSemFixas(true);
                    return;
                  }
                  setConfirmaSemFixas(false);
                  gerar("gerar");
                }}
                disabled={ocupado || resumo.indefinidos === 0}
                style={{
                  marginTop: 14,
                  fontFamily: INTER,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: 11,
                  borderRadius: 8,
                  border: 0,
                  cursor: ocupado || resumo.indefinidos === 0 ? "default" : "pointer",
                  background: resumo.indefinidos === 0 ? "#f0e8df" : "#262626",
                  color: resumo.indefinidos === 0 ? "#a8a29a" : "#fff",
                }}
              >
                {ocupado ? "Gerando…" : `Gerar para ${resumo.indefinidos} sem definição`}
              </button>
              {confirmaSemFixas && fixas.length === 0 && (
                <div style={{ fontSize: 12, color: "#3d3d3d", background: "#fdf3e7", borderRadius: 8, padding: 10 }}>
                  <div>Ninguém tem data fixa ainda. Simular mesmo assim?</div>
                  <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmaSemFixas(false);
                        gerar("gerar");
                      }}
                      style={linkBtn("#262626")}
                    >
                      Sim, simular
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmaSemFixas(false);
                        document.getElementById("passo-datas-fixas")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        document.getElementById("busca-data-fixa")?.focus();
                      }}
                      style={linkBtn("#b85c12")}
                    >
                      Definir antes
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => gerar("regenerar")}
                disabled={ocupado}
                style={{ ...BTN_SEC, padding: 10, opacity: ocupado ? 0.6 : 1 }}
              >
                Refazer as automáticas
              </button>
              {confirmaLimpar ? (
                <div className="flex items-center justify-center gap-3" style={{ fontSize: 12, paddingTop: 4 }}>
                  <span style={{ color: "#3d3d3d" }}>Apagar tudo?</span>
                  <button type="button" onClick={limparTudo} style={linkBtn("#b42318")}>
                    Sim, limpar
                  </button>
                  <button type="button" onClick={() => setConfirmaLimpar(false)} style={linkBtn("#737373")}>
                    Não
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmaLimpar(true)} style={{ ...linkBtn("#b42318"), paddingTop: 4 }}>
                  Limpar simulação
                </button>
              )}
            </div>
          )}
        </div>

        {/* ------------------ Coluna direita ------------------ */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* KPIs */}
          <div style={CARTAO} className="grid grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div style={{ padding: "20px 24px", gap: 8 }} className="flex flex-col lg:border-r border-[#f4ebe1]">
              <div style={ROTULO}>Programados</div>
              <div className="flex items-baseline gap-1.5">
                <span style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 28, lineHeight: 1 }}>{resumo.completos}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#737373" }}>de {total}</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, background: "#f4ebe1" }}>
                <div style={{ background: "#262626", width: `${pctCompleto}%` }} />
                <div style={{ background: "#fbb26e", width: `${pctParcial}%` }} />
              </div>
              <div style={{ fontSize: 12, color: "#5c5c5c" }}>
                {resumo.parciais} parciais · {resumo.indefinidos} sem definição
              </div>
            </div>
            <div style={{ padding: "20px 24px", gap: 6 }} className="flex flex-col lg:border-r border-[#f4ebe1]">
              <div style={ROTULO}>Pendências</div>
              <div
                style={{
                  fontFamily: OSWALD,
                  fontWeight: 600,
                  fontSize: 28,
                  lineHeight: 1,
                  color: resumo.bloqueantes > 0 ? "#b42318" : "#262626",
                }}
              >
                {resumo.bloqueantes}
              </div>
              <div style={{ fontSize: 12, color: "#5c5c5c" }}>{resumo.subPend || "nada a resolver"}</div>
            </div>
            <div style={{ padding: "20px 24px", gap: 6 }} className="flex flex-col lg:border-r border-[#f4ebe1]">
              <div style={ROTULO}>Dias sem data</div>
              <div style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 28, lineHeight: 1 }}>{resumo.semData} dias</div>
              <div style={{ fontSize: 12, color: "#5c5c5c" }}>somando todos os saldos</div>
            </div>
            <div style={{ padding: "20px 24px", gap: 6 }} className="flex flex-col">
              <div style={ROTULO}>Custo estimado</div>
              <div style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 28, lineHeight: 1 }}>{textoCusto}</div>
              <div style={{ fontSize: 12, color: "#5c5c5c" }}>férias + 1/3 do cenário</div>
            </div>
          </div>

          {/* Passo 1 — datas fixas */}
          {!aprovado && (
            <div id="passo-datas-fixas" style={{ ...CARTAO, padding: "20px 24px" }} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div style={{ fontSize: 14, fontWeight: 600 }}>Passo 1 · Datas já definidas</div>
                <span style={{ fontSize: 12, color: "#5c5c5c" }}>
                  {fixas.length} com data fixa · {total - fixas.length} para simular
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#5c5c5c", lineHeight: 1.45 }}>
                Quem já tem as férias combinadas: defina aqui primeiro. A simulação mantém essas datas e planeja os outros em volta delas.
              </div>

              {fixas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fixas.map((p) => {
                    const manuais = p.periodos.filter((x) => x.origem === "manual");
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDefinindo(p)}
                        title="Editar datas"
                        style={{
                          fontFamily: INTER,
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #e7ddd2",
                          background: "#f4ebe1",
                          color: "#262626",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <strong style={{ fontWeight: 600 }}>{p.nome}</strong>
                        <span style={{ color: "#5c5c5c" }}>
                          {" · "}
                          {manuais.map((x) => `${fDM(x.ini)} a ${fDM(x.fim)}`).join(" + ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2" style={{ maxWidth: 420 }}>
                <input
                  id="busca-data-fixa"
                  type="search"
                  value={buscaFixa}
                  onChange={(e) => setBuscaFixa(e.target.value)}
                  placeholder="Buscar colaborador para definir a data"
                  style={{ fontFamily: INTER, fontSize: 13, padding: "9px 12px", border: "1px solid #e7ddd2", borderRadius: 8, background: "#fff", color: "#262626" }}
                />
                {candidatosFixa.length > 0 && (
                  <div style={{ border: "1px solid #f4ebe1", borderRadius: 8, overflow: "hidden" }}>
                    {candidatosFixa.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setDefinindo(p);
                          setBuscaFixa("");
                        }}
                        style={{
                          display: "flex",
                          width: "100%",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "9px 12px",
                          border: 0,
                          borderBottom: "1px solid #f4ebe1",
                          background: "#fff",
                          fontFamily: INTER,
                          fontSize: 13,
                          color: "#262626",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span>
                          {p.nome} <span style={{ color: "#737373", fontSize: 12 }}>· {p.unidade}</span>
                        </span>
                        <span style={{ color: "#b85c12", fontWeight: 600, fontSize: 12 }}>Definir data</span>
                      </button>
                    ))}
                  </div>
                )}
                {buscaFixa.trim() && candidatosFixa.length === 0 && (
                  <span style={{ fontSize: 12, color: "#737373" }}>Ninguém encontrado (ou já tem data fixa).</span>
                )}
              </div>
            </div>
          )}

          {/* Colaboradores */}
          <div style={{ ...CARTAO, padding: "8px 24px 16px" }} className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "12px 0" }}>
              <div style={{ display: "flex", background: "#f0e8df", borderRadius: 8, padding: 3, fontSize: 13, fontWeight: 500 }}>
                {(["lista", "calendario"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisao(v)}
                    style={{
                      fontFamily: INTER,
                      fontSize: 13,
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: 0,
                      cursor: "pointer",
                      background: visao === v ? "#fff" : "transparent",
                      fontWeight: visao === v ? 600 : 500,
                      color: "#262626",
                    }}
                  >
                    {v === "lista" ? "Lista" : "Calendário"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3.5" style={{ fontSize: 12, fontWeight: 500, color: "#5c5c5c" }}>
                <Legenda cor={COR_MANUAL.fundo} texto="Manual" />
                <Legenda cor={COR_AUTO.barra} texto="Automática" />
                {visao === "calendario" && <Legenda cor="#d6cec5" texto="Já no mapa oficial" />}
                <Legenda cor="#fff" anel texto="Conflito ou data inválida" />
              </div>
            </div>

            {pessoas.length === 0 ? (
              <p style={{ fontSize: 13, color: "#737373", padding: "28px 0", textAlign: "center" }}>
                Nenhum colaborador com período aquisitivo aberto nesse escopo.
              </p>
            ) : visao === "lista" ? (
              <ListaPessoas
                pessoas={pessoas}
                aprovado={aprovado}
                ocupado={ocupado}
                aoGerar={(id) => gerar("gerar", id)}
                aoLimpar={limparPessoa}
                aoDefinir={setDefinindo}
              />
            ) : (
              <Calendario pessoas={pessoas} ano={cenario.ano} aprovado={aprovado} aoDefinir={setDefinindo} />
            )}
          </div>

          {/* Pendências */}
          {pendencias.length > 0 && (
            <div style={{ ...CARTAO, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                {resumo.bloqueantes > 0 ? "Resolver antes de aprovar" : "Avisos"}
              </div>
              <div className="flex flex-col">
                {pendencias.map((p, i) => {
                  const aviso = p.tipo === "Após o limite";
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3"
                      style={{ padding: "11px 0", borderTop: "1px solid #f4ebe1", fontSize: 13, color: "#3d3d3d" }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: aviso ? "#ffe9d2" : "#fdecea",
                          color: aviso ? "#93440c" : "#b42318",
                        }}
                      >
                        {p.tipo}
                      </span>
                      <span>{p.texto}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé fixo */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 20,
          background: "#fff",
          borderTop: "1px solid #f1e4d6",
          borderRadius: "12px 12px 0 0",
          boxShadow: "0 -4px 16px rgba(38,38,38,.05)",
          padding: "14px 24px",
        }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div style={{ fontSize: 13, color: resumo.bloqueantes > 0 && !aprovado ? "#b42318" : "#3d3d3d", fontWeight: 500 }}>
          {aprovado
            ? "Cenário aprovado. As férias já estão no mapa oficial."
            : resumo.bloqueantes > 0
            ? `Resolva ${resumo.bloqueantes} pendência${resumo.bloqueantes !== 1 ? "s" : ""} para aprovar`
            : `${resumo.completos} de ${total} completos · ${resumo.semData} dias sem data${mostrarValores ? ` · ${textoCusto}` : ""}`}
        </div>
        {!aprovado && (
          <div className="relative">
            {confirmaAprovar && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "calc(100% + 10px)",
                  width: 300,
                  background: "#fff",
                  border: "1px solid #e7ddd2",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(38,38,38,.15)",
                  padding: 16,
                  fontSize: 13,
                }}
              >
                <p style={{ margin: 0, color: "#3d3d3d" }}>
                  As férias deste cenário viram férias planejadas no mapa oficial e entram no calendário. Confirmar?
                </p>
                <div className="flex justify-end gap-2" style={{ marginTop: 12 }}>
                  <button type="button" onClick={() => setConfirmaAprovar(false)} style={{ ...BTN_SEC, padding: "7px 12px" }}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={aprovar}
                    style={{ ...BTN_SEC, padding: "7px 12px", background: "#262626", color: "#fff", border: "1px solid #262626" }}
                  >
                    Sim, aprovar
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={ocupado || resumo.bloqueantes > 0 || resumo.nenhumaFerias}
              onClick={() => setConfirmaAprovar((v) => !v)}
              style={{
                fontFamily: INTER,
                fontSize: 13,
                fontWeight: 600,
                padding: "11px 18px",
                borderRadius: 8,
                border: 0,
                background: ocupado || resumo.bloqueantes > 0 || resumo.nenhumaFerias ? "#f0e8df" : "#262626",
                color: ocupado || resumo.bloqueantes > 0 || resumo.nenhumaFerias ? "#a8a29a" : "#fff",
                cursor: ocupado || resumo.bloqueantes > 0 || resumo.nenhumaFerias ? "default" : "pointer",
              }}
            >
              Aprovar e enviar para o mapa oficial
            </button>
          </div>
        )}
      </div>

      {/* Aviso (toast) */}
      {aviso && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 92,
            zIndex: 60,
            background: "#262626",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            padding: "11px 18px",
            borderRadius: 10,
            maxWidth: "min(640px, 92vw)",
            boxShadow: "0 8px 24px rgba(38,38,38,.25)",
          }}
        >
          {aviso}
        </div>
      )}

      {/* Painel lateral: definir manualmente */}
      {definindo && (
        <PainelDefinir
          key={definindo.id}
          pessoa={definindo}
          cenarioId={cenario.id}
          padrao={padraoModelo}
          aoFechar={() => setDefinindo(null)}
          aoSalvar={(msg) => {
            setDefinindo(null);
            setAviso(msg);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças pequenas                                                      */
/* ------------------------------------------------------------------ */

function campoNumero(largura: number): CSSProperties {
  return {
    width: largura,
    fontFamily: INTER,
    fontSize: 14,
    fontWeight: 500,
    padding: 8,
    border: "1px solid #e7ddd2",
    borderRadius: 8,
    textAlign: "center",
    background: "#fff",
  };
}

function linkBtn(cor: string): CSSProperties {
  return {
    fontFamily: INTER,
    fontSize: 12,
    fontWeight: 500,
    color: cor,
    background: "transparent",
    border: 0,
    cursor: "pointer",
    padding: 0,
    textAlign: "center",
  };
}

/** Escolher em quais unidades a simulação vale: uma, algumas ou todas (salva sozinho). */
function SeletorUnidades({
  cenarioId,
  disponiveis,
  selecionadas,
  bloqueado,
}: {
  cenarioId: string;
  disponiveis: { id: string; nome: string }[];
  selecionadas: string[];
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [marcadas, setMarcadas] = useState<string[]>(selecionadas);
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chave = selecionadas.join("|");

  // quando a página recarrega com outra seleção (ex.: trocou de cenário), acompanha
  useEffect(() => {
    setMarcadas(selecionadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenarioId, chave]);

  function salvar(ids: string[]) {
    if (timer.current) clearTimeout(timer.current);
    setEstado("salvando");
    timer.current = setTimeout(() => {
      atualizarUnidadesCenario(cenarioId, ids)
        .then(() => {
          setEstado("salvo");
          router.refresh();
        })
        .catch(() => setEstado("erro"));
    }, 600);
  }

  function alternar(id: string) {
    if (bloqueado) return;
    const novo = marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id];
    if (novo.length === 0) return; // sempre fica pelo menos uma
    setMarcadas(novo);
    salvar(novo);
  }

  function todas() {
    if (bloqueado) return;
    const ids = disponiveis.map((u) => u.id);
    setMarcadas(ids);
    salvar(ids);
  }

  const todasMarcadas = marcadas.length === disponiveis.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span style={ROTULO}>Unidades</span>
        <span style={{ fontSize: 11, color: estado === "erro" ? "#b42318" : "#737373" }}>
          {estado === "salvando" ? "salvando…" : estado === "salvo" ? "salvo" : estado === "erro" ? "não salvou" : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label
          style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: bloqueado ? "default" : "pointer" }}
        >
          <input type="checkbox" checked={todasMarcadas} onChange={todas} disabled={bloqueado} />
          Todas as unidades
        </label>
        {disponiveis.map((u) => (
          <label
            key={u.id}
            style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: bloqueado ? "default" : "pointer", color: "#3d3d3d" }}
          >
            <input type="checkbox" checked={marcadas.includes(u.id)} onChange={() => alternar(u.id)} disabled={bloqueado} />
            {u.nome}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#737373" }}>
        {todasMarcadas ? "A simulação vale para todas as unidades." : `A simulação vale para ${marcadas.length} de ${disponiveis.length} unidades.`}
      </div>
    </div>
  );
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span style={ROTULO}>{titulo}</span>
      {children}
    </div>
  );
}

function Legenda({ cor, texto, anel }: { cor: string; texto: string; anel?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        style={{
          width: 14,
          height: 8,
          borderRadius: 2,
          background: cor,
          boxShadow: anel ? "inset 0 0 0 2px #d92d20" : undefined,
        }}
      />
      {texto}
    </span>
  );
}

/** Contador − n + ; "sem limite" quando vazio. */
function Passo({
  titulo,
  sub,
  valor,
  aoMudar,
}: {
  titulo: string;
  sub: string;
  valor: number | null;
  aoMudar: (v: number | null) => void;
}) {
  const botao: CSSProperties = {
    width: 32,
    textAlign: "center",
    fontFamily: INTER,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: "34px",
    cursor: "pointer",
    color: "#5c5c5c",
    background: "transparent",
    border: 0,
    padding: 0,
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span style={ROTULO}>{titulo}</span>
        <span style={{ fontSize: 12, color: "#5c5c5c" }}>{sub}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #e7ddd2", borderRadius: 8, overflow: "hidden" }}>
        <button
          type="button"
          aria-label="Diminuir"
          onClick={() => aoMudar(valor == null ? null : valor <= 1 ? null : valor - 1)}
          style={botao}
        >
          −
        </button>
        <span
          title={valor == null ? "sem limite" : undefined}
          style={{
            minWidth: 40,
            textAlign: "center",
            fontFamily: valor == null ? INTER : OSWALD,
            fontWeight: 600,
            fontSize: valor == null ? 11 : 20,
            lineHeight: "34px",
            color: valor == null ? "#737373" : "#262626",
          }}
        >
          {valor == null ? "sem limite" : valor}
        </span>
        <button type="button" aria-label="Aumentar" onClick={() => aoMudar(valor == null ? 1 : Math.min(99, valor + 1))} style={botao}>
          +
        </button>
      </div>
    </div>
  );
}

function Chip({ p }: { p: PeriodoSim }) {
  const manual = p.origem === "manual";
  return (
    <span
      title={manual ? "Definido manualmente" : "Gerado automaticamente"}
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        background: manual ? COR_MANUAL.fundo : COR_AUTO.fundo,
        color: manual ? COR_MANUAL.texto : COR_AUTO.texto,
        boxShadow: p.problema ? ANEL : undefined,
      }}
    >
      {fDM(p.ini)} a {fDM(p.fim)} · {p.dias}d
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */

const COLUNAS = "1.5fr .9fr 2fr 1fr 96px";

function ListaPessoas({
  pessoas,
  aprovado,
  ocupado,
  aoGerar,
  aoLimpar,
  aoDefinir,
}: {
  pessoas: PessoaSim[];
  aprovado: boolean;
  ocupado: boolean;
  aoGerar: (id: string) => void;
  aoLimpar: (id: string) => void;
  aoDefinir: (p: PessoaSim) => void;
}) {
  const miniBtn: CSSProperties = { ...BTN_SEC, fontSize: 12, padding: "6px 12px" };
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 760 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLUNAS,
            gap: 16,
            padding: "8px 0",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "#737373",
            borderBottom: "1px solid #e7ddd2",
          }}
        >
          <span>Colaborador</span>
          <span>Limite</span>
          <span>Períodos simulados</span>
          <span>Saldo</span>
          <span />
        </div>
        {pessoas.map((p) => {
          const sim = p.periodos.reduce((s, x) => s + x.dias, 0);
          const falta = Math.max(0, p.saldo - sim);
          const completo = p.saldo > 0 && falta === 0;
          const pct = p.saldo > 0 ? Math.min(100, (sim / p.saldo) * 100) : 0;
          const temPeriodos = p.periodos.length > 0;
          return (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: COLUNAS,
                gap: 16,
                alignItems: "center",
                padding: "11px 0",
                borderTop: "1px solid #f4ebe1",
                fontSize: 13,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div className="min-w-0">
                {aprovado ? (
                  <div style={{ fontWeight: 500 }} className="truncate" title={p.nome}>
                    {p.nome}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => aoDefinir(p)}
                    title={`Definir datas de ${p.nome}`}
                    style={{ ...linkBtn("#262626"), fontSize: 13, fontWeight: 500, textAlign: "left", maxWidth: "100%" }}
                    className="truncate block hover:underline"
                  >
                    {p.nome}
                  </button>
                )}
                <div style={{ fontSize: 12, color: "#737373" }} className="truncate">
                  {p.unidade}
                </div>
              </div>
              <span title={`Período aquisitivo: ${p.periodoLabel}`}>{fDMA(p.limite)}</span>
              <div className="flex flex-wrap gap-1.5">
                {temPeriodos ? (
                  p.periodos.map((x) => <Chip key={x.id} p={x} />)
                ) : (
                  <span style={{ color: "#737373" }}>sem definição</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div style={{ height: 6, borderRadius: 3, background: "#f4ebe1", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: completo ? "#262626" : "#fbb26e" }} />
                </div>
                {p.saldo <= 0 ? (
                  <span style={{ fontSize: 12, color: "#737373" }}>sem saldo</span>
                ) : completo ? (
                  <span style={{ fontSize: 12, color: "#1f7a52" }}>completo</span>
                ) : (
                  <span style={{ fontSize: 12, color: "#5c5c5c" }}>
                    {falta} de {p.saldo} dias sem data
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                {!aprovado &&
                  (temPeriodos ? (
                    <button type="button" disabled={ocupado} onClick={() => aoLimpar(p.id)} style={miniBtn}>
                      Limpar
                    </button>
                  ) : (
                    <button type="button" disabled={ocupado || p.saldo <= 0} onClick={() => aoGerar(p.id)} style={{ ...miniBtn, opacity: p.saldo <= 0 ? 0.5 : 1 }}>
                      Gerar
                    </button>
                  ))}
                {!aprovado && (
                  <button type="button" onClick={() => aoDefinir(p)} style={{ ...linkBtn("#b85c12"), fontWeight: 600 }} className="hover:underline">
                    {temPeriodos ? "Editar" : "Definir"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendário                                                          */
/* ------------------------------------------------------------------ */

function diaDoAno(iso: string, ano: number): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ano, 0, 1)) / 86400000);
}

function Calendario({
  pessoas,
  ano,
  aprovado,
  aoDefinir,
}: {
  pessoas: PessoaSim[];
  ano: number;
  aprovado: boolean;
  aoDefinir: (p: PessoaSim) => void;
}) {
  const diasNoAno = (Date.UTC(ano + 1, 0, 1) - Date.UTC(ano, 0, 1)) / 86400000;
  const diasDoMes = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(ano, m + 1, 0)).getUTCDate());

  function posicao(ini: string, fim: string): { left: number; width: number } | null {
    const a = diaDoAno(ini, ano);
    const b = diaDoAno(fim, ano);
    if (b < 0 || a > diasNoAno - 1) return null;
    const aa = Math.max(0, a);
    const bb = Math.min(diasNoAno - 1, b);
    return { left: (aa / diasNoAno) * 100, width: ((bb - aa + 1) / diasNoAno) * 100 };
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, PessoaSim[]>();
    for (const p of pessoas) {
      if (!mapa.has(p.unidade)) mapa.set(p.unidade, []);
      mapa.get(p.unidade)!.push(p);
    }
    return Array.from(mapa.entries());
  }, [pessoas]);

  const grade = (
    <div className="absolute inset-0 flex pointer-events-none">
      {diasDoMes.map((d, m) => (
        <div key={m} style={{ flex: d, borderLeft: "1px solid #f4ebe1" }} />
      ))}
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 760 }}>
        <div className="flex items-end" style={{ borderBottom: "1px solid #e7ddd2", padding: "8px 0" }}>
          <div style={{ width: 200, flexShrink: 0, ...ROTULO, letterSpacing: ".04em" }}>Colaborador</div>
          <div className="flex flex-1">
            {diasDoMes.map((d, m) => (
              <div
                key={m}
                style={{ flex: d, textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", color: "#737373" }}
              >
                {MESES[m]}
              </div>
            ))}
          </div>
        </div>

        {grupos.map(([unidade, lista]) => (
          <div key={unidade}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#93440c", padding: "14px 0 6px" }}>{unidade}</div>
            {lista.map((p) => {
              const marcaLimite = diaDoAno(p.limite, ano);
              const limiteNoAno = marcaLimite >= 0 && marcaLimite <= diasNoAno - 1;
              return (
                <div key={p.id} className="flex items-center" style={{ borderTop: "1px solid #f4ebe1", height: 34 }}>
                  <div style={{ width: 200, flexShrink: 0, paddingRight: 8 }} className="min-w-0">
                    {aprovado ? (
                      <span style={{ fontSize: 13 }} className="truncate block" title={p.nome}>
                        {p.nome}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => aoDefinir(p)}
                        title={`Definir datas de ${p.nome}`}
                        style={{ ...linkBtn("#262626"), fontSize: 13, textAlign: "left", maxWidth: "100%" }}
                        className="truncate block hover:underline"
                      >
                        {p.nome}
                      </button>
                    )}
                  </div>
                  <div className="relative flex-1" style={{ height: "100%" }}>
                    {grade}
                    {p.reais.map((r, i) => {
                      const pos = posicao(r.ini, r.fim);
                      if (!pos) return null;
                      return (
                        <div
                          key={`r${i}`}
                          title={`No mapa oficial: ${fDMA(r.ini)} a ${fDMA(r.fim)}`}
                          style={{
                            position: "absolute",
                            top: "50%",
                            transform: "translateY(-50%)",
                            height: 8,
                            borderRadius: 3,
                            background: "#d6cec5",
                            left: `${pos.left}%`,
                            width: `max(${pos.width}%, 5px)`,
                          }}
                        />
                      );
                    })}
                    {p.periodos.map((x) => {
                      const pos = posicao(x.ini, x.fim);
                      if (!pos) return null;
                      return (
                        <div
                          key={x.id}
                          title={`${x.origem === "manual" ? "Manual" : "Automática"} · ${fDMA(x.ini)} a ${fDMA(x.fim)} · ${x.dias} dias${x.problema ? " · conflito ou data inválida" : ""}`}
                          style={{
                            position: "absolute",
                            top: "50%",
                            transform: "translateY(-50%)",
                            height: 16,
                            borderRadius: 4,
                            background: x.origem === "manual" ? COR_MANUAL.fundo : COR_AUTO.barra,
                            boxShadow: x.problema ? ANEL : undefined,
                            left: `${pos.left}%`,
                            width: `max(${pos.width}%, 6px)`,
                          }}
                        />
                      );
                    })}
                    {limiteNoAno && (
                      <div
                        title={`Limite de concessão: ${fDMA(p.limite)}`}
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          width: 2,
                          background: "#d92d20",
                          left: `${(marcaLimite / diasNoAno) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ fontSize: 12, color: "#737373", marginTop: 14 }}>Traço vermelho: limite de concessão.</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel lateral: definir os períodos de uma pessoa                    */
/* ------------------------------------------------------------------ */

function PainelDefinir({
  pessoa,
  cenarioId,
  padrao,
  aoFechar,
  aoSalvar,
}: {
  pessoa: PessoaSim;
  cenarioId: string;
  padrao: number[];
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<{ ini: string; dias: number }[]>(() => {
    const base = pessoa.periodos.length
      ? pessoa.periodos.map((p) => ({ ini: p.ini, dias: p.dias }))
      : [0, 1, 2].map((i) => ({ ini: "", dias: padrao[i] ?? 0 }));
    while (base.length < 3) base.push({ ini: "", dias: 0 });
    return base.slice(0, 3);
  });

  function atualizar(i: number, campo: "ini" | "dias", valor: string) {
    setLinhas((atual) => atual.map((l, k) => (k === i ? { ...l, [campo]: campo === "dias" ? Number(valor) || 0 : valor } : l)));
    setErro(null);
  }

  function salvar() {
    setErro(null);
    const fd = new FormData();
    fd.set("cenario_id", cenarioId);
    fd.set("colaborador_id", pessoa.id);
    fd.set("periodo_aquisitivo_id", pessoa.periodoId);
    linhas.forEach((l, i) => {
      fd.set(`inicio${i + 1}`, l.ini);
      fd.set(`dias${i + 1}`, String(l.dias || 0));
    });
    startTransition(async () => {
      const r = await definirFeriasManualCenario(fd);
      if (r.ok) aoSalvar(`Férias de ${pessoa.nome} salvas`);
      else setErro((r.erro ?? "Não foi possível salvar.").replace(/⚠️\s*/g, ""));
    });
  }

  function remover() {
    startTransition(async () => {
      await removerDefinicaoColaborador(cenarioId, pessoa.id);
      aoSalvar(`Definição de ${pessoa.nome} removida`);
    });
  }

  const soma = linhas.reduce((s, l) => s + (l.ini ? l.dias : 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(38,38,38,.28)" }} onClick={aoFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "100%",
          background: "#fff",
          height: "100%",
          overflowY: "auto",
          padding: 24,
          fontFamily: INTER,
          color: "#262626",
          borderLeft: "1px solid #f1e4d6",
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{pessoa.nome}</div>
            <div style={{ fontSize: 12, color: "#737373", marginTop: 2 }}>{pessoa.unidade}</div>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" style={{ ...linkBtn("#737373"), fontSize: 20, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ background: "#faf7f3", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#3d3d3d" }} className="flex flex-col gap-1">
          <span>Período aquisitivo: {pessoa.periodoLabel}</span>
          <span>Limite para tirar: {fDMA(pessoa.limite)}</span>
          <span>Saldo: {pessoa.saldo} dias</span>
        </div>

        <div className="flex flex-col gap-3">
          <span style={ROTULO}>Períodos de férias</span>
          {linhas.map((l, i) => {
            const fim = l.ini && l.dias > 0 ? somarDias(l.ini, l.dias - 1) : null;
            return (
              <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: "52px 1fr 64px", fontSize: 13 }}>
                <span style={{ color: "#737373" }}>{i + 1}º</span>
                <DateInput
                  value={l.ini}
                  onChange={(v) => atualizar(i, "ini", v)}
                  style={{ fontFamily: INTER, fontSize: 13, padding: "8px 10px", border: "1px solid #e7ddd2", borderRadius: 8, background: "#fff" }}
                />
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={l.dias || ""}
                  placeholder="dias"
                  onChange={(e) => atualizar(i, "dias", e.target.value)}
                  style={{ ...campoNumero(64), padding: "8px 6px", fontSize: 13 }}
                />
                <span />
                <span style={{ gridColumn: "2 / span 2", fontSize: 12, color: "#737373" }}>
                  {fim ? `termina em ${fDMA(fim)}` : "deixe em branco se não usar"}
                </span>
              </div>
            );
          })}
          <span style={{ fontSize: 12, color: soma > pessoa.saldo ? "#b42318" : "#737373" }}>
            Total: {soma} de {pessoa.saldo} dias. Regra: até 3 períodos, um com 14 dias ou mais e os outros com 5 ou mais.
          </span>
          <span style={{ fontSize: 12, color: "#737373" }}>Ao salvar, todos os períodos desta pessoa passam a ser manuais.</span>
        </div>

        {erro && (
          <div style={{ background: "#fdecea", color: "#b42318", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>{erro}</div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={salvar}
            style={{
              fontFamily: INTER,
              fontSize: 13,
              fontWeight: 600,
              padding: 11,
              borderRadius: 8,
              border: 0,
              background: "#262626",
              color: "#fff",
              cursor: "pointer",
              opacity: pendente ? 0.6 : 1,
            }}
          >
            {pendente ? "Salvando…" : "Salvar períodos"}
          </button>
          {pessoa.periodos.length > 0 && (
            <button type="button" disabled={pendente} onClick={remover} style={{ ...linkBtn("#b42318"), padding: 6 }}>
              Remover a definição desta pessoa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
