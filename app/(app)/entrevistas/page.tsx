import { createClient } from "@/lib/supabase-server";
import EntrevistasTela from "@/components/entrevistas/EntrevistasTela";
import type { CargoDesc } from "@/lib/cargos";
import type { AvaliacaoSel, CandidatoSel, EntrevistaSel, Vaga } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

export default async function EntrevistasPage() {
  const supabase = createClient();
  const [vagasRes, candRes, entRes, avalRes, cargosRes] = await Promise.all([
    supabase.from("sel_vagas").select("*").order("data_abertura", { ascending: false }),
    supabase.from("sel_candidatos").select("*").order("created_at", { ascending: true }),
    supabase.from("sel_entrevistas").select("*").order("data", { ascending: true }),
    supabase.from("sel_avaliacoes").select("*"),
    supabase.from("cargos_desc").select("*"),
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

  // "Teste técnico" foi renomeada para "Etapa técnica": registros antigos aparecem com o nome novo.
  const nova = (e: string) => (e === "Teste técnico" ? "Etapa técnica" : e);
  const candidatos = ((candRes.data ?? []) as CandidatoSel[]).map((c) => ({ ...c, etapa: nova(c.etapa) }));
  const entrevistas = ((entRes.data ?? []) as EntrevistaSel[]).map((e) => ({ ...e, etapa: nova(e.etapa) }));

  return (
    <EntrevistasTela
      vagasIniciais={(vagasRes.data ?? []) as Vaga[]}
      candidatosIniciais={candidatos}
      entrevistasIniciais={entrevistas}
      avaliacoesIniciais={(avalRes.data ?? []) as AvaliacaoSel[]}
      cargos={((cargosRes.data ?? []) as CargoDesc[]).map((c) => ({ ...c, cenarios: c.cenarios ?? [] }))}
    />
  );
}
