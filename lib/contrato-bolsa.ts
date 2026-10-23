// "Contrato Bolsa": Termo de Concessão de Bolsa de Estudos (complementa o Contrato de Parceria).
// Usa o modelo Word da empresa (contrato-bolsa-modelo.ts) e só preenche os campos:
// dados do parceiro, dados do Salão-Parceiro (empresa), curso, valor, parcelas, foro e data.
// Não mexe no Instrumento de Parceria (contrato-pj.ts), que continua como sempre.

import { patchDocument, PatchType, TextRun } from "docx";
import { MODELO_BOLSA_BASE64 } from "./contrato-bolsa-modelo";

const BRANCO = "________________";

export interface ParceiroBolsa {
  nome: string;
  /** "Feminino" | "Masculino" | null: define brasileiro/brasileira, casado/casada. */
  sexo?: string | null;
  estadoCivil?: string | null;
  rg?: string | null;
  /** Campo CPF/CNPJ do cadastro: 11 dígitos = CPF, 14 dígitos = CNPJ. */
  cpfCnpj?: string | null;
  endereco?: string | null;
  /** Início do Contrato de Parceria (AAAA-MM-DD). */
  contratoInicio?: string | null;
}

export interface SalaoBolsa {
  razao: string;
  cnpj: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
}

export interface DadosBolsa {
  parceiro: ParceiroBolsa;
  salao: SalaoBolsa;
  curso: string;
  valorMensalidade: number;
  parcelas: number;
}

// ---------- números por extenso ----------

const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function unidade(n: number, fem: boolean): string {
  if (fem && n === 1) return "uma";
  if (fem && n === 2) return "duas";
  return UN[n];
}

