import { createClient } from "@/lib/supabase-server";
import ColaboradorForm from "@/components/ColaboradorForm";
import type { Empresa, Unidade } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NovoColaboradorPage() {
  const supabase = createClient();
  const [{ data: empresas }, { data: unidades }] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Novo colaborador</h1>
        <p className="text-slate-500 text-sm">
          Ao salvar, o app já cria o checklist de onboarding e o período aquisitivo de férias.
        </p>
      </div>
      <ColaboradorForm empresas={(empresas ?? []) as Empresa[]} unidades={(unidades ?? []) as Unidade[]} />
    </div>
  );
}
