"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
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

const ESTILO_EIXO = { fontSize: 11, fill: "#64748b", fontFamily: "Inter, sans-serif" };

/** Donut de distribuição de colaboradores por cargo (top 6 + "Outros"). */
export function DonutCargo({ dados }: { dados: { nome: string; total: number }[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-slate-400">Sem colaboradores ativos pra mostrar.</p>;
  }
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
          stroke="#ffffff"
          strokeWidth={2}
        >
          {dados.map((d, i) => (
            <Cell
              key={d.nome}
              fill={d.nome === "Outros" ? COR_OUTROS : CORES_CATEGORICAS[i % CORES_CATEGORICAS.length]}
            />
          ))}
        </Pie>
        <Tooltip {...ESTILO_TOOLTIP} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, ""]} />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, fontFamily: "Inter, sans-serif", color: "#475569" }}
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
}: {
  labelA: string;
  valorA: number;
  labelB: string;
  valorB: number;
}) {
  const dados = [
    { nome: labelA, total: valorA },
    { nome: labelB, total: valorB },
  ];
  if (valorA + valorB === 0) {
    return <p className="text-sm text-slate-400">Sem colaboradores ativos pra mostrar.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={dados} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={46} outerRadius={70} paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
          <Cell fill="#20ab98" />
          <Cell fill="#3c4680" />
        </Pie>
        <Tooltip {...ESTILO_TOOLTIP} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, ""]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: "Inter, sans-serif", color: "#475569" }} />
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

/** Barras simples (1 série) — tempo de empresa dos colaboradores ativos, por faixa. */
export function BarrasTempoEmpresa({ dados }: { dados: { faixa: string; total: number }[] }) {
  if (dados.every((d) => d.total === 0)) {
    return <p className="text-sm text-slate-400">Sem colaboradores ativos pra mostrar.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dados} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="faixa" tick={ESTILO_EIXO} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
        <YAxis tick={ESTILO_EIXO} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip {...ESTILO_TOOLTIP} formatter={(v: number) => [`${v} colaborador${v !== 1 ? "es" : ""}`, "Tempo de empresa"]} />
        <Bar dataKey="total" fill="#20ab98" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
