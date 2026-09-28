"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";

// Paleta categórica fixa do app (mesmas cores já usadas nas categorias do
// Calendário Geral — lib/calculos.ts, PALETA_CORES_EVENTO) — mantém a
// identidade visual consistente em vez de inventar uma paleta nova.
const CORES_CATEGORICAS = [
  "#4f46e5", // índigo
  "#0891b2", // ciano
  "#059669", // esmeralda
  "#d97706", // âmbar
  "#7c3aed", // roxo
  "#db2777", // rosa
  "#ea580c", // laranja
];
const COR_OUTROS = "#94a3b8"; // slate-400 — sempre a cor da fatia "Outros"

// Paleta categórica pro tema escuro (visual "Dark Analytics") — tons mais
// claros/vibrantes pra manter contraste sobre o fundo navy (ink-900/ink-800).
const CORES_CATEGORICAS_ESCURO = [
  "#6fe0cf", // teal (brand-300)
  "#7c9aff", // azul
  "#f3c34c", // dourado (gold-400)
  "#c084fc", // roxo
  "#f472b6", // rosa
  "#fb923c", // laranja
  "#22d3ee", // ciano
];
const COR_OUTROS_ESCURO = "#4b5578";

const ESTILO_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 4px 10px rgba(15,23,42,0.08)",
    fontSize: 12,
    fontFamily: "Inter, sans-serif",
    padding: "8px 12px",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 2 },
};

const ESTILO_TOOLTIP_ESCURO = {
  contentStyle: {
    backgroundColor: "#161c44",
    border: "1px solid #2c3568",
    borderRadius: 12,
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    padding: "8px 12px",
    color: "#e2e8f0",
  },
  labelStyle: { color: "#f8fafc", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "#cbd5e1" },
};

const ESTILO_EIXO = { fontSize: 11, fill: "#64748b", fontFamily: "Inter, sans-serif" };
const ESTILO_EIXO_ESCURO = { fontSize: 11, fill: "#8891ab", fontFamily: "'JetBrains Mono', monospace" };

