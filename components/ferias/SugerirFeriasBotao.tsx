"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { sugerirOpcoesFerias, criarFeriasDeSugestao } from "@/lib/actions";
import { formatarDataBR } from "@/lib/calculos";

interface Opcao {
  inicio: string;
  fim: string;
  dias: number;
  semConflito: boolean;
  dentroDoPrazo: boolean;
  regrasAtendidas: boolean;
}

function formatarData(iso: string): string {
  return formatarDataBR(iso);
}

export default function SugerirFeriasBotao({
  colaboradorId,
  periodoAquisitivoId,
}: {
  colaboradorId: string;
  periodoAquisitivoId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
  const [criado, setCriado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!periodoAquisitivoId) return null;

  function buscar() {
    setAberto(true);
    setCriado(false);
    setErro(null);
    startTransition(async () => {
      const r = await sugerirOpcoesFerias(colaboradorId, periodoAquisitivoId!);
      setOpcoes(r);
    });
  }

  function escolher(opcao: Opcao) {
    setErro(null);
    const formData = new FormData();
    formData.set("colaborador_id", colaboradorId);
    formData.set("periodo_aquisitivo_id", periodoAquisitivoId!);
    formData.set("data_inicio", opcao.inicio);
    formData.set("data_fim", opcao.fim);
    formData.set("dias", String(opcao.dias));
    startTransition(async () => {
      const r = await criarFeriasDeSugestao(formData);
      if (r.ok) {
        setCriado(true);
      } else {
        setErro(r.mensagem);
      }
    });
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : buscar())}
        className="text-[10px] text-brand-600 hover:underline whitespace-nowrap"
      >
        ✨ Sugerir férias
      </button>

      {aberto &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setAberto(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-semibold text-slate-800">Opções sugeridas</p>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              {criado ? (
                <p className="text-sm text-emerald-600 py-2">Período planejado criado ✓</p>
              ) : erro ? (
                <p className="text-sm text-amber-600 py-2 leading-snug">{erro}</p>
              ) : isPending && !opcoes ? (
                <p className="text-sm text-slate-400 py-2">Calculando…</p>
              ) : opcoes && opcoes.length === 0 ? (
                <p className="text-sm text-amber-600 py-2">
                  Não achei data livre dentro do prazo legal — programe manualmente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {opcoes?.map((o, i) => (
                    <li key={i} className="border border-slate-100 rounded-lg p-3">
                      <p className="text-sm font-medium text-slate-800">
                        {formatarData(o.inicio)} — {formatarData(o.fim)}
                      </p>
                      <p className="text-xs text-emerald-600 mt-1 leading-snug">
                        ✓ {o.dias} dias · ✓ Sem conflito · ✓ Dentro do prazo · ✓ Regras da CLT atendidas
                      </p>
                      <button
                        disabled={isPending}
                        onClick={() => escolher(o)}
                        className="mt-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-3 py-1.5"
                      >
                        Usar esta opção
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
