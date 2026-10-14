import { createClient } from "@/lib/supabase-server";
import CargosTela from "@/components/cargos/CargosTela";
import type { CargoDesc } from "@/lib/cargos";

export const dynamic = "force-dynamic";

export default async function CargosPage() {
  const supabase = createClient();
  const { data, error } = await supabase.from("cargos_desc").select("*").order("cargo", { ascending: true });
  if (error) {
    const faltaTabela = /does not exist|schema cache/i.test(error.message);
    return (
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">Descrição de Cargos</h1>
        <p className="text-sm text-red-700">
          {faltaTabela
            ? "Falta criar a tabela no banco. Rode o arquivo migration_030_cargos.sql no Supabase (SQL Editor) e abra esta tela de novo."
            : `Não foi possível carregar: ${error.message}`}
        </p>
      </div>
    );
  }
  return <CargosTela iniciais={(data ?? []) as CargoDesc[]} />;
}
