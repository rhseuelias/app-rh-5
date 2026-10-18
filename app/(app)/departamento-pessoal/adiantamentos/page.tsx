import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { competenciaAtualSP, deslocarCompetencia, empresaVT, EMPRESAS_VT, grupoVT } from "@/lib/vale-transporte";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { elegivelAdiantamento } from "@/lib/adiantamentos";
import AdiantamentosTela, { type ItemAdiantamento } from "@/components/adiantamentos/AdiantamentosTela";

export const dynamic = "force-dynamic";

export default async function AdiantamentosPage() {
  const supabase = createClient();
  const anterior = deslocarCompetencia(competenciaAtualSP(), -1);
  const [empresasRes, unidadesRes, colaboradoresRes, anteriorRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("adiantamentos_mensais").select("id", { count: "exact", head: true }).eq("competencia", anterior),
  ]);
  // null = a tabela ainda não existe (migration_039 não rodou)
  const anteriorSalvo: boolean | null = anteriorRes.error ? null : (anteriorRes.count ?? 0) > 0;

  if (colaboradoresRes.error) {
    return (
      <div className="card">
        <p className="text-sm text-red-700">Não foi possível carregar os colaboradores.</p>
      </div>
    );
  }

  const empresaPorId = new Map(((empresasRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colaboradores = (colaboradoresRes.data ?? []) as Colaborador[];

  const itens: ItemAdiantamento[] = colaboradores.filter(elegivelAdiantamento).map((c) => ({
    id: c.id,
    nome: c.nome,
    cargo: c.cargo ?? "",
    empresa: empresaVT(c, empresaPorId, unidadePorId),
    unidade: grupoVT(c, empresaPorId, unidadePorId),
    recebe: !!c.adiantamento_salario,
  }));

  const outras = Array.from(new Set(itens.map((i) => i.empresa)))
    .filter((e) => !(EMPRESAS_VT as readonly string[]).includes(e))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const empresas: string[] = [...EMPRESAS_VT, ...outras];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/departamento-pessoal" className="text-xs font-medium text-brand-600 hover:underline">
          ← Departamento Pessoal
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900">Adiantamentos</h1>
        <p className="text-sm text-stone-600">Marque quem recebe adiantamento. Quem estiver marcado entra no relatório de todos os meses.</p>
      </div>
      {anteriorSalvo === null ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Para guardar os adiantamentos de cada mês, rode o arquivo <b>migration_039_adiantamentos_mensais.sql</b> no Supabase.
        </div>
      ) : (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${anteriorSalvo ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
        >
          <span>
            {anteriorSalvo ? "✅" : "⚠️"} <b>{rotuloCompetencia(anterior)}</b> {anteriorSalvo ? "está salvo." : "não foi gerado e salvo."}
          </span>
          <Link href={`/departamento-pessoal/adiantamentos/relatorio?competencia=${anterior}`} className="font-semibold underline">
            Ver {rotuloCompetencia(anterior)}
          </Link>
        </div>
      )}
      <AdiantamentosTela itens={itens} empresas={empresas} />
    </div>
  );
}
