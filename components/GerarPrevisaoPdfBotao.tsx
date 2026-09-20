"use client";

import { useState } from "react";
import type { PeriodoAquisitivo } from "@/types/db";

/**
 * Antes de baixar o PDF de previsão de férias, mostra qual período
 * aquisitivo (sempre o aberto) será usado como referência e deixa o RH
 * escolher quantos dias vão no 1º período — o resto do saldo vira o 2º.
 */
export default function GerarPrevisaoPdfBotao({
  colaboradorId,
  periodoAberto,
  saldo,
  jaTemFeriasSalvas,
}: {
  colaboradorId: string;
  periodoAberto: PeriodoAquisitivo | null;
  saldo: number;
  jaTemFeriasSalvas: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [dias1, setDias1] = useState(Math.min(15, Math.max(saldo, 0)));

  const dias2 = Math.max(0, saldo - dias1);
  const fracionamentoValido = dias2 === 0 || dias2 >= 5;
  const podeEscolherDias = !!periodoAberto && !jaTemFeriasSalvas && saldo >= 5;
  const podeGerar = !!periodoAberto && (jaTemFeriasSalvas || (saldo >= 5 && dias1 >= 5 && dias1 <= saldo && fracionamentoValido));

  const href = podeGerar
    ? `/api/ferias/${colaboradorId}/pdf${jaTemFeriasSalvas ? "" : `?dias=${dias1}`}`
    : undefined;

  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setAberto((v) => !v)} className="btn-secondary text-sm whitespace-nowrap">
        ⬇️ Gerar previsão de férias
      </button>

      {aberto && (
        <div className="absolute z-30 right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Previsão de férias</p>
            <button type="button" onClick={() => setAberto(false)} className="text-slate-400 text-xs">
              ✕
            </button>
          </div>

          {!periodoAberto ? (
            <p className="text-xs text-amber-600 leading-snug">
              Esse colaborador não tem período aquisitivo aberto no momento.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-slate-400 leading-snug mb-2">
                Referência: período aberto{" "}
                {new Date(periodoAberto.inicio).toLocaleDateString("pt-BR")}–
                {new Date(periodoAberto.fim).toLocaleDateString("pt-BR")}
                <br />
                Saldo disponível: {saldo} dia{saldo !== 1 ? "s" : ""}
              </p>

              {jaTemFeriasSalvas ? (
                <p className="text-[11px] text-slate-500 leading-snug mb-2">
                  Esse período já tem férias lançadas — o relatório mostra as datas já salvas.
                </p>
              ) : saldo < 5 ? (
                <p className="text-[11px] text-amber-600 leading-snug mb-2">
                  Saldo insuficiente pra gerar uma previsão (mínimo 5 dias).
                </p>
              ) : (
                <>
                  <label className="block text-[10px] text-slate-500 mb-2">
                    Dias do 1º período
                    <input
                      type="number"
                      min={5}
                      max={saldo}
                      value={dias1}
                      onChange={(e) => setDias1(Number(e.target.value))}
                      className="input !text-[10px] !py-1 !px-1.5 w-full mt-0.5"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mb-2">
                    {dias2 > 0 ? `2º período: ${dias2} dia${dias2 !== 1 ? "s" : ""}` : "Período único (sem 2º período)"}
                  </p>
                  {!fracionamentoValido && (
                    <p className="text-[10px] text-red-600 mb-2 leading-snug">
                      Cada período do fracionamento precisa ter no mínimo 5 dias — ajuste o valor.
                    </p>
                  )}
                </>
              )}

              {podeEscolherDias || jaTemFeriasSalvas ? (
                <a
                  href={href}
                  className={`mt-1 block text-center w-full text-xs font-semibold rounded-full px-2.5 py-1.5 ${
                    podeGerar
                      ? "text-white bg-brand-600 hover:bg-brand-700"
                      : "text-slate-400 bg-slate-100 cursor-not-allowed pointer-events-none"
                  }`}
                >
                  ⬇️ Baixar PDF
                </a>
              ) : null}
            </>
          )}
        </div>
      )}
    </span>
  );
}
