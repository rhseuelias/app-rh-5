"use client";

import { useState, useTransition } from "react";
import { editarPeriodoAquisitivoManual, excluirPeriodoAquisitivo, gerarProximoPeriodoAquisitivo } from "@/lib/actions";
import type { PeriodoAquisitivo } from "@/types/db";

/** Ações "editar"/"excluir"/"gerar" de uma linha da tabela de períodos aquisitivos. */
export default function PeriodoAquisitivoAcoes({
  periodo,
  colaboradorId,
}: {
  periodo: PeriodoAquisitivo;
  colaboradorId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);
  const [limite, setLimite] = useState(periodo.limite_concessao);
  const [resultadoGerar, setResultadoGerar] = useState<{ ok: boolean; mensagem: string } | null>(null);

  function salvar() {
    setErro(null);
    const formData = new FormData();
    formData.set("id", periodo.id);
    formData.set("colaborador_id", colaboradorId);
    formData.set("inicio", inicio);
    formData.set("fim", fim);
    formData.set("limite_concessao", limite);
    startTransition(async () => {
      const r = await editarPeriodoAquisitivoManual(formData);
      if (r.ok) setAberto(false);
      else setErro(r.mensagem);
    });
  }

  function excluir() {
    if (
      !confirm(
        "Excluir esse período aquisitivo? Férias já lançadas nele continuam no histórico, só deixam de referenciá-lo. Essa ação não pode ser desfeita."
      )
    ) {
      return;
    }
    startTransition(() => {
      excluirPeriodoAquisitivo(periodo.id, colaboradorId);
    });
  }

  function gerar() {
    setResultadoGerar(null);
    startTransition(async () => {
      const r = await gerarProximoPeriodoAquisitivo(periodo.id, colaboradorId);
      setResultadoGerar(r);
    });
  }

  return (
    <div className="text-left">
      <span className="relative inline-flex items-center gap-3 whitespace-nowrap">
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs text-brand-600 hover:underline">
          editar
        </button>
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          excluir
        </button>
        <button
          type="button"
          onClick={gerar}
          disabled={isPending}
          className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline disabled:opacity-50"
        >
          gerar próximo
        </button>

        {aberto && (
          <div className="absolute z-30 right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-700">Editar período</p>
              <button type="button" onClick={() => setAberto(false)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-500">
                Início
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                />
              </label>
              <label className="block text-[10px] text-slate-500">
                Fim
                <input
                  type="date"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                />
              </label>
              <label className="block text-[10px] text-slate-500">
                Limite de concessão
                <input
                  type="date"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                />
              </label>
            </div>
            {erro && <p className="text-[10px] text-red-600 mt-2 leading-snug">{erro}</p>}
            <button
              type="button"
              disabled={isPending}
              onClick={salvar}
              className="mt-2 w-full text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1.5 disabled:opacity-50"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        )}
      </span>

      {resultadoGerar && (
        <p className={`text-[11px] mt-1 max-w-[260px] leading-snug ${resultadoGerar.ok ? "text-emerald-600" : "text-amber-600"}`}>
          {resultadoGerar.mensagem}
        </p>
      )}
    </div>
  );
}
