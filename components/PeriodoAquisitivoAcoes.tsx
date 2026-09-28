"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { addDays, format } from "date-fns";
import {
  editarPeriodoAquisitivoManual,
  excluirPeriodoAquisitivo,
  gerarProximoPeriodoAquisitivoComDatas,
  darBaixaPeriodoAquisitivo,
} from "@/lib/actions";
import { calcularPeriodoAquisitivo } from "@/lib/calculos";
import DateInput from "@/components/DateInput";
import type { PeriodoAquisitivo } from "@/types/db";

/** Ações "editar"/"dar baixa"/"excluir"/"gerar" de uma linha da tabela de períodos aquisitivos. */
export default function PeriodoAquisitivoAcoes({
  periodo,
  colaboradorId,
  saldo,
}: {
  periodo: PeriodoAquisitivo;
  colaboradorId: string;
  /** Dias de férias que ainda faltam ser usados nesse período (0 = completo, 30 dias já batidos). */
  saldo: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);
  const [limite, setLimite] = useState(periodo.limite_concessao);

  const [baixaAberta, setBaixaAberta] = useState(false);
  const [baixaInicio, setBaixaInicio] = useState("");
  const [baixaDias, setBaixaDias] = useState("");
  const [baixaVendeuAbono, setBaixaVendeuAbono] = useState(false);
  const [resultadoBaixa, setResultadoBaixa] = useState<{ ok: boolean; mensagem: string } | null>(null);

  // "Gerar próximo" — janela central. Se ainda sobra saldo nesse período,
  // deixa completar os dias que faltam (mesma lógica da "dar baixa"). Se o
  // período já está com os 30 dias batidos, deixa criar o próximo período
  // aquisitivo, com as datas sugeridas mas editáveis.
  const [gerarAberta, setGerarAberta] = useState(false);
  const [gerarInicio, setGerarInicio] = useState("");
  const [gerarDias, setGerarDias] = useState("");
  const [gerarVendeuAbono, setGerarVendeuAbono] = useState(false);
  const [novoInicio, setNovoInicio] = useState("");
  const [novoFim, setNovoFim] = useState("");
  const [novoLimite, setNovoLimite] = useState("");
  const [resultadoGerar, setResultadoGerar] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const completo = saldo <= 0;

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

  function abrirBaixa() {
    setAberto(false);
    setResultadoBaixa(null);
    setBaixaInicio("");
    setBaixaDias("");
    setBaixaVendeuAbono(false);
    setBaixaAberta(true);
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
    if (Number(baixaDias) > saldo) {
      setResultadoBaixa({
        ok: false,
        mensagem: `Esse período só tem ${saldo} dia${saldo !== 1 ? "s" : ""} de saldo disponível.`,
      });
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

  function abrirGerar() {
    setAberto(false);
    setResultadoGerar(null);
    if (completo) {
      // período já batido: sugere o próximo, com datas editáveis
      const baseData = format(addDays(new Date(periodo.fim), 1), "yyyy-MM-dd");
      const { inicio: novoIni, fim: novoF, limite_concessao: novoLim } = calcularPeriodoAquisitivo(baseData);
      setNovoInicio(format(novoIni, "yyyy-MM-dd"));
      setNovoFim(format(novoF, "yyyy-MM-dd"));
      setNovoLimite(format(novoLim, "yyyy-MM-dd"));
    } else {
      // ainda falta usar esse período: deixa completar os dias que restam
      setGerarInicio("");
      setGerarDias(String(saldo));
      setGerarVendeuAbono(false);
    }
    setGerarAberta(true);
  }

  function completarPeriodo() {
    setResultadoGerar(null);
    if (!gerarInicio) {
      setResultadoGerar({ ok: false, mensagem: "Preencha a data de início." });
      return;
    }
    if (!gerarDias || Number(gerarDias) <= 0) {
      setResultadoGerar({ ok: false, mensagem: "Informe a quantidade de dias." });
      return;
    }
    if (Number(gerarDias) > saldo) {
      setResultadoGerar({
        ok: false,
        mensagem: `Esse período só tem ${saldo} dia${saldo !== 1 ? "s" : ""} de saldo disponível.`,
      });
      return;
    }
    const formData = new FormData();
    formData.set("periodo_aquisitivo_id", periodo.id);
    formData.set("colaborador_id", colaboradorId);
    formData.set("data_inicio", gerarInicio);
    formData.set("dias", gerarDias);
    if (gerarVendeuAbono) formData.set("vendeu_abono", "on");
    startTransition(async () => {
      const r = await darBaixaPeriodoAquisitivo(formData);
      setResultadoGerar(r);
      if (r.ok) setGerarAberta(false);
    });
  }

  function criarProximoPeriodo() {
    setResultadoGerar(null);
    if (!novoInicio || !novoFim || !novoLimite) {
      setResultadoGerar({ ok: false, mensagem: "Preencha as 3 datas do novo período." });
      return;
    }
    const formData = new FormData();
    formData.set("periodo_anterior_id", periodo.id);
    formData.set("colaborador_id", colaboradorId);
    formData.set("inicio", novoInicio);
    formData.set("fim", novoFim);
    formData.set("limite_concessao", novoLimite);
    startTransition(async () => {
      const r = await gerarProximoPeriodoAquisitivoComDatas(formData);
      setResultadoGerar(r);
      if (r.ok) setGerarAberta(false);
    });
  }

  return (
    <div className="text-left">
      <span className="relative inline-flex items-center gap-2 text-xs whitespace-nowrap">
        <button
          type="button"
          onClick={() => {
            setBaixaAberta(false);
            setAberto((v) => !v);
          }}
          className="text-slate-500 hover:text-brand-600 transition-colors"
        >
          editar
        </button>
        {!completo && (
          <>
            <span className="text-slate-200">·</span>
            <button type="button" onClick={abrirBaixa} className="text-amber-600 hover:text-amber-700 font-medium transition-colors">
              dar baixa
            </button>
          </>
        )}
        <span className="text-slate-200">·</span>
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="text-slate-500 hover:text-red-600 transition-colors disabled:opacity-40"
        >
          excluir
        </button>
        <span className="text-slate-200">·</span>
        <button
          type="button"
          onClick={abrirGerar}
          disabled={isPending}
          className="text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-40"
        >
          gerar próximo
        </button>
      </span>

      {resultadoGerar?.ok && (
        <p className="text-[11px] mt-1 max-w-[260px] leading-snug text-emerald-600">{resultadoGerar.mensagem}</p>
      )}
      {resultadoBaixa?.ok && (
        <p className="text-[11px] mt-1 max-w-[260px] leading-snug text-emerald-600">{resultadoBaixa.mensagem}</p>
      )}

      {aberto &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setAberto(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-base font-semibold text-slate-800">Editar período</p>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label">Início</label>
                  <DateInput
                    value={inicio}
                    onChange={setInicio}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Fim</label>
                  <DateInput
                    value={fim}
                    onChange={setFim}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Limite de concessão</label>
                  <DateInput
                    value={limite}
                    onChange={setLimite}
                    className="input"
                  />
                </div>
              </div>

              {erro && <p className="text-xs text-red-600 mt-3 leading-snug">{erro}</p>}

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={salvar}
                  className="btn-primary flex-1 text-sm disabled:opacity-50"
                >
                  {isPending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {baixaAberta &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setBaixaAberta(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-base font-semibold text-slate-800">Dar baixa em férias</p>
                <button
                  type="button"
                  onClick={() => setBaixaAberta(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4 leading-snug">
                Registra que o colaborador já tirou essas férias — pode repetir se ele tirou em
                mais de uma vez dentro desse período (ex.: 15 + 15 dias). Saldo disponível nesse
                período: <span className="font-semibold">{saldo} dia{saldo !== 1 ? "s" : ""}</span>.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="label">Data de início</label>
                  <DateInput
                    className="input"
                    value={baixaInicio}
                    onChange={setBaixaInicio}
                  />
                </div>
                <div>
                  <label className="label">Quantos dias</label>
                  <input
                    type="number"
                    min={1}
                    max={saldo}
                    placeholder={`Ex.: ${Math.min(15, saldo)}`}
                    className="input"
                    value={baixaDias}
                    onChange={(e) => setBaixaDias(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={baixaVendeuAbono}
                    onChange={(e) => setBaixaVendeuAbono(e.target.checked)}
                  />
                  Vendeu 1/3 (abono)
                </label>
              </div>

              {resultadoBaixa && !resultadoBaixa.ok && (
                <p className="text-xs text-red-600 mt-3 leading-snug">{resultadoBaixa.mensagem}</p>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setBaixaAberta(false)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={darBaixa}
                  className="btn-primary flex-1 text-sm disabled:opacity-50"
                >
                  {isPending ? "Salvando…" : "Dar baixa"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {gerarAberta &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setGerarAberta(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-base font-semibold text-slate-800">
                  {completo ? "Gerar próximo período aquisitivo" : "Completar período aquisitivo"}
                </p>
                <button
                  type="button"
                  onClick={() => setGerarAberta(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              {completo ? (
                <>
                  <p className="text-xs text-slate-500 mb-4 leading-snug">
                    Esse período já tem os 30 dias batidos. Confira as datas do próximo período
                    aquisitivo (sugeridas automaticamente, mas você pode ajustar) e confirme.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Início do período</label>
                      <DateInput
                        className="input"
                        value={novoInicio}
                        onChange={setNovoInicio}
                      />
                    </div>
                    <div>
                      <label className="label">Fim do período</label>
                      <DateInput
                        className="input"
                        value={novoFim}
                        onChange={setNovoFim}
                      />
                    </div>
                    <div>
                      <label className="label">Limite de concessão</label>
                      <DateInput
                        className="input"
                        value={novoLimite}
                        onChange={setNovoLimite}
                      />
                    </div>
                  </div>
                  {resultadoGerar && !resultadoGerar.ok && (
                    <p className="text-xs text-red-600 mt-3 leading-snug">{resultadoGerar.mensagem}</p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => setGerarAberta(false)}
                      className="btn-secondary flex-1 text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={criarProximoPeriodo}
                      className="btn-primary flex-1 text-sm disabled:opacity-50"
                    >
                      {isPending ? "Gerando…" : "Gerar período"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-4 leading-snug">
                    Esse período ainda tem <span className="font-semibold">{saldo} dia{saldo !== 1 ? "s" : ""}</span> de
                    saldo. Só é possível gerar o próximo período aquisitivo depois de completar os 30
                    dias — lance aqui o restante.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Data de início</label>
                      <DateInput
                        className="input"
                        value={gerarInicio}
                        onChange={setGerarInicio}
                      />
                    </div>
                    <div>
                      <label className="label">Quantos dias</label>
                      <input
                        type="number"
                        min={1}
                        max={saldo}
                        placeholder={`Ex.: ${saldo}`}
                        className="input"
                        value={gerarDias}
                        onChange={(e) => setGerarDias(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={gerarVendeuAbono}
                        onChange={(e) => setGerarVendeuAbono(e.target.checked)}
                      />
                      Vendeu 1/3 (abono)
                    </label>
                  </div>
                  {resultadoGerar && !resultadoGerar.ok && (
                    <p className="text-xs text-red-600 mt-3 leading-snug">{resultadoGerar.mensagem}</p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => setGerarAberta(false)}
                      className="btn-secondary flex-1 text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={completarPeriodo}
                      className="btn-primary flex-1 text-sm disabled:opacity-50"
                    >
                      {isPending ? "Salvando…" : "Completar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
