import { deslocarCompetencia } from "@/lib/vale-transporte";

// Qualquer cliente do Supabase (o do usuário logado).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

export type ResultadoCopia = { ok: true; copiados: number } | { ok: false; erro: string };

const chave = (c: string, o: string, cartao: string | null) => `${c}|${o}|${cartao ?? ""}`;

/**
 * Copia os cartões do mês anterior para o mês pedido: número do cartão, diária,
 * valor, dias úteis, alimentação e prêmio. O SALDO não é copiado (volta zerado),
 * porque o saldo do cartão muda todo mês. Só copia o que ainda não existe.
 */
export async function copiarDoMesAnteriorVT(
  supabase: Cliente,
  competencia: string,
  colaboradorIds: string[]
): Promise<ResultadoCopia> {
  if (colaboradorIds.length === 0) return { ok: true, copiados: 0 };
  const anterior = deslocarCompetencia(competencia, -1);

  const [antRes, atualRes] = await Promise.all([
    supabase.from("vt_lancamentos").select("*").eq("competencia", anterior).in("colaborador_id", colaboradorIds),
    supabase
      .from("vt_lancamentos")
      .select("colaborador_id, operadora, cartao")
      .eq("competencia", competencia)
      .in("colaborador_id", colaboradorIds),
  ]);
  if (antRes.error) return { ok: false, erro: antRes.error.message };
  if (atualRes.error) return { ok: false, erro: atualRes.error.message };

  const jaTem = new Set<string>(
    (atualRes.data ?? []).map((r: { colaborador_id: string; operadora: string; cartao: string | null }) =>
      chave(r.colaborador_id, r.operadora, r.cartao)
    )
  );

  const novas = (antRes.data ?? [])
    .filter((r: { colaborador_id: string; operadora: string; cartao: string | null }) => !jaTem.has(chave(r.colaborador_id, r.operadora, r.cartao)))
    .map(
      (r: {
        colaborador_id: string;
        operadora: string;
        cartao: string | null;
        diaria: number;
        valor_unit: number;
        dias_uteis: number;
        alimentacao: number | null;
        premio: number | null;
      }) => ({
        competencia,
        colaborador_id: r.colaborador_id,
        operadora: r.operadora,
        cartao: r.cartao,
        diaria: r.diaria,
        valor_unit: r.valor_unit,
        dias_uteis: r.dias_uteis,
        alimentacao: r.alimentacao ?? 0,
        premio: r.premio ?? 0,
        saldo: 0,
      })
    );

  if (novas.length === 0) return { ok: true, copiados: 0 };
  const { error } = await supabase.from("vt_lancamentos").insert(novas);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, copiados: novas.length };
}

/**
 * Cópia automática: na primeira vez que um mês (atual ou passado) é aberto, traz
 * os cartões do mês anterior. Um marcador (vt_competencias) garante que isso só
 * acontece uma vez, então um cartão que você excluir não volta sozinho.
 */
export async function copiaAutomaticaVT(
  supabase: Cliente,
  competencia: string,
  competenciaAtual: string,
  colaboradorIds: string[]
): Promise<boolean> {
  // o mês atual e o próximo já trazem o mês anterior; meses mais distantes ficam vazios
  if (competencia > deslocarCompetencia(competenciaAtual, 1)) return false;
  const anterior = deslocarCompetencia(competencia, -1);

  const marcado = await supabase.from("vt_competencias").select("competencia").eq("competencia", competencia).maybeSingle();
  if (marcado.error || marcado.data) return false; // sem a tabela (migration 023) ou já copiado

  const temAnterior = await supabase.from("vt_lancamentos").select("id", { count: "exact", head: true }).eq("competencia", anterior);
  if (temAnterior.error || (temAnterior.count ?? 0) === 0) return false;

  // o marcador funciona como trava: se duas telas abrirem juntas, só uma copia
  const trava = await supabase.from("vt_competencias").insert({ competencia });
  if (trava.error) return false;

  const r = await copiarDoMesAnteriorVT(supabase, competencia, colaboradorIds);
  if (!r.ok) {
    await supabase.from("vt_competencias").delete().eq("competencia", competencia);
    return false;
  }
  return true;
}
