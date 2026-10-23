import { redirect } from "next/navigation";

// O desligamento agora é registrado na ficha do colaborador (botão "Desligar").
export default function RegistrarDesligamentoPage() {
  redirect("/colaboradores");
}
