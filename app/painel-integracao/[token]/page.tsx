import type { Metadata } from "next";
import PainelTimeline from "@/components/integracao/PainelTimeline";
import { createAdminClient } from "@/lib/supabase-admin";
import { GRUPOS, montarPainelIntegracao } from "@/lib/painel-integracao";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel de Integração — acompanhamento",
  robots: { index: false, follow: false },
};

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-[#faf7f3] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#262626" }}>{titulo}</h1>
        <p style={{ fontSize: 14, color: "#5c5c5c", marginTop: 8 }}>{texto}</p>
      </div>
    </div>
  );
}

export default async function PainelPublicoPage({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[a-f0-9]{32,64}$/.test(token)) {
    return <Aviso titulo="Link inválido" texto="Peça ao RH um link novo." />;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return <Aviso titulo="Indisponível" texto="Não foi possível abrir o painel agora." />;
  }

  const { data: link } = await admin
    .from("links_painel_integracao")
    .select("id, ativo, colaboradores_ids")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.ativo) {
    return <Aviso titulo="Link desativado" texto="Este link não funciona mais. Peça ao RH um link novo." />;
  }

  await admin.from("links_painel_integracao").update({ ultimo_acesso: new Date().toISOString() }).eq("id", link.id);

  const painel = await montarPainelIntegracao(admin);
  // Se o RH escolheu colaboradores, mostra só eles; senão mostra todos.
  const escolhidos: string[] | null = Array.isArray(link.colaboradores_ids) ? link.colaboradores_ids : null;
  const linhas = escolhidos ? painel.linhas.filter((l) => escolhidos.includes(l.colaboradorId)) : painel.linhas;
  const atrasados = linhas.filter((l) => l.status === "atrasado").length;

  return (
    <div className="min-h-screen bg-[#faf7f3]">
      <main className="p-4 md:p-10 max-w-7xl mx-auto w-full space-y-5" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
            somente visualização
          </p>
        </div>
        <PainelTimeline linhas={linhas} gruposNomes={GRUPOS} somenteLeitura />
      </main>
    </div>
  );
}
