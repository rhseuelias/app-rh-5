import DashboardConteudo from "@/components/dashboard/DashboardConteudo";

export const dynamic = "force-dynamic";

// O conteúdo do Dashboard fica em components/dashboard/DashboardConteudo.tsx,
// porque a página da diretoria (/diretoria/[token]) usa os mesmos blocos.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { empresa?: string; mes?: string; relatorio?: string };
}) {
  return DashboardConteudo({ searchParams });
}
