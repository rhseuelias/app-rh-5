import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, EtapaProcesso, ProcessoIntegracao } from "@/types/db";
import { etapaAtrasada, calcularExperiencia } from "@/lib/calculos";
import RetirarDoPainelBotao from "@/components/integracao/RetirarDoPainelBotao";
import HistoricoLegendaPainel from "@/components/integracao/HistoricoLegendaPainel";

export const dynamic = "force-dynamic";

const STATUS_GERAL_LABEL: Record<string, string> = {
  integracao: "Integração",
  experiencia: "Experiência",
  efetivado: "Efetivado(a)",
  nao_efetivado: "Não efetivado(a)",
};

export default async function PainelIntegracaoPage({
  searchParams,
}: {
  searchParams: { empresa?: string; lider?: string; status?: string };
}) {
  const supabase = createClient();

  const [{ data: processos }, { data: colaboradores }, { data: empresas }, { data: etapas }, { data: config }] =
    await Promise.all([
      supabase.from("processos_integracao").select("*").order("created_at", { ascending: false }),
      supabase.from("colaboradores").select("*"),
      supabase.from("empresas").select("*"),
      supabase.from("etapas_processo").select("*").order("ordem", { ascending: true }),
      supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    ]);

  const prazoSaidaPainelDias = config?.prazo_saida_painel_dias ?? 7;

  // Efetivado(a)/Não efetivado(a) some do painel sozinho depois de X dias (config acima),
  // ou na hora, se alguém retirou manualmente pelo botão 🗑️ — mas o registro continua no banco.
  function deveEstarNoPainel(p: ProcessoIntegracao): boolean {
    if (p.arquivado) return false;
    if (p.status_geral === "efetivado" || p.status_geral === "nao_efetivado") {
      const base = p.status_geral_definido_em;
      if (!base) return true;
      const diasNoStatus = Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
      return diasNoStatus < prazoSaidaPainelDias;
    }
    return true;
  }

  const todosProcessos = (processos ?? []) as ProcessoIntegracao[];
  const listaProcessos = todosProcessos.filter(deveEstarNoPainel);
  const colaboradorPorId = new Map(((colaboradores ?? []) as Colaborador[]).map((c) => [c.id, c]));
  const empresaPorId = new Map(((empresas ?? []) as Empresa[]).map((e) => [e.id, e]));

  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of (etapas ?? []) as EtapaProcesso[]) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }

  // ---- filtros (via URL, bem simples) ----
  const empresasDisponiveis = Array.from(empresaPorId.values());
  const lideresDisponiveis = Array.from(
    new Set(Array.from(colaboradorPorId.values()).map((c) => c.lider).filter(Boolean))
  ) as string[];

  let linhas = listaProcessos.map((p) => {
    const colaborador = colaboradorPorId.get(p.colaborador_id);
    const etapasDoProcesso = (etapasPorProcesso.get(p.id) ?? []).sort((a, b) => a.ordem - b.ordem);
    const etapaAtual = etapasDoProcesso.find(
      (e) => !e.bloqueada && e.status !== "realizado" && e.status !== "em_experiencia"
    );
    const algumaAtrasada = etapasDoProcesso.some((e) => etapaAtrasada(e.prazo, e.status));
    return { processo: p, colaborador, etapasDoProcesso, etapaAtual, algumaAtrasada };
  });

  if (searchParams.empresa) {
    linhas = linhas.filter((l) => l.colaborador?.empresa_id === searchParams.empresa);
  }
  if (searchParams.lider) {
    linhas = linhas.filter((l) => l.colaborador?.lider === searchParams.lider);
  }
  if (searchParams.status) {
    linhas = linhas.filter((l) => l.processo.status_geral === searchParams.status);
  }

  // ---- indicadores (calculados sobre TODOS os processos, não só os filtrados) ----
  const emAndamento = listaProcessos.filter((p) => p.status_geral === "integracao").length;
  const emExperiencia = listaProcessos.filter((p) => p.status_geral === "experiencia").length;
  const efetivados = listaProcessos.filter((p) => p.status_geral === "efetivado").length;

  let atrasadas = 0;
  for (const p of listaProcessos) {
    const etapasDoProcesso = etapasPorProcesso.get(p.id) ?? [];
    if (etapasDoProcesso.some((e) => etapaAtrasada(e.prazo, e.status))) atrasadas++;
  }

  const dentroPrazo = listaProcessos.length - atrasadas;

  // Histórico: totais de TODOS os processos já criados (mesmo os que já saíram do painel
  // por prazo vencido ou pelo botão 🗑️) — os registros nunca são apagados, então
  // Efetivados/Não efetivados continuam contando aqui para sempre.
  const historicoEfetivados = todosProcessos.filter((p) => p.status_geral === "efetivado").length;
  const historicoNaoEfetivados = todosProcessos.filter((p) => p.status_geral === "nao_efetivado").length;
  const itensHistorico = [
    { label: "Novos colaboradores", valor: todosProcessos.length, cor: "bg-blue-500" },
    { label: "Em andamento", valor: emAndamento, cor: "bg-amber-500" },
    { label: "Dentro do prazo", valor: dentroPrazo, cor: "bg-emerald-600" },
    { label: "Atrasadas", valor: atrasadas, cor: "bg-red-600" },
    { label: "Efetivados", valor: historicoEfetivados, cor: "bg-emerald-700" },
    { label: "Não Efetivados", valor: historicoNaoEfetivados, cor: "bg-slate-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Painel de Integração</h1>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhamento em tempo real do processo de integração de cada novo colaborador.
          </p>
        </div>
        <Link href="/configuracoes/integracao" className="text-xs text-brand-600 hover:underline">
          ⚙️ Configurações do processo
        </Link>
      </div>

      <p className="text-xs text-slate-400 -mt-3">
        Efetivado(a) e Não efetivado(a) saem do painel sozinhos depois de {prazoSaidaPainelDias} dias (ou na
        hora, pelo botão 🗑️ no cartão) — os registros e o histórico continuam salvos, só não aparecem mais
        aqui.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMini numero={listaProcessos.length} label="Novos" />
        <KpiMini numero={emAndamento} label="Em andamento" />
        <KpiMini numero={dentroPrazo} label="Dentro do prazo" cor="text-emerald-600" />
        <KpiMini numero={atrasadas} label="Atrasadas" cor="text-red-600" />
        <KpiMini numero={emExperiencia} label="Em experiência" cor="text-blue-600" />
        <KpiMini numero={efetivados} label="Efetivados" />
      </div>

      <div className="card">
        <form className="flex flex-wrap gap-2 mb-5" method="get">
          <select name="empresa" defaultValue={searchParams.empresa ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Empresa/unidade — todas</option>
            {empresasDisponiveis.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
          <select name="lider" defaultValue={searchParams.lider ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Líder — todos</option>
            {lideresDisponiveis.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input !w-auto !text-xs !py-1.5">
            <option value="">Status — todos</option>
            <option value="integracao">Integração</option>
            <option value="experiencia">Experiência</option>
            <option value="efetivado">Efetivado(a)</option>
            <option value="nao_efetivado">Não efetivado(a)</option>
          </select>
          <button type="submit" className="btn-secondary !px-4 !py-2 !text-xs">Filtrar</button>
          {(searchParams.empresa || searchParams.lider || searchParams.status) && (
            <Link href="/onboarding" className="text-xs text-slate-400 self-center hover:underline">Limpar</Link>
          )}
        </form>

        {linhas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum processo de integração ainda — eles são criados automaticamente quando você converte um
            candidato em colaborador na tela de Pré-cadastro (ou pelo botão "Incluir no processo de integração"
            na ficha do colaborador).
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1fr_1fr_272px] gap-4 items-start">
            {(["integracao", "experiencia", "efetivado", "nao_efetivado"] as const).map((statusColuna) => {
              const linhasDaColuna = linhas.filter((l) => l.processo.status_geral === statusColuna);
              return (
                <ColunaKanban
                  key={statusColuna}
                  status={statusColuna}
                  linhas={linhasDaColuna}
                  empresaPorId={empresaPorId}
                  prazoSaidaPainelDias={prazoSaidaPainelDias}
                />
              );
            })}
            <HistoricoLegendaPainel historico={itensHistorico} />
          </div>
        )}
      </div>
    </div>
  );
}

const COLUNA_ICONE: Record<string, string> = {
  integracao: "🧭",
  experiencia: "🧪",
  efetivado: "✅",
  nao_efetivado: "🚫",
};

// Cabeçalho em faixa colorida (degradê), estilo "Modelo 2 — Split view com resumo lateral"
const COLUNA_HEADER: Record<string, string> = {
  integracao: "bg-gradient-to-r from-slate-600 to-slate-500",
  experiencia: "bg-gradient-to-r from-blue-700 to-blue-500",
  efetivado: "bg-gradient-to-r from-emerald-700 to-emerald-500",
  nao_efetivado: "bg-gradient-to-r from-slate-500 to-slate-400",
};

type LinhaProcesso = {
  processo: ProcessoIntegracao;
  colaborador: Colaborador | undefined;
  etapasDoProcesso: EtapaProcesso[];
  etapaAtual: EtapaProcesso | undefined;
  algumaAtrasada: boolean;
};

function ColunaKanban({
  status,
  linhas,
  empresaPorId,
  prazoSaidaPainelDias,
}: {
  status: string;
  linhas: LinhaProcesso[];
  empresaPorId: Map<string, Empresa>;
  prazoSaidaPainelDias: number;
}) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col bg-white border border-slate-100">
      <div className={`flex items-center justify-between px-3.5 py-2.5 text-white ${COLUNA_HEADER[status]}`}>
        <div className="text-xs font-bold">
          {COLUNA_ICONE[status]} {STATUS_GERAL_LABEL[status]}
        </div>
        <div className="text-xs font-bold rounded-full px-2 py-0.5 bg-white/20">
          {linhas.length}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2.5 bg-slate-50/60 flex-grow">
      {linhas.length === 0 && (
        <p className="text-xs text-slate-400 px-1 py-2">Ninguém aqui no momento.</p>
      )}

      {linhas.map(({ processo, colaborador, etapasDoProcesso, etapaAtual, algumaAtrasada }) => {
        const empresa = colaborador?.empresa_id ? empresaPorId.get(colaborador.empresa_id) : null;
        const total = etapasDoProcesso.length || 1;
        const concluidas = etapasDoProcesso.filter(
          (e) => e.status === "realizado" || e.status === "em_experiencia"
        ).length;
        const pct = Math.round((concluidas / total) * 100);

        let faseTexto = "—";
        let badgeTexto = "";
        let badgeCor = "bg-slate-100 text-slate-600";
        let barraCor = "bg-slate-300";
        let diasAteSairDoPainel: number | null = null;

        if (status === "efetivado" || status === "nao_efetivado") {
          if (processo.status_geral_definido_em) {
            const diasNoStatus = Math.floor(
              (Date.now() - new Date(processo.status_geral_definido_em).getTime()) / 86400000
            );
            diasAteSairDoPainel = Math.max(0, prazoSaidaPainelDias - diasNoStatus);
          }
        }

        if (status === "experiencia" && colaborador?.data_admissao) {
          const { diasDecorridos, diasRestantes } = calcularExperiencia(
            colaborador.data_admissao,
            processo.prazo_experiencia_dias
          );
          faseTexto = `Experiência — ${diasDecorridos} de ${processo.prazo_experiencia_dias} dias`;
          badgeTexto = diasRestantes >= 0 ? `${diasRestantes} dias restantes` : "prazo vencido";
          badgeCor = "bg-blue-100 text-blue-700";
          barraCor = "bg-blue-500";
        } else if (status === "efetivado") {
          faseTexto = "Avaliação concluída";
          badgeTexto = "Efetivado(a)";
          badgeCor = "bg-emerald-100 text-emerald-700";
          barraCor = "bg-emerald-500";
        } else if (status === "nao_efetivado") {
          faseTexto = "Processo encerrado";
          badgeTexto = "Não efetivado(a)";
          badgeCor = "bg-slate-200 text-slate-600";
          barraCor = "bg-slate-400";
        } else if (etapaAtual) {
          faseTexto = etapaAtual.nome;
          if (algumaAtrasada) {
            badgeTexto = "Atrasado";
            badgeCor = "bg-red-100 text-red-700";
            barraCor = "bg-red-500";
          } else if (etapaAtual.status === "em_andamento") {
            badgeTexto = "Em andamento";
            badgeCor = "bg-amber-100 text-amber-700";
            barraCor = "bg-amber-500";
          } else {
            badgeTexto = "Não iniciado";
            badgeCor = "bg-slate-100 text-slate-500";
            barraCor = "bg-slate-300";
          }
        } else {
          faseTexto = "Concluído";
        }

        const podeRetirar = status === "efetivado" || status === "nao_efetivado";

        return (
          <div
            key={processo.id}
            className="relative bg-white rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition-shadow"
          >
            {podeRetirar && <RetirarDoPainelBotao processoId={processo.id} />}

            <Link href={`/onboarding/${processo.colaborador_id}`} className="block p-3.5">
              <div className="flex items-center gap-2.5 mb-2 pr-5">
                <div className="w-8 h-8 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {iniciais(colaborador?.nome)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{colaborador?.nome ?? "—"}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {colaborador?.cargo ?? "—"}
                    {empresa ? ` · ${empresa.nome}` : ""}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-1.5">{faseTexto}</p>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                <div className={`h-full rounded-full ${barraCor}`} style={{ width: `${pct}%` }} />
              </div>

              <div className="flex items-center justify-between gap-2">
                {badgeTexto && (
                  <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${badgeCor}`}>
                    {badgeTexto}
                  </span>
                )}
                {diasAteSairDoPainel !== null && (
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {diasAteSairDoPainel === 0
                      ? "sai do painel hoje"
                      : `sai do painel em ${diasAteSairDoPainel}d`}
                  </span>
                )}
              </div>
            </Link>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function iniciais(nome?: string | null): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

// Tile compacto de indicador — estilo "Modelo 2 — Split view com resumo lateral"
function KpiMini({ numero, label, cor }: { numero: number; label: string; cor?: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl px-3.5 py-2.5">
      <p className="text-[10.5px] text-slate-400">{label}</p>
      <p className={`text-lg font-display font-bold mt-0.5 ${cor ?? "text-slate-900"}`}>{numero}</p>
    </div>
  );
}
