import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  DependenteColaborador,
  Empresa,
  Ferias,
  HistoricoContratoPJ,
  OnboardingEtapa,
  PeriodoAquisitivo,
  Unidade,
} from "@/types/db";
import ColaboradorForm from "@/components/ColaboradorForm";
import {
  custoMensalColaborador,
  ETAPAS_ONBOARDING_LABEL,
  diasParaVencerFerias,
  formatarDataBR,
  FERIAS_STATUS_LABEL,
  TIPO_COLABORADOR_LABEL,
} from "@/lib/calculos";
import { calcularSaldo } from "@/lib/simulacao-ferias";
import { formatarReais } from "@/lib/formatadores";
import { notFound } from "next/navigation";
import Link from "next/link";
import StatusColaboradorAcoes from "@/components/StatusColaboradorAcoes";
import RenovarContratoPJBotao from "@/components/RenovarContratoPJBotao";
import ContratoPJEmissao from "@/components/ContratoPJEmissao";
import HistoricoContratoPJAcoes from "@/components/HistoricoContratoPJAcoes";
import { ehAlphaville } from "@/lib/contrato-pj";
import IncluirNoProcessoBotao from "@/components/integracao/IncluirNoProcessoBotao";
import GerarPrimeiroPeriodoAquisitivoBotao from "@/components/GerarPrimeiroPeriodoAquisitivoBotao";
import PeriodoAquisitivoAcoes from "@/components/PeriodoAquisitivoAcoes";
import GerarPrevisaoPdfBotao from "@/components/GerarPrevisaoPdfBotao";
import ExcluirHistoricoFeriasBotao from "@/components/ExcluirHistoricoFeriasBotao";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

const FERIAS_STATUS_BADGE: Record<string, string> = {
  planejada: "bg-blue-50 text-blue-600",
  solicitado: "bg-slate-100 text-slate-500",
  aprovado: "bg-emerald-50 text-emerald-600",
  concluido: "bg-emerald-50 text-emerald-600",
  cancelado: "bg-slate-100 text-slate-400",
};

