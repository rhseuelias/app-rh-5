"use client";

import { useState, useTransition } from "react";
import type { BeneficioTipoTransporte } from "@/types/db";
import { cadastrarTipoTransporte, atualizarTaxaTipoTransporte, removerTipoTransporte } from "@/lib/actions-beneficios";
import { centavosParaReais, formatarReais, reaisParaDigitos } from "@/lib/formatadores";
import InputMoeda from "./InputMoeda";

function TipoItem({ tipo }: { tipo: BeneficioTipoTransporte }) {
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [digitos, setDigitos] = useState(reaisParaDigitos(tipo.taxa_adm));

  function salvarTaxa() {
    const formData = new FormData();
    formData.set("id", tipo.id);
    formData.set("taxa_adm", String(centavosParaReais(digitos)));
    startTransition(async () => {
      await atualizarTaxaTipoTransporte(formData);
      setEditando(false);
    });
  }

  function remover() {
    if (!confirm(`Remover "${tipo.nome}" da lista de tipos cadastrados? Lançamentos já feitos com esse tipo continuam no histórico, só some da lista pra novos lançamentos.`)) {
      return;
    }
    startTransition(() => {
      removerTipoTransporte(tipo.id);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3.5 pr-2 py-1.5 text-sm">
      <span className="font-semibold text-slate-700">{tipo.nome}</span>
      {!editando && (
        <>
          <span className="text-xs text-slate-400">Taxa adm: {formatarReais(tipo.taxa_adm)}</span>
          <button type="button" onClick={() => setEditando(true)} className="text-xs text-brand-600 hover:underline">
            editar taxa
          </button>
        </>
      )}
      {editando && (
        <>
          <InputMoeda digitos={digitos} onChange={setDigitos} />
          <button
            type="button"
            disabled={isPending}
            onClick={salvarTaxa}
            className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1 disabled:opacity-50"
          >
            salvar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-xs text-slate-400 hover:underline">
            cancelar
          </button>
        </>
      )}
      <button
        type="button"
        onClick={remover}
        disabled={isPending}
        className="text-slate-400 hover:text-red-500 text-xs px-1 disabled:opacity-50"
        title="Remover tipo"
      >
        ✕
      </button>
    </li>
  );
}

export default function TiposTransporteCadastro({
  empresaId,
  tipos,
}: {
  empresaId: string;
  tipos: BeneficioTipoTransporte[];
}) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">⚙️ Tipos de transporte cadastrados nesta empresa</h3>

      {tipos.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-3">
          {tipos.map((t) => (
            <TipoItem key={t.id} tipo={t} />
          ))}
        </ul>
      )}
      {tipos.length === 0 && (
        <p className="text-sm text-slate-400 mb-3">Nenhum tipo cadastrado ainda. Cadastre um abaixo (ex.: CAJU, SEMPARAR, BHBUS, OTIMO).</p>
      )}

      <form action={cadastrarTipoTransporte} className="flex flex-wrap gap-2">
        <input type="hidden" name="empresa_id" value={empresaId} />
        <input name="nome" required className="input !w-auto !py-1.5 !text-sm" placeholder="Nome do novo tipo (ex.: 99POP)" />
        <button type="submit" className="btn-secondary !text-sm !py-1.5">＋ Cadastrar tipo</button>
      </form>
    </div>
  );
}
