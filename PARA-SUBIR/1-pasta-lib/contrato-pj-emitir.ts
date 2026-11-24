// Escolhe qual modelo de contrato PJ usar para o colaborador.
//
// - PJ da BDU na área comercial/vendas  -> "Contrato de Prestação de Serviços de Empreitada"
// - PJ da unidade Alphaville (São Paulo)  -> "Instrumento Particular de Parceria" de São Paulo (Seu Elias SP LTDA)
// - todos os demais PJ (barbeiros, Atendimento etc.) -> "Instrumento Particular de Parceria" (modelo de sempre, Minas Gerais)
//
// O contrato dos barbeiros NÃO muda: só entra no modelo novo quem é da BDU e do comercial.

import { ehAlphaville, gerarContratoPjDocx, type ErroContratoPJ, type ResultadoContratoPJ, type SupabaseComStorage } from "@/lib/contrato-pj";
import { ehContratoComercialBDU, gerarContratoPjComercialDocx } from "@/lib/contrato-pj-comercial";
import { gerarContratoPjSpDocx } from "@/lib/contrato-pj-sp";
import type { Colaborador, ConfigAssinaturasPJ, Empresa } from "@/types/db";

export type ModeloContratoPj = "comercial_bdu" | "parceria" | "parceria_sp";

export const ROTULO_MODELO_CONTRATO_PJ: Record<ModeloContratoPj, string> = {
  comercial_bdu: "Contrato de prestação de serviços (BDU, área comercial)",
  parceria: "Instrumento de parceria (barbeiros)",
  parceria_sp: "Instrumento de parceria de São Paulo (Alphaville)",
};

export function modeloContratoPj(
  colaborador: Pick<Colaborador, "tipo" | "departamento">,
  empresaNome: string | null | undefined,
  nomeUnidade?: string | null
): ModeloContratoPj {
  if (colaborador.tipo === "PJ" && ehContratoComercialBDU(empresaNome, colaborador.departamento)) return "comercial_bdu";
  if (colaborador.tipo === "PJ" && ehAlphaville(nomeUnidade)) return "parceria_sp";
  return "parceria";
}

export async function emitirContratoPj(
  colaborador: Colaborador,
  nomeUnidade: string | null,
  empresa: Empresa | null,
  config: ConfigAssinaturasPJ | null,
  supabaseParaImagens?: SupabaseComStorage
): Promise<ResultadoContratoPJ | ErroContratoPJ> {
  const modelo = modeloContratoPj(colaborador, empresa?.nome, nomeUnidade);
  if (modelo === "comercial_bdu") {
    return gerarContratoPjComercialDocx(colaborador, empresa, config, supabaseParaImagens);
  }
  if (modelo === "parceria_sp") {
    // assinaturas do Salão e das testemunhas já fazem parte do modelo de São Paulo
    return gerarContratoPjSpDocx(colaborador);
  }
  return gerarContratoPjDocx(colaborador, nomeUnidade, config, supabaseParaImagens);
}
