"use client";

import { useState, useTransition } from "react";
import { renovarContratoPJ } from "@/lib/actions";
import DateInput from "@/components/DateInput";
import CampoMoeda from "@/components/campos/CampoMoeda";

/** Botão + formulário pra renovar o contrato de um colaborador PJ — guarda o
 * período atual no histórico automaticamente e substitui pelo novo período. */
export default function RenovarContratoPJBotao({
  colaboradorId,
  contratoFimAtual,
  valorAtual,
  restrito = false,
}: {
  colaboradorId: string;
  contratoFimAtual: string | null;
  valorAtual: number | null;
  restrito?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [isPending, startTransition] = useTransition();

  function enviar(formData: FormData) {
    startTransition(() => renovarContratoPJ(formData));
    setAberto(false);
  }

  return (
    <div>
      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className="btn-secondary text-sm">
          🔄 Renovar contrato
        </button>
      ) : (
        <form action={enviar} className="card space-y-3 max-w-md !p-4">
          <input type="hidden" name="colaborador_id" value={colaboradorId} />
          <h3 className="font-medium text-slate-900 text-sm">Renovar contrato PJ</h3>
          <p className="text-xs text-slate-400">
            O período atual{contratoFimAtual ? ` (até ${formatarDataBR(contratoFimAtual)})` : ""} vai ficar
            guardado no histórico, e os campos abaixo passam a ser o contrato vigente.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Novo início</label>
              <DateInput name="novo_contrato_inicio" required className="input" />
            </div>
            <div>
              <label className="label">Novo fim</label>
              <DateInput name="novo_contrato_fim" required className="input" />
            </div>
            {!restrito && (
              <div className="sm:col-span-2">
                <CampoMoeda
                  label="Novo valor da nota fiscal mensal"
                  name="novo_valor_nota_fiscal"
                  defaultValue={valorAtual ?? undefined}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAberto(false)} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="btn-primary text-sm">
              {isPending ? "Salvando..." : "Confirmar renovação"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function formatarDataBR(v: string): string {
  const [ano, mes, dia] = v.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return v;
  return `${dia}/${mes}/${ano}`;
}
