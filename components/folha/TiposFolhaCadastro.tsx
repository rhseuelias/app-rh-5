"use client";

import { useState, useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { cadastrarTipoFolha, removerTipoFolha, salvarGruposTipo } from "@/lib/actions-folha";

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

/** Mostra (e deixa editar) pra quais unidades/empresas uma coluna vale.
 * Sem restrição = vale pra todo mundo, que é o padrão de toda coluna. */
function AbrangenciaTipo({
  tipoId,
  todosGrupos,
  gruposAtuais,
}: {
  tipoId: string;
  todosGrupos: string[];
  gruposAtuais: string[];
}) {
  const valeParaTodos = gruposAtuais.length === 0;
  const [editando, setEditando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>(gruposAtuais);
  const [isPending, startTransition] = useTransition();

  function alternar(grupo: string) {
    setSelecionados((prev) => (prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo]));
  }

  function salvar() {
    startTransition(async () => {
      await salvarGruposTipo(tipoId, selecionados);
      setEditando(false);
    });
  }

  function voltarParaTodos() {
    startTransition(async () => {
      await salvarGruposTipo(tipoId, []);
      setSelecionados([]);
      setEditando(false);
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setSelecionados(gruposAtuais);
          setEditando(true);
        }}
        className="text-xs text-slate-400 hover:text-brand-600 underline decoration-dotted"
        title="Escolher quais unidades/empresas usam essa coluna"
      >
        {valeParaTodos ? "vale pra todas as unidades" : `vale só pra: ${gruposAtuais.join(", ")}`}
      </button>
    );
  }

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-3 mt-1 space-y-2 basis-full">
      <p className="text-xs text-slate-500">Marque quais unidades/empresas usam essa coluna:</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {todosGrupos.map((g) => (
          <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={selecionados.includes(g)} onChange={() => alternar(g)} disabled={isPending} />
            {g}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={salvar}
          disabled={isPending || selecionados.length === 0}
          className="btn-secondary !text-xs !py-1 !px-2.5"
          title={selecionados.length === 0 ? "Marque pelo menos 1 unidade, ou use \"voltar a valer pra todas\"" : undefined}
        >
          {isPending ? "Salvando..." : "Salvar seleção"}
        </button>
        <button type="button" onClick={voltarParaTodos} disabled={isPending} className="text-xs text-slate-400 hover:text-slate-600">
          voltar a valer pra todas
        </button>
        <button type="button" onClick={() => setEditando(false)} disabled={isPending} className="text-xs text-slate-400 hover:text-slate-600">
          cancelar
        </button>
      </div>
    </div>
  );
}

function TipoItem({
  tipo,
  todosGrupos,
  gruposAtuais,
}: {
  tipo: FolhaTipo;
  todosGrupos: string[];
  gruposAtuais: string[];
}) {
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
    <li className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl pl-3.5 pr-2 py-1.5 text-sm">
      <span className="font-semibold text-slate-700">{tipo.nome}</span>
      <span className="text-xs text-slate-400">{ROTULO_CATEGORIA[tipo.categoria] ?? tipo.categoria}</span>
      <span className="text-xs text-slate-300">{ROTULO_FORMATO[tipo.formato] ?? tipo.formato}</span>
      {tipo.calculo_automatico && (
        <span className="text-xs text-brand-600" title="Calculado automaticamente pelo sistema">🧮 auto</span>
      )}
      {todosGrupos.length > 1 && (
        <AbrangenciaTipo tipoId={tipo.id} todosGrupos={todosGrupos} gruposAtuais={gruposAtuais} />
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

export default function TiposFolhaCadastro({
  tipos,
  todosGrupos,
  gruposPorTipo,
}: {
  tipos: FolhaTipo[];
  todosGrupos: string[];
  gruposPorTipo: Record<string, string[]>;
}) {
  const [restringirNova, setRestringirNova] = useState(false);

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">⚙️ Colunas cadastradas na grade da Folha</h3>

      {tipos.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-3">
          {tipos.map((t) => (
            <TipoItem key={t.id} tipo={t} todosGrupos={todosGrupos} gruposAtuais={gruposPorTipo[t.id] ?? []} />
          ))}
        </ul>
      )}
      {tipos.length === 0 && (
        <p className="text-sm text-slate-400 mb-3">Nenhuma coluna cadastrada ainda. Cadastre uma abaixo.</p>
      )}

      <form action={cadastrarTipoFolha} className="space-y-2">
        <div className="flex flex-wrap gap-2">
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
        </div>

        {todosGrupos.length > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setRestringirNova((v) => !v)}
              className="text-xs text-slate-400 hover:text-brand-600 underline decoration-dotted"
            >
              {restringirNova
                ? "essa coluna nova vai valer só pras unidades marcadas abaixo ↓"
                : "essa coluna nova vale pra todas as unidades — clique aqui se for só de algumas"}
            </button>
            {restringirNova && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                {todosGrupos.map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="checkbox" name="grupos" value={g} />
                    {g}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
