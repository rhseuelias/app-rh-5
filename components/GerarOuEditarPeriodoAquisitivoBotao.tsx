"use client";

import { useState, useTransition } from "react";
import { editarPeriodoAquisitivoManual, gerarPeriodoAquisitivoManual } from "@/lib/actions";
import type { PeriodoAquisitivo } from "@/types/db";

export default function GerarOuEditarPeriodoAquisitivoBotao({
  colaboradorId,
  periodoAberto,
}: {
  colaboradorId: string;
  periodoAberto: PeriodoAquisitivo | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [inicio, setInicio] = useState(periodoAberto?.inicio ?? "");
  const [fim, setFim] = useState(periodoAberto?.fim ?? "");
  const [limite, setLimite] = useState(periodoAberto?.limite_concessao ?? "");

  function gerar() {
    setResultado(null);
    startTransition(async () => {
      const r = await gerarPeriodoAquisitivoManual(colaboradorId);
      setResultado(r);
    });
  }

  function salvarEdicao() {
    if (!periodoAberto) return;
    setResultado(null);
    const formData = new FormData();
    formData.set("id", periodoAberto.id);
    formData.set("colaborador_id", colaboradorId);
    formData.set("inicio", inicio);
    formData.set("fim", fim);
    formData.set("limite_concessao", limite);
    startTransition(async () => {
      const r = await editarPeriodoAquisitivoManual(formData);
      setResultado(r);
    });
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="btn-secondary text-xs whitespace-nowrap"
      >
        🔄 Gerar/editar período aquisitivo
      </button>

      {aberto && (
        <div className="absolute z-30 right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Período aquisitivo</p>
            <button type="button" onClick={() => setAberto(false)} className="text-slate-400 text-xs">
              ✕
            </button>
          </div>

          {periodoAberto ? (
            <>
              <p className="text-[10px] text-slate-400 mb-2">Editar as datas do período aberto atual:</p>
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
              <button
                type="button"
                disabled={isPending}
                onClick={salvarEdicao}
                className="mt-3 w-full text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1.5 disabled:opacity-50"
              >
                {isPending ? "Salvando…" : "Salvar alteração"}
              </button>
              <div className="my-3 border-t border-slate-100" />
              <p className="text-[10px] text-slate-400 mb-2">Ou, se precisar, gere um período novo do zero:</p>
            </>
          ) : (
            <p className="text-[10px] text-slate-400 mb-2">
              Esse colaborador não tem período aquisitivo aberto no momento.
            </p>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={gerar}
            className="w-full text-xs font-semibold text-brand-600 border border-brand-200 hover:bg-brand-50 rounded-full px-2.5 py-1.5 disabled:opacity-50"
          >
            {isPending ? "Gerando…" : "🔄 Gerar novo período aquisitivo"}
          </button>

          {resultado && (
            <p className={`text-[10px] mt-2 leading-snug ${resultado.ok ? "text-emerald-600" : "text-amber-600"}`}>
              {resultado.mensagem}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
