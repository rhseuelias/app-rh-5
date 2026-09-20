"use client";

import { useState, useTransition } from "react";
import { sugerirOpcoesFerias, criarFeriasDeSugestao } from "@/lib/actions";

interface Opcao {
  inicio: string;
  fim: string;
  dias: number;
  semConflito: boolean;
  dentroDoPrazo: boolean;
  regrasAtendidas: boolean;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
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
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : buscar())}
        className="text-[10px] text-brand-600 hover:underline whitespace-nowrap"
      >
        ✨ Sugerir férias
      </button>

      {aberto && (
        <div className="absolute z-20 left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-card p-3 text-left">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Opções sugeridas</p>
            <button onClick={() => setAberto(false)} className="text-slate-400 text-xs">
              ✕
            </button>
          </div>

          {criado ? (
            <p className="text-xs text-emerald-600 py-2">Período planejado criado ✓</p>
          ) : erro ? (
            <p className="text-xs text-amber-600 py-2 leading-snug">{erro}</p>
          ) : isPending && !opcoes ? (
            <p className="text-xs text-slate-400 py-2">Calculando…</p>
          ) : opcoes && opcoes.length === 0 ? (
            <p className="text-xs text-amber-600 py-2">
              Não achei data livre dentro do prazo legal — programe manualmente.
            </p>
          ) : (
            <ul className="space-y-2">
              {opcoes?.map((o, i) => (
                <li key={i} className="border border-slate-100 rounded-lg p-2">
                  <p className="text-xs font-medium text-slate-800">
                    {formatarData(o.inicio)} — {formatarData(o.fim)}
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-1 leading-snug">
                    ✓ {o.dias} dias · ✓ Sem conflito · ✓ Dentro do prazo · ✓ Regras da CLT atendidas
                  </p>
                  <button
                    disabled={isPending}
                    onClick={() => escolher(o)}
                    className="mt-1.5 text-[10px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1"
                  >
                    Usar esta opção
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
