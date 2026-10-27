import { deslocarCompetencia } from "@/lib/vale-transporte";

// Qualquer cliente do Supabase (o do usuário logado).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

export type ResultadoCopia = { ok: true; copiados: number } | { ok: false; erro: string };

const chave = (c: string, o: string, cartao: string | null) => `${c}|${o}|${cartao ?? ""}`;

/**
 * Copia os cartões do mês anterior para o mês pedido: número do cartão, diária,
 * valor, dias úteis, alimentação, prêmio e multi. O SALDO não é copiado (volta zerado),
 * porque o saldo do cartão muda todo mês. Só copia o que ainda não existe.
 */
export async function copiarDoMesAnteriorVT(
  supabase: Cliente,
  competencia: string,
  colaboradorIds: string[],
  operadoras?: string[]
): Promise<ResultadoCopia> {
  if (colaboradorIds.length === 0) return { ok: true, copiados: 0 };
  const anterior = deslocarCompetencia(competencia, -1);

  let consultaAnterior = supabase.from("vt_lancamentos").select("*").eq("competencia", anterior).in("colaborador_id", colaboradorIds);
  if (operadoras) consultaAnterior = consultaAnterior.in("operadora", operadoras);

  const [antRes, atualRes] = await Promise.all([
    consultaAnterior,
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
        multi?: number | null;
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
        // só envia o Multi quando existe (assim a cópia funciona mesmo antes da migration_026)
        ...(r.multi ? { multi: r.multi } : {}),
        saldo: 0,
      })
    );

  if (novas.length === 0) return { ok: true, copiados: 0 };
  const { error } = await supabase.from("vt_lancamentos").insert(novas);
  if (error) return { ok: false, erro: error.message };
  return { ok: true, copiados: novas.length };
}

/**
 * Cópia automática: ao abrir um mês (atual, próximo ou passado), cada operadora (BHBUS, ÓTIMO,
 * SEMPARAR, CAJU) que ainda não tem NENHUM lançamento no mês traz os cartões e valores do mês
 * anterior. Operadora que já tem lançamentos no mês não é mexida, então o que você excluir
 * ou ajustar não volta sozinho. (Para trazer o que faltar, use "Copiar cartões do mês anterior".)
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

  const [atual, ant] = await Promise.all([
    supabase.from("vt_lancamentos").select("operadora").eq("competencia", competencia).limit(5000),
    supabase.from("vt_lancamentos").select("operadora").eq("competencia", anterior).limit(5000),
  ]);
  if (atual.error || ant.error) return false;

  const comLancamento = new Set<string>((atual.data ?? []).map((r: { operadora: string }) => r.operadora));
  const vazias = Array.from(new Set<string>((ant.data ?? []).map((r: { operadora: string }) => r.operadora))).filter(
    (o) => !comLancamento.has(o)
  );
  if (vazias.length === 0) return false;

  const r = await copiarDoMesAnteriorVT(supabase, competencia, colaboradorIds, vazias);
  return r.ok && r.copiados > 0;
}
