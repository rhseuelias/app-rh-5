import { getDaysInMonth, getDay } from "date-fns";
import SugerirFeriasBotao from "./SugerirFeriasBotao";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface CelulaMapa {
  cor: string;
  titulo: string;
  conflito: boolean;
}

export interface LinhaMapa {
  id: string;
  nome: string;
  periodoAbertoId: string | null;
  dias: Record<string, CelulaMapa>; // chave "YYYY-MM-DD"
}

function chave(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export default function MapaFerias({
  ano,
  meses,
  linhas,
}: {
  ano: number;
  meses: number[]; // 0-indexado (0 = Janeiro)
  linhas: LinhaMapa[];
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
                  <th className="sticky left-0 bg-white text-left text-slate-500 font-medium px-2 py-1 min-w-[160px] border-b border-slate-200">
                    Colaborador
                  </th>
                  {diasArray.map((d) => {
                    const fimDeSemana = [0, 6].includes(getDay(new Date(ano, mes, d)));
                    return (
                      <th
                        key={d}
                        className={`w-6 text-center font-normal border-b border-slate-200 ${
                          fimDeSemana ? "text-slate-300 bg-slate-50" : "text-slate-400"
                        }`}
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
                      <SugerirFeriasBotao colaboradorId={linha.id} periodoAquisitivoId={linha.periodoAbertoId} />
                    </td>
                    {diasArray.map((d) => {
                      const celula = linha.dias[chave(ano, mes, d)];
                      return (
                        <td key={d} className="text-center py-1.5">
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
