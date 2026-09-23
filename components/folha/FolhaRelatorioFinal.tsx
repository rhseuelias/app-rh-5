"use client";

import { useState, useTransition } from "react";
import type { CategoriaFolha, FolhaTipo } from "@/types/db";
import { salvarFolhaLote } from "@/lib/actions-folha";
import { formatarReais } from "@/lib/formatadores";
import type { GrupoFolha, ValorCelula } from "./FolhaWizard";

const COR_CATEGORIA: Record<CategoriaFolha, string> = {
  provento: "bg-blue-50 text-blue-700",
  desconto: "bg-emerald-50 text-emerald-700",
  espelhamento: "bg-amber-50 text-amber-700",
};

const ROTULO_CATEGORIA: Record<CategoriaFolha, string> = {
  provento: "PROVENTOS",
  desconto: "DESCONTOS",
  espelhamento: "ESPELHAMENTO",
};

/** Relatório de Conferência: a grade inteira, travada — cada unidade
 * com o cabeçalho das colunas repetido (igual à planilha), pronta pra
 * conferir antes de mandar pra contabilidade. Libera só quando todas
 * as unidades concluem todos os eventos. */
export default function FolhaRelatorioFinal({
  competencia,
  tipos,
  grupos,
  valores,
  notasIniciais,
  onVoltar,
}: {
  competencia: string;
  tipos: FolhaTipo[];
  grupos: GrupoFolha[];
  valores: Record<string, Record<string, ValorCelula>>;
  notasIniciais: Record<string, string>;
  onVoltar: () => void;
}) {
  const categorias = Array.from(new Set(tipos.map((t) => t.categoria))) as CategoriaFolha[];

  function subtotalGrupo(colaboradores: { id: string }[], tipoId: string, formato: string): number | null {
    if (formato !== "moeda") return null;
    let soma = 0;
    for (const c of colaboradores) soma += valores[c.id]?.[tipoId]?.valor ?? 0;
    return soma;
  }

  function totalGeral(tipoId: string, formato: string): number | null {
    if (formato !== "moeda") return null;
    let soma = 0;
    for (const g of grupos) soma += subtotalGrupo(g.colaboradores, tipoId, formato) ?? 0;
    return soma;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={onVoltar} className="text-sm text-slate-400 hover:text-slate-600">
          ← voltar pras unidades
        </button>
        <span className="text-sm font-bold text-slate-900">📋 Relatório de Conferência — {competencia}</span>
      </div>

      <div className="card !bg-slate-50 !border-slate-200">
        <p className="text-sm text-slate-500">
          🔒 Essa tela é só pra conferir — pra corrigir algum valor, volte na unidade e revise o evento (a coluna).
        </p>
      </div>

      {grupos.map((g) => (
        <div key={g.rotulo} className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-ink-900">
                  <th colSpan={tipos.length + 2} className="py-1.5 px-3 text-left text-white text-xs font-bold uppercase tracking-wide">
                    {g.rotulo}
                  </th>
                </tr>
                <tr>
                  <th className="py-2 px-3 text-left text-slate-400 text-xs uppercase bg-white sticky left-0 z-10">Colaborador</th>
                  {categorias.map((categoria) => {
                    const doGrupo = tipos.filter((t) => t.categoria === categoria);
                    if (doGrupo.length === 0) return null;
                    return (
                      <th
                        key={categoria}
                        colSpan={doGrupo.length}
                        className={`py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wide ${COR_CATEGORIA[categoria]}`}
                      >
                        {ROTULO_CATEGORIA[categoria]}
                      </th>
                    );
                  })}
                  <th className="py-2 px-3 text-left text-slate-400 text-xs uppercase">Ponto</th>
                </tr>
                <tr>
                  <th className="bg-white sticky left-0" />
                  {tipos.map((t) => (
                    <th key={t.id} className="py-2 px-2 text-center text-slate-500 text-[11px] font-semibold whitespace-nowrap">
                      {t.nome}
                      {t.codigo && <div className="text-[10px] text-slate-300 font-normal">{t.codigo}</div>}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.colaboradores.map((c) => (
                  <LinhaColaborador
                    key={c.id}
                    competencia={competencia}
                    colaboradorId={c.id}
                    nome={c.nome}
                    tipos={tipos}
                    valoresColaborador={valores[c.id] ?? {}}
                    notaInicial={notasIniciais[c.id] ?? ""}
                  />
                ))}
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                  <td className="py-1.5 px-3 text-slate-600 text-xs sticky left-0 bg-slate-50">
                    Subtotal {g.rotulo}
                  </td>
                  {tipos.map((t) => {
                    const sub = subtotalGrupo(g.colaboradores, t.id, t.formato);
                    return (
                      <td key={t.id} className="py-1.5 px-2 text-center text-xs text-slate-700">
                        {sub === null ? "—" : formatarReais(sub)}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="bg-ink-900 text-white font-bold">
                <td className="py-2 px-3 sticky left-0 bg-ink-900">TOTAL GERAL — TODAS AS UNIDADES</td>
                {tipos.map((t) => {
                  const tot = totalGeral(t.id, t.formato);
                  return (
                    <td key={t.id} className="py-2 px-2 text-center text-xs">
                      {tot === null ? "—" : formatarReais(tot)}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LinhaColaborador({
  competencia,
  colaboradorId,
  nome,
  tipos,
  valoresColaborador,
  notaInicial,
}: {
  competencia: string;
  colaboradorId: string;
  nome: string;
  tipos: FolhaTipo[];
  valoresColaborador: Record<string, ValorCelula>;
  notaInicial: string;
}) {
  const [nota, setNota] = useState(notaInicial);
  const [isPending, startTransition] = useTransition();

  function salvarNota() {
    startTransition(() => {
      salvarFolhaLote(competencia, [], [{ colaborador_id: colaboradorId, nota: nota || null }]);
    });
  }

  return (
    <tr className="border-b border-slate-100">
      <td className="py-1.5 px-3 font-medium text-slate-800 whitespace-nowrap bg-white sticky left-0">{nome}</td>
      {tipos.map((t) => {
        const v = valoresColaborador[t.id];
        const texto = t.formato === "moeda" ? formatarReais(v?.valor ?? 0) : v?.valor_texto || "—";
        return (
          <td key={t.id} className="py-1 px-2 text-center text-xs text-slate-600">
            {texto}
          </td>
        );
      })}
      <td className="py-1 px-1">
        <input
          type="text"
          value={nota}
          disabled={isPending}
          onChange={(e) => setNota(e.target.value)}
          onBlur={salvarNota}
          placeholder="anotação..."
          className="input !w-40 !py-1.5 !px-2 !text-xs"
        />
      </td>
    </tr>
  );
}
