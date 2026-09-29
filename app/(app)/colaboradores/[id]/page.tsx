import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  DependenteColaborador,
  Empresa,
  EventoCalendario,
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
  CATEGORIA_EVENTO_LABEL,
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

const STATUS_COLABORADOR: Record<string, { label: string; classe: string }> = {
  experiencia: { label: "Em experiência", classe: "bg-amber-50 text-amber-700" },
  ativo: { label: "Ativo", classe: "bg-emerald-50 text-emerald-700" },
  afastado: { label: "Afastado", classe: "bg-slate-100 text-slate-600" },
  desligado: { label: "Desligado", classe: "bg-red-50 text-red-600" },
};

const ETAPA_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  atrasado: "Atrasado",
};

const ORDEM_ETAPAS = Object.keys(ETAPAS_ONBOARDING_LABEL);

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

/** Idade em anos a partir de "AAAA-MM-DD" (sem depender de fuso horário). */
function idadeEmAnos(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataNascimento);
  if (!m) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - Number(m[1]);
  const mes = hoje.getMonth() + 1 - Number(m[2]);
  if (mes < 0 || (mes === 0 && hoje.getDate() < Number(m[3]))) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0 text-sm">
      <dt className="text-slate-500 shrink-0">{rotulo}</dt>
      <dd className="text-slate-900 font-medium text-right break-words min-w-0">{children}</dd>
    </div>
  );
}

function TituloCartao({
  icone,
  titulo,
  acao,
}: {
  icone: string;
  titulo: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <span aria-hidden className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-lg">
          {icone}
        </span>
        {titulo}
      </h2>
      {acao}
    </div>
  );
}

