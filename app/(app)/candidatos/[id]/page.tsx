import { redirect } from "next/navigation";

// O Pré-cadastro foi retirado do app (veja app/(app)/candidatos/page.tsx).
export default function CandidatoRetirado() {
  redirect("/colaboradores");
}
