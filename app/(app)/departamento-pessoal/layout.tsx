import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

/** Departamento Pessoal (Folha, Benefícios...) não é liberado pro perfil
 * "assistente": mesmo digitando o endereço na mão, volta pro início. */
export default async function DepartamentoPessoalLayout({ children }: { children: React.ReactNode }) {
  if (await souAssistente()) redirect("/dashboard");
  return <>{children}</>;
}
