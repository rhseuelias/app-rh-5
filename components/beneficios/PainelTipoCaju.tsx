"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { BeneficioExtra, BeneficioTransporte } from "@/types/db";
import { formatarReais } from "@/lib/formatadores";
import { salvarExtras, salvarTransporte } from "@/lib/actions-beneficios";
import LinhaTransporteCajuForm from "./LinhaTransporteCajuForm";
import AdicionarTransporte from "./AdicionarTransporte";
import ExtrasForm from "./ExtrasForm";

export interface LinhaCaju {
  colaboradorId: string;
  nome: string;
  entradasCaju: BeneficioTransporte[];
  extra?: BeneficioExtra;
  alimentacao: number;
  premio: number;
  outros: number;
  totalCaju: number;
}

export default function PainelTipoCaju({
  competencia,
  tipo,
  mesFechado,
  linhas,
}: {
  competencia: string;
  tipo: string;
  mesFechado: boolean;
  linhas: LinhaCaju[];
}) {
  const [busca, setBusca] = useState("");
  const [modoFiltro, setModoFiltro] = useState<"todos" | "km" | "viagens" | "sem">("todos");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "ok" | "conferir">("todos");
  const [visao, setVisao] = useState<"compacto" | "detalhado">("compacto");
  const [isSaving, startSaving] = useTransition();
  const [salvo, setSalvo] = useState(false);

  // Guarda o valor atual de cada linha (transporte e extras), atualizado a
  // cada digitação pelos filhos. O botão "Salvar" do final lê tudo daqui e
  // manda salvar de uma vez, em vez de cada linha ter seu próprio botão.
  const draftsTransporte = useRef(new Map<string, Record<string, string>>()).current;
  const draftsExtras = useRef(new Map<string, Record<string, string>>()).current;

  function registrarTransporte(id: string, campos: Record<string, string>) {
    draftsTransporte.set(id, campos);
  }

  function registrarExtras(colaboradorId: string, campos: Record<string, string>) {
    draftsExtras.set(colaboradorId, campos);
  }

  function salvarTudo() {
    setSalvo(false);
    startSaving(async () => {
      const chamadas: Promise<unknown>[] = [];
      draftsTransporte.forEach((campos) => {
        const fd = new FormData();
        Object.entries(campos).forEach(([k, v]) => fd.set(k, v));
        chamadas.push(salvarTransporte(fd));
      });
      draftsExtras.forEach((campos) => {
        const fd = new FormData();
        Object.entries(campos).forEach(([k, v]) => fd.set(k, v));
        chamadas.push(salvarExtras(fd));
      });
      await Promise.all(chamadas);
      setSalvo(true);
    });
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      if (modoFiltro === "sem" && l.entradasCaju.length > 0) return false;
      if ((modoFiltro === "km" || modoFiltro === "viagens") && !l.entradasCaju.some((e) => e.modo === modoFiltro)) return false;
      const status = l.totalCaju > 0 ? "ok" : "conferir";
      if (statusFiltro !== "todos" && statusFiltro !== status) return false;
      return true;
    });
  }, [linhas, busca, modoFiltro, statusFiltro]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar colaborador..."
          className="input !text-xs !py-1.5 flex-1 min-w-[160px]"
        />
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as any)} className="input !w-auto !text-xs !py-1.5">
          <option value="todos">Todos os status</option>
          <option value="ok">OK</option>
          <option value="conferir">Conferir</option>
        </select>
        <select value={modoFiltro} onChange={(e) => setModoFiltro(e.target.value as any)} className="input !w-auto !text-xs !py-1.5">
          <option value="todos">Todos os modos</option>
          <option value="km">Km rodado</option>
          <option value="viagens">Viagens/dia</option>
          <option value="sem">Sem CAJU no transporte</option>
        </select>
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 ml-auto">
          <button
            type="button"
            onClick={() => setVisao("compacto")}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md ${visao === "compacto" ? "bg-ink-900 text-white" : "text-slate-500"}`}
          >
            Compacto
          </button>
          <button
            type="button"
            onClick={() => setVisao("detalhado")}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md ${visao === "detalhado" ? "bg-ink-900 text-white" : "text-slate-500"}`}
          >
            Detalhado
          </button>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-xs text-slate-400 p-4">Nenhum colaborador encontrado com esse filtro.</p>
      ) : visao === "compacto" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-400 text-[10px] uppercase">
                <th className="py-1.5 px-4 border-b border-slate-200">Colaborador</th>
                <th className="py-1.5 px-4 border-b border-slate-200">Transporte</th>
                <th className="py-1.5 px-4 border-b border-slate-200 text-right">Alimentação</th>
                <th className="py-1.5 px-4 border-b border-slate-200 text-right">Prêmio</th>
                <th className="py-1.5 px-4 border-b border-slate-200 text-right">Outros</th>
                <th className="py-1.5 px-4 border-b border-slate-200 text-right">Total</th>
                <th className="py-1.5 px-4 border-b border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => {
                const status = l.totalCaju > 0 ? "ok" : "conferir";
                return (
                  <tr key={l.colaboradorId} className="border-b border-slate-100 even:bg-slate-50/60">
                    <td className="py-2 px-4 font-bold text-slate-900 text-sm">{l.nome}</td>
                    <td className="py-2 px-4 text-slate-500">
                      {l.entradasCaju.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        l.entradasCaju.map((tr, i) => (
                          <span key={tr.id} className="inline-flex items-center gap-1 mr-2">
                            <span className="text-[10px] font-semibold uppercase text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                              {tr.modo === "km" ? "Km" : "Viag/dia"}
                            </span>
                          </span>
                        ))
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-600">{formatarReais(l.alimentacao)}</td>
                    <td className="py-2 px-4 text-right text-slate-600">{formatarReais(l.premio)}</td>
                    <td className="py-2 px-4 text-right text-slate-600">{formatarReais(l.outros)}</td>
                    <td className="py-2 px-4 text-right font-bold text-slate-800">{formatarReais(l.totalCaju)}</td>
                    <td className="py-2 px-4">
                      {status === "ok" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Conferir
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 px-4">Colaborador</th>
                  <th className="py-2 px-4">Transporte (CAJU)</th>
                  <th className="py-2 px-4">Alimentação / Prêmio / Outros</th>
                  <th className="py-2 px-4">Total no CAJU</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.colaboradorId} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="py-3 px-4 font-bold text-slate-900 text-base whitespace-nowrap">{l.nome}</td>
                    <td className="py-3 px-4 min-w-[280px]">
                      {l.entradasCaju.length === 0 && <p className="text-xs text-slate-400 mb-1.5">Sem CAJU no transporte</p>}
                      {l.entradasCaju.map((tr) => (
                        <LinhaTransporteCajuForm
                          key={tr.id}
                          competencia={competencia}
                          colaboradorId={l.colaboradorId}
                          tipo={tipo}
                          mesFechado={mesFechado}
                          lancamento={tr}
                          onChange={registrarTransporte}
                        />
                      ))}
                      {!mesFechado && (
                        <AdicionarTransporte competencia={competencia} tipo={tipo} colaboradores={[{ id: l.colaboradorId, nome: l.nome }]} />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <ExtrasForm
                        competencia={competencia}
                        colaboradorId={l.colaboradorId}
                        mesFechado={mesFechado}
                        extra={l.extra}
                        onChange={registrarExtras}
                      />
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">{formatarReais(l.totalCaju)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!mesFechado && (
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
              {salvo && !isSaving && <span className="text-xs text-emerald-600 font-semibold">✓ Salvo</span>}
              <button
                type="button"
                disabled={isSaving}
                onClick={salvarTudo}
                className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2 disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
