"use server";

import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { assistentePodeVerContratoRemuneracao } from "@/lib/acesso-assistente";
import { salvarColaboradorComMatricula } from "@/lib/actions-colaborador-matricula";

const CAMPOS_FINANCEIROS = [
  "salario_base",
  "comissao_media",
  "auxilio_outros",
  "custo_vt",
  "custo_va_vr",
  "custo_assist_medica",
  "custo_assist_psicologica",
  "valor_nota_fiscal",
  "comissao_corte_pct",
  "comissao_quimica_pct",
] as const;

// Campos que, quando vazios, são enviados como texto vazio (igual ao formulário faz hoje)
const CAMPOS_VAZIOS_SE_NULO = new Set<string>(["comissao_corte_pct", "comissao_quimica_pct"]);

/**
 * Salva o colaborador. Se quem está salvando é a assistente e o colaborador
 * já passou do ponto em que ela pode ver salário/valores (etapa Contrato em
 * diante), os valores financeiros são SEMPRE recolocados a partir do banco —
 * não importa o que veio do formulário. Assim a tela nem precisa enviar o
 * salário, e nada é zerado ou alterado por ela.
 */
export async function salvarColaboradorProtegido(formData: FormData) {
  const idBruto = formData.get("id");
  const id = typeof idBruto === "string" && idBruto ? idBruto : null;

  if (id && (await souAssistente())) {
    const supabase = createClient();
    const liberado = await assistentePodeVerContratoRemuneracao(supabase, id);

    if (!liberado) {
      const { data } = await supabase
        .from("colaboradores")
        .select(CAMPOS_FINANCEIROS.join(", "))
        .eq("id", id)
        .single();

      if (data) {
        const atual = data as unknown as Record<string, number | null>;
        for (const campo of CAMPOS_FINANCEIROS) {
          const valor = atual[campo];
          if (valor === null || valor === undefined) {
            formData.set(campo, CAMPOS_VAZIOS_SE_NULO.has(campo) ? "" : "0");
          } else {
            formData.set(campo, String(valor));
          }
        }
      }
    }
  }

  return salvarColaboradorComMatricula(formData);
}