function AtalhoAcao({ href, icone, texto }: { href: string; icone: string; texto: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 hover:border-brand-400 hover:bg-brand-50 transition-colors"
    >
      <span aria-hidden className="text-lg">
        {icone}
      </span>
      <span className="flex-1">{texto}</span>
      <span aria-hidden className="text-slate-400">
        ›
      </span>
    </a>
  );
}

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
    { data: eventosFuturos },
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
    supabase
      .from("eventos_calendario")
      .select("*")
      .eq("colaborador_id", params.id)
      .gte("data_inicio", new Date().toISOString().slice(0, 10))
      .order("data_inicio", { ascending: true })
      .limit(5),
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

  const status = STATUS_COLABORADOR[c.status] ?? { label: c.status, classe: "bg-slate-100 text-slate-600" };
  const empresa = ((empresas ?? []) as Empresa[]).find((e) => e.id === c.empresa_id) ?? null;
  const idade = idadeEmAnos(c.data_nascimento);
  const ehPJ = c.tipo === "PJ";
  const rotuloDoc = ehPJ ? "CNPJ" : "CPF";
  const inicioContrato = ehPJ ? c.contrato_inicio : c.data_admissao;
  const vencimentoContrato = ehPJ ? c.contrato_fim : c.status === "experiencia" ? c.data_fim_experiencia : null;

  const etapasOnboarding = [...((onboarding ?? []) as OnboardingEtapa[])].sort(
    (a, b) => ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa)
  );
  const etapasConcluidas = etapasOnboarding.filter((o) => o.status === "concluido").length;
  const pctOnboarding =
    etapasOnboarding.length > 0 ? Math.round((etapasConcluidas / etapasOnboarding.length) * 100) : 0;

  // próximos eventos = eventos do calendário deste colaborador + férias futuras já marcadas
  const hojeISO = new Date().toISOString().slice(0, 10);
  const proximosEventos = [
    ...((eventosFuturos ?? []) as EventoCalendario[]).map((e) => ({
      chave: `e-${e.id}`,
      data: e.data_inicio,
      titulo: e.titulo || CATEGORIA_EVENTO_LABEL[e.categoria] || "Evento",
    })),
    ...feriasReaisAtivas
      .filter((f) => f.data_inicio >= hojeISO)
      .map((f) => ({
        chave: `f-${f.id}`,
        data: f.data_inicio,
        titulo: `Férias (${f.dias} dia${f.dias !== 1 ? "s" : ""})`,
      })),
  ]
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Link href="/colaboradores" className="text-sm text-slate-500 hover:text-slate-800 inline-block">
        ← Voltar
      </Link>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div
            aria-hidden
            className="w-16 h-16 rounded-full bg-brand-600 text-white text-xl font-semibold flex items-center justify-center shrink-0"
          >
            {iniciais(c.nome)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-slate-900 break-words">{c.nome}</h1>
              <span className={`badge ${status.classe}`}>{status.label}</span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {TIPO_COLABORADOR_LABEL[c.tipo] ?? c.tipo} · {c.cargo ?? "sem cargo"}
              {!restrito && (
                <>
                  {" "}
                  · custo mensal estimado <strong>{formatarReais(custoMensal)}</strong>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <a href="#editar-ficha" className="btn-secondary text-sm">
            ✏️ Editar
          </a>
          <StatusColaboradorAcoes id={c.id} statusAtual={c.status} />
        </div>
      </div>

      {/* Cartões de resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <TituloCartao
            icone="📄"
            titulo="Contrato"
            acao={
              <a href={ehPJ ? "#contrato-pj" : "#editar-ficha"} className="text-xs text-brand-600 hover:underline">
                Ver detalhes →
              </a>
            }
          />
          <span className={`badge ${status.classe}`}>{status.label}</span>
          <p className="text-sm text-slate-600 mt-2">
            {TIPO_COLABORADOR_LABEL[c.tipo] ?? c.tipo} · {c.cargo ?? "sem cargo"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Início: {formatarDataBR(inicioContrato)}
            {!restrito && <> · Estimativa: {formatarReais(custoMensal)}</>}
          </p>
        </div>

        <div className="card">
          <TituloCartao
            icone="👥"
            titulo="Onboarding"
            acao={
              processo ? (
                <Link href={`/onboarding/${c.id}`} className="text-xs text-brand-600 hover:underline">
                  Ver ficha →
                </Link>
              ) : undefined
            }
          />
          {processo ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>{etapasOnboarding.length > 0 ? "Em andamento" : "Sem etapas"}</span>
                <span>
                  {etapasConcluidas} de {etapasOnboarding.length} etapas
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pctOnboarding}%` }} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Ainda não está no processo de integração.</p>
              <IncluirNoProcessoBotao colaboradorId={c.id} />
            </div>
          )}
        </div>

        {ehPJ ? (
          <div className="card">
            <TituloCartao
              icone="🧾"
              titulo="Nota fiscal"
              acao={
                <a href="#contrato-pj" className="text-xs text-brand-600 hover:underline">
                  Ver detalhes →
                </a>
              }
            />
            {restrito ? (
              <p className="text-sm text-slate-500">Valores disponíveis só para o RH.</p>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-900">
                  {c.valor_nota_fiscal ? formatarReais(c.valor_nota_fiscal) : "—"}
                  <span className="text-xs font-normal text-slate-500"> /mês</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {c.comissao_corte_pct ? `corte ${c.comissao_corte_pct}%` : "corte —"} ·{" "}
                  {c.comissao_quimica_pct ? `química ${c.comissao_quimica_pct}%` : "química —"}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="card">
            <TituloCartao
              icone="🏖️"
              titulo="Férias"
              acao={
                <a href="#ferias" className="text-xs text-brand-600 hover:underline">
                  Ver detalhes →
                </a>
              }
            />
            {periodoAberto ? (
              <>
                <span className="badge bg-emerald-50 text-emerald-700">Em aberto</span>
                <p className="text-sm text-slate-600 mt-2">
                  Período: {formatarDataBR(periodoAberto.inicio)} a {formatarDataBR(periodoAberto.fim)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Saldo: {saldoAberto} dia{saldoAberto !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Nenhum período aquisitivo em aberto.</p>
            )}
          </div>
        )}
      </div>

      {/* Grade de 3 colunas */}
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* Coluna 1 */}
        <div className="space-y-4">
          <div className="card">
            <TituloCartao
              icone="🪪"
              titulo="Dados básicos"
              acao={
                <a href="#editar-ficha" className="text-xs text-brand-600 hover:underline">
                  Editar
                </a>
              }
            />
            <dl>
              <Linha rotulo="Nome completo">{c.nome}</Linha>
              <Linha rotulo={rotuloDoc}>{c.cpf_cnpj || "—"}</Linha>
              {!ehPJ && <Linha rotulo="RG">{c.rg || "—"}</Linha>}
              <Linha rotulo="Data de nascimento">
                {c.data_nascimento
                  ? `${formatarDataBR(c.data_nascimento)}${idade !== null ? ` (${idade} anos)` : ""}`
                  : "—"}
              </Linha>
              <Linha rotulo="E-mail">{c.email || "—"}</Linha>
              <Linha rotulo="Telefone">{c.telefone || "—"}</Linha>
              <Linha rotulo="Endereço">{c.endereco || "—"}</Linha>
            </dl>
          </div>

          <div className="card">
            <TituloCartao
              icone="ℹ️"
              titulo="Informações rápidas"
              acao={
                <a href="#editar-ficha" className="text-xs text-brand-600 hover:underline">
                  Editar
                </a>
              }
            />
            <dl>
              <Linha rotulo="Empresa">{empresa?.nome ?? "—"}</Linha>
              <Linha rotulo="Unidade">{unidadeDoColaborador?.nome ?? "—"}</Linha>
              <Linha rotulo="Departamento">{c.departamento || "—"}</Linha>
              <Linha rotulo="Líder direto">{c.lider || "—"}</Linha>
              <Linha rotulo="Contato de emergência">
                {c.nome_contato_emergencia || c.telefone_contato_emergencia
                  ? [c.nome_contato_emergencia, c.telefone_contato_emergencia].filter(Boolean).join(" · ")
                  : "—"}
              </Linha>
            </dl>
          </div>
        </div>

        {/* Coluna 2 */}
        <div className="space-y-4">
          <div className="card">
            <TituloCartao
              icone="📄"
              titulo="Contrato"
              acao={
                <a href={ehPJ ? "#contrato-pj" : "#editar-ficha"} className="text-xs text-brand-600 hover:underline">
                  Ver detalhes →
                </a>
              }
            />
            <dl>
              <Linha rotulo="Tipo de contrato">{TIPO_COLABORADOR_LABEL[c.tipo] ?? c.tipo}</Linha>
              <Linha rotulo="Cargo">{c.cargo || "Sem cargo"}</Linha>
              {!restrito && (
                <Linha rotulo={ehPJ ? "Valor da nota fiscal" : "Salário base"}>
                  {ehPJ
                    ? c.valor_nota_fiscal
                      ? formatarReais(c.valor_nota_fiscal)
                      : "—"
                    : formatarReais(c.salario_base)}
                </Linha>
              )}
              <Linha rotulo={ehPJ ? "Início do contrato" : "Data de admissão"}>
                {formatarDataBR(inicioContrato)}
              </Linha>
              <Linha rotulo="Status">
                <span className={`badge ${status.classe}`}>{status.label}</span>
              </Linha>
              <Linha rotulo={ehPJ ? "Fim do contrato" : "Fim da experiência"}>
                {vencimentoContrato ? formatarDataBR(vencimentoContrato) : "—"}
              </Linha>
            </dl>
          </div>

          <div className="card">
            <TituloCartao
              icone="✅"
              titulo="Onboarding"
              acao={
                processo ? (
                  <Link href={`/onboarding/${c.id}`} className="text-xs text-brand-600 hover:underline">
                    Ver etapas →
                  </Link>
                ) : undefined
              }
            />
            {etapasOnboarding.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma etapa registrada.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>Progresso</span>
                  <span>
                    {etapasConcluidas} de {etapasOnboarding.length} etapas
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3">
                  <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pctOnboarding}%` }} />
                </div>
                <ul className="space-y-2 text-sm">
                  {etapasOnboarding.map((o) => (
                    <li key={o.id} className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          o.status === "concluido"
                            ? "bg-emerald-500 text-white"
                            : o.status === "em_andamento"
                              ? "bg-brand-600 text-white"
                              : o.status === "atrasado"
                                ? "bg-red-500 text-white"
                                : "border-2 border-slate-300 text-transparent"
                        }`}
                      >
                        {o.status === "concluido" ? "✓" : o.status === "atrasado" ? "!" : "•"}
                      </span>
                      <span className="flex-1 text-slate-700">{ETAPAS_ONBOARDING_LABEL[o.etapa] ?? o.etapa}</span>
                      <span className="text-xs text-slate-500">{ETAPA_STATUS_LABEL[o.status] ?? o.status}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Coluna 3 */}
        <div className="space-y-4">
          <div className="card">
            <TituloCartao icone="⚡" titulo="Ações rápidas" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <AtalhoAcao href="#editar-ficha" icone="✏️" texto="Editar dados" />
              {ehPJ ? (
                <>
                  <AtalhoAcao href="#contrato-pj" icone="🔄" texto="Renovar contrato" />
                  <AtalhoAcao href="#contrato-pj" icone="📑" texto="Emitir contrato" />
                </>
              ) : (
                !restrito && (
                  <>
                    <AtalhoAcao href={`/api/ficha-admissao/${c.id}/pdf`} icone="⬇️" texto="Ficha de admissão (PDF)" />
                    <AtalhoAcao href={`/api/ficha-admissao/${c.id}/excel`} icone="📊" texto="Ficha de admissão (Excel)" />
                  </>
                )
              )}
              {processo && <AtalhoAcao href={`/onboarding/${c.id}`} icone="✅" texto="Processo de integração" />}
            </div>
          </div>

          <div className="card">
            <TituloCartao
              icone="📅"
              titulo="Próximos eventos"
              acao={
                <Link href="/calendario" className="text-xs text-brand-600 hover:underline">
                  Ver calendário →
                </Link>
              }
            />
            {proximosEventos.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum evento marcado daqui pra frente.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {proximosEventos.map((e) => (
                  <li key={e.chave} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-slate-700">{e.titulo}</span>
                    <span className="text-slate-500 shrink-0">{formatarDataBR(e.data)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {c.tipo === "PJ" && (
        <div id="contrato-pj" className="card space-y-4 scroll-mt-6">
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

      {c.tipo !== "PJ" && (
      <div id="ferias" className="card scroll-mt-6">
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

      <div id="editar-ficha" className="scroll-mt-6">
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
