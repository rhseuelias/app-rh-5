"use client";

import { useState } from "react";
import type { FolhaTipo } from "@/types/db";
import { tiposDoGrupo } from "@/lib/folha-calculos";
import type { ObservacaoUnidade } from "@/lib/actions-folha-observacoes";
import FolhaEventoStep from "./FolhaEventoStep";
import FolhaRelatorioFinal from "./FolhaRelatorioFinal";
import FolhaRelatorioDinamico from "./FolhaRelatorioDinamico";

export interface ValorCelula {
  valor: number;
  valor_texto: string | null;
}

export interface ColaboradorFolha {
  id: string;
  nome: string;
  cargo: string | null;
  salario_base: number;
  /** matrícula na contabilidade (aparece no Relatório de Conferência) */
  matricula?: string | null;
}

export interface GrupoFolha {
  rotulo: string;
  /** empresa da unidade (ex.: "BSE" para a unidade "SAVASSI") — só pro título do relatório */
  empresaNome?: string;
  colaboradores: ColaboradorFolha[];
}

/** Colaborador com o vínculo de empresa/unidade, usado só pelo Relatório
 * Dinâmico (que agrupa por EMPRESA, diferente do lançamento que agrupa por
 * unidade). `subgrupoRotulo` é o mesmo rótulo usado no lançamento (unidade,
 * "ESTÁGIO" ou a própria empresa) — serve só pra saber quais colunas valem
 * (`gruposPorTipo` é indexado por esse rótulo). */
export interface ColaboradorComVinculo extends ColaboradorFolha {
  subgrupoRotulo: string;
}

export interface EmpresaFolha {
  nome: string;
  colaboradores: ColaboradorComVinculo[];
}

type StatusUnidade = "pendente" | "andamento" | "concluido";
type FiltroStatus = "todos" | StatusUnidade;

const STATUS_UNIDADE: Record<StatusUnidade, { label: string; classe: string }> = {
  pendente: { label: "Pendente", classe: "bg-amber-50 text-amber-700" },
  andamento: { label: "Em andamento", classe: "bg-blue-50 text-blue-700" },
  concluido: { label: "Concluído", classe: "bg-emerald-50 text-emerald-700" },
};

/**
 * Orquestra o processo por unidade: escolher a unidade → preencher um
 * evento (coluna) por vez, concluindo cada um antes de liberar o
 * próximo → quando TODAS as unidades concluem TODOS os eventos que
 * valem pra elas, libera o Relatório de Conferência (a grade inteira,
 * travada, pra olhar) e o Relatório Dinâmico (comparação por empresa,
 * com somatório de cada coluna). Cada unidade só vê as colunas que
 * valem pra ela — `gruposPorTipo` diz quais colunas são restritas a
 * quais unidades/empresas (sem entrada ali = vale pra todo mundo).
 */
