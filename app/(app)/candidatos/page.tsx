import { redirect } from "next/navigation";

// O Pré-cadastro foi retirado do app: a entrada de novos colaboradores agora
// é pela importação das Fichas de Admissão (Google Forms) na tela de
// Colaboradores. Quem abrir o endereço antigo cai direto lá.
export default function CandidatosRetirado() {
  redirect("/colaboradores");
}
