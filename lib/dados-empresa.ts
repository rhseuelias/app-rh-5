// Dados cadastrais de empresa/unidade (razão social, CNPJ e endereço).
// É a FONTE ÚNICA para qualquer documento que precise desses dados
// (Aviso Prévio, e outros que vierem). Os dados são cadastrados em
// Projeção de Custo > Empresas / Unidades.
//
// Este arquivo não acessa o banco: recebe a empresa e a unidade já lidas e
// devolve os dados prontos. Assim pode ser usado tanto em telas quanto em
// rotas de PDF/Word.

import { empresaConhecidaPorCnpj, type EmpresaCarta } from "@/lib/carta-dados";

export interface DadosEmpresa extends EmpresaCarta {
  cep: string;
}

/** Campos que empresa e unidade têm em comum no cadastro. */
export interface OrigemDadosEmpresa {
  nome?: string | null;
  razao_social?: string | null;
  cnpj?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

const t = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Junta os dados da unidade com os da empresa.
 * - Razão social e CNPJ: o da unidade, se tiver; senão o da empresa.
 * - Endereço: se a unidade tem endereço próprio, usa o endereço completo dela
 *   (sem misturar rua de um lugar com cidade de outro); senão usa o da empresa.
 * - O que ainda estiver vazio é completado com os endereços que o app já
 *   conhecia pelo CNPJ.
 */
export function combinarDadosEmpresa(
  empresa?: OrigemDadosEmpresa | null,
  unidade?: OrigemDadosEmpresa | null
): DadosEmpresa {
  const usarUnidade = t(unidade?.endereco) !== "";
  const fonte: OrigemDadosEmpresa = (usarUnidade ? unidade : empresa) ?? {};

  const cnpj = t(unidade?.cnpj) || t(empresa?.cnpj);
  const conhecida = empresaConhecidaPorCnpj(cnpj);

  return {
    razao: t(unidade?.razao_social) || t(empresa?.razao_social) || conhecida?.razao || t(empresa?.nome),
    cnpj: conhecida?.cnpj || cnpj,
    cep: t(fonte.cep),
    endereco: t(fonte.endereco) || conhecida?.endereco || "",
    numero: t(fonte.numero) || conhecida?.numero || "",
    complemento: t(fonte.complemento) || conhecida?.complemento || "",
    bairro: t(fonte.bairro) || conhecida?.bairro || "",
    cidade: t(fonte.cidade) || conhecida?.cidade || "",
    uf: (t(fonte.uf) || conhecida?.uf || "").toUpperCase().slice(0, 2),
  };
}

/** true quando o cadastro tem o mínimo para sair num documento. */
export function cadastroEmpresaCompleto(o?: OrigemDadosEmpresa | null): boolean {
  if (!o) return false;
  return [o.cnpj, o.endereco, o.numero, o.bairro, o.cidade, o.uf].every((v) => t(v) !== "");
}

/** true quando a unidade tem endereço próprio cadastrado. */
export function unidadeTemEnderecoProprio(o?: OrigemDadosEmpresa | null): boolean {
  return t(o?.endereco) !== "";
}
