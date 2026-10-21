import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import { TOKEN_PESQUISA_OK } from "@/lib/pesquisa-integracao";
import PesquisaCelular from "@/components/pesquisa/PesquisaCelular";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pesquisa de satisfação — Grupo Seu Elias",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-[#faf7f3] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#262626" }}>{titulo}</h1>
        <p style={{ fontSize: 16, color: "#5c5c5c", marginTop: 8 }}>{texto}</p>
      </div>
    </div>
  );
}

function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR") : "";
}

/** Página aberta pelo colaborador, no celular, pelo link curto /p/código. Não mostra nenhum dado além do primeiro nome. */
export default async function PesquisaPublicaPage({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!TOKEN_PESQUISA_OK.test(token)) return <Aviso titulo="Link inválido" texto="Peça ao RH um link novo." />;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return <Aviso titulo="Indisponível" texto="Não foi possível abrir a pesquisa agora. Tente de novo em alguns minutos." />;
  }

  const { data: pesquisa } = await admin
    .from("pesquisas_integracao")
    .select("colaborador_id, expira_em, respondida_em")
    .eq("token", token)
    .maybeSingle();

  if (!pesquisa) return <Aviso titulo="Link desativado" texto="Este link não funciona mais. Peça ao RH um link novo." />;
  if (pesquisa.respondida_em) return <Aviso titulo="Pesquisa já respondida" texto="O RH já recebeu as suas respostas. Obrigado!" />;
  if (new Date(pesquisa.expira_em).getTime() < Date.now()) return <Aviso titulo="Link expirado" texto="Peça ao RH um link novo." />;

  const { data: colab } = await admin.from("colaboradores").select("nome").eq("id", pesquisa.colaborador_id).maybeSingle();

  return <PesquisaCelular token={token} primeiroNome={primeiroNome(colab?.nome)} />;
}
