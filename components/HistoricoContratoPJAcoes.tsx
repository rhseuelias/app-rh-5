"use client";

import { useState, useTransition } from "react";
import { editarHistoricoContratoPJ, excluirHistoricoContratoPJ } from "@/lib/actions";
import DateInput from "@/components/DateInput";
import CampoMoeda from "@/components/campos/CampoMoeda";
import type { HistoricoContratoPJ } from "@/types/db";

/** Editar + excluir uma linha do histórico de renovações de contrato PJ. */
export default function HistoricoContratoPJAcoes({
  item,
  colaboradorId,
  restrito,
}: {
  item: HistoricoContratoPJ;
  colaboradorId: string;
  restrito: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [isPending, startTransition] = useTransition();

  function salvar(formData: FormData) {
    startTransition(() => editarHistoricoContratoPJ(formData));
    setEditando(false);
  }

  function excluir() {
    if (!confirm("Excluir esse período do histórico de renovações? Essa ação não pode ser desfeita.")) return;
    startTransition(() => excluirHistoricoContratoPJ(item.id, colaboradorId));
  }

  if (editando) {
    return (
      <form action={salvar} className="card !p-3 space-y-3 max-w-md">
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="colaborador_id" value={colaboradorId} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Início</label>
            <DateInput name="contrato_inicio" defaultValue={item.contrato_inicio ?? ""} required className="input" />
          </div>
          <div>
            <label className="label">Fim</label>
            <DateInput name="contrato_fim" defaultValue={item.contrato_fim ?? ""} required className="input" />
          </div>
          {!restrito && (
            <div className="sm:col-span-2">
              <CampoMoeda
                label="Valor da nota fiscal mensal"
                name="valor_nota_fiscal"
                defaultValue={item.valor_nota_fiscal ?? undefined}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setEditando(false)} className="btn-secondary text-xs">
            Cancelar
          </button>
          <button type="submit" disabled={isPending} className="btn-primary text-xs">
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <span className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="text-xs text-brand-600 hover:underline"
      >
        editar
      </button>
      <button
        type="button"
        onClick={excluir}
        disabled={isPending}
        title="Excluir do histórico"
        aria-label="Excluir do histórico"
        className="shrink-0 grid place-items-center w-6 h-6 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </span>
  );
}
