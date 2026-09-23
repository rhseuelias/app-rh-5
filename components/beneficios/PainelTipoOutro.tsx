"use client";

import { useMemo, useState } from "react";
import type { BeneficioTransporte } from "@/types/db";
import { formatarReais } from "@/lib/formatadores";
import { calcularEntradaTransporte } from "@/lib/beneficios-calculos";
import LinhaTransporteForm from "./LinhaTransporteForm";
import AdicionarTransporte from "./AdicionarTransporte";

export interface LinhaOutro {
  colaboradorId: string;
  nome: string;
  tr: BeneficioTransporte;
}

export default function PainelTipoOutro({
  competencia,
  tipo,
  comCartao,
  mesFechado,
  linhas,
  colaboradoresParaAdicionar,
}: {
  competencia: string;
  tipo: string;
  comCartao: boolean;
  mesFechado: boolean;
  linhas: LinhaOutro[];
  colaboradoresParaAdicionar: { id: string; nome: string }[];
}) {
  const [busca, setBusca] = useState("");
  const [modoFiltro, setModoFiltro] = useState<"todos" | "km" | "viagens">("todos");
  const [visao, setVisao] = useState<"compacto" | "detalhado">("compacto");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      if (modoFiltro !== "todos" && l.tr.modo !== modoFiltro) return false;
      return true;
    });
  }, [linhas, busca, modoFiltro]);

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
        <select value={modoFiltro} onChange={(e) => setModoFiltro(e.target.value as any)} className="input !w-auto !text-xs !py-1.5">
          <option value="todos">Todos os modos</option>
          <option value="km">Km rodado</option>
          <option value="viagens">Viagens/dia</option>
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
                <th className="py-1.5 px-4 border-b border-slate-200">Modo</th>
                {comCartao && <th className="py-1.5 px-4 border-b border-slate-200">N° do cartão</th>}
                <th className="py-1.5 px-4 border-b border-slate-200 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.tr.id} className="border-b border-slate-100 even:bg-slate-50/60">
                  <td className="py-2 px-4 font-medium text-slate-800">{l.nome}</td>
                  <td className="py-2 px-4">
                    <span className="text-[10px] font-semibold uppercase text-violet-600 bg-violet-50 rounded px-1.5 py-0.5">
                      {l.tr.modo === "km" ? "Km rodado" : "Viagens/dia"}
                    </span>
                  </td>
                  {comCartao && <td className="py-2 px-4 text-slate-500">{l.tr.numero_cartao || "—"}</td>}
                  <td className="py-2 px-4 text-right font-bold text-slate-800">{formatarReais(calcularEntradaTransporte(l.tr))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs uppercase">
                <th className="py-2 px-4">Colaborador</th>
                <th className="py-2 px-4">Modo</th>
                <th className="py-2 px-4">Cálculo</th>
                {comCartao && <th className="py-2 px-4">N° do Cartão</th>}
                <th className="py-2 px-4">Total</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <LinhaTransporteForm
                  key={l.tr.id}
                  competencia={competencia}
                  colaboradorId={l.colaboradorId}
                  tipo={tipo}
                  comCartao={comCartao}
                  mesFechado={mesFechado}
                  lancamento={l.tr}
                  mostrarNome
                  nomeColaborador={l.nome}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!mesFechado && colaboradoresParaAdicionar.length > 0 && (
        <div className="border-t border-slate-100">
          <AdicionarTransporte competencia={competencia} tipo={tipo} colaboradores={colaboradoresParaAdicionar} />
        </div>
      )}
    </div>
  );
}
