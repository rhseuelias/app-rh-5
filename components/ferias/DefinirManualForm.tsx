"use client";

import { useState, useTransition } from "react";
import { addDays } from "date-fns";
import { definirFeriasManualCenario } from "@/lib/actions";

function fimCalculado(inicio: string, dias: number): string {
  if (!inicio || !dias) return "—";
  return addDays(new Date(inicio + "T00:00:00"), Math.max(1, dias) - 1).toLocaleDateString("pt-BR");
}

export default function DefinirManualForm({
  cenarioId,
  colaboradorId,
  colaboradorNome,
  periodoAquisitivoId,
  periodoAquisitivoLabel,
  saldoDisponivel,
  periodosPadrao,
}: {
  cenarioId: string;
  colaboradorId: string;
  colaboradorNome: string;
  periodoAquisitivoId: string;
  periodoAquisitivoLabel: string;
  saldoDisponivel: number;
  periodosPadrao: number[]; // ex.: [15, 15] ou [15, 15, 0]
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const padrao = [0, 1, 2].map((i) => periodosPadrao[i] ?? 0);
  const [linhas, setLinhas] = useState(padrao.map((d) => ({ inicio: "", dias: d })));

  function atualizar(i: number, campo: "inicio" | "dias", valor: string) {
    setLinhas((atual) => {
      const copia = [...atual];
      copia[i] = { ...copia[i], [campo]: campo === "dias" ? Number(valor) : valor };
      return copia;
    });
    setOk(false);
  }

  function salvar() {
    setErro(null);
    setOk(false);
    const formData = new FormData();
    formData.set("cenario_id", cenarioId);
    formData.set("colaborador_id", colaboradorId);
    formData.set("periodo_aquisitivo_id", periodoAquisitivoId);
    linhas.forEach((l, i) => {
      formData.set(`inicio${i + 1}`, l.inicio);
      formData.set(`dias${i + 1}`, String(l.dias || 0));
    });
    startTransition(async () => {
      const r = await definirFeriasManualCenario(formData);
      if (r.ok) {
        setOk(true);
        setAberto(false);
      } else {
        setErro(r.erro ?? "Não foi possível salvar.");
      }
    });
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-xs font-semibold text-brand-600 hover:underline whitespace-nowrap"
      >
        ✍️ Definir manualmente
      </button>
      {ok && <span className="ml-2 text-[10px] text-emerald-600">salvo ✓</span>}

      {aberto && (
        <div className="absolute z-30 right-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-700">{colaboradorNome}</p>
            <button onClick={() => setAberto(false)} className="text-slate-400 text-xs">✕</button>
          </div>
          <p className="text-[10px] text-slate-400 mb-2">
            Período aquisitivo: {periodoAquisitivoLabel} · Saldo disponível: {saldoDisponivel} dias
          </p>

          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 w-14">Período {i + 1}</span>
                <input
                  type="date"
                  value={l.inicio}
                  onChange={(e) => atualizar(i, "inicio", e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 !w-auto"
                />
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={l.dias || ""}
                  placeholder="dias"
                  onChange={(e) => atualizar(i, "dias", e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 !w-14"
                />
                <span className="text-[10px] text-slate-400 whitespace-nowrap">→ {fimCalculado(l.inicio, l.dias)}</span>
              </div>
            ))}
          </div>

          {erro && <p className="text-[10px] text-red-600 mt-2 leading-snug">{erro}</p>}

          <button
            disabled={isPending}
            onClick={salvar}
            className="mt-3 w-full text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1.5 disabled:opacity-50"
          >
            {isPending ? "Salvando…" : "SALVAR FÉRIAS MANUAIS"}
          </button>
        </div>
      )}
    </span>
  );
}
