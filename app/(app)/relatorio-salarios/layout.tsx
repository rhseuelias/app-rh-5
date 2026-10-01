import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

/** Relatório de salários e custo: o perfil "assistente" não tem acesso. */
export default async function RelatorioSalariosLayout({ children }: { children: React.ReactNode }) {
  if (await souAssistente()) redirect("/dashboard");
  return <>{children}</>;
}
