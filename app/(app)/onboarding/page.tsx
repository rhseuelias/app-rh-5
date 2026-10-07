import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import IncluirColaboradorPainel from "@/components/integracao/IncluirColaboradorPainel";
import CompartilharPainel from "@/components/integracao/CompartilharPainel";
import PainelTimeline from "@/components/integracao/PainelTimeline";
import { GRUPOS, montarPainelIntegracao } from "@/lib/painel-integracao";

export const dynamic = "force-dynamic";

export default async function PainelIntegracaoPage() {
  const supabase = createClient();
  const { linhas, atrasados, disponiveis } = await montarPainelIntegracao(supabase);

  return (
    <div className="space-y-5" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              fontWeight: 600,
              fontSize: 32,
              lineHeight: 1.1,
              textTransform: "uppercase",
              letterSpacing: ".02em",
              color: "#262626",
            }}
          >
            Painel de Integração
          </h1>
          <p style={{ fontSize: 13, color: "#5c5c5c", marginTop: 4 }}>
            {linhas.length} colaborador{linhas.length !== 1 ? "es" : ""} em integração · {atrasados} com etapa atrasada ·
            atualizado agora
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/configuracoes/integracao"
            style={{ fontSize: 13, fontWeight: 500, color: "#b85c12" }}
            className="hover:underline"
          >
            Configurações do processo
          </Link>
          <CompartilharPainel
            colaboradores={linhas.map((l) => ({
              id: l.colaboradorId,
              nome: l.nome,
              detalhe: [l.cargo, l.unidadeNome || l.empresaNome].filter(Boolean).join(" · "),
            }))}
          />
          <IncluirColaboradorPainel disponiveis={disponiveis} />
        </div>
      </div>

      <PainelTimeline linhas={linhas} gruposNomes={GRUPOS} />
    </div>
  );
}
