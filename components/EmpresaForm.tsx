"use client";

import { useTransition } from "react";
import type { Empresa } from "@/types/db";
import { salvarEmpresa, excluirEmpresa } from "@/lib/actions";
import CampoMoeda from "@/components/campos/CampoMoeda";
import CampoDocumento from "@/components/campos/CampoDocumento";

export default function EmpresaForm({
  empresa,
  unidadesCount = 0,
}: {
  empresa?: Empresa;
  unidadesCount?: number;
}) {
  const [isPending, startTransition] = useTransition();

  function excluir() {
    if (!empresa) return;
    const avisoUnidades =
      unidadesCount > 0
        ? ` Isso também vai excluir ${unidadesCount} filial${unidadesCount !== 1 ? "is" : ""}/unidade${
            unidadesCount !== 1 ? "s" : ""
          } cadastrada${unidadesCount !== 1 ? "s" : ""} dessa empresa.`
        : "";
    if (
      !confirm(
        `Excluir a empresa "${empresa.nome}"?${avisoUnidades} Colaboradores vinculados a ela não são excluídos, só ficam sem empresa. Essa ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    startTransition(() => {
      excluirEmpresa(empresa.id);
    });
  }

  return (
    <form action={salvarEmpresa} className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {empresa && <input type="hidden" name="id" value={empresa.id} />}
      <div>
        <label className="label">Nome</label>
        <input name="nome" required className="input" defaultValue={empresa?.nome} />
      </div>
      <CampoDocumento label="CNPJ" name="cnpj" tipo="cnpj" defaultValue={empresa?.cnpj ?? ""} />
      <CampoMoeda
        label="Faturamento mensal"
        name="faturamento_mensal"
        defaultValue={empresa?.faturamento_mensal ?? 0}
      />
      <div>
        <label className="label">Absenteísmo (%)</label>
        <input
          type="number"
          step="0.1"
          name="absenteismo_pct"
          className="input"
          defaultValue={empresa?.absenteismo_pct ?? ""}
        />
      </div>
      <div>
        <label className="label">Performance (%)</label>
        <input
          type="number"
          step="0.1"
          name="performance_pct"
          className="input"
          defaultValue={empresa?.performance_pct ?? ""}
        />
      </div>
      <div>
        <label className="label">Treinamento (%)</label>
        <input
          type="number"
          step="0.1"
          name="treinamento_pct"
          className="input"
          defaultValue={empresa?.treinamento_pct ?? ""}
        />
      </div>
      <div>
        <label className="label">Clima organizacional (%)</label>
        <input
          type="number"
          step="0.1"
          name="clima_pct"
          className="input"
          defaultValue={empresa?.clima_pct ?? ""}
        />
      </div>
      <div className="md:col-span-3 flex items-center gap-3">
        <button type="submit" className="btn-primary">
          Salvar
        </button>
        {empresa && (
          <button
            type="button"
            onClick={excluir}
            disabled={isPending}
            className="text-sm text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            excluir empresa
          </button>
        )}
      </div>
    </form>
  );
}
