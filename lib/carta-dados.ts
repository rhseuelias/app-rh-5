// Dados e textos da carta de aviso (usados pelo PDF e pelo Word).
// Os textos são modelos: confira com a contabilidade antes de usar.

import { br, dataValida, fDias, somarDias, type TipoAviso } from "@/lib/desligamento";

export interface EmpresaCarta {
  razao: string;
  cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface DadosCarta {
  tipo: TipoAviso;
  empresa: EmpresaCarta;
  colaborador: { nome: string; cpf: string; admissao: string | null; endereco: string };
  comunicacao: string; // AAAA-MM-DD
  ultimoDia: string; // AAAA-MM-DD
  diasAviso: number | null;
  homologacao: { data: string | null; hora: string | null; local: string | null } | null;
}

/** Empresas do grupo que já têm endereço cadastrado (a carta já sai preenchida). */
const EMPRESAS_CONHECIDAS: EmpresaCarta[] = [
  {
    razao: "BARBERDAY - CENTRO DE TREINAMENTO PARA BARBEIROS LTDA",
    cnpj: "55.581.259/0001-65",
    endereco: "Alameda Rio Negro",
    numero: "500",
    complemento: "Andar 6, Bloco 2, Cond West Towers, Sala 601 a 608",
    bairro: "Alphaville",
    cidade: "Barueri",
    uf: "SP",
  },
  {
    razao: "SEU ELIAS BARBA, CABELO E BIGODE SP LTDA ME",
    cnpj: "60.274.535/0001-82",
    endereco: "Alameda Araguaia",
    numero: "750",
    complemento: "LOJA 10 COND EDIFICIO ARAGUAIA",
    bairro: "ALPHAVILLE INDUSTRIAL",
    cidade: "Barueri",
    uf: "SP",
  },
];

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/** Endereço já conhecido para esse CNPJ (ou null). */
export function empresaConhecidaPorCnpj(cnpj: string | null | undefined): EmpresaCarta | null {
  const d = soDigitos(cnpj);
  if (d.length < 14) return null;
  return EMPRESAS_CONHECIDAS.find((e) => soDigitos(e.cnpj) === d) ?? null;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d} de ${MESES[Number(m) - 1]} de ${a}`;
}

export const TITULO_CARTA: Record<TipoAviso, string> = {
  trabalhado: "AVISO PRÉVIO TRABALHADO",
  indenizado: "AVISO PRÉVIO INDENIZADO",
  acordo: "COMUNICADO DE RESCISÃO POR ACORDO (ART. 484-A DA CLT)",
};

/** Parágrafos do corpo da carta, por tipo. */
export function paragrafosCarta(d: DadosCarta): string[] {
  const ultimo = br(d.ultimoDia);
  const h = d.homologacao;
  const dataHom = h?.data && dataValida(h.data) ? br(h.data) : "____/____/_______";
  const hora = h?.hora?.trim() ? ` às ${h.hora.trim()}` : "";
  const local = h?.local?.trim() ? `, em ${h.local.trim()}` : "";
  const comparecimento =
    `Aguardamos seu comparecimento na data de ${dataHom}${hora}${local}, ` +
    "para recebimento das verbas rescisórias existentes e o cumprimento das formalidades legais exigidas para a Rescisão Contratual.";

  let abertura: string[];
  if (d.tipo === "indenizado") {
    abertura = [
      "Pelo presente, comunicamos a V.Sa. que não mais convindo a esta empresa manter seu contrato de trabalho, " +
        "vimos por meio deste, rescindí-lo, na forma da Legislação pertinente, encontrando-se V.Sa. dispensado(a) " +
        "do cumprimento do Aviso Prévio, que lhe será pago de forma indenizatória junto às demais verbas rescisórias, " +
        `devendo cessar suas atividades a partir de ${ultimo}.`,
    ];
  } else if (d.tipo === "trabalhado") {
    const dias = d.diasAviso ?? 30;
    abertura = [
      "Pelo presente, comunicamos a V.Sa. que não mais convindo a esta empresa manter seu contrato de trabalho, " +
        "vimos por meio deste, rescindí-lo, na forma da Legislação pertinente, devendo V.Sa. cumprir o Aviso Prévio " +
        `de ${fDias(dias)}, com início em ${br(somarDias(d.comunicacao, 1))} e término em ${ultimo}, sendo este o seu último dia de trabalho.`,
      "Durante o aviso, V.Sa. tem direito à redução de 2 (duas) horas diárias na jornada de trabalho, sem prejuízo do " +
        "salário integral, ou, se preferir cumprir a jornada normal, a faltar 7 (sete) dias corridos ao final do período " +
        "(art. 488 da CLT).",
    ];
  } else {
    abertura = [
      "Pelo presente, comunicamos a V.Sa. que, de comum acordo entre as partes, nos termos do art. 484-A da CLT, " +
        `o contrato de trabalho fica extinto a partir de ${ultimo}, sendo o Aviso Prévio indenizado e pago pela ` +
        "metade, junto às demais verbas rescisórias.",
    ];
  }
  return [...abertura, comparecimento, "Solicitamos a devolução da cópia deste com o seu ciente."];
}

export function assinaturasCarta(d: DadosCarta): string[] {
  return [d.empresa.razao || "Empresa", d.colaborador.nome, "Responsável legal (quando menor de 18 anos)."];
}

export function cidadeEData(d: DadosCarta): string {
  return `${d.empresa.cidade ? `${d.empresa.cidade}, ` : ""}${dataPorExtenso(d.comunicacao)}.`;
}
