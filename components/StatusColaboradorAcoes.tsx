"use client";

import { useState, useTransition } from "react";
import { atualizarStatusColaborador, desligarColaborador, excluirColaborador } from "@/lib/actions";
import { TIPO_RESCISAO_OPCOES } from "@/lib/calculos";

export default function StatusColaboradorAcoes({
  id,
  statusAtual,
}: {
  id: string;
  statusAtual: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [mostrarDesligamento, setMostrarDesligamento] = useState(false);

  function mudar(status: string) {
    startTransition(() => atualizarStatusColaborador(id, status));
  }

  function confirmarExclusao() {
    if (!confirm("Você está Excluindo todo registro do colaborador, todos os dados serão perdidos.")) {
      return;
    }
    if (!confirm("Tem certeza? Quer EXCLUIR o colaborador?")) {
      return;
    }
    startTransition(() => excluirColaborador(id));
  }

  function enviarDesligamento(formData: FormData) {
    startTransition(() => desligarColaborador(formData));
    setMostrarDesligamento(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {statusAtual === "experiencia" && (
          <button
            disabled={isPending}
            onClick={() => mudar("ativo")}
            className="btn-secondary text-sm"
          >
            Efetivar
          </button>
        )}
        {statusAtual !== "desligado" && (
          <button
            disabled={isPending}
            onClick={() => setMostrarDesligamento((v) => !v)}
            className="btn-secondary text-sm text-red-600"
          >
            Desligar
          </button>
        )}
        <button disabled={isPending} onClick={confirmarExclusao} className="btn-secondary text-sm text-red-700">
          Excluir
        </button>
      </div>

      {mostrarDesligamento && (
        <form action={enviarDesligamento} className="card space-y-3 max-w-md">
          <input type="hidden" name="colaborador_id" value={id} />
          <h3 className="font-medium text-slate-900 text-sm">Confirmar desligamento</h3>
          <div>
            <label className="label">Data do último dia</label>
            <input type="date" name="data_ultimo_dia" required className="input" />
          </div>
          <div>
            <label className="label">Tipo de rescisão</label>
            <select name="tipo_rescisao" required className="input">
              <option value="">—</option>
              {TIPO_RESCISAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo do desligamento</label>
            <textarea name="motivo_desligamento" rows={2} className="input" />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMostrarDesligamento(false)}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="btn-primary text-sm">
              Confirmar desligamento
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
