"use client";

import { useState, useTransition } from "react";
import { addDays } from "date-fns";
import { editarPeriodoSimulado, removerPeriodoSimulado, removerDefinicaoColaborador } from "@/lib/actions";

export interface PeriodoEditavel {
  id: string;
  dataInicio: string;
  dataFim: string;
  dias: number;
  origemSimulacao: "manual" | "automatica" | null;
}

function formatarData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Edição direta no mapa/lista: ajustar datas, remover 1 período ou limpar toda a definição de 1 colaborador — sem sair da tela. */
export default function EditarPeriodosSimulados({
  cenarioId,
  colaboradorId,
  periodos,
}: {
  cenarioId: string;
  colaboradorId: string;
  periodos: PeriodoEditavel[];
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, { inicio: string; dias: number }>>({});

  if (periodos.length === 0) return null;

  function valor(p: PeriodoEditavel, campo: "inicio" | "dias") {
    const r = rascunho[p.id];
    if (campo === "inicio") return r?.inicio ?? p.dataInicio;
    return r?.dias ?? p.dias;
  }

  function atualizarRascunho(p: PeriodoEditavel, campo: "inicio" | "dias", novoValor: string) {
    setRascunho((atual) => ({
      ...atual,
      [p.id]: {
        inicio: campo === "inicio" ? novoValor : valor(p, "inicio") as string,
        dias: campo === "dias" ? Number(novoValor) : (valor(p, "dias") as number),
      },
    }));
  }

  function salvar(p: PeriodoEditavel) {
    const inicio = valor(p, "inicio") as string;
    const dias = valor(p, "dias") as number;
    const formData = new FormData();
    formData.set("id", p.id);
    formData.set("data_inicio", inicio);
    formData.set("dias", String(dias));
    startTransition(async () => {
      await editarPeriodoSimulado(formData);
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      await removerPeriodoSimulado(id);
    });
  }

  function removerTudo() {
    startTransition(async () => {
      await removerDefinicaoColaborador(cenarioId, colaboradorId);
      setAberto(false);
    });
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-[10px] text-brand-600 hover:underline whitespace-nowrap"
      >
        ✏️ editar
      </button>

      {aberto && (
        <div className="absolute z-20 left-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Períodos simulados</p>
            <button onClick={() => setAberto(false)} className="text-slate-400 text-xs">✕</button>
          </div>
          <ul className="space-y-2">
            {periodos.map((p) => {
              const inicio = valor(p, "inicio") as string;
              const dias = valor(p, "dias") as number;
              const fimCalculado = inicio ? addDays(new Date(inicio + "T00:00:00"), Math.max(1, dias) - 1) : null;
              return (
                <li key={p.id} className="border border-slate-100 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`badge text-white !text-[9px] ${p.origemSimulacao === "manual" ? "bg-emerald-500" : "bg-amber-400"}`}
                    >
                      {p.origemSimulacao === "manual" ? "Manual" : "Automática"}
                    </span>
                    <span className="text-[10px] text-slate-400">era {formatarData(p.dataInicio)} — {formatarData(p.dataFim)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={inicio}
                      onChange={(e) => atualizarRascunho(p, "inicio", e.target.value)}
                      className="input !text-[10px] !py-1 !px-1.5 !w-auto"
                    />
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={dias}
                      onChange={(e) => atualizarRascunho(p, "dias", e.target.value)}
                      className="input !text-[10px] !py-1 !px-1.5 !w-14"
                    />
                    <span className="text-[10px] text-slate-400">
                      → {fimCalculado ? formatarData(fimCalculado.toISOString().slice(0, 10)) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={isPending}
                      onClick={() => salvar(p)}
                      className="text-[10px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1"
                    >
                      Salvar alteração
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => remover(p.id)}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      remover este período
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            disabled={isPending}
            onClick={removerTudo}
            className="mt-2 text-[10px] text-slate-400 hover:text-red-500 hover:underline"
          >
            Limpar toda a definição deste colaborador
          </button>
        </div>
      )}
    </span>
  );
}
