// "Instrumento Particular de Parceria" de SÃO PAULO: contrato dos barbeiros da unidade Alphaville.
// Usa o modelo Word da empresa (contrato-pj-sp-modelo.ts) e só preenche os dados do parceiro:
// nome, CNPJ, endereço, comissões e data. O restante (Seu Elias SP LTDA, cláusulas, foro de Barueri/SP)
// e as assinaturas do Salão Parceiro e das testemunhas ficam como estão no modelo.
// O contrato de Minas Gerais (contrato-pj.ts) não muda.

import { patchDocument, PatchType, TextRun } from "docx";
import { MODELO_PARCERIA_SP_BASE64 } from "./contrato-pj-sp-modelo";
import type { Colaborador } from "@/types/db";

const BRANCO = "________________";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09-21" -> "21 de setembro de 2026". Sem data cadastrada, usa hoje. */
function dataPorExtensoSp(iso: string | null): string {
  const base = iso && iso.length >= 10 ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = base.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1] ?? ""} de ${ano}`;
}

const COMISSAO_EXTENSO: Record<number, string> = {
  30: "trinta por cento",
  33: "trinta e três por cento",
  35: "trinta e cinco por cento",
  38: "trinta e oito por cento",
  40: "quarenta por cento",
  50: "cinquenta por cento",
};

/** Sem comissão cadastrada, mantém o 33% que já vem no modelo de São Paulo. */
function comissaoTextoSp(pct: number | null): string {
  const valor = pct && pct > 0 ? pct : 33;
  return `${valor}% (${COMISSAO_EXTENSO[valor] ?? `${valor} por cento`})`;
}

function fmtCnpj(valor: string | null | undefined): string {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return (valor ?? "").trim();
}

function nomeArquivoSeguro(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `contrato-pj-sp-${base || "colaborador"}.docx`;
}

export interface ResultadoContratoPjSp {
  ok: true;
  buffer: Buffer;
  nomeArquivo: string;
}
export interface ErroContratoPjSp {
  ok: false;
  motivo: string;
}

export async function gerarContratoPjSpDocx(
  colaborador: Pick<
    Colaborador,
    "tipo" | "nome" | "cpf_cnpj" | "endereco" | "contrato_inicio" | "comissao_corte_pct" | "comissao_quimica_pct"
  >
): Promise<ResultadoContratoPjSp | ErroContratoPjSp> {
  if (colaborador.tipo !== "PJ") {
    return { ok: false, motivo: "Esse contrato é só para colaboradores do tipo PJ." };
  }

  const nome = colaborador.nome?.trim() || BRANCO;
  const cnpj = fmtCnpj(colaborador.cpf_cnpj) || BRANCO;

  const texto: Record<string, string> = {
    PARCEIRO_NOME: nome,
    PARCEIRO_CNPJ: cnpj,
    PARCEIRO_ENDERECO: colaborador.endereco?.trim() || BRANCO,
    COMISSAO_CORTE: comissaoTextoSp(colaborador.comissao_corte_pct),
    COMISSAO_QUIMICA: comissaoTextoSp(colaborador.comissao_quimica_pct),
    DATA_CONTRATO: dataPorExtensoSp(colaborador.contrato_inicio),
    ASS_NOME: nome,
    ASS_CNPJ: cnpj,
  };

  const patches: Record<string, { type: typeof PatchType.PARAGRAPH; children: TextRun[] }> = {};
  for (const [chave, valor] of Object.entries(texto)) {
    patches[chave] = { type: PatchType.PARAGRAPH, children: [new TextRun(valor)] };
  }

  const buffer = (await patchDocument({
    outputType: "nodebuffer",
    data: Buffer.from(MODELO_PARCERIA_SP_BASE64, "base64"),
    patches,
    keepOriginalStyles: true,
  })) as Buffer;

  return { ok: true, buffer, nomeArquivo: nomeArquivoSeguro(colaborador.nome ?? "") };
}
