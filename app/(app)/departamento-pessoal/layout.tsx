import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

/** Departamento Pessoal (Folha, Benefícios...) não é liberado pro perfil
 * "assistente": mesmo digitando o endereço na mão, volta pro início.
 * Única exceção: o Vale Transporte, liberado para ela. */
export default async function DepartamentoPessoalLayout({ children }: { children: React.ReactNode }) {
  const caminho = headers().get("x-pathname") ?? "";
  const valeTransporte = caminho === "/departamento-pessoal/vale-transporte" || caminho.startsWith("/departamento-pessoal/vale-transporte/");
  if (!valeTransporte && (await souAssistente())) redirect("/dashboard");
  return <>{children}</>;
}