export default function FolhaWizard({
  competencia,
  mesFechado,
  tipos,
  grupos,
  gruposPorTipo,
  empresasFolha,
  valoresIniciais,
  valoresBase,
  notasIniciais,
  eventosConcluidosIniciais,
  observacoesIniciais,
}: {
  competencia: string;
  mesFechado: boolean;
  tipos: FolhaTipo[];
  grupos: GrupoFolha[];
  gruposPorTipo: Record<string, string[]>;
  empresasFolha: EmpresaFolha[];
  valoresIniciais: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  notasIniciais: Record<string, string>;
  eventosConcluidosIniciais: Record<string, string[]>;
  /** observações fixas de cada unidade, indexadas pelo rótulo da unidade */
  observacoesIniciais: Record<string, ObservacaoUnidade[]>;
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<string | null>(null);
  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
  const [mostrarRelatorioDinamico, setMostrarRelatorioDinamico] = useState(false);
  const [valores, setValores] = useState(valoresIniciais);
  const [concluidos, setConcluidos] = useState(eventosConcluidosIniciais);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [observacoes, setObservacoes] = useState(observacoesIniciais);
  const [avisoConcluida, setAvisoConcluida] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const [msgExport, setMsgExport] = useState<{
    tipo: "ok" | "aviso" | "erro";
    texto: string;
    detalhes: string[];
  } | null>(null);

  function grupoEstaCompleto(rotulo: string): boolean {
    const tiposG = tiposDoGrupo(tipos, rotulo, gruposPorTipo);
    return tiposG.length > 0 && tiposG.every((t) => concluidos[rotulo]?.includes(t.id));
  }

  const todosCompletos = grupos.length > 0 && grupos.every((g) => grupoEstaCompleto(g.rotulo));

  // Baixa a planilha da contabilidade (modelo "Movimento Variável") da unidade.
  async function exportarPlanilha(rotulo: string) {
    setExportando(rotulo);
    setMsgExport(null);
    try {
      const url = `/api/folha/exportar?competencia=${encodeURIComponent(competencia)}&unidade=${encodeURIComponent(rotulo)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const texto = (await res.text()).trim();
        setMsgExport({ tipo: "erro", texto: texto || "Não foi possível gerar a planilha.", detalhes: [] });
        return;
      }
      const nome = decodeURIComponent(res.headers.get("X-Nome-Arquivo") ?? "MovimentoVariavel.xlsx");
      let avisos: string[] = [];
      try {
        avisos = JSON.parse(decodeURIComponent(res.headers.get("X-Avisos") ?? "%5B%5D")) as string[];
      } catch {
        avisos = [];
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      const endereco = URL.createObjectURL(blob);
      link.href = endereco;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(endereco);
      setMsgExport({
        tipo: avisos.length > 0 ? "aviso" : "ok",
        texto: `Planilha "${nome}" gerada.`,
        detalhes: avisos,
      });
    } catch {
      setMsgExport({ tipo: "erro", texto: "Não foi possível gerar a planilha. Tente de novo.", detalhes: [] });
    } finally {
      setExportando(null);
    }
  }

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

  function handleLimpar(grupo: string, tipoId: string) {
    setValores((prev) => {
      const novo: typeof prev = { ...prev };
      for (const colaboradorId of Object.keys(novo)) {
        const valoresColab = novo[colaboradorId];
        if (valoresColab && tipoId in valoresColab) {
          const resto = { ...valoresColab };
          delete resto[tipoId];
          novo[colaboradorId] = resto;
        }
      }
      return novo;
    });
    setConcluidos((prev) => {
      const atual = prev[grupo] ?? [];
      if (!atual.includes(tipoId)) return prev;
      return { ...prev, [grupo]: atual.filter((id) => id !== tipoId) };
    });
  }

  if (mostrarRelatorioDinamico) {
    return (
      <FolhaRelatorioDinamico
        competencia={competencia}
        tipos={tipos}
        gruposPorTipo={gruposPorTipo}
        empresasFolha={empresasFolha}
        valores={valores}
        onVoltar={() => setMostrarRelatorioDinamico(false)}
      />
    );
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
        onLimpar={handleLimpar}
        onVoltar={() => setGrupoSelecionado(null)}
        observacoes={observacoes[grupo.rotulo] ?? []}
        onObservacoesChange={(lista) => setObservacoes((prev) => ({ ...prev, [grupo.rotulo]: lista }))}
        onFinalizar={(rotulo) => {
          setAvisoConcluida(rotulo);
          setGrupoSelecionado(null);
        }}
      />
    );
  }

  // situação de cada unidade: quantos eventos (colunas) já foram concluídos
  const unidades = grupos.map((g) => {
    const tiposG = tiposDoGrupo(tipos, g.rotulo, gruposPorTipo);
    const feitos = tiposG.filter((t) => concluidos[g.rotulo]?.includes(t.id)).length;
    const total = tiposG.length;
    const completo = total > 0 && feitos === total;
    const status: StatusUnidade = completo ? "concluido" : feitos > 0 ? "andamento" : "pendente";
    return { grupo: g, feitos, total, completo, status };
  });
  const unidadesConcluidas = unidades.filter((u) => u.completo).length;
  const pctGeral = unidades.length > 0 ? (unidadesConcluidas / unidades.length) * 100 : 0;

  const termo = busca.trim().toLowerCase();
  const unidadesVisiveis = unidades.filter(
    (u) =>
      (filtroStatus === "todos" || u.status === filtroStatus) &&
      (termo === "" || u.grupo.rotulo.toLowerCase().includes(termo))
  );
  const rotuloAcao = mesFechado ? "Consultar" : "Lançar";

  return (
    <div className="space-y-4">
      {avisoConcluida && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex items-start justify-between gap-3"
        >
          <p className="font-medium">
            ✓ {avisoConcluida} concluída e salva. Não precisa avançar mais — é só seguir para a próxima unidade.
          </p>
          <button type="button" onClick={() => setAvisoConcluida(null)} className="text-xs underline shrink-0">
            fechar
          </button>
        </div>
      )}

      {msgExport && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
            msgExport.tipo === "erro"
              ? "border-red-200 bg-red-50 text-red-800"
              : msgExport.tipo === "aviso"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <div className="space-y-1">
            <p className="font-medium">{msgExport.texto}</p>
            {msgExport.detalhes.length > 0 && (
              <>
                <p className="text-xs">Confira antes de enviar para a contabilidade:</p>
                <ul className="list-disc pl-5 text-xs space-y-0.5">
                  {msgExport.detalhes.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMsgExport(null)}
            aria-label="Fechar aviso"
            className="text-xs underline shrink-0"
          >
            fechar
          </button>
        </div>
      )}

      <section className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-lg">
              📍
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Unidades</h2>
              <p className="text-xs text-slate-500">Acompanhe o progresso de lançamento de cada unidade.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar unidade..."
              aria-label="Buscar unidade"
              className="input !w-44 !py-1.5"
            />
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
              aria-label="Filtrar por situação"
              className="input !w-auto !py-1.5"
            >
              <option value="todos">Filtros: todas</option>
              <option value="pendente">Pendentes</option>
              <option value="andamento">Em andamento</option>
              <option value="concluido">Concluídas</option>
            </select>
            <div className="min-w-[10rem]">
              <p className="text-xs text-slate-500 mb-1">
                {unidadesConcluidas} de {unidades.length} unidades concluídas
              </p>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pctGeral}%` }} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Dentro de cada unidade é um evento (coluna) por vez: conclua o atual para liberar o próximo. Os relatórios só
          liberam depois que TODAS as unidades terminarem.
        </p>

        {unidadesVisiveis.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma unidade encontrada com esse filtro.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {unidadesVisiveis.map(({ grupo, feitos, total, completo, status }) => (
              <div
                key={grupo.rotulo}
                className={`rounded-2xl border p-4 ${
                  completo ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span aria-hidden className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                      📍
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-words">{grupo.rotulo}</p>
                      <p className="text-xs text-slate-500">
                        {grupo.colaboradores.length} colaborador{grupo.colaboradores.length === 1 ? "" : "es"}
                      </p>
                    </div>
                  </div>
                  {completo && (
                    <span aria-hidden className="text-emerald-600 font-bold">
                      ✓
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-3 mb-1">
                  <p className="text-xs text-slate-500">
                    {feitos}/{total}
                  </p>
                  {(observacoes[grupo.rotulo]?.length ?? 0) > 0 && (
                    <p className="text-xs text-amber-700" title="Observações fixas desta unidade">
                      📝 {observacoes[grupo.rotulo].length} observaç
                      {observacoes[grupo.rotulo].length === 1 ? "ão" : "ões"}
                    </p>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${completo ? "bg-emerald-500" : "bg-brand-600"}`}
                    style={{ width: `${total > 0 ? (feitos / total) * 100 : 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 mt-3">
                  <span className={`badge ${STATUS_UNIDADE[status].classe}`}>{STATUS_UNIDADE[status].label}</span>
                  <button
                    type="button"
                    onClick={() => setGrupoSelecionado(grupo.rotulo)}
                    className="btn-primary !text-sm !py-1.5 !px-4"
                  >
                    {rotuloAcao} →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => exportarPlanilha(grupo.rotulo)}
                  disabled={!completo || exportando !== null}
                  className="btn-secondary !text-xs !py-1.5 w-full mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    completo
                      ? "Baixar a planilha no modelo da contabilidade"
                      : "Conclua todos os eventos da unidade para exportar"
                  }
                >
                  {exportando === grupo.rotulo ? "Gerando planilha..." : "⬇ Exportar planilha"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-lg">
              📋
            </span>
            <h2 className="font-semibold text-slate-900">Resumo das unidades</h2>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              disabled={!todosCompletos}
              onClick={() => setMostrarRelatorioDinamico(true)}
              className={`btn-secondary !text-sm !py-1.5 ${
                todosCompletos ? "!bg-white !text-ink-900 !border-ink-900" : "opacity-40 cursor-not-allowed"
              }`}
              title={
                todosCompletos
                  ? "Comparar as empresas e ver o somatório de cada coluna, pra conferência"
                  : "Termine todas as unidades pra liberar"
              }
            >
              📐 Relatório Dinâmico {todosCompletos ? "" : "(bloqueado)"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="py-2.5 px-3">Unidade</th>
                <th className="py-2.5 px-3">Colaboradores</th>
                <th className="py-2.5 px-3 min-w-[10rem]">Progresso</th>
                <th className="py-2.5 px-3">Eventos concluídos</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unidadesVisiveis.map(({ grupo, feitos, total, completo, status }) => (
                <tr key={grupo.rotulo}>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    <span aria-hidden className="mr-1.5">
                      📍
                    </span>
                    {grupo.rotulo}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{grupo.colaboradores.length}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${completo ? "bg-emerald-500" : "bg-brand-600"}`}
                          style={{ width: `${total > 0 ? (feitos / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {feitos}/{total}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{feitos}</td>
                  <td className="py-2.5 px-3">
                    <span className={`badge ${STATUS_UNIDADE[status].classe}`}>{STATUS_UNIDADE[status].label}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => exportarPlanilha(grupo.rotulo)}
                        disabled={!completo || exportando !== null}
                        className="btn-secondary !text-xs !py-1 !px-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          completo
                            ? "Baixar a planilha no modelo da contabilidade"
                            : "Conclua todos os eventos da unidade para exportar"
                        }
                      >
                        {exportando === grupo.rotulo ? "Gerando..." : "⬇ Exportar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGrupoSelecionado(grupo.rotulo)}
                        className="btn-primary !text-xs !py-1 !px-3.5"
                      >
                        {rotuloAcao}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
