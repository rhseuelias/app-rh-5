"use client";

import { useState, useTransition } from "react";
import {
  editarPeriodoAquisitivoManual,
  excluirPeriodoAquisitivo,
  gerarProximoPeriodoAquisitivo,
  darBaixaPeriodoAquisitivo,
} from "@/lib/actions";
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

  const [baixaAberta, setBaixaAberta] = useState(false);
  const [baixaInicio, setBaixaInicio] = useState("");
  const [baixaDias, setBaixaDias] = useState("");
  const [baixaVendeuAbono, setBaixaVendeuAbono] = useState(false);
  const [resultadoBaixa, setResultadoBaixa] = useState<{ ok: boolean; mensagem: string } | null>(null);

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

  function darBaixa() {
    setResultadoBaixa(null);
    if (!baixaInicio) {
      setResultadoBaixa({ ok: false, mensagem: "Preencha a data de início." });
      return;
    }
    if (!baixaDias || Number(baixaDias) <= 0) {
      setResultadoBaixa({ ok: false, mensagem: "Informe a quantidade de dias." });
      return;
    }
    const formData = new FormData();
    formData.set("periodo_aquisitivo_id", periodo.id);
    formData.set("colaborador_id", colaboradorId);
    formData.set("data_inicio", baixaInicio);
    formData.set("dias", baixaDias);
    if (baixaVendeuAbono) formData.set("vendeu_abono", "on");
    startTransition(async () => {
      const r = await darBaixaPeriodoAquisitivo(formData);
      setResultadoBaixa(r);
      if (r.ok) {
        setBaixaInicio("");
        setBaixaDias("");
        setBaixaVendeuAbono(false);
        setBaixaAberta(false);
      }
    });
  }

  return (
    <div className="text-left">
      <span className="relative inline-flex items-center gap-3 whitespace-nowrap">
        <button
          type="button"
          onClick={() => {
            setBaixaAberta(false);
            setAberto((v) => !v);
          }}
          className="text-xs text-brand-600 hover:underline"
        >
          editar
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setBaixaAberta((v) => !v);
          }}
          className="text-xs text-amber-600 hover:text-amber-700 hover:underline font-medium"
        >
          dar baixa
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

        {baixaAberta && (
          <div className="absolute z-30 right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-700">Dar baixa em férias</p>
              <button type="button" onClick={() => setBaixaAberta(false)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mb-2 leading-snug">
              Registra que o colaborador já tirou essas férias — pode repetir se ele tirou em mais
              de uma vez dentro desse período (ex.: 15 + 15 dias).
            </p>
            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-500">
                Data de início
                <input
                  type="date"
                  value={baixaInicio}
                  onChange={(e) => setBaixaInicio(e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                />
              </label>
              <label className="block text-[10px] text-slate-500">
                Quantos dias
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={baixaDias}
                  onChange={(e) => setBaixaDias(e.target.value)}
                  className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-slate-600 pt-1">
                <input
                  type="checkbox"
                  checked={baixaVendeuAbono}
                  onChange={(e) => setBaixaVendeuAbono(e.target.checked)}
                />
                Vendeu 1/3 (abono)
              </label>
            </div>
            {resultadoBaixa && !resultadoBaixa.ok && (
              <p className="text-[10px] text-red-600 mt-2 leading-snug">{resultadoBaixa.mensagem}</p>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={darBaixa}
              className="mt-2 w-full text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-full px-2.5 py-1.5 disabled:opacity-50"
            >
              {isPending ? "Salvando…" : "Dar baixa"}
            </button>
          </div>
        )}

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
      {resultadoBaixa?.ok && (
        <p className="text-[11px] mt-1 max-w-[260px] leading-snug text-emerald-600">{resultadoBaixa.mensagem}</p>
      )}
    </div>
  );
}
