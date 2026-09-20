import { getDaysInMonth, getDay } from "date-fns";
import EditarPeriodosSimulados, { type PeriodoEditavel } from "./EditarPeriodosSimulados";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface CelulaSimulacao {
  cor: string;
  titulo: string;
  conflito: boolean;
}

export interface LinhaSimulacao {
  id: string;
  nome: string;
  dias: Record<string, CelulaSimulacao>; // chave "YYYY-MM-DD"
  periodos: PeriodoEditavel[];
}

export const LEGENDA_SIMULACAO = [
  { label: "Férias programadas (real)", cor: "bg-blue-500" },
  { label: "Definidas manualmente", cor: "bg-emerald-500" },
  { label: "Geradas automaticamente", cor: "bg-amber-400" },
  { label: "Conflito / data inválida", cor: "bg-red-500 ring-2 ring-red-500" },
  { label: "Feriado", cor: "bg-fuchsia-200" },
  { label: "Dia normal", cor: "bg-white border border-slate-200" },
];

function chave(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export default function MapaSimulacao({
  ano,
  meses,
  linhas,
  feriados,
  cenarioId,
}: {
  ano: number;
  meses: number[]; // 0-indexado
  linhas: LinhaSimulacao[];
  feriados: Set<string>;
  cenarioId: string;
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">Nenhum colaborador nesse filtro.</p>;
  }

  return (
    <div className="space-y-6">
      {meses.map((mes) => {
        const totalDias = getDaysInMonth(new Date(ano, mes, 1));
        const diasArray = Array.from({ length: totalDias }, (_, i) => i + 1);

        return (
          <div key={mes} className="overflow-x-auto">
            <p className="text-xs font-display font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {NOMES_MES[mes]} de {ano}
            </p>
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white text-left text-slate-500 font-medium px-2 py-1 min-w-[180px] border-b border-slate-200">
                    Colaborador
                  </th>
                  {diasArray.map((d) => {
                    const dataDia = new Date(ano, mes, d);
                    const fimDeSemana = [0, 6].includes(getDay(dataDia));
                    const feriado = feriados.has(chave(ano, mes, d));
                    return (
                      <th
                        key={d}
                        className={`w-6 text-center font-normal border-b border-slate-200 ${
                          feriado ? "bg-fuchsia-100 text-fuchsia-700" : fimDeSemana ? "text-slate-300 bg-slate-50" : "text-slate-400"
                        }`}
                        title={feriado ? "Feriado" : undefined}
                      >
                        {d}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.id} className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap">
                      <span className="text-slate-700">{linha.nome}</span>{" "}
                      <EditarPeriodosSimulados cenarioId={cenarioId} colaboradorId={linha.id} periodos={linha.periodos} />
                    </td>
                    {diasArray.map((d) => {
                      const celula = linha.dias[chave(ano, mes, d)];
                      const feriado = feriados.has(chave(ano, mes, d));
                      return (
                        <td key={d} className={`text-center py-1.5 ${feriado && !celula ? "bg-fuchsia-50" : ""}`}>
                          {celula ? (
                            <span
                              title={celula.titulo}
                              className={`inline-block w-4 h-4 rounded-sm ${celula.cor} ${
                                celula.conflito ? "ring-2 ring-red-500 ring-offset-1" : ""
                              }`}
                            />
                          ) : (
                            <span className="inline-block w-4 h-4" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
