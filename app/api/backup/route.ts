import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const TABELAS = [
  "empresas",
  "unidades",
  "colaboradores",
  "dependentes_colaborador",
  "documentos_colaborador",
  "periodos_aquisitivos",
  "ferias",
  "onboarding_etapas",
  "eventos_calendario",
  "feriados",
  "historico_colaborador",
  "candidatos",
  "documentos_candidato",
  "processos_integracao",
  "etapas_processo",
  "etapas_config",
  "historico_etapas",
  "documentos_etapa",
  "avaliacoes_experiencia",
  "config_integracao",
];

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const backup: Record<string, unknown> = {
    gerado_em: new Date().toISOString(),
  };

  for (const tabela of TABELAS) {
    const { data, error } = await supabase.from(tabela).select("*");
    backup[tabela] = error ? { erro: error.message } : data;
  }

  const nomeArquivo = `backup-app-rh-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
