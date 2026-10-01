"use client";

import { useState, useTransition } from "react";
import {
  adicionarObservacaoUnidade,
  editarObservacaoUnidade,
  excluirObservacaoUnidade,
  type ObservacaoUnidade,
} from "@/lib/actions-folha-observacoes";

function mesAno(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Quadro de observações de uma unidade: lembretes que ficam salvos e
 * continuam aparecendo em todas as etapas e nos meses seguintes, até você
 * excluir. */
export default function ObservacoesUnidade({
  grupo,
  observacoes,
  onChange,
}: {
  grupo: string;
  observacoes: ObservacaoUnidade[];
  onChange: (lista: ObservacaoUnidade[]) => void;
}) {
  const [novo, setNovo] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function adicionar() {
    setErro(null);
    startTransition(async () => {
      const r = await adicionarObservacaoUnidade(grupo, novo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onChange([...observacoes, r.dados]);
      setNovo("");
    });
  }

  function iniciarEdicao(o: ObservacaoUnidade) {
    setErro(null);
    setConfirmandoId(null);
    setEditandoId(o.id);
    setTextoEdicao(o.texto);
  }

  function salvarEdicao(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await editarObservacaoUnidade(id, textoEdicao);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onChange(observacoes.map((o) => (o.id === id ? r.dados : o)));
      setEditandoId(null);
    });
  }

  function excluir(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await excluirObservacaoUnidade(id);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onChange(observacoes.filter((o) => o.id !== id));
      setConfirmandoId(null);
    });
  }

  return (
    <section
      aria-label={`Observações de ${grupo}`}
      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3"
    >
      <div>
        <h3 className="text-base font-bold text-slate-900">📝 Observações — {grupo}</h3>
        <p className="text-xs text-slate-500">
          Ficam salvas e aparecem em todas as etapas e nos próximos meses, até você excluir.
        </p>
      </div>

      {observacoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma observação. Escreva abaixo o que não pode esquecer.</p>
      ) : (
        <ol className="space-y-2">
          {observacoes.map((o, i) => (
            <li key={o.id} className="rounded-xl bg-white border border-amber-100 px-3 py-2">
              {editandoId === o.id ? (
                <div className="space-y-2">
                  <textarea
                    value={textoEdicao}
                    onChange={(e) => setTextoEdicao(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    aria-label="Editar observação"
                    className="input !text-sm"
                    disabled={isPending}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => salvarEdicao(o.id)}
                      disabled={isPending || textoEdicao.trim() === ""}
                      className="btn-primary !text-xs !py-1.5 !px-3 disabled:opacity-50"
                    >
                      {isPending ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      disabled={isPending}
                      className="text-xs text-slate-600 hover:text-slate-800"
                    >
                      cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                      <span className="font-bold text-red-700">{i + 1}- </span>
                      {o.texto}
                    </p>
                    {mesAno(o.created_at) && (
                      <p className="text-[11px] text-slate-400 mt-0.5">desde {mesAno(o.created_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    {confirmandoId === o.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => excluir(o.id)}
                          disabled={isPending}
                          className="rounded-md bg-red-700 text-white font-medium px-2.5 py-1 hover:bg-red-800 disabled:opacity-50"
                        >
                          {isPending ? "Excluindo..." : "Confirmar exclusão"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoId(null)}
                          disabled={isPending}
                          className="text-slate-600 hover:text-slate-800"
                        >
                          cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => iniciarEdicao(o)}
                          className="text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErro(null);
                            setEditandoId(null);
                            setConfirmandoId(o.id);
                          }}
                          className="text-red-700 hover:underline"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-2">
        <textarea
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Nova observação (ex.: Colocar aumento para a Letícia)"
          aria-label="Nova observação"
          className="input !text-sm"
          disabled={isPending}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={adicionar}
            disabled={isPending || novo.trim() === ""}
            className="btn-secondary !text-sm !py-1.5 disabled:opacity-50"
          >
            {isPending && editandoId === null && confirmandoId === null ? "Salvando..." : "＋ Adicionar observação"}
          </button>
          {erro && <span className="text-sm text-red-600">{erro}</span>}
        </div>
      </div>
    </section>
  );
}
