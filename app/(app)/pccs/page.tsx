import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import PccsTela from "@/components/pccs/PccsTela";
import type { CargoDesc } from "@/lib/cargos";

export const dynamic = "force-dynamic";

export default async function PccsPage() {
  if (await souAssistente()) redirect("/dashboard");
  const supabase = createClient();

  const [cargosRes, pccsRes, colabRes, avalRes] = await Promise.all([
    supabase.from("cargos_desc").select("*").order("cargo", { ascending: true }),
    supabase.from("pccs_cargos").select("*"),
    supabase
      .from("colaboradores")
      .select("id, nome, cargo, tipo, status, data_admissao, salario_base")
      .in("tipo", ["CLT", "Estagio"])
      .in("status", ["experiencia", "ativo"])
      .order("nome", { ascending: true }),
    supabase.from("pccs_avaliacoes").select("*").order("created_at", { ascending: false }),
  ]);

  const erro = cargosRes.error ?? pccsRes.error ?? avalRes.error;
  if (erro) {
    const faltaTabela = /does not exist|schema cache/i.test(erro.message);
    return (
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">PCCS</h1>
        <p className="text-sm text-red-700">
          {faltaTabela
            ? "Falta criar as tabelas no banco. Rode o arquivo migration_049_pccs.sql no Supabase (SQL Editor) e abra esta tela de novo."
            : `Não foi possível carregar: ${erro.message}`}
        </p>
      </div>
    );
  }

  return (
    <PccsTela
      cargos={((cargosRes.data ?? []) as CargoDesc[]).map((c) => ({ ...c, cenarios: c.cenarios ?? [] }))}
      pccsCargos={pccsRes.data ?? []}
      colaboradores={colabRes.data ?? []}
      avaliacoes={avalRes.data ?? []}
    />
  );
}
