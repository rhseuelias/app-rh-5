import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade, Ferias, PeriodoAquisitivo, Feriado } from "@/types/db";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";
import { hojeEmBrasilia, mapaDeFeriados } from "@/lib/ferias-regras";
import FeriasPainel, { type PessoaFerias } from "@/components/ferias/FeriasPainel";

export const dynamic = "force-dynamic";

export default async function FeriasPage({
  searchParams,
}: {
  searchParams: { ano?: string; aba?: string };
}) {
  const supabase = createClient();

  // gera sozinho o próximo período aquisitivo de quem já passou do fim do anterior
  await autoGerarProximosPeriodosVencidos();

  // perfil "assistente" não vê valores em reais
  const ocultarValores = await souAssistente();

  const [
    { data: colaboradoresData },
    { data: empresasData },
    { data: unidadesData },
    { data: feriasData },
    { data: aquisitivosData },
    { data: feriadosData },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("tipo", "CLT").in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("ferias").select("*").neq("status", "cancelado").eq("simulacao", false),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("feriados").select("*"),
  ]);

  const colaboradores = (colaboradoresData ?? []) as Colaborador[];
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const todasFerias = (feriasData ?? []) as Ferias[];
  const aquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];
  const feriados = mapaDeFeriados((feriadosData ?? []) as Feriado[]);

  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));

  // período aquisitivo aberto de cada colaborador (o que vence primeiro)
  const abertoPor = new Map<string, PeriodoAquisitivo>();
  for (const p of aquisitivos) {
    const atual = abertoPor.get(p.colaborador_id);
    if (!atual || p.limite_concessao < atual.limite_concessao) abertoPor.set(p.colaborador_id, p);
  }

  const feriasPor = new Map<string, Ferias[]>();
  for (const f of todasFerias) {
    if (!feriasPor.has(f.colaborador_id)) feriasPor.set(f.colaborador_id, []);
    feriasPor.get(f.colaborador_id)!.push(f);
  }

  const pessoas: PessoaFerias[] = colaboradores
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((c) => {
      const aq = abertoPor.get(c.id) ?? null;
      const fs = (feriasPor.get(c.id) ?? []).slice().sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1));
      const doAberto = (f: Ferias) => (aq ? f.periodo_aquisitivo_id === aq.id || f.periodo_aquisitivo_id === null : true);
      return {
        id: c.id,
        nome: c.nome,
        unidade: (c.unidade_id && nomeUnidade.get(c.unidade_id)) || "Sem unidade",
        empresa: (c.empresa_id && nomeEmpresa.get(c.empresa_id)) || "",
        empresaId: c.empresa_id ?? null,
        salario: ocultarValores ? 0 : Number(c.salario_base) || 0,
        aq: aq
          ? {
              id: aq.id,
              ini: String(aq.inicio).slice(0, 10),
              fim: String(aq.fim).slice(0, 10),
              limite: String(aq.limite_concessao).slice(0, 10),
            }
          : null,
        abono: fs.some((f) => f.vendeu_abono && doAberto(f)),
        per: fs.map((f) => ({
          id: f.id,
          i: String(f.data_inicio).slice(0, 10),
          d: f.dias,
          st: f.status === "planejada" || f.status === "solicitado" ? ("planejada" as const) : ("aprovado" as const),
          pid: f.periodo_aquisitivo_id,
        })),
      };
    });

  const hoje = hojeEmBrasilia();
  const anoPadrao = Number(hoje.slice(0, 4));
  const ano = Number(searchParams.ano) >= 2000 ? Number(searchParams.ano) : anoPadrao;

  return (
    <FeriasPainel
      hoje={hoje}
      anoInicial={ano}
      pessoas={pessoas}
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
      feriados={feriados}
      mostrarValores={!ocultarValores}
      abaInicial={searchParams.aba === "situacao" ? "sit" : "mapa"}
    />
  );
}
