"use client";

import { useTransition } from "react";
import type { Unidade } from "@/types/db";
import { salvarUnidade, excluirUnidade } from "@/lib/actions";
import CampoDocumento from "@/components/campos/CampoDocumento";
import DadosCadastraisCampos from "@/components/campos/DadosCadastraisCampos";
import { ADIANTAMENTO_OPCOES } from "@/lib/calculos";
import { cadastroEmpresaCompleto, unidadeTemEnderecoProprio } from "@/lib/dados-empresa";

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

  const temEndereco = unidadeTemEnderecoProprio(unidade);
  const completo = cadastroEmpresaCompleto(unidade);

  return (
    <li className="rounded-lg border border-slate-100 p-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <span>
          {unidade.nome} {unidade.cnpj && <span className="text-slate-400">— {unidade.cnpj}</span>}
        </span>
        <span className="flex items-center gap-2 shrink-0 flex-wrap">
          {unidade.adiantamento_pct && (
            <span className="badge bg-slate-100 text-slate-600">
              Adiantamento {unidade.adiantamento_pct}%
            </span>
          )}
          {!temEndereco ? (
            <span className="badge bg-slate-100 text-slate-600">Usa os dados da empresa</span>
          ) : completo ? (
            <span className="badge bg-emerald-100 text-emerald-700">Dados completos</span>
          ) : (
            <span className="badge bg-amber-100 text-amber-800">Faltam dados</span>
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
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-brand-600">Editar dados da unidade</summary>
        <form action={salvarUnidade} className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <input type="hidden" name="id" value={unidade.id} />
          <input type="hidden" name="empresa_id" value={empresaId} />
          <div>
            <label className="label">Nome da filial</label>
            <input name="nome" required className="input" defaultValue={unidade.nome} />
          </div>
          <CampoDocumento label="CNPJ da filial" name="cnpj" tipo="cnpj" defaultValue={unidade.cnpj} />
          <div>
            <label className="label">Adiantamento salarial</label>
            <select name="adiantamento_pct" className="input" defaultValue={unidade.adiantamento_pct ?? ""}>
              <option value="">Sem adiantamento</option>
              {ADIANTAMENTO_OPCOES.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              Se esta unidade tem endereço próprio, preencha aqui. Se deixar o endereço em branco, os documentos usam o
              endereço da empresa.
            </p>
            <DadosCadastraisCampos
              idBase={`unidade-${unidade.id}`}
              valores={unidade}
              rotuloRazao="Razão social (se for diferente da empresa)"
            />
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn-primary text-sm">
              Salvar unidade
            </button>
          </div>
        </form>
      </details>
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
        <ul className="text-sm text-slate-600 space-y-2">
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
          <div className="md:col-span-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              Endereço da unidade (opcional). Em branco, os documentos usam o endereço da empresa.
            </p>
            <DadosCadastraisCampos
              idBase={`unidade-nova-${empresaId}`}
              rotuloRazao="Razão social (se for diferente da empresa)"
            />
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