export default async function ColaboradorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // gera sozinho o próximo período aquisitivo desse colaborador (e dos
  // demais) se o último já passou da data de fim, antes de buscar os
  // dados da página
  await autoGerarProximosPeriodosVencidos();

  const restrito = await souAssistente();

  const [
    { data: colaborador },
    { data: empresas },
    { data: unidades },
    { data: ferias },
    { data: onboarding },
    { data: aquisitivos },
    { data: dependentes },
    { data: processo },
    { data: historicoContratosPJ },
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
    supabase
      .from("historico_contratos_pj")
      .select("*")
      .eq("colaborador_id", params.id)
      .order("contrato_inicio", { ascending: false }),
  ]);

  if (!colaborador) notFound();

  const c = colaborador as Colaborador;
  const custoMensal = custoMensalColaborador(c);
  const aquisitivosLista = (aquisitivos ?? []) as PeriodoAquisitivo[];
  const historico = (historicoContratosPJ ?? []) as HistoricoContratoPJ[];

  const unidadeDoColaborador = (unidades as Unidade[] | null)?.find((u) => u.id === c.unidade_id) ?? null;
  const bloqueadoContratoMotivo = ehAlphaville(unidadeDoColaborador?.nome ?? null)
    ? "Esse modelo de contrato é de Minas Gerais e não vale pra unidade Alphaville (outro estado) — ainda não temos o modelo do contrato de lá cadastrado."
    : null;
  const assinaturaPjUrl = c.assinatura_pj_path
    ? (await supabase.storage.from("documentos").createSignedUrl(c.assinatura_pj_path, 60 * 60)).data?.signedUrl ??
      null
    : null;

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
            {TIPO_COLABORADOR_LABEL[c.tipo] ?? c.tipo} · {c.cargo ?? "sem cargo"}
            {!restrito && (
              <>
                {" "}
                · custo mensal estimado{" "}
                <strong>
                  {custoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </>
            )}
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

      {c.tipo === "PJ" && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-medium text-slate-900 mb-1">📑 Contrato PJ</h2>
              <p className="text-xs text-slate-400">
                {c.contrato_inicio || c.contrato_fim
                  ? `Vigente: ${formatarDataBR(c.contrato_inicio)} – ${formatarDataBR(c.contrato_fim)}`
                  : "Nenhum período de contrato cadastrado ainda."}
                {!restrito && c.valor_nota_fiscal ? ` · ${formatarReais(c.valor_nota_fiscal)}/mês` : ""}
                {!restrito && c.comissao_corte_pct ? ` · corte ${c.comissao_corte_pct}%` : ""}
                {!restrito && c.comissao_quimica_pct ? ` · química ${c.comissao_quimica_pct}%` : ""}
              </p>
            </div>
            <RenovarContratoPJBotao
              colaboradorId={c.id}
              contratoFimAtual={c.contrato_fim}
              valorAtual={c.valor_nota_fiscal}
              restrito={restrito}
            />
          </div>

          <div className="overflow-x-auto -mx-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 px-1">
              Histórico de renovação de contrato
            </p>
            {historico.length === 0 ? (
              <p className="text-sm text-slate-400 px-1">Nenhuma renovação registrada ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                    <th className="py-2 px-1 font-medium">Seq.</th>
                    <th className="py-2 px-1 font-medium">Período</th>
                    {!restrito && <th className="py-2 px-1 font-medium">Valor</th>}
                    <th className="py-2 px-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...historico].reverse().map((h, i) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-1 text-slate-400">{i + 1}-</td>
                      <td className="py-2.5 px-1 whitespace-nowrap text-slate-700">
                        {formatarDataBR(h.contrato_inicio)} – {formatarDataBR(h.contrato_fim)}
                      </td>
                      {!restrito && (
                        <td className="py-2.5 px-1 text-slate-700">
                          {h.valor_nota_fiscal ? formatarReais(h.valor_nota_fiscal) : "—"}
                        </td>
                      )}
                      <td className="py-2.5 px-1">
                        <HistoricoContratoPJAcoes item={h} colaboradorId={c.id} restrito={restrito} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ContratoPJEmissao
            colaboradorId={c.id}
            bloqueadoMotivo={bloqueadoContratoMotivo}
            assinaturaUrl={assinaturaPjUrl}
          />
        </div>
      )}

      {!restrito && c.tipo !== "PJ" && (
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
      )}

      {c.tipo !== "PJ" && (
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-sm font-semibold text-slate-800">🏖️ Situação aquisitiva de férias</h2>
          <GerarPrevisaoPdfBotao
            colaboradorId={c.id}
            periodoAberto={periodoAberto}
            saldo={saldoAberto}
            jaTemFeriasSalvas={jaTemFeriasSalvasAberto}
          />
        </div>
        {aquisitivosLista.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-400">Nenhum período aquisitivo registrado.</p>
            <GerarPrimeiroPeriodoAquisitivoBotao colaboradorId={c.id} />
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                  <th className="py-2 px-1 font-medium">Seq.</th>
                  <th className="py-2 px-1 font-medium">Período aquisitivo</th>
                  <th className="py-2 px-1 font-medium">Status</th>
                  <th className="py-2 px-1 font-medium">Limite</th>
                  <th className="py-2 px-1 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aquisitivosLista.map((p, i) => {
                  const saldo = saldoDoPeriodo(p.id);
                  const dias = diasParaVencerFerias(p.limite_concessao);
                  const completo = p.status === "gozado" || saldo <= 0;
                  return (
                    <tr key={p.id}>
                      <td className="py-2.5 px-1 text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-1 whitespace-nowrap text-slate-700">
                        {formatarDataBR(p.inicio)}–{formatarDataBR(p.fim)}
                      </td>
                      <td className="py-2.5 px-1">
                        {p.status === "vencido" ? (
                          <span className="badge bg-red-50 text-red-600">Vencido</span>
                        ) : completo ? (
                          <span className="badge bg-emerald-50 text-emerald-600">Completo</span>
                        ) : (
                          <span className="badge bg-amber-50 text-amber-600">
                            faltam {saldo} dia{saldo !== 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-1">
                        {completo ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={dias < 0 ? "text-red-600 font-medium" : dias <= 60 ? "text-red-600" : "text-slate-400"}>
                            {dias < 0 ? `vencido há ${Math.abs(dias)} dias` : `vence em ${dias} dias`}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-1">
                        <PeriodoAquisitivoAcoes periodo={p} colaboradorId={c.id} saldo={saldo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {c.tipo !== "PJ" && (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">🏖️ Histórico de férias</h2>
        {(ferias ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma férias registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(ferias as Ferias[]).map((f) => (
              <li key={f.id} className="flex justify-between items-center gap-3 py-2.5">
                <span className="text-slate-700">
                  {formatarDataBR(f.data_inicio)} – {formatarDataBR(f.data_fim)}{" "}
                  <span className="text-slate-400">· {f.dias} dia{f.dias !== 1 ? "s" : ""}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`badge ${FERIAS_STATUS_BADGE[f.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {FERIAS_STATUS_LABEL[f.status] ?? f.status}
                  </span>
                  <ExcluirHistoricoFeriasBotao id={f.id} colaboradorId={c.id} status={f.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

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
          restrito={restrito}
        />
      </div>
    </div>
  );
}
