import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import Link from "next/link";
import ImportarColaboradoresCSV from "@/components/ImportarColaboradoresCSV";
import ColaboradoresLista from "@/components/ColaboradoresLista";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ColaboradoresPage() {
  const supabase = createClient();

  // gera sozinho o próximo período aquisitivo de quem já passou da data
  // de fim do período anterior, antes de buscar os dados da página
  await autoGerarProximosPeriodosVencidos();

  const [{ data }, { data: empresasData }, { data: unidadesData }] = await Promise.all([
    supabase.from("colaboradores").select("*").order("nome", { ascending: true }),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const todos = (data ?? []) as Colaborador[];
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const nomeEmpresaPorId = Object.fromEntries(empresas.map((e) => [e.id, e.nome]));
  const nomeUnidadePorId = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Colaboradores</h1>
          <p className="text-slate-500 text-sm">{todos.length} cadastrados</p>
        </div>
        <Link href="/colaboradores/novo" className="btn-primary whitespace-nowrap">
          + Novo colaborador
        </Link>
      </div>

      <details className="group card">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 flex items-center gap-1.5 list-none">
          <span className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
          Importar colaboradores de um CSV (Google Forms CLT / PJ ou planilha)
        </summary>
        <div className="mt-4">
          <ImportarColaboradoresCSV />
        </div>
      </details>

      <ColaboradoresLista
        colaboradores={todos}
        nomeEmpresaPorId={nomeEmpresaPorId}
        nomeUnidadePorId={nomeUnidadePorId}
      />
    </div>
  );
}
