import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { AvisoErro, CabecalhoModulo, LinkBotao } from "@/components/desligamentos/ui";
import RegistrarDesligamentoForm, { type ColabOpcao } from "@/components/desligamentos/RegistrarDesligamentoForm";

export const dynamic = "force-dynamic";

export default async function RegistrarDesligamentoPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (await souAssistente()) redirect("/dashboard");

  const supabase = createClient();
  const [colRes, empRes, uniRes] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, matricula, tipo, empresa_id, unidade_id, departamento, cargo, lider, data_admissao, status")
      .neq("status", "desligado")
      .order("nome"),
    supabase.from("empresas").select("id, nome"),
    supabase.from("unidades").select("id, nome"),
  ]);

  const acoes = <LinkBotao href="/desligamentos/historico">Histórico</LinkBotao>;

  if (colRes.error) {
    return (
      <div className="space-y-5">
        <CabecalhoModulo titulo="Registrar desligamento" acoes={acoes} />
        <AvisoErro texto="Não foi possível carregar os colaboradores." />
      </div>
    );
  }

  const empresaPorId = new Map(((empRes.data ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]));
  const unidadePorId = new Map(((uniRes.data ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));

  const colaboradores: ColabOpcao[] = (
    (colRes.data ?? []) as {
      id: string;
      nome: string;
      matricula: string | null;
      tipo: string | null;
      empresa_id: string | null;
      unidade_id: string | null;
      departamento: string | null;
      cargo: string | null;
      lider: string | null;
      data_admissao: string | null;
    }[]
  ).map((c) => ({
    id: c.id,
    nome: c.nome,
    matricula: c.matricula ?? "",
    vinculo: c.tipo === "Estagio" ? "Estágio" : (c.tipo ?? ""),
    empresa: (c.empresa_id && empresaPorId.get(c.empresa_id)) || "",
    unidade: (c.unidade_id && unidadePorId.get(c.unidade_id)) || "",
    departamento: c.departamento ?? "",
    cargo: c.cargo ?? "",
    gestor: c.lider ?? "",
    admissao: c.data_admissao ?? "",
  }));

  const preSelecionado = Array.isArray(searchParams.colaborador) ? searchParams.colaborador[0] : searchParams.colaborador;

  return (
    <div className="space-y-5">
      <CabecalhoModulo
        titulo="Registrar desligamento"
        subtitulo="Escolha o colaborador que já está cadastrado. Os dados dele vêm do cadastro, sem digitar de novo."
        acoes={acoes}
      />
      <RegistrarDesligamentoForm colaboradores={colaboradores} preSelecionado={preSelecionado ?? null} />
    </div>
  );
}
