"use server";

import { revalidatePath } from "next/cache";

// Avisa o Next.js que a tela da Gestão de Folha mudou. Sem isso, ao sair da
// tela e voltar, o navegador pode mostrar uma cópia antiga da página (de antes
// de concluir as unidades) e as unidades voltam a aparecer como pendentes.
export async function revalidarFolha(): Promise<void> {
  revalidatePath("/departamento-pessoal/folha");
}
