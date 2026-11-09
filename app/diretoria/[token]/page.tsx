import type { Metadata } from "next";
import { timingSafeEqual } from "crypto";
import DashboardConteudo from "@/components/dashboard/DashboardConteudo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel da Diretoria",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-[#eaf1f0] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#12302c", textTransform: "none", letterSpacing: 0 }}>{titulo}</h1>
        <p style={{ fontSize: 14, color: "#3f5a56", marginTop: 8 }}>{texto}</p>
      </div>
    </div>
  );
}

function tokenConfere(recebido: string): boolean {
  const esperado = process.env.DIRETORIA_TOKEN ?? "";
  if (esperado.length < 32) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Página da diretoria: sem login, protegida pelo código secreto no endereço (DIRETORIA_TOKEN).
// Mostra só totais: total de colaboradores, crescimento por ano, clima e treinamento.
export default async function DiretoriaPage({ params }: { params: { token: string } }) {
  if (!tokenConfere(params.token ?? "")) {
    return <Aviso titulo="Link inválido" texto="Peça ao RH o link atualizado do painel da diretoria." />;
  }

  let conteudo;
  try {
    conteudo = await DashboardConteudo({ publico: true });
  } catch {
    return <Aviso titulo="Indisponível" texto="Não foi possível abrir o painel agora. Tente de novo em alguns minutos." />;
  }

  return (
    <div className="min-h-screen bg-[#eaf1f0]">
      <main className="mx-auto w-full max-w-7xl p-3 md:p-8">{conteudo}</main>
    </div>
  );
}