/** Donut de distribuição de colaboradores por cargo (top 6 + "Outros"). */
export function DonutCargo({ dados, escuro }: { dados: { nome: string; total: number }[]; escuro?: boolean }) {
  if (dados.length === 0) {
    return <p className={`text-sm ${escuro ? "text-slate-400" : "text-slate-400"}`}>Sem colaboradores ativos pra mostrar.</p>;
  }
  const paleta = escuro ? CORES_CATEGORICAS_ESCURO : CORES_CATEGORICAS;
  const corOutros = escuro ? COR_OUTROS_ESCURO : COR_OUTROS;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={dados}
          dataKey="total"
          nameKey="nome"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={2}
          stroke={escuro ? "#161c44" : "#ffffff"}
          strokeWidth={2}
        >
          {dados.map((d, i) => (
            <Cell
              key={d.nome}
              fill={d.nome === "Outros" ? corOutros : paleta[i % paleta.length]}
            />
          ))}
        </Pie>
        <Tooltip {...(escuro ? ESTILO_TOOLTIP_ESCURO : ESTILO_TOOLTIP)} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, ""]} />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{
            fontSize: 11,
            fontFamily: escuro ? "'JetBrains Mono', monospace" : "Inter, sans-serif",
            color: escuro ? "#8b94ac" : "#475569",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Donut simples de 2 fatias — usado pra CLT × PJ. */
export function DonutDuas({
  labelA,
  valorA,
  labelB,
  valorB,
  labelC,
  valorC,
  escuro,
}: {
  labelA: string;
  valorA: number;
  labelB: string;
  valorB: number;
  labelC?: string;
  valorC?: number;
  escuro?: boolean;
}) {
  const dados = [
    { nome: labelA, total: valorA },
    { nome: labelB, total: valorB },
    ...(labelC && valorC !== undefined ? [{ nome: labelC, total: valorC }] : []),
  ];
  const somaTotal = dados.reduce((soma, d) => soma + d.total, 0);
  const CORES = escuro ? ["#6fe0cf", "#7c9aff", "#f4c672"] : ["#20ab98", "#3c4680", "#d97706"];
  if (somaTotal === 0) {
    return <p className="text-sm text-slate-400">Sem colaboradores ativos pra mostrar.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={dados} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={46} outerRadius={70} paddingAngle={2} stroke={escuro ? "#161c44" : "#ffffff"} strokeWidth={2}>
          {dados.map((d, i) => (
            <Cell key={d.nome} fill={CORES[i % CORES.length]} />
          ))}
        </Pie>
        <Tooltip {...(escuro ? ESTILO_TOOLTIP_ESCURO : ESTILO_TOOLTIP)} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, ""]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: escuro ? "'JetBrains Mono', monospace" : "Inter, sans-serif", color: escuro ? "#8b94ac" : "#475569" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Barras agrupadas — indicadores (performance/absenteísmo/treinamento/clima) por empresa. */
export function BarrasIndicadoresEmpresa({
  dados,
}: {
  dados: { empresa: string; performance: number | null; absenteismo: number | null; treinamento: number | null; clima: number | null }[];
}) {
  if (dados.length === 0) {
    return <p className="text-sm text-slate-400">Cadastre empresas pra ver esse gráfico.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dados} margin={{ top: 4, right: 8, left: -16, bottom: 4 }} barGap={3}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="empresa" tick={ESTILO_EIXO} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis tick={ESTILO_EIXO} axisLine={false} tickLine={false} unit="%" width={40} />
        <Tooltip {...ESTILO_TOOLTIP} formatter={(v: number) => `${v}%`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: "Inter, sans-serif", color: "#475569" }} />
        <Bar dataKey="performance" name="Performance" fill="#20ab98" radius={[4, 4, 0, 0]} />
        <Bar dataKey="absenteismo" name="Absenteísmo" fill="#dc2626" radius={[4, 4, 0, 0]} />
        <Bar dataKey="treinamento" name="Treinamento" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        <Bar dataKey="clima" name="Clima" fill="#d97706" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras (1 série) com o valor escrito em cima de cada barra — performance por empresa. */
export function BarrasPerformanceEmpresa({ dados }: { dados: { empresa: string; performance: number }[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-slate-400">Cadastre empresas pra ver esse gráfico.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 20, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="empresa" tick={ESTILO_EIXO} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis tick={ESTILO_EIXO} axisLine={false} tickLine={false} unit="%" width={40} domain={[0, 100]} />
        <Tooltip {...ESTILO_TOOLTIP} formatter={(v: number) => [`${v}%`, "Performance"]} />
        <Bar dataKey="performance" fill="#20ab98" radius={[6, 6, 0, 0]} maxBarSize={48}>
          <LabelList dataKey="performance" position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: 12, fontWeight: 700, fill: "#0f172a", fontFamily: "Inter, sans-serif" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Linha(s) ao longo de meses — usado na "Evolução dos indicadores". Marcado
 * como dado de exemplo em quem usa esse componente: o sistema ainda não
 * guarda um histórico mensal de headcount/turnover/absenteísmo, então esses
 * pontos são gerados (mantendo o mês atual = valor real) só pra ilustrar
 * como o gráfico vai ficar quando o histórico existir de verdade.
 */
export function EvolucaoIndicadores({
  serieHeadcount,
  serieTurnover,
  serieAbsenteismo,
  escuro,
}: {
  serieHeadcount: { mes: string; valor: number }[];
  serieTurnover: { mes: string; valor: number }[];
  serieAbsenteismo: { mes: string; valor: number }[];
  escuro?: boolean;
}) {
  const [meses, setMeses] = useState<3 | 6 | 12>(6);

  const fatiar = <T,>(arr: T[]) => arr.slice(arr.length - meses);
  const dadosHeadcount = fatiar(serieHeadcount);
  const dadosPercentuais = fatiar(serieTurnover).map((t, i) => ({
    mes: t.mes,
    turnover: t.valor,
    absenteismo: fatiar(serieAbsenteismo)[i]?.valor ?? 0,
  }));

  const eixo = escuro ? ESTILO_EIXO_ESCURO : ESTILO_EIXO;
  const tooltip = escuro ? ESTILO_TOOLTIP_ESCURO : ESTILO_TOOLTIP;
  const corGrade = escuro ? "#232c48" : "#f1f5f9";

  return (
    <div>
      <div className="flex justify-end gap-1 mb-2">
        {([3, 6, 12] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => setMeses(opcao)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              meses === opcao
                ? escuro
                  ? "bg-brand-400 text-ink-900"
                  : "bg-brand-600 text-white"
                : escuro
                  ? "bg-white/5 text-slate-400 hover:bg-white/10"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {opcao} meses
          </button>
        ))}
      </div>

      <p className={`text-[11px] mb-1 ${escuro ? "text-slate-400" : "text-slate-400"}`}>Headcount</p>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={dadosHeadcount} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={corGrade} />
          <XAxis dataKey="mes" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
          <Tooltip {...tooltip} formatter={(v: number) => [`${v} pessoas`, "Headcount"]} />
          <Line type="monotone" dataKey="valor" name="Headcount" stroke={escuro ? "#6fe0cf" : "#3c4680"} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-400 mb-1 mt-2">Turnover × Absenteísmo</p>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={dadosPercentuais} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={corGrade} />
          <XAxis dataKey="mes" tick={eixo} axisLine={false} tickLine={false} />
          <YAxis tick={eixo} axisLine={false} tickLine={false} width={30} unit="%" />
          <Tooltip {...tooltip} formatter={(v: number) => `${v}%`} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: escuro ? "'JetBrains Mono', monospace" : "Inter, sans-serif", color: escuro ? "#8b94ac" : "#475569" }} />
          <Line type="monotone" dataKey="turnover" name="Turnover" stroke={escuro ? "#f472b6" : "#db2777"} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="absenteismo" name="Absenteísmo" stroke={escuro ? "#f3c34c" : "#d97706"} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras simples (1 série) — tempo de empresa dos colaboradores ativos, por faixa. */
export function BarrasTempoEmpresa({ dados, escuro }: { dados: { faixa: string; total: number }[]; escuro?: boolean }) {
  if (dados.every((d) => d.total === 0)) {
    return <p className="text-sm text-slate-400">Sem colaboradores ativos pra mostrar.</p>;
  }
  const eixo = escuro ? ESTILO_EIXO_ESCURO : ESTILO_EIXO;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dados} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={escuro ? "#232c48" : "#f1f5f9"} />
        <XAxis dataKey="faixa" tick={eixo} axisLine={{ stroke: escuro ? "#2c3568" : "#e2e8f0" }} tickLine={false} />
        <YAxis tick={eixo} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip {...(escuro ? ESTILO_TOOLTIP_ESCURO : ESTILO_TOOLTIP)} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, "Tempo de empresa"]} />
        <Bar dataKey="total" fill={escuro ? "#6fe0cf" : "#20ab98"} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
