"use client";

import { useState, useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { salvarFolhaLote } from "@/lib/actions-folha";
import { tiposDoGrupo } from "@/lib/folha-calculos";
import { formatarReais } from "@/lib/formatadores";
import type { GrupoFolha, ValorCelula } from "./FolhaWizard";

const TODAS = "__todas__";

// Colunas "de horas" (Referência) não são dinheiro: aparecem como número e
// não entram nos totais de PROVENTOS / DESCONTOS em reais.
function ehHoras(t: FolhaTipo): boolean {
  return /refer[eê]ncia/i.test(t.nome);
}

function formatarHoras(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return ano && mes ? `${mes}/${ano}` : competencia;
}

function tituloDoGrupo(g: GrupoFolha): string {
  const emp = g.empresaNome?.trim();
  const base = emp && emp.toUpperCase() !== g.rotulo.toUpperCase() ? `${emp} - ${g.rotulo}` : g.rotulo;
  return base.toUpperCase();
}

/** Relatório de Conferência no modelo da contabilidade: uma tabela por
 * unidade (Nome, Matrícula, PROVENTOS em verde, DESCONTOS em salmão), com o
 * total de cada coluna e o quadro PROVENTOS / DESCONTOS. Dá para ver uma
 * unidade só ou todas (com o TOTAL GERAL no fim). Libera só quando todas as
 * unidades concluem todos os eventos. */
export default function FolhaRelatorioFinal({
  competencia,
  tipos,
  grupos,
  gruposPorTipo,
  valores,
  notasIniciais,
  onVoltar,
}: {
  competencia: string;
  tipos: FolhaTipo[];
  grupos: GrupoFolha[];
  gruposPorTipo: Record<string, string[]>;
  valores: Record<string, Record<string, ValorCelula>>;
  notasIniciais: Record<string, string>;
  onVoltar: () => void;
}) {
  const [selecao, setSelecao] = useState<string>(TODAS);

  function soma(colaboradores: { id: string }[], tipoId: string): number {
    let s = 0;
    for (const c of colaboradores) s += valores[c.id]?.[tipoId]?.valor ?? 0;
    return s;
  }

  function resumoDoGrupo(g: GrupoFolha) {
    const tiposG = tiposDoGrupo(tipos, g.rotulo, gruposPorTipo);
    let proventos = 0;
    let descontos = 0;
    for (const t of tiposG) {
      if (t.formato !== "moeda" || ehHoras(t)) continue;
      const s = soma(g.colaboradores, t.id);
      if (t.categoria === "provento") proventos += s;
      else if (t.categoria === "desconto") descontos += s;
    }
    return { proventos, descontos };
  }

  const visiveis = selecao === TODAS ? grupos : grupos.filter((g) => g.rotulo === selecao);

  const geral = grupos.reduce(
    (acc, g) => {
      const r = resumoDoGrupo(g);
      return { proventos: acc.proventos + r.proventos, descontos: acc.descontos + r.descontos };
    },
    { proventos: 0, descontos: 0 }
  );

  // total geral por coluna (todas as unidades somadas)
  const colunasGeral = tipos
    .filter((t) => t.formato === "moeda" && (t.categoria === "provento" || t.categoria === "desconto"))
    .map((t) => ({ tipo: t, total: grupos.reduce((acc, g) => acc + soma(g.colaboradores, t.id), 0) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={onVoltar} className="text-sm text-slate-400 hover:text-slate-600">
          ← voltar pras unidades
        </button>
        <span className="text-sm font-bold text-slate-900">📋 Relatório de Conferência — {mesAno(competencia)}</span>
      </div>

      <div className="card !bg-slate-50 !border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          🔒 Essa tela é só pra conferir — pra corrigir algum valor, volte na unidade e revise o evento (a coluna).
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mostrar
          <select
            value={selecao}
            onChange={(e) => setSelecao(e.target.value)}
            aria-label="Escolher unidade do relatório"
            className="input !w-auto !py-1.5 !text-sm"
          >
            <option value={TODAS}>Todas as unidades</option>
            {grupos.map((g) => (
              <option key={g.rotulo} value={g.rotulo}>
                {tituloDoGrupo(g)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visiveis.map((g) => {
        const tiposG = tiposDoGrupo(tipos, g.rotulo, gruposPorTipo);
        const provs = tiposG.filter((t) => t.categoria === "provento");
        const descs = tiposG.filter((t) => t.categoria === "desconto");
        const colunas = [...provs, ...descs];
        const resumo = resumoDoGrupo(g);

        return (
          <section key={g.rotulo} className="card space-y-3">
            <div className="flex items-baseline gap-4 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{tituloDoGrupo(g)}</h2>
              <span className="text-sm font-semibold text-slate-700 border-l border-slate-400 pl-4">
                MÊS: {mesAno(competencia)}
              </span>
            </div>

            {colunas.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma coluna ativa para esta unidade.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[760px]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="border border-stone-800 bg-stone-100 px-2 py-1.5 text-center font-semibold min-w-[220px]">
                        Nome
                      </th>
                      <th rowSpan={2} className="border border-stone-800 bg-stone-100 px-2 py-1.5 text-center font-semibold w-20">
                        Matrícula
                      </th>
                      {provs.length > 0 && (
                        <th colSpan={provs.length} className="border border-stone-800 bg-[#DDF0D9] px-2 py-1.5 text-center font-semibold">
                          PROVENTOS
                        </th>
                      )}
                      {descs.length > 0 && (
                        <th colSpan={descs.length} className="border border-stone-800 bg-[#FCE3D6] px-2 py-1.5 text-center font-semibold">
                          DESCONTOS
                        </th>
                      )}
                      <th rowSpan={2} className="border border-stone-800 bg-stone-100 px-2 py-1.5 text-center font-semibold">
                        Ponto
                      </th>
                    </tr>
                    <tr>
                      {provs.map((t) => (
                        <th key={t.id} className="border border-stone-800 bg-[#DDF0D9] px-2 py-1.5 text-center text-xs font-semibold leading-tight min-w-[110px]">
                          {t.nome}
                        </th>
                      ))}
                      {descs.map((t) => (
                        <th key={t.id} className="border border-stone-800 bg-[#FCE3D6] px-2 py-1.5 text-center text-xs font-semibold leading-tight min-w-[110px]">
                          {t.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.colaboradores.map((c) => (
                      <LinhaColaborador
                        key={c.id}
                        competencia={competencia}
                        colaboradorId={c.id}
                        nome={c.nome}
                        matricula={c.matricula ?? ""}
                        provs={provs}
                        descs={descs}
                        valoresColaborador={valores[c.id] ?? {}}
                        notaInicial={notasIniciais[c.id] ?? ""}
                      />
                    ))}
                    <tr className="font-bold">
                      <td colSpan={2} className="border-t-2 border-stone-800 px-2 py-1.5" />
                      {colunas.map((t) => {
                        const cor = t.categoria === "provento" ? "bg-[#DDF0D9]" : "bg-[#FCE3D6]";
                        const total = soma(g.colaboradores, t.id);
                        return (
                          <td key={t.id} className={`border border-stone-800 border-t-2 px-2 py-1.5 text-right whitespace-nowrap ${cor}`}>
                            {t.formato !== "moeda" ? "" : ehHoras(t) ? formatarHoras(total) : formatarReais(total)}
                          </td>
                        );
                      })}
                      <td className="border-t-2 border-stone-800" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <table className="border-collapse text-sm">
              <tbody>
                <tr>
                  <td className="border border-stone-500 bg-stone-100 px-3 py-1 font-semibold min-w-[130px]">PROVENTOS</td>
                  <td className="border border-stone-500 px-3 py-1 text-right min-w-[120px]">{formatarReais(resumo.proventos)}</td>
                </tr>
                <tr>
                  <td className="border border-stone-500 bg-stone-100 px-3 py-1 font-semibold">DESCONTOS</td>
                  <td className="border border-stone-500 px-3 py-1 text-right">{formatarReais(resumo.descontos)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      {selecao === TODAS && (
        <section className="card space-y-3">
          <div className="flex items-baseline gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">TOTAL GERAL — TODAS AS UNIDADES</h2>
            <span className="text-sm font-semibold text-slate-700 border-l border-slate-400 pl-4">
              MÊS: {mesAno(competencia)}
            </span>
          </div>

          <table className="border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-stone-500 bg-stone-100 px-3 py-1 font-semibold min-w-[130px]">PROVENTOS</td>
                <td className="border border-stone-500 px-3 py-1 text-right min-w-[120px]">{formatarReais(geral.proventos)}</td>
              </tr>
              <tr>
                <td className="border border-stone-500 bg-stone-100 px-3 py-1 font-semibold">DESCONTOS</td>
                <td className="border border-stone-500 px-3 py-1 text-right">{formatarReais(geral.descontos)}</td>
              </tr>
            </tbody>
          </table>

          <details>
            <summary className="cursor-pointer text-sm text-brand-600 select-none">Ver o total geral de cada coluna</summary>
            <div className="overflow-x-auto mt-2">
              <table className="border-collapse text-sm">
                <tbody>
                  {colunasGeral.map(({ tipo, total }) => (
                    <tr key={tipo.id}>
                      <td
                        className={`border border-stone-500 px-3 py-1 ${
                          tipo.categoria === "provento" ? "bg-[#DDF0D9]" : "bg-[#FCE3D6]"
                        }`}
                      >
                        {tipo.nome}
                      </td>
                      <td className="border border-stone-500 px-3 py-1 text-right min-w-[120px]">
                        {ehHoras(tipo) ? formatarHoras(total) : formatarReais(total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function LinhaColaborador({
  competencia,
  colaboradorId,
  nome,
  matricula,
  provs,
  descs,
  valoresColaborador,
  notaInicial,
}: {
  competencia: string;
  colaboradorId: string;
  nome: string;
  matricula: string;
  provs: FolhaTipo[];
  descs: FolhaTipo[];
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

  function celula(t: FolhaTipo, fundo: string) {
    const v = valoresColaborador[t.id];
    let texto = "";
    if (t.formato === "moeda") {
      const n = v?.valor ?? 0;
      if (n !== 0) texto = ehHoras(t) ? formatarHoras(n) : formatarReais(n);
    } else {
      texto = v?.valor_texto ?? "";
    }
    return (
      <td key={t.id} className={`border border-stone-800 px-2 py-1 text-right whitespace-nowrap text-xs ${fundo}`}>
        {texto}
      </td>
    );
  }

  return (
    <tr>
      <td className="border border-stone-800 px-2 py-1 font-medium text-slate-800 whitespace-nowrap">{nome}</td>
      <td className="border border-stone-800 px-2 py-1 text-center text-slate-700">{matricula}</td>
      {provs.map((t) => celula(t, "bg-white"))}
      {descs.map((t) => celula(t, "bg-[#FEF3EC]"))}
      <td className="border border-stone-800 px-1 py-1">
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
