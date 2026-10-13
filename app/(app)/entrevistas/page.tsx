import { createClient } from "@/lib/supabase-server";
import EntrevistasTela from "@/components/entrevistas/EntrevistasTela";
import type { AvaliacaoSel, CandidatoSel, EntrevistaSel, Vaga } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

export default async function EntrevistasPage() {
  const supabase = createClient();
  const [vagasRes, candRes, entRes, avalRes] = await Promise.all([
    supabase.from("sel_vagas").select("*").order("data_abertura", { ascending: false }),
    supabase.from("sel_candidatos").select("*").order("created_at", { ascending: true }),
    supabase.from("sel_entrevistas").select("*").order("data", { ascending: true }),
    supabase.from("sel_avaliacoes").select("*"),
  ]);

  const erro = vagasRes.error ?? candRes.error ?? entRes.error ?? avalRes.error;
  if (erro) {
    const faltaTabela = /does not exist|schema cache/i.test(erro.message);
    return (
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">Entrevistas</h1>
        <p className="text-sm text-red-700">
          {faltaTabela
            ? "Falta criar as tabelas no banco. Rode o arquivo migration_027_entrevistas.sql no Supabase (SQL Editor) e abra esta tela de novo."
            : `Não foi possível carregar: ${erro.message}`}
        </p>
      </div>
    );
  }

  return (
    <EntrevistasTela
      vagasIniciais={(vagasRes.data ?? []) as Vaga[]}
      candidatosIniciais={(candRes.data ?? []) as CandidatoSel[]}
      entrevistasIniciais={(entRes.data ?? []) as EntrevistaSel[]}
      avaliacoesIniciais={(avalRes.data ?? []) as AvaliacaoSel[]}
    />
  );
}
