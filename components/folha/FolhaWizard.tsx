"use client";

import { useState } from "react";
import type { FolhaTipo } from "@/types/db";
import { tiposDoGrupo } from "@/lib/folha-calculos";
import FolhaEventoStep from "./FolhaEventoStep";
import FolhaRelatorioFinal from "./FolhaRelatorioFinal";

export interface ValorCelula {
  valor: number;
  valor_texto: string | null;
}

export interface ColaboradorFolha {
  id: string;
  nome: string;
  cargo: string | null;
  salario_base: number;
}

export interface GrupoFolha {
  rotulo: string;
  colaboradores: ColaboradorFolha[];
}

/**
 * Orquestra o processo por unidade: escolher a unidade → preencher um
 * evento (coluna) por vez, concluindo cada um antes de liberar o
 * próximo → quando TODAS as unidades concluem TODOS os eventos que
 * valem pra elas, libera o Relatório de Conferência (a grade inteira,
 * travada, pra olhar). Cada unidade só vê as colunas que valem pra
 * ela — `gruposPorTipo` diz quais colunas são restritas a quais
 * unidades/empresas (sem entrada ali = vale pra todo mundo).
 */
export default function FolhaWizard({
  competencia,
  mesFechado,
  tipos,
  grupos,
  gruposPorTipo,
  valoresIniciais,
  valoresBase,
  notasIniciais,
  eventosConcluidosIniciais,
}: {
  competencia: string;
  mesFechado: boolean;
  tipos: FolhaTipo[];
  grupos: GrupoFolha[];
  gruposPorTipo: Record<string, string[]>;
  valoresIniciais: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  notasIniciais: Record<string, string>;
  eventosConcluidosIniciais: Record<string, string[]>;
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<string | null>(null);
  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
  const [valores, setValores] = useState(valoresIniciais);
  const [concluidos, setConcluidos] = useState(eventosConcluidosIniciais);

  function grupoEstaCompleto(rotulo: string): boolean {
    const tiposG = tiposDoGrupo(tipos, rotulo, gruposPorTipo);
    return tiposG.length > 0 && tiposG.every((t) => concluidos[rotulo]?.includes(t.id));
  }

  const todosCompletos = grupos.length > 0 && grupos.every((g) => grupoEstaCompleto(g.rotulo));

  function handleConcluir(grupo: string, tipoId: string, lancamentos: Record<string, ValorCelula>) {
    setValores((prev) => {
      const novo: typeof prev = { ...prev };
      for (const [colaboradorId, val] of Object.entries(lancamentos)) {
        novo[colaboradorId] = { ...(novo[colaboradorId] ?? {}), [tipoId]: val };
      }
      return novo;
    });
    setConcluidos((prev) => {
      const atual = prev[grupo] ?? [];
      if (atual.includes(tipoId)) return prev;
      return { ...prev, [grupo]: [...atual, tipoId] };
    });
  }

  if (mostrarRelatorio) {
    return (
      <FolhaRelatorioFinal
        tipos={tipos}
        grupos={grupos}
        gruposPorTipo={gruposPorTipo}
        valores={valores}
        notasIniciais={notasIniciais}
        competencia={competencia}
        onVoltar={() => setMostrarRelatorio(false)}
      />
    );
  }

  if (grupoSelecionado) {
    const grupo = grupos.find((g) => g.rotulo === grupoSelecionado);
    if (!grupo) return null;
    return (
      <FolhaEventoStep
        competencia={competencia}
        mesFechado={mesFechado}
        grupo={grupo}
        tipos={tiposDoGrupo(tipos, grupo.rotulo, gruposPorTipo)}
        valores={valores}
        valoresBase={valoresBase}
        concluidosDoGrupo={concluidos[grupo.rotulo] ?? []}
        onConcluir={handleConcluir}
        onVoltar={() => setGrupoSelecionado(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h3 className="text-sm font-semibold text-slate-700">🧾 Lançamento por unidade</h3>
          <button
            type="button"
            disabled={!todosCompletos}
            onClick={() => setMostrarRelatorio(true)}
            className={`btn-secondary !text-sm !py-1.5 ${
              todosCompletos ? "!bg-ink-900 !text-white !border-ink-900" : "opacity-40 cursor-not-allowed"
            }`}
            title={todosCompletos ? "Ver a grade completa, pronta pra conferência" : "Termine todas as unidades pra liberar"}
          >
            📋 Relatório de Conferência {todosCompletos ? "" : "(bloqueado)"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Escolha uma unidade pra lançar. Dentro dela, é um evento (coluna) por vez — conclua o atual pra liberar o
          próximo. Só depois de terminar TODAS as unidades o Relatório de Conferência libera.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {grupos.map((g) => {
          const tiposG = tiposDoGrupo(tipos, g.rotulo, gruposPorTipo);
          const feitos = concluidos[g.rotulo]?.length ?? 0;
          const total = tiposG.length;
          const completo = grupoEstaCompleto(g.rotulo);
          return (
            <button
              key={g.rotulo}
              type="button"
              onClick={() => setGrupoSelecionado(g.rotulo)}
              className={`card text-left hover:border-brand-300 transition-colors ${
                completo ? "!bg-emerald-50 !border-emerald-200" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{g.rotulo}</span>
                {completo && <span className="text-emerald-600 text-lg">✓</span>}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {g.colaboradores.length} colaborador{g.colaboradores.length === 1 ? "" : "es"}
              </p>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${completo ? "bg-emerald-500" : "bg-brand-400"}`}
                  style={{ width: `${total > 0 ? (feitos / total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {feitos}/{total} eventos concluídos
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
