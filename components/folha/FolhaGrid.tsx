"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import type { CategoriaFolha, FolhaTipo } from "@/types/db";
import { salvarFolhaLote, type LancamentoFolhaInput } from "@/lib/actions-folha";
import { formatarReais } from "@/lib/formatadores";
import CelulaLancamento from "./CelulaLancamento";

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

const CATEGORIAS: CategoriaFolha[] = ["provento", "desconto", "espelhamento"];

export interface ValorCelula {
  valor: number;
  valor_texto: string | null;
}

export interface GrupoFolha {
  rotulo: string;
  colaboradores: { id: string; nome: string }[];
}

export default function FolhaGrid({
  competencia,
  mesFechado,
  tipos,
  grupos,
  valoresIniciais,
  notasIniciais,
}: {
  competencia: string;
  mesFechado: boolean;
  tipos: FolhaTipo[];
  grupos: GrupoFolha[];
  valoresIniciais: Record<string, Record<string, ValorCelula>>;
  notasIniciais: Record<string, string>;
}) {
  const draftsLancamentos = useRef(new Map<string, LancamentoFolhaInput>()).current;
  const draftsNotas = useRef(new Map<string, string>()).current;
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);

  const tiposPorCategoria = CATEGORIAS.map((categoria) => ({
    categoria,
    tipos: tipos.filter((t) => t.categoria === categoria),
  }));

  function registrarLancamento(colaboradorId: string, tipoId: string, payload: ValorCelula) {
    draftsLancamentos.set(`${colaboradorId}:${tipoId}`, {
      colaborador_id: colaboradorId,
      tipo_id: tipoId,
      valor: payload.valor,
      valor_texto: payload.valor_texto,
    });
    setSalvo(false);
  }

  function registrarNota(colaboradorId: string, nota: string) {
    draftsNotas.set(colaboradorId, nota);
    setSalvo(false);
  }

  function salvarTudo() {
    startTransition(async () => {
      const lancamentos = Array.from(draftsLancamentos.values());
      const notas = Array.from(draftsNotas.entries()).map(([colaborador_id, nota]) => ({
        colaborador_id,
        nota: nota || null,
      }));
      if (lancamentos.length === 0 && notas.length === 0) return;
      await salvarFolhaLote(competencia, lancamentos, notas);
      draftsLancamentos.clear();
      draftsNotas.clear();
      setSalvo(true);
    });
  }

  function subtotalGrupo(colaboradores: { id: string }[], tipoId: string, formato: string): number | null {
    if (formato === "texto") return null;
    let soma = 0;
    for (const c of colaboradores) soma += valoresIniciais[c.id]?.[tipoId]?.valor ?? 0;
    return soma;
  }

  function totalGeral(tipoId: string, formato: string): number | null {
    if (formato === "texto") return null;
    let soma = 0;
    for (const g of grupos) soma += subtotalGrupo(g.colaboradores, tipoId, formato) ?? 0;
    return soma;
  }

  return (
    <div className="space-y-3">
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className="py-2 px-3 text-left text-slate-400 text-xs uppercase bg-white sticky left-0 z-10">
                  Colaborador
                </th>
                {tiposPorCategoria.map(({ categoria, tipos: tiposCat }) =>
                  tiposCat.length > 0 ? (
                    <th
                      key={categoria}
                      colSpan={tiposCat.length}
                      className={`py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wide ${COR_CATEGORIA[categoria]}`}
                    >
                      {ROTULO_CATEGORIA[categoria]}
                    </th>
                  ) : null
                )}
                <th rowSpan={2} className="py-2 px-3 text-left text-slate-400 text-xs uppercase">
                  Ponto
                </th>
              </tr>
              <tr>
                {tipos.map((t) => (
                  <th key={t.id} className="py-2 px-2 text-center text-slate-500 text-[11px] font-semibold whitespace-nowrap">
                    {t.nome}
                    {t.codigo && <div className="text-[10px] text-slate-300 font-normal">{t.codigo}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.rotulo}>
                  <tr className="bg-ink-900">
                    <td colSpan={tipos.length + 2} className="py-1.5 px-3 text-white text-xs font-bold uppercase tracking-wide sticky left-0 bg-ink-900">
                      {g.rotulo}
                    </td>
                  </tr>
                  {g.colaboradores.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-3 font-medium text-slate-800 whitespace-nowrap bg-white sticky left-0">{c.nome}</td>
                      {tipos.map((t) => {
                        const inicial = valoresIniciais[c.id]?.[t.id];
                        return (
                          <td key={t.id} className="py-1 px-1 text-center">
                            <CelulaLancamento
                              formato={t.formato}
                              valorInicial={inicial?.valor ?? 0}
                              valorTextoInicial={inicial?.valor_texto ?? null}
                              disabled={mesFechado}
                              onChange={(payload) => registrarLancamento(c.id, t.id, payload)}
                            />
                          </td>
                        );
                      })}
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          disabled={mesFechado}
                          defaultValue={notasIniciais[c.id] ?? ""}
                          onChange={(e) => registrarNota(c.id, e.target.value)}
                          placeholder="anotação..."
                          className="input !w-40 !py-1.5 !px-2 !text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 border-b-2 border-slate-200 font-bold">
                    <td className="py-1.5 px-3 text-slate-600 text-xs sticky left-0 bg-slate-50">Subtotal {g.rotulo}</td>
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
                </Fragment>
              ))}
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

      <div className="flex items-center justify-end gap-3">
        {salvo && !isPending && <span className="text-sm text-emerald-600 font-medium">✓ Salvo</span>}
        {!mesFechado && (
          <button
            type="button"
            disabled={isPending}
            onClick={salvarTudo}
            className="btn-secondary !bg-ink-900 !text-white !border-ink-900 disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Salvar"}
          </button>
        )}
      </div>
    </div>
  );
}
