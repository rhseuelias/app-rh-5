import Link from "next/link";
import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";
import ImportarRelatorioFerias from "@/components/ferias/ImportarRelatorioFerias";

export const dynamic = "force-dynamic";

export default async function ImportarRelatorioFeriasPage() {
  // o perfil "assistente" não altera períodos aquisitivos
  if (await souAssistente()) redirect("/ferias");

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <Link href="/ferias" className="text-[12px] font-semibold text-[#b85c12] hover:text-[#93440c]">
          ← Voltar para Férias
        </Link>
        <h1
          className="text-[32px] leading-tight font-semibold text-[#262626] uppercase mt-2"
          style={{ fontFamily: "'Oswald', 'Arial Narrow', sans-serif", letterSpacing: "0.02em" }}
        >
          Importar relatório de férias
        </h1>
        <p className="text-[13px] text-[#5c5c5c] mt-1">
          Atualiza os períodos aquisitivos (início, fim e limite) com os dados do relatório da contabilidade.
        </p>
      </div>
      <ImportarRelatorioFerias />
    </div>
  );
}