function ate999(n: number, fem: boolean): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(fem ? CT[c].replace(/ntos$/, "ntas") : CT[c]);
  if (r) {
    if (r < 20) partes.push(unidade(r, fem));
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DZ[d]} e ${unidade(u, fem)}` : DZ[d]);
    }
  }
  return partes.join(" e ");
}

/** 0 a 999.999. */
export function porExtenso(n: number, fem = false): string {
  if (n === 0) return "zero";
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const textoMil = mil ? (mil === 1 ? "mil" : `${ate999(mil, fem)} mil`) : "";
  const textoResto = resto ? ate999(resto, fem) : "";
  if (textoMil && textoResto) {
    const juntar = resto < 100 || resto % 100 === 0 ? " e " : " ";
    return textoMil + juntar + textoResto;
  }
  return textoMil || textoResto;
}

export function valorPorExtenso(v: number): string {
  const reais = Math.floor(v + 1e-9);
  const cent = Math.round((v - reais) * 100);
  const partes: string[] = [];
  if (reais > 0) partes.push(`${porExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  if (cent > 0) partes.push(`${porExtenso(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ") || "zero real";
}

// ---------- formatação ----------

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

function fmtCpf(d: string) {
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}
function fmtCnpj(d: string) {
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function separarDocumento(cpfCnpj: string | null | undefined): { cpf: string; cnpj: string } {
  const d = soDigitos(cpfCnpj);
  if (d.length === 11) return { cpf: fmtCpf(d), cnpj: "" };
  if (d.length === 14) return { cpf: "", cnpj: fmtCnpj(d) };
  return { cpf: "", cnpj: (cpfCnpj ?? "").trim() };
}

function dataBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "__/__/____";
}

function dataHojePorExtenso(): string {
  try {
    return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).replace(/^(\d+) de /, "$1 de ");
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function qualificacaoParceiro(p: ParceiroBolsa, cpf: string, cnpj: string): string {
  const fem = p.sexo === "Feminino";
  const masc = p.sexo === "Masculino";
  const g = (m: string, f: string, ambos: string) => (fem ? f : masc ? m : ambos);
  const nacionalidade = g("brasileiro", "brasileira", "brasileiro(a)");
  const civil: Record<string, string> = {
    solteiro: g("solteiro", "solteira", "solteiro(a)"),
    casado: g("casado", "casada", "casado(a)"),
    divorciado: g("divorciado", "divorciada", "divorciado(a)"),
    viuvo: g("viúvo", "viúva", "viúvo(a)"),
    uniao_estavel: "em união estável",
  };
  const estadoCivil = (p.estadoCivil && civil[p.estadoCivil]) || `estado civil ${BRANCO}`;
  const partes = [
    p.nome || BRANCO,
    nacionalidade,
    estadoCivil,
    "profissional de barbearia",
    `RG nº ${p.rg?.trim() || BRANCO}`,
    `CPF nº ${cpf || BRANCO}`,
  ];
  if (cnpj) partes.push(`CNPJ nº ${cnpj}`);
  partes.push(`residente na ${p.endereco?.trim() || BRANCO}`);
  return partes.join(", ");
}

function enderecoSalao(s: SalaoBolsa): string {
  const rua = [s.endereco?.trim(), s.numero?.trim() ? `nº ${s.numero.trim()}` : "", s.complemento?.trim()].filter(Boolean).join(", ");
  const partes = [rua || BRANCO, s.bairro?.trim(), s.cep?.trim() ? `CEP ${s.cep.trim()}` : "", [s.cidade?.trim(), s.uf?.trim()].filter(Boolean).join("/")].filter(Boolean);
  return partes.join(", ");
}

function nomeArquivoSeguro(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `Contrato_Bolsa_${base || "parceiro"}.docx`;
}

export interface ResultadoBolsa {
  ok: true;
  buffer: Buffer;
  nomeArquivo: string;
}

export async function gerarContratoBolsaDocx(d: DadosBolsa): Promise<ResultadoBolsa> {
  const { cpf, cnpj } = separarDocumento(d.parceiro.cpfCnpj);
  const cidadeUf = [d.salao.cidade?.trim(), d.salao.uf?.trim()].filter(Boolean).join("/") || "________/__";
  const salaoCnpj = soDigitos(d.salao.cnpj).length === 14 ? fmtCnpj(soDigitos(d.salao.cnpj)) : d.salao.cnpj;

  const texto: Record<string, string> = {
    PARCEIRO_QUALIFICACAO: qualificacaoParceiro(d.parceiro, cpf, cnpj),
    DATA_PARCERIA: dataBR(d.parceiro.contratoInicio),
    SALAO_RAZAO: d.salao.razao || BRANCO,
    SALAO_CNPJ: salaoCnpj || BRANCO,
    SALAO_ENDERECO: enderecoSalao(d.salao),
    // o app ainda não guarda o representante legal do salão: fica em branco para preencher no Word
    SALAO_REPRESENTANTE: BRANCO,
    SALAO_REPRESENTANTE_CPF: BRANCO,
    CURSO: d.curso,
    VALOR_MENSALIDADE: `R$ ${d.valorMensalidade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${valorPorExtenso(d.valorMensalidade)})`,
    PARCELAS: `${d.parcelas} (${porExtenso(d.parcelas, true)})`,
    CIDADE_UF: cidadeUf,
    DATA_EXTENSO: dataHojePorExtenso(),
    ASS_PARCEIRO_NOME: d.parceiro.nome || BRANCO,
    ASS_PARCEIRO_CPF: cpf || BRANCO,
    ASS_SALAO_RAZAO: d.salao.razao || BRANCO,
    ASS_SALAO_CNPJ: salaoCnpj || BRANCO,
  };

  const patches: Record<string, { type: typeof PatchType.PARAGRAPH; children: TextRun[] }> = {};
  for (const [chave, valor] of Object.entries(texto)) {
    patches[chave] = { type: PatchType.PARAGRAPH, children: [new TextRun(valor)] };
  }

  const buffer = (await patchDocument({
    outputType: "nodebuffer",
    data: Buffer.from(MODELO_BOLSA_BASE64, "base64"),
    patches,
    keepOriginalStyles: true,
  })) as Buffer;

  return { ok: true, buffer, nomeArquivo: nomeArquivoSeguro(d.parceiro.nome) };
}
