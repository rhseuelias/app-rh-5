import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** O módulo "Controle de Folha" foi retirado do sistema. Quem ainda tiver o
 * endereço salvo cai direto nos Lançamentos da Folha. */
export default function FolhaRetiradaPage() {
  redirect("/departamento-pessoal/lancamentos");
}
