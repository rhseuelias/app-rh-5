import { createClient } from "@/lib/supabase-server";
import { obterPapelUsuarioLogado } from "@/lib/permissoes";
import { aplicarDesligamentosAgendados } from "@/lib/actions-desligamentos-modulo";
import {
  CONFIG_PADRAO,
  calcularIntervalos,
  hojeSP,
  type ColabQuadro,
  type ConfigDesligamentos,
  type Intervalo,
  type PeriodoChave,
  type RegistroDesligamento,
} from "@/lib/desligamentos-modulo";

export interface FiltrosDesl {
  periodo: PeriodoChave;
  de?: string;
  ate?: string;
  empresa: string;
  unidade: string;
  iniciativa: string;
}

export interface BaseDesligamentos {
  registros: RegistroDesligamento[]; // ativos e cancelados
  quadro: ColabQuadro[];
  empresas: string[];
  unidades: { empresa: string; unidade: string }[];
  config: ConfigDesligamentos;
  podeVerRestrito: boolean;
  papel: string | null;
}

export type ResultadoBase = { ok: true; base: BaseDesligamentos } | { ok: false; erro: string };

type Param = string | string[] | undefined;
function um(p: Param): string {
  return (Array.isArray(p) ? p[0] : p) ?? "";
}

export function lerFiltros(sp: Record<string, Param>): FiltrosDesl {
  const p = um(sp.periodo);
  const periodo: PeriodoChave = ["todos", "mes", "trimestre", "semestre", "ano", "personalizado"].includes(p)
    ? (p as PeriodoChave)
    : "semestre";
  return {
    periodo,
    de: um(sp.de) || undefined,
    ate: um(sp.ate) || undefined,
    empresa: um(sp.empresa),
    unidade: um(sp.unidade),
    iniciativa: um(sp.iniciativa),
  };
}

export function intervalosDosFiltros(f: FiltrosDesl): { atual: Intervalo; anterior: Intervalo } {
  return calcularIntervalos(f.periodo, hojeSP(), f.de, f.ate);
}

/** Igual a intervalosDosFiltros, mas "Todos" começa na data mais antiga que existe nos dados (desligamento ou admissão). */
export function intervalosComBase(f: FiltrosDesl, base: BaseDesligamentos): { atual: Intervalo; anterior: Intervalo } {
  const r = intervalosDosFiltros(f);
  if (f.periodo !== "todos") return r;
  const datas = [
    ...base.registros.map((x) => x.data_desligamento),
    ...base.quadro.map((c) => c.admissao).filter((d): d is string => !!d),
  ].sort();
  const de = datas[0] ?? r.atual.ate;
  // não existe "período anterior" quando se olha tudo: fica vazio
  return { atual: { de, ate: r.atual.ate }, anterior: { de: "1990-01-01", ate: "1990-01-02" } };
}

export async function carregarBase(): Promise<ResultadoBase> {
  await aplicarDesligamentosAgendados();
  const supabase = createClient();
  const [regRes, colRes, empRes, uniRes, cfgRes, papel] = await Promise.all([
    supabase.from("desligamentos_registro").select("*").order("data_desligamento", { ascending: false }),
    supabase.from("colaboradores").select("empresa_id, unidade_id, data_admissao, data_desligamento"),
    supabase.from("empresas").select("id, nome"),
    supabase.from("unidades").select("id, nome, empresa_id"),
    supabase.from("desligamentos_config").select("*").eq("id", 1).maybeSingle(),
    obterPapelUsuarioLogado(),
  ]);

  if (regRes.error) {
    if (/does not exist|schema cache/i.test(regRes.error.message)) {
      return {
        ok: false,
        erro: "Falta criar as tabelas do módulo. Rode o arquivo migration_043_desligamentos_modulo.sql no Supabase.",
      };
    }
    return { ok: false, erro: regRes.error.message };
  }

  const empresaPorId = new Map(((empRes.data ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]));
  const unidadesRaw = (uniRes.data ?? []) as { id: string; nome: string; empresa_id: string | null }[];
  const unidadePorId = new Map(unidadesRaw.map((u) => [u.id, u]));

  const quadro: ColabQuadro[] = (
    (colRes.data ?? []) as {
      empresa_id: string | null;
      unidade_id: string | null;
      data_admissao: string | null;
      data_desligamento: string | null;
    }[]
  ).map((c) => {
    const uni = c.unidade_id ? unidadePorId.get(c.unidade_id) : undefined;
    const empId = c.empresa_id ?? uni?.empresa_id ?? null;
    return {
      empresa: (empId && empresaPorId.get(empId)) || "",
      unidade: uni?.nome ?? "",
      admissao: c.data_admissao,
      desligamento: c.data_desligamento,
    };
  });

  const podeVerRestrito = papel === null || papel === "rh" || papel === "admin";
  const registros = ((regRes.data ?? []) as RegistroDesligamento[]).map((r) =>
    podeVerRestrito ? r : { ...r, motivo_complementar: null, observacoes_restritas: null }
  );

  const cfg = cfgRes.data as Partial<ConfigDesligamentos> | null;
  const config: ConfigDesligamentos = {
    limite_90_dias: Number(cfg?.limite_90_dias ?? CONFIG_PADRAO.limite_90_dias),
    limite_quadro_unidade: Number(cfg?.limite_quadro_unidade ?? CONFIG_PADRAO.limite_quadro_unidade),
    meta_entrevistas: Number(cfg?.meta_entrevistas ?? CONFIG_PADRAO.meta_entrevistas),
    minimo_quadro: Number(cfg?.minimo_quadro ?? CONFIG_PADRAO.minimo_quadro),
  };

  const empresas = Array.from(new Set([...empresaPorId.values()])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const unidades = unidadesRaw
    .map((u) => ({ empresa: (u.empresa_id && empresaPorId.get(u.empresa_id)) || "", unidade: u.nome }))
    .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR"));

  return { ok: true, base: { registros, quadro, empresas, unidades, config, podeVerRestrito, papel } };
}

export function filtrarRegistros(regs: RegistroDesligamento[], f: FiltrosDesl): RegistroDesligamento[] {
  return regs.filter(
    (r) =>
      (!f.empresa || r.empresa === f.empresa) &&
      (!f.unidade || r.unidade === f.unidade) &&
      (!f.iniciativa || r.iniciativa === f.iniciativa)
  );
}

export function filtrarQuadro(q: ColabQuadro[], f: Pick<FiltrosDesl, "empresa" | "unidade">): ColabQuadro[] {
  return q.filter((c) => (!f.empresa || c.empresa === f.empresa) && (!f.unidade || c.unidade === f.unidade));
}
