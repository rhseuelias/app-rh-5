"use client";

import { useState, useTransition } from "react";
import { darBaixaFerias, type ResultadoBaixaFerias } from "@/lib/actions";

interface Linha {
  colaboradorId: string;
  dataInicio: string;
  dataFim: string;
  vendeuAbono: boolean;
}

const linhaVazia = (): Linha => ({ colaboradorId: "", dataInicio: "", dataFim: "", vendeuAbono: false });

export default function DarBaixaFerias({ colaboradores }: { colaboradores: { id: string; nome: string }[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoBaixaFerias | null>(null);

  const colaboradoresOrdenados = [...colaboradores].sort((a, b) => a.nome.localeCompare(b.nome));

  function atualizar(i: number, campo: keyof Linha, valor: string | boolean) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, linhaVazia()]);
  }

  function removerLinha(i: number) {
    setLinhas((atual) => (atual.length > 1 ? atual.filter((_, idx) => idx !== i) : atual));
  }

  function enviar() {
    setErro(null);
    setResultado(null);
    const validas = linhas.filter((l) => l.colaboradorId && l.dataInicio && l.dataFim);
    if (validas.length === 0) {
      setErro("Selecione pelo menos um colaborador e preencha as duas datas.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await darBaixaFerias(validas);
        setResultado(r);
        if (r.processadas > 0) setLinhas([linhaVazia()]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao dar baixa.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Pra registrar quem já tirou férias fora do sistema: escolha o colaborador e as datas de
        início e fim (o último dia de férias, não o dia da volta ao trabalho). Cada linha já entra
        como férias concluída, descontando do período aquisitivo em aberto do colaborador. Clique
        em &quot;+ Adicionar colaborador&quot; pra lançar vários de uma vez.
      </p>

      <div className="space-y-2">
        {linhas.map((linha, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 border border-slate-100 rounded-lg p-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">Colaborador</label>
              <select
                className="input"
                value={linha.colaboradorId}
                onChange={(e) => atualizar(i, "colaboradorId", e.target.value)}
              >
                <option value="">Selecione…</option>
                {colaboradoresOrdenados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Início</label>
              <input
                type="date"
                className="input"
                value={linha.dataInicio}
                onChange={(e) => atualizar(i, "dataInicio", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Fim</label>
              <input
                type="date"
                className="input"
                value={linha.dataFim}
                onChange={(e) => atualizar(i, "dataFim", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={linha.vendeuAbono}
                onChange={(e) => atualizar(i, "vendeuAbono", e.target.checked)}
              />
              Vendeu abono
            </label>
            <button
              type="button"
              onClick={() => removerLinha(i)}
              disabled={linhas.length === 1}
              className="text-xs text-red-500 hover:underline disabled:opacity-30 pb-2 whitespace-nowrap"
            >
              remover
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={adicionarLinha} className="text-xs text-brand-600 hover:underline">
        + Adicionar colaborador
      </button>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {resultado && (
        <div className="text-sm space-y-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-emerald-700 font-medium">
            {resultado.processadas} período{resultado.processadas === 1 ? "" : "s"} de férias dado
            {resultado.processadas === 1 ? "" : "s"} baixa com sucesso.
          </p>
          {resultado.semPeriodoAberto.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">
                {resultado.semPeriodoAberto.length} sem período aquisitivo em aberto
              </span>{" "}
              (confira a data de admissão na ficha do colaborador): {resultado.semPeriodoAberto.join(", ")}
            </p>
          )}
          {resultado.semSaldo.length > 0 && (
            <p className="text-amber-700">
              <span className="font-medium">{resultado.semSaldo.length} sem saldo suficiente</span>:{" "}
              {resultado.semSaldo.join("; ")}
            </p>
          )}
          {resultado.erros.length > 0 && (
            <p className="text-red-600">
              <span className="font-medium">{resultado.erros.length} com erro:</span> {resultado.erros.join("; ")}
            </p>
          )}
        </div>
      )}

      <div>
        <button type="button" onClick={enviar} disabled={isPending} className="btn-secondary text-sm">
          {isPending ? "Processando..." : "Dar baixa"}
        </button>
      </div>
    </div>
  );
}
