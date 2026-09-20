import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, EtapaProcesso, HistoricoEtapa, ProcessoIntegracao } from "@/types/db";
import { differenceInCalendarDays } from "date-fns";
import LinhaDoTempoIntegracao from "@/components/integracao/LinhaDoTempoIntegracao";

export const dynamic = "force-dynamic";

const STATUS_GERAL_LABEL: Record<string, string> = {
  integracao: "Integração",
  experiencia: "Experiência",
  efetivado: "Efetivado(a)",
  nao_efetivado: "Não efetivado(a)",
};

const STATUS_GERAL_COR: Record<string, string> = {
  integracao: "text-slate-700",
  experiencia: "text-blue-600",
  efetivado: "text-emerald-600",
  nao_efetivado: "text-red-600",
};

export default async function ColaboradorIntegracaoPage({
  params,
}: {
  params: { colaboradorId: string };
}) {
  const supabase = createClient();

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", params.colaboradorId)
    .single();

  if (!colaborador) {
    return (
      <div className="card">
        <p className="text-sm text-slate-600">Colaborador não encontrado.</p>
      </div>
    );
  }

  const colaboradorTyped = colaborador as Colaborador;

  const { data: processo } = await supabase
    .from("processos_integracao")
    .select("*")
    .eq("colaborador_id", params.colaboradorId)
    .maybeSingle();

  if (!processo) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">{colaboradorTyped.nome}</h1>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">
            Este colaborador não tem um processo de integração — ele foi cadastrado diretamente em
            Colaboradores, sem passar pelo Pré-cadastro.
          </p>
        </div>
      </div>
    );
  }

  const processoTyped = processo as ProcessoIntegracao;

  const [{ data: empresa }, { data: etapas }] = await Promise.all([
    colaboradorTyped.empresa_id
      ? supabase.from("empresas").select("*").eq("id", colaboradorTyped.empresa_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("etapas_processo")
      .select("*")
      .eq("processo_id", processoTyped.id)
      .order("ordem", { ascending: true }),
  ]);

  const listaEtapas = (etapas ?? []) as EtapaProcesso[];
  const empresaTyped = empresa as Empresa | null;

  const { data: historico } = listaEtapas.length
    ? await supabase
        .from("historico_etapas")
        .select("*")
        .in(
          "etapa_processo_id",
          listaEtapas.map((e) => e.id)
        )
        .order("data", { ascending: false })
    : { data: [] };

  const historicoPorEtapa: Record<string, HistoricoEtapa[]> = {};
  for (const h of (historico ?? []) as HistoricoEtapa[]) {
    if (!historicoPorEtapa[h.etapa_processo_id]) historicoPorEtapa[h.etapa_processo_id] = [];
    historicoPorEtapa[h.etapa_processo_id].push(h);
  }

  const tempoProcessoDias = processoTyped.cronometro_iniciado_em
    ? differenceInCalendarDays(new Date(), new Date(processoTyped.cronometro_iniciado_em))
    : 0;

  const etapaAtual = listaEtapas.find(
    (e) => !e.bloqueada && e.status !== "realizado" && e.status !== "em_experiencia"
  );
  const prazoGeral = etapaAtual?.prazo
    ? new Date(etapaAtual.prazo).getTime() < Date.now()
      ? "Atrasado"
      : "No prazo"
    : "—";

  return (
    <div className="space-y-6">
      <Link href="/onboarding" className="text-xs text-brand-600">
        ← Voltar ao Painel de Integração
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">{colaboradorTyped.nome}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {colaboradorTyped.cargo ?? "—"}
              {empresaTyped ? ` · ${empresaTyped.nome}` : ""}
              {colaboradorTyped.lider ? ` · Líder: ${colaboradorTyped.lider}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-5">
            <Stat label="Status geral" valor={STATUS_GERAL_LABEL[processoTyped.status_geral]} cor={STATUS_GERAL_COR[processoTyped.status_geral]} />
            <Stat label="Data de admissão" valor={colaboradorTyped.data_admissao ? new Date(colaboradorTyped.data_admissao).toLocaleDateString("pt-BR") : "—"} />
            <Stat label="Tempo de processo" valor={processoTyped.cronometro_iniciado_em ? `${tempoProcessoDias} dias` : "não iniciado"} />
            <Stat label="Prazo" valor={prazoGeral} cor={prazoGeral === "Atrasado" ? "text-red-600" : prazoGeral === "No prazo" ? "text-emerald-600" : undefined} />
          </div>
        </div>

        <h2 className="font-display font-semibold text-slate-900 mb-4">Linha do tempo da integração</h2>
        <LinhaDoTempoIntegracao
          processoId={processoTyped.id}
          colaboradorId={colaboradorTyped.id}
          etapas={listaEtapas}
          historicoPorEtapa={historicoPorEtapa}
          dataAdmissao={colaboradorTyped.data_admissao}
          prazoExperienciaDias={processoTyped.prazo_experiencia_dias}
        />
      </div>
    </div>
  );
}

function Stat({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400 font-medium">{label}</p>
      <p className={`text-sm font-display font-bold ${cor ?? "text-slate-800"}`}>{valor}</p>
    </div>
  );
}
