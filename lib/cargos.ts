export interface Responsabilidade {
  titulo: string;
  itens: string[];
}
export interface ResultadoEsperado {
  resp: string;
  res: string;
}
export interface Indicador {
  nome: string;
  meta: string;
  freq: string;
}
export interface CenarioCargo {
  titulo: string;
  /** O que se espera ouvir do candidato (um item por linha na edição). */
  sinais: string[];
}
export interface CargoDesc {
  id: string;
  cargo: string;
  empresa: string;
  departamento: string | null;
  cbo: string | null;
  identificador: string | null;
  missao: string | null;
  sumaria: string | null;
  resp: Responsabilidade[];
  sucesso: string[];
  resultados: ResultadoEsperado[];
  indicadores: Indicador[];
  escolaridade: string | null;
  experiencia: string | null;
  habilitacao: string | null;
  tecnicos: string[];
  comportamentais: string[];
  cenarios: CenarioCargo[];
}

export const CAMPOS_CARGO = [
  "cargo", "empresa", "departamento", "cbo", "identificador", "missao", "sumaria", "resp", "sucesso", "resultados",
  "indicadores", "escolaridade", "experiencia", "habilitacao", "tecnicos", "comportamentais", "cenarios",
] as const;

export function cargoCompleto(c: CargoDesc): boolean {
  return !!(c.missao && c.sumaria && c.resp.length && c.resultados.length && c.indicadores.length);
}
