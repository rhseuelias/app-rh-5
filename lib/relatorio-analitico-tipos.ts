// Formato dos dados do Relatório Analítico da Folha (usado pela tela e pelo PDF).

export interface ColunaRel {
  id: string;
  nome: string;
  codigo: string; // número da verba (17, 42, 431...) ou ""
  rotulo: string; // nome sem o código nem o "- Valor"/"- Referência"
  grupo: "provento" | "desconto";
  formato: "moeda" | "texto" | "sim_nao";
  horas: boolean; // coluna de horas (Referência): não entra nos totais em R$
  destaque: boolean; // coluna destacada em vermelho (431)
}

export interface LinhaRel {
  id: string;
  nome: string;
  ponto: string;
  valores: Record<string, string>; // texto pronto para mostrar, por coluna
  numeros: Record<string, number>; // valor numérico das colunas de moeda
  totalP: number;
  totalD: number;
}

export interface GrupoRel {
  rotulo: string; // ex.: "BSE-Savassi" ou "BDU"
  empresa: string;
  colunas: ColunaRel[]; // só as colunas que têm algum valor neste grupo
  linhas: LinhaRel[];
  totaisColuna: Record<string, number>;
  totalP: number;
  totalD: number;
}

export interface ResumoUnidadeRel {
  rotulo: string;
  funcionarios: number;
  totalP: number;
  totalD: number;
}

export interface ResumoColunaRel {
  coluna: ColunaRel;
  total: number;
}

export interface RelatorioAnalitico {
  competencia: string;
  rotuloMes: string;
  periodo: string;
  escopoRotulo: string;
  mesFechado: boolean;
  grupos: GrupoRel[];
  resumoUnidades: ResumoUnidadeRel[];
  resumoColunas: ResumoColunaRel[];
  totalFuncionarios: number;
  totalP: number;
  totalD: number;
  geradoEm: string;
}

export interface OpcaoEscopo {
  chave: string;
  rotulo: string;
}
