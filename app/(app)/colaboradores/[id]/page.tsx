import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  DependenteColaborador,
  Empresa,
  Ferias,
  OnboardingEtapa,
  PeriodoAquisitivo,
  Unidade,
} from "@/types/db";
import ColaboradorForm from "@/components/ColaboradorForm";
import { custoMensalColaborador, ETAPAS_ONBOARDING_LABEL, diasParaVencerFerias } from "@/lib/calculos";
import { calcularSaldo } from "@/lib/simulacao-ferias";
import { notFound } from "next/navigation";
import Link from "next/link";
import StatusColaboradorAcoes from "@/components/StatusColaboradorAcoes";
import IncluirNoProcessoBotao from "@/components/integracao/IncluirNoProcessoBotao";
import GerarPrimeiroPeriodoAquisitivoBotao from "@/components/GerarPrimeiroPeriodoAquisitivoBotao";
import PeriodoAquisitivoAcoes from "@/components/PeriodoAquisitivoAcoes";
import GerarPrevisaoPdfBotao from "@/components/GerarPrevisaoPdfBotao";
import ExcluirFeriasBotao from "@/components/ExcluirFeriasBotao";

export const dynamic = "force-dynamic";

export default async function ColaboradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [
    { data: colaborador },
    { data: empresas },
    { data: unidades },
    { data: ferias },
    { data: onboarding },
    { data: aquisitivos },
    { data: dependentes },
    { data: processo },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("id", params.id).single(),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("ferias").select("*").eq("colaborador_id", params.id).order("data_inicio", { ascending: false }),
    supabase.from("onboarding_etapas").select("*").eq("colaborador_id", params.id),
    supabase
      .from("periodos_aquisitivos")
      .select("*")
      .eq("colaborador_id", params.id)
      .order("inicio", { ascending: true }),
    supabase.from("dependentes_colaborador").select("*").eq("colaborador_id", params.id),
    supabase.from("processos_integracao").select("id").eq("colaborador_id", params.id).maybeSingle(),
  ]);

  if (!colaborador) notFound();

  const c = colaborador as Colaborador;
  const custoMensal = custoMensalColaborador(c);
  const aquisitivosLista = (aquisitivos ?? []) as PeriodoAquisitivo[];

  // saldo de cada período aquisitivo = 30 dias - o que já foi de fato usado
  // (férias reais, não simuladas, e não canceladas) lançado nele
  const feriasReaisAtivas = ((ferias ?? []) as Ferias[]).filter((f) => !f.simulacao && f.status !== "cancelado");
  function saldoDoPeriodo(periodoId: string): number {
    const usados = feriasReaisAtivas
      .filter((f) => f.periodo_aquisitivo_id === periodoId)
      .reduce((soma, f) => soma + f.dias, 0);
    return calcularSaldo(usados);
  }

  const periodoAberto = aquisitivosLista.find((p) => p.status === "aberto") ?? null;
  const saldoAberto = periodoAberto ? saldoDoPeriodo(periodoAberto.id) : 0;
  const jaTemFeriasSalvasAberto = periodoAberto
    ? feriasReaisAtivas.some((f) => f.periodo_aquisitivo_id === periodoAberto.id)
    : false;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{c.nome}</h1>
          <p className="text-slate-500 text-sm">
            {c.tipo} · {c.cargo ?? "sem cargo"} · custo mensal estimado{" "}
            <strong>
              {custoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </strong>
          </p>
        </div>
        <StatusColaboradorAcoes id={c.id} statusAtual={c.status} />
      </div>

      {processo ? (
        <Link href={`/onboarding/${c.id}`} className="text-xs text-brand-600 hover:underline inline-block">
          ✅ Ver ficha do Processo de Integração →
        </Link>
      ) : (
        <IncluirNoProcessoBotao colaboradorId={c.id} />
      )}

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-medium text-slate-900 mb-1">📄 Ficha de Admissão</h2>
            <p className="text-xs text-slate-400">
              Documento no mesmo modelo usado pela contabilidade, pronto pra baixar e enviar.
            </p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/ficha-admissao/${c.id}/pdf`} className="btn-secondary text-sm">
              ⬇️ Baixar PDF
            </a>
            <a href={`/api/ficha-admissao/${c.id}/excel`} className="btn-secondary text-sm">
              ⬇️ Baixar Excel
            </a>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-medium text-slate-900">🏖️ Situação aquisitiva de férias</h2>
          <GerarPrevisaoPdfBotao
            colaboradorId={c.id}
            periodoAberto={periodoAberto}
            saldo={saldoAberto}
            jaTemFeriasSalvas={jaTemFeriasSalvasAberto}
          />
        </div>
        {aquisitivosLista.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Nenhum período aquisitivo registrado.</p>
            <GerarPrimeiroPeriodoAquisitivoBotao colaboradorId={c.id} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Sequência</th>
                  <th className="py-2 pr-4">Período aquisitivo</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Limite</th>
                  <th className="py-2 pr-4">Editar / excluir / gerar</th>
                </tr>
              </thead>
              <tbody>
                {aquisitivosLista.map((p, i) => {
                  const saldo = saldoDoPeriodo(p.id);
                  const dias = diasParaVencerFerias(p.limite_concessao);
                  const completo = p.status === "gozado" || saldo <= 0;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(p.inicio).toLocaleDateString("pt-BR")}–{new Date(p.fim).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 pr-4">
                        {p.status === "vencido" ? (
                          <span className="badge bg-red-100 text-red-700">Vencido</span>
                        ) : completo ? (
                          <span className="badge bg-emerald-100 text-emerald-700">Completo</span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700">
                            faltam {saldo} dia{saldo !== 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {completo ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className={dias < 0 ? "text-red-600 font-medium" : dias <= 60 ? "text-red-600" : "text-slate-600"}>
                            {dias < 0 ? `vencido há ${Math.abs(dias)} dias` : `vence em ${dias} dias`}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <PeriodoAquisitivoAcoes periodo={p} colaboradorId={c.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">🏖️ Histórico de férias</h2>
        {(ferias ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma férias registrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(ferias as Ferias[]).map((f) => (
              <li key={f.id} className="flex justify-between items-center gap-2">
                <span>
                  {new Date(f.data_inicio).toLocaleDateString("pt-BR")} —{" "}
                  {new Date(f.data_fim).toLocaleDateString("pt-BR")} ({f.dias} dias)
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="badge bg-slate-100 text-slate-600">{f.status}</span>
                  {f.status === "cancelado" && <ExcluirFeriasBotao id={f.id} colaboradorId={c.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">✅ Onboarding</h2>
        {(onboarding ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma etapa registrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(onboarding as OnboardingEtapa[]).map((o) => (
              <li key={o.id} className="flex justify-between">
                <span>{ETAPAS_ONBOARDING_LABEL[o.etapa]}</span>
                <span className="badge bg-slate-100 text-slate-600">{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-medium text-slate-900 mb-3">Editar ficha</h2>
        <ColaboradorForm
          colaborador={c}
          empresas={(empresas ?? []) as Empresa[]}
          unidades={(unidades ?? []) as Unidade[]}
          dependentes={(dependentes ?? []) as DependenteColaborador[]}
        />
      </div>
    </div>
  );
}
