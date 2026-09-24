"use client";

import { useState } from "react";
import type { CategoriaFolha, FolhaTipo } from "@/types/db";
import { compararGrupos, tiposDoGrupo } from "@/lib/folha-calculos";
import { formatarReais } from "@/lib/formatadores";
import { corDaEmpresa } from "@/lib/empresa-cores";
import type { ColaboradorComVinculo, EmpresaFolha, ValorCelula } from "./FolhaWizard";

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

/** Relatório Dinâmico da Folha: versão analítica pra conferir se o que foi
 * digitado está certo — mostra cada coluna lançada com o somatório dela.
 * Aba "Geral" compara as empresas lado a lado; aba "Individual" abre o
 * detalhe colaborador por colaborador de uma empresa (unidade por unidade).
 * Só fica disponível quando todas as unidades concluem todos os eventos
 * (mesma regra do Relatório de Conferência). */
export default function FolhaRelatorioDinamico({
  competencia,
  tipos,
  gruposPorTipo,
  empresasFolha,
  valores,
  onVoltar,
}: {
  competencia: string;
  tipos: FolhaTipo[];
  gruposPorTipo: Record<string, string[]>;
  empresasFolha: EmpresaFolha[];
  valores: Record<string, Record<string, ValorCelula>>;
  onVoltar: () => void;
}) {
  const [aba, setAba] = useState<"geral" | "individual">("geral");
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>(empresasFolha[0]?.nome ?? "");

  const tiposMoeda = tipos.filter((t) => t.formato === "moeda");
  const categoriasPresentes = Array.from(new Set(tiposMoeda.map((t) => t.categoria))) as CategoriaFolha[];

  function valorCelula(colaboradorId: string, tipoId: string): number {
    return valores[colaboradorId]?.[tipoId]?.valor ?? 0;
  }

  function somaColuna(colaboradores: { id: string }[], tipoId: string): number {
    return colaboradores.reduce((acc, c) => acc + valorCelula(c.id, tipoId), 0);
  }

  function somaTotal(colaboradores: { id: string }[]): number {
    return tiposMoeda.reduce((acc, t) => acc + somaColuna(colaboradores, t.id), 0);
  }

  if (empresasFolha.length === 0) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onVoltar} className="text-sm text-slate-400 hover:text-slate-600">
          ← voltar pras unidades
        </button>
        <div className="card">
          <p className="text-sm text-slate-400">Nenhum colaborador encontrado.</p>
        </div>
      </div>
    );
  }

  // ---- GERAL: soma de cada coluna, por empresa ----
  const linhasGeral = empresasFolha.map((emp, i) => ({
    nome: emp.nome,
    cor: corDaEmpresa(emp.nome, i),
    colaboradores: emp.colaboradores,
    totalEmpresa: somaTotal(emp.colaboradores),
  }));
  const totalGeralGeral = linhasGeral.reduce((acc, l) => acc + l.totalEmpresa, 0);

  // ---- INDIVIDUAL: subgrupos (unidade/ESTÁGIO/empresa) da empresa escolhida ----
  const empresaAtual = empresasFolha.find((e) => e.nome === empresaSelecionada) ?? empresasFolha[0];
  const subgruposMap = new Map<string, ColaboradorComVinculo[]>();
  for (const c of empresaAtual.colaboradores) {
    if (!subgruposMap.has(c.subgrupoRotulo)) subgruposMap.set(c.subgrupoRotulo, []);
    subgruposMap.get(c.subgrupoRotulo)!.push(c);
  }
  const subgrupos = Array.from(subgruposMap.entries()).sort((a, b) => compararGrupos(a[0], b[0]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={onVoltar} className="text-sm text-slate-400 hover:text-slate-600">
          ← voltar pras unidades
        </button>
        <span className="text-sm font-bold text-slate-900">📐 Relatório Dinâmico da Folha — {competencia}</span>
      </div>

      <div className="card !bg-slate-50 !border-slate-200">
        <p className="text-sm text-slate-500">
          🔎 Cada coluna lançada, lado a lado, com o somatório — pra conferir se o que foi digitado está certo.
          Pra corrigir algum valor, volte na unidade e revise o evento (a coluna).
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAba("geral")}
          className={`rounded-lg border-2 px-4 py-1.5 text-sm font-semibold ${
            aba === "geral" ? "!bg-white !border-ink-900 !text-ink-900" : "!bg-slate-50 !border-slate-200 !text-slate-400"
          }`}
        >
          📊 Geral
        </button>
        <button
          type="button"
          onClick={() => setAba("individual")}
          className={`rounded-lg border-2 px-4 py-1.5 text-sm font-semibold ${
            aba === "individual" ? "!bg-white !border-ink-900 !text-ink-900" : "!bg-slate-50 !border-slate-200 !text-slate-400"
          }`}
        >
          🏢 Individual
        </button>
      </div>

      {aba === "geral" && (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="bg-white sticky left-0 z-10" />
                  {categoriasPresentes.map((categoria) => {
                    const doCategoria = tiposMoeda.filter((t) => t.categoria === categoria);
                    if (doCategoria.length === 0) return null;
                    return (
                      <th
                        key={categoria}
                        colSpan={doCategoria.length}
                        className={`py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wide ${COR_CATEGORIA[categoria]}`}
                      >
                        {ROTULO_CATEGORIA[categoria]}
                      </th>
                    );
                  })}
                  <th className="py-2 px-3 text-left text-slate-400 text-xs uppercase">Total</th>
                </tr>
                <tr>
                  <th className="py-2 px-3 text-left text-slate-400 text-xs uppercase bg-white sticky left-0 z-10">
                    Empresa
                  </th>
                  {tiposMoeda.map((t) => (
                    <th key={t.id} className="py-2 px-2 text-center text-slate-500 text-[11px] font-semibold whitespace-nowrap">
                      {t.nome}
                    </th>
                  ))}
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {linhasGeral.map((l) => (
                  <tr key={l.nome} className="border-b border-slate-100">
                    <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap bg-white sticky left-0">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: l.cor.cor }} />
                      {l.nome}
                    </td>
                    {tiposMoeda.map((t) => {
                      const soma = somaColuna(l.colaboradores, t.id);
                      return (
                        <td key={t.id} className="py-2 px-2 text-center text-xs text-slate-600">
                          {soma === 0 ? "—" : formatarReais(soma)}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-xs font-bold text-slate-900 whitespace-nowrap">
                      {formatarReais(l.totalEmpresa)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink-900 text-white font-bold">
                  <td className="py-2 px-3 sticky left-0 bg-ink-900">TOTAL GERAL — soma da coluna</td>
                  {tiposMoeda.map((t) => {
                    const somaTipo = linhasGeral.reduce((acc, l) => acc + somaColuna(l.colaboradores, t.id), 0);
                    return (
                      <td key={t.id} className="py-2 px-2 text-center text-xs">
                        {formatarReais(somaTipo)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-xs whitespace-nowrap">{formatarReais(totalGeralGeral)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === "individual" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {empresasFolha.map((emp, i) => {
              const cor = corDaEmpresa(emp.nome, i);
              const ativa = emp.nome === empresaSelecionada;
              return (
                <button
                  key={emp.nome}
                  type="button"
                  onClick={() => setEmpresaSelecionada(emp.nome)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-1.5 text-sm font-bold"
                  style={
                    ativa
                      ? { borderColor: cor.cor, color: cor.cor, background: cor.bg }
                      : { borderColor: "#e2e8f0", color: "#94a3b8", background: "white" }
                  }
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cor.cor }} />
                  {emp.nome}
                </button>
              );
            })}
          </div>

          {subgrupos.map(([rotulo, colaboradoresSub]) => {
            const tiposSub = tiposDoGrupo(tipos, rotulo, gruposPorTipo);
            const categoriasSub = Array.from(new Set(tiposSub.map((t) => t.categoria))) as CategoriaFolha[];
            return (
              <div key={rotulo} className="card !p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-ink-900">
                        <th colSpan={tiposSub.length + 1} className="py-1.5 px-3 text-left text-white text-xs font-bold uppercase tracking-wide">
                          {rotulo}
                        </th>
                      </tr>
                      <tr>
                        <th className="py-2 px-3 text-left text-slate-400 text-xs uppercase bg-white sticky left-0 z-10">
                          Colaborador
                        </th>
                        {categoriasSub.map((categoria) => {
                          const doCategoria = tiposSub.filter((t) => t.categoria === categoria);
                          if (doCategoria.length === 0) return null;
                          return (
                            <th
                              key={categoria}
                              colSpan={doCategoria.length}
                              className={`py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wide ${COR_CATEGORIA[categoria]}`}
                            >
                              {ROTULO_CATEGORIA[categoria]}
                            </th>
                          );
                        })}
                      </tr>
                      <tr>
                        <th className="bg-white sticky left-0" />
                        {tiposSub.map((t) => (
                          <th key={t.id} className="py-2 px-2 text-center text-slate-500 text-[11px] font-semibold whitespace-nowrap">
                            {t.nome}
                            {t.codigo && <div className="text-[10px] text-slate-300 font-normal">{t.codigo}</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colaboradoresSub.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-1.5 px-3 font-medium text-slate-800 whitespace-nowrap bg-white sticky left-0">
                            {c.nome}
                          </td>
                          {tiposSub.map((t) => {
                            const v = valores[c.id]?.[t.id];
                            const texto = t.formato === "moeda" ? formatarReais(v?.valor ?? 0) : v?.valor_texto || "—";
                            return (
                              <td key={t.id} className="py-1 px-2 text-center text-xs text-slate-600">
                                {texto}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="py-1.5 px-3 text-slate-600 text-xs sticky left-0 bg-slate-50">
                          Subtotal {rotulo}
                        </td>
                        {tiposSub.map((t) => {
                          const sub = t.formato === "moeda" ? somaColuna(colaboradoresSub, t.id) : null;
                          return (
                            <td key={t.id} className="py-1.5 px-2 text-center text-xs text-slate-700">
                              {sub === null ? "—" : formatarReais(sub)}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="bg-ink-900 text-white font-bold">
                    <td className="py-2 px-3 sticky left-0 bg-ink-900 whitespace-nowrap">
                      TOTAL {empresaAtual.nome.toUpperCase()}
                    </td>
                    {tiposMoeda.map((t) => (
                      <td key={t.id} className="py-2 px-2 text-center text-xs">
                        {formatarReais(somaColuna(empresaAtual.colaboradores, t.id))}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      {formatarReais(somaTotal(empresaAtual.colaboradores))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
