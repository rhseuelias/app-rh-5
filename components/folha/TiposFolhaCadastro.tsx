"use client";

import { useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { cadastrarTipoFolha, removerTipoFolha } from "@/lib/actions-folha";

const ROTULO_CATEGORIA: Record<string, string> = {
  provento: "🔵 Provento",
  desconto: "🟢 Desconto",
  espelhamento: "🟡 Espelhamento",
};

const ROTULO_FORMATO: Record<string, string> = {
  moeda: "R$",
  texto: "texto",
  sim_nao: "Sim/Não",
};

function TipoItem({ tipo }: { tipo: FolhaTipo }) {
  const [isPending, startTransition] = useTransition();

  function remover() {
    if (
      !confirm(
        `Remover a coluna "${tipo.nome}" da grade? Lançamentos já feitos com essa coluna continuam no histórico, só some da grade pra novos lançamentos.`
      )
    ) {
      return;
    }
    startTransition(() => {
      removerTipoFolha(tipo.id);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3.5 pr-2 py-1.5 text-sm">
      <span className="font-semibold text-slate-700">{tipo.nome}</span>
      <span className="text-xs text-slate-400">{ROTULO_CATEGORIA[tipo.categoria] ?? tipo.categoria}</span>
      <span className="text-xs text-slate-300">{ROTULO_FORMATO[tipo.formato] ?? tipo.formato}</span>
      {tipo.calculo_automatico && (
        <span className="text-xs text-brand-600" title="Calculado automaticamente pelo sistema">🧮 auto</span>
      )}
      <button
        type="button"
        onClick={remover}
        disabled={isPending}
        className="text-slate-400 hover:text-red-500 text-xs px-1 disabled:opacity-50"
        title="Remover coluna"
      >
        ✕
      </button>
    </li>
  );
}

export default function TiposFolhaCadastro({ tipos }: { tipos: FolhaTipo[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">⚙️ Colunas cadastradas na grade da Folha</h3>

      {tipos.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-3">
          {tipos.map((t) => (
            <TipoItem key={t.id} tipo={t} />
          ))}
        </ul>
      )}
      {tipos.length === 0 && (
        <p className="text-sm text-slate-400 mb-3">Nenhuma coluna cadastrada ainda. Cadastre uma abaixo.</p>
      )}

      <form action={cadastrarTipoFolha} className="flex flex-wrap gap-2">
        <input name="nome" required className="input !w-auto !py-1.5 !text-sm" placeholder="Nome da nova coluna (ex.: Auxílio Creche)" />
        <select name="categoria" required defaultValue="provento" className="input !w-auto !py-1.5 !text-sm">
          <option value="provento">Provento</option>
          <option value="desconto">Desconto</option>
        </select>
        <select name="formato" defaultValue="moeda" className="input !w-auto !py-1.5 !text-sm">
          <option value="moeda">Valor em R$</option>
          <option value="texto">Texto livre</option>
          <option value="sim_nao">Sim/Não</option>
        </select>
        <input name="codigo" className="input !w-20 !py-1.5 !text-sm" placeholder="Código" />
        <button type="submit" className="btn-secondary !text-sm !py-1.5">＋ Cadastrar coluna</button>
      </form>
    </div>
  );
}
