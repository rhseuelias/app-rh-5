import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { EventoCalendario } from "@/types/db";
import CalendarioClient from "@/components/CalendarioClient";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const supabase = createClient();

  const inicioAno = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const fimAno = new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);

  const [{ data: eventos }, { data: feriados }] = await Promise.all([
    supabase
      .from("eventos_calendario")
      .select("*")
      .gte("data_inicio", inicioAno)
      .lte("data_inicio", fimAno),
    supabase.from("feriados").select("*").gte("data", inicioAno).lte("data", fimAno),
  ]);

  const eventosFeriados: EventoCalendario[] = (feriados ?? []).map((f) => ({
    id: `feriado-${f.id}`,
    titulo: f.nome,
    categoria: "feriado",
    data_inicio: f.data,
    data_fim: null,
    colaborador_id: null,
    empresa_id: null,
    descricao: f.abrangencia,
  }));

  const todosEventos = [...(eventos ?? []), ...eventosFeriados] as EventoCalendario[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Calendário Geral</h1>
          <p className="text-slate-500 text-sm">
            Admissões, férias, feriados, reuniões, ações de RH e prazos — tudo em um lugar
          </p>
        </div>
        <Link href="/configuracoes/calendario" className="text-xs text-brand-600 hover:underline">
          ⚙️ Configurações do calendário
        </Link>
      </div>

      <CalendarioClient eventos={todosEventos} />
    </div>
  );
}
