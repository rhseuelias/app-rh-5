"use client";

import { useTransition } from "react";
import type { Unidade } from "@/types/db";
import { salvarUnidade, excluirUnidade } from "@/lib/actions";
import CampoDocumento from "@/components/campos/CampoDocumento";
import { ADIANTAMENTO_OPCOES } from "@/lib/calculos";

function UnidadeItem({ unidade, empresaId }: { unidade: Unidade; empresaId: string }) {
  const [isPending, startTransition] = useTransition();

  function excluir() {
    if (
      !confirm(
        `Excluir a filial/unidade "${unidade.nome}"? Colaboradores vinculados a ela não são excluídos, só ficam sem unidade. Essa ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    startTransition(() => {
      excluirUnidade(unidade.id, empresaId);
    });
  }

  return (
    <li className="flex justify-between items-center gap-2">
      <span>
        {unidade.nome} {unidade.cnpj && <span className="text-slate-400">— {unidade.cnpj}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {unidade.adiantamento_pct && (
          <span className="badge bg-slate-100 text-slate-600">
            Adiantamento {unidade.adiantamento_pct}%
          </span>
        )}
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          excluir
        </button>
      </span>
    </li>
  );
}

export default function UnidadesForm({
  empresaId,
  unidades,
}: {
  empresaId: string;
  unidades: Unidade[];
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-slate-100 mt-2">
      <h3 className="text-sm font-medium text-slate-700">Filiais / Unidades</h3>

      {unidades.length > 0 && (
        <ul className="text-sm text-slate-600 space-y-1">
          {unidades.map((u) => (
            <UnidadeItem key={u.id} unidade={u} empresaId={empresaId} />
          ))}
        </ul>
      )}
      {unidades.length === 0 && (
        <p className="text-sm text-slate-400">Nenhuma filial cadastrada ainda.</p>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-brand-600">+ Cadastrar filial/unidade</summary>
        <form action={salvarUnidade} className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <input type="hidden" name="empresa_id" value={empresaId} />
          <div>
            <label className="label">Nome da filial</label>
            <input name="nome" required className="input" placeholder="Ex.: Unidade Savassi" />
          </div>
          <CampoDocumento label="CNPJ da filial" name="cnpj" tipo="cnpj" />
          <div>
            <label className="label">Adiantamento salarial</label>
            <select name="adiantamento_pct" className="input" defaultValue="">
              <option value="">Sem adiantamento</option>
              {ADIANTAMENTO_OPCOES.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn-secondary text-sm">
              Salvar filial
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
