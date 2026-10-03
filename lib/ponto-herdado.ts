import { createClient } from "@/lib/supabase-server";

/**
 * Ponto / Observações com "memória": o que foi escrito num mês continua valendo
 * nos meses seguintes, até alguém apagar ou escrever outra coisa.
 *
 * Para cada pessoa vale a anotação do mês pedido; se ela não tem anotação
 * nesse mês, vale a do mês mais recente anterior que tenha. Uma anotação
 * apagada de propósito fica gravada como vazia e interrompe a herança.
 */

export interface PontoDaPessoa {
  texto: string;
  /** "YYYY-MM" do mês de onde veio o texto; null quando foi escrito no próprio mês */
  deMes: string | null;
}

const LOTE_PESSOAS = 120;
const PAGINA = 1000;

export async function carregarPontoComHeranca(
  supabase: ReturnType<typeof createClient>,
  competencia: string,
  colaboradorIds: string[]
): Promise<Record<string, PontoDaPessoa>> {
  const resultado: Record<string, PontoDaPessoa> = {};
  if (colaboradorIds.length === 0) return resultado;

  const { data: comps } = await supabase.from("folha_competencias").select("id, competencia").lte("competencia", competencia);
  const mesPorId = new Map<string, string>(((comps ?? []) as { id: string; competencia: string }[]).map((c) => [c.id, c.competencia]));
  if (mesPorId.size === 0) return resultado;
  const idsMeses = Array.from(mesPorId.keys());

  // linha mais recente (até o mês pedido) de cada pessoa
  const maisRecente = new Map<string, { mes: string; nota: string | null }>();
  for (let i = 0; i < colaboradorIds.length; i += LOTE_PESSOAS) {
    const lote = colaboradorIds.slice(i, i + LOTE_PESSOAS);
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await supabase
        .from("folha_notas")
        .select("colaborador_id, competencia_id, nota")
        .in("competencia_id", idsMeses)
        .in("colaborador_id", lote)
        .order("id")
        .range(de, de + PAGINA - 1);
      if (error || !data) break;
      for (const n of data) {
        const mes = mesPorId.get(n.competencia_id as string);
        if (!mes) continue;
        const atual = maisRecente.get(n.colaborador_id as string);
        if (!atual || mes > atual.mes) maisRecente.set(n.colaborador_id as string, { mes, nota: (n.nota as string | null) ?? null });
      }
      if (data.length < PAGINA) break;
    }
  }

  for (const [colabId, { mes, nota }] of Array.from(maisRecente.entries())) {
    const texto = (nota ?? "").trim();
    if (texto === "") continue; // vazio (ou apagado de propósito): nada a mostrar
    resultado[colabId] = { texto, deMes: mes === competencia ? null : mes };
  }
  return resultado;
}

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" → "set/26" */
export function mesCurto(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  return `${ABREV[(m || 1) - 1]}/${String(a).slice(2)}`;
}
