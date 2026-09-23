import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  FolhaCompetencia,
  FolhaLancamento,
  FolhaNota,
  FolhaTipo,
  Unidade,
} from "@/types/db";
import { colaboradorAtivoFolha, rotuloGrupoColaborador } from "@/lib/folha-calculos";
import { competenciaAtual, rotuloCompetencia } from "@/lib/beneficios-calculos";
import TiposFolhaCadastro from "@/components/folha/TiposFolhaCadastro";
import CompetenciaAcoesFolha from "@/components/folha/CompetenciaAcoesFolha";
import FolhaGrid, { type GrupoFolha, type ValorCelula } from "@/components/folha/FolhaGrid";

export const dynamic = "force-dynamic";

export default async function FolhaPage({
  searchParams,
}: {
  searchParams: { competencia?: string };
}) {
  const supabase = createClient();

  const [
    { data: empresasData },
    { data: unidadesData },
    { data: colaboradoresData },
    { data: competenciasData },
    { data: tiposData },
  ] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("folha_competencias").select("*").order("competencia", { ascending: false }),
    supabase.from("folha_tipos").select("*").eq("ativo", true).order("ordem"),
  ]);

  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const todosColaboradores = ((colaboradoresData ?? []) as Colaborador[]).filter(colaboradorAtivoFolha);
  const competencias = (competenciasData ?? []) as FolhaCompetencia[];
  const tipos = (tiposData ?? []) as FolhaTipo[];

  if (empresas.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Departamento Pessoal · Controle de Folha</h1>
        <div className="card">
          <p className="text-sm text-slate-500">
            Ainda não há nenhuma empresa cadastrada. Cadastre a empresa primeiro em{" "}
            <Link href="/projecao-custo" className="text-brand-600 hover:underline">Projeção de Custo</Link>.
          </p>
        </div>
      </div>
    );
  }

  const empresasPorId: Record<string, Empresa> = {};
  for (const e of empresas) empresasPorId[e.id] = e;
  const unidadesPorId: Record<string, Unidade> = {};
  for (const u of unidades) unidadesPorId[u.id] = u;

  const competencia = searchParams.competencia || competenciaAtual();
  const competenciaRow = competencias.find((c) => c.competencia === competencia);
  const mesFechado = competenciaRow?.fechado ?? false;

  const opcoesCompetencia = Array.from(
    new Set([competenciaAtual(), competencia, ...competencias.map((c) => c.competencia)])
  ).sort((a, b) => (a < b ? 1 : -1));

  let lancamentosRows: FolhaLancamento[] = [];
  let notasRows: FolhaNota[] = [];
  if (competenciaRow && todosColaboradores.length > 0) {
    const ids = todosColaboradores.map((c) => c.id);
    const [{ data: lancData }, { data: notasData }] = await Promise.all([
      supabase.from("folha_lancamentos").select("*").eq("competencia_id", competenciaRow.id).in("colaborador_id", ids),
      supabase.from("folha_notas").select("*").eq("competencia_id", competenciaRow.id).in("colaborador_id", ids),
    ]);
    lancamentosRows = (lancData ?? []) as FolhaLancamento[];
    notasRows = (notasData ?? []) as FolhaNota[];
  }

  const valoresIniciais: Record<string, Record<string, ValorCelula>> = {};
  for (const l of lancamentosRows) {
    (valoresIniciais[l.colaborador_id] ??= {})[l.tipo_id] = { valor: l.valor, valor_texto: l.valor_texto };
  }
  const notasIniciais: Record<string, string> = {};
  for (const n of notasRows) notasIniciais[n.colaborador_id] = n.nota ?? "";

  // agrupa por unidade (quando tem) ou empresa (quando não tem unidades
  // separadas), igual à sua planilha
  const gruposMap = new Map<string, { id: string; nome: string }[]>();
  for (const c of todosColaboradores) {
    const rotulo = rotuloGrupoColaborador(c, empresasPorId, unidadesPorId);
    if (!gruposMap.has(rotulo)) gruposMap.set(rotulo, []);
    gruposMap.get(rotulo)!.push({ id: c.id, nome: c.nome });
  }
  const grupos: GrupoFolha[] = Array.from(gruposMap.entries())
    .map(([rotulo, colaboradores]) => ({
      rotulo,
      colaboradores: colaboradores.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Departamento Pessoal · Controle de Folha</h1>
          <p className="text-slate-500 text-sm">
            Proventos, Descontos e Espelhamento — todos os colaboradores ativos, agrupados por unidade/empresa, igual à planilha que vai pra contabilidade.
          </p>
        </div>
        <CompetenciaAcoesFolha competencia={competencia} fechado={mesFechado} />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="competencia" defaultValue={competencia} className="input !w-auto !text-sm !py-1.5">
          {opcoesCompetencia.map((comp) => (
            <option key={comp} value={comp}>{rotuloCompetencia(comp)}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary !text-sm !py-1.5">Ver</button>
      </form>

      {mesFechado && (
        <div className="card bg-slate-50 border-slate-200">
          <p className="text-sm text-slate-500">
            🔒 {rotuloCompetencia(competencia)} está fechado — vira histórico, só dá pra consultar. Use "Reabrir este mês" ali em cima se precisar corrigir algo.
          </p>
        </div>
      )}

      <TiposFolhaCadastro tipos={tipos} />

      {tipos.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-400">Nenhuma coluna cadastrada ainda. Cadastre uma ali em cima.</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-400">Nenhum colaborador ativo encontrado.</p>
        </div>
      ) : (
        <FolhaGrid
          competencia={competencia}
          mesFechado={mesFechado}
          tipos={tipos}
          grupos={grupos}
          valoresIniciais={valoresIniciais}
          notasIniciais={notasIniciais}
        />
      )}
    </div>
  );
}
