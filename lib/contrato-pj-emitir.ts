// Escolhe qual modelo de contrato PJ usar para o colaborador.
//
// - PJ da BDU na área comercial/vendas  -> "Contrato de Prestação de Serviços de Empreitada"
// - todos os demais PJ (barbeiros, Atendimento etc.) -> "Instrumento Particular de Parceria" (modelo de sempre)
//
// O contrato dos barbeiros NÃO muda: só entra no modelo novo quem é da BDU e do comercial.

import { gerarContratoPjDocx, type ErroContratoPJ, type ResultadoContratoPJ, type SupabaseComStorage } from "@/lib/contrato-pj";
import { ehContratoComercialBDU, gerarContratoPjComercialDocx } from "@/lib/contrato-pj-comercial";
import type { Colaborador, ConfigAssinaturasPJ, Empresa } from "@/types/db";

export type ModeloContratoPj = "comercial_bdu" | "parceria";

export const ROTULO_MODELO_CONTRATO_PJ: Record<ModeloContratoPj, string> = {
  comercial_bdu: "Contrato de prestação de serviços (BDU, área comercial)",
  parceria: "Instrumento de parceria (barbeiros)",
};

export function modeloContratoPj(
  colaborador: Pick<Colaborador, "tipo" | "departamento">,
  empresaNome: string | null | undefined
): ModeloContratoPj {
  return colaborador.tipo === "PJ" && ehContratoComercialBDU(empresaNome, colaborador.departamento)
    ? "comercial_bdu"
    : "parceria";
}

export async function emitirContratoPj(
  colaborador: Colaborador,
  nomeUnidade: string | null,
  empresa: Empresa | null,
  config: ConfigAssinaturasPJ | null,
  supabaseParaImagens?: SupabaseComStorage
): Promise<ResultadoContratoPJ | ErroContratoPJ> {
  if (modeloContratoPj(colaborador, empresa?.nome) === "comercial_bdu") {
    return gerarContratoPjComercialDocx(colaborador, empresa, config, supabaseParaImagens);
  }
  return gerarContratoPjDocx(colaborador, nomeUnidade, config, supabaseParaImagens);
}
