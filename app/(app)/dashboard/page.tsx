import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  EtapaProcesso,
  Ferias,
  PeriodoAquisitivo,
  ProcessoIntegracao,
} from "@/types/db";
import {
  custoMensalColaborador,
  percentualFolhaSobreFaturamento,
  LIMITE_SAUDAVEL_FOLHA_PCT,
  diasParaFimExperiencia,
  diasParaVencerFerias,
  etapaAtrasada,
} from "@/lib/calculos";
import { autoGerarProximosPeriodosVencidos } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";
import FiltrosPainel from "@/components/dashboard/FiltrosPainel";
import IntegracaoPainel from "@/components/dashboard/IntegracaoPainel";
import AvisosRescisoes from "@/components/dashboard/AvisosRescisoes";
import { montarLinhasIntegracao } from "@/components/dashboard/integracao-dados";
import { Gauge, ClimaPorEmpresa, LegendaSemaforo, COR_SEM } from "@/components/dashboard/Semaforo";
import {
  Cartao,
  TituloCartao,
  Pilula,
  Vazio,
  LINK_SUTIL,
  INTER,
  OSWALD,
  TONS,
  iniciais,
  fmt1,
  type Tom,
} from "@/components/dashboard/Blocos";

export const dynamic = "force-dynamic";

const COR_CLT = "#3d3d3d";
const COR_PJ = "#fbb26e";
const COR_ESTAGIO = "#ffd5aa";
const COR_TRILHA = "#f4ebe1";

const META_CLIMA = 80;
const META_TREINAMENTO = 80;
const ESCALA_FOLHA = 25;

const MESES_NOME = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dois = (n: number) => String(n).padStart(2, "0");
const dia10 = (s?: string | null) => (s ? s.slice(0, 10) : "");
const ddmm = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const reais = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function hojeBrasilia() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { ano: partes[0], mes: partes[1], dia: partes[2] };
}

interface LinhaAtencao {
  chave: string;
  rotulo: string;
  n: number;
  tom: Tom;
  href: string;
}

const ICONE_TOM: Record<Tom, string> = { red: "✕", orange: "▲", green: "✓", off: "✓" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { empresa?: string; mes?: string };
}) {
  const supabase = createClient();

  // gera sozinho o próximo período aquisitivo de quem já passou do fim do anterior
  await autoGerarProximosPeriodosVencidos();

  // perfil "assistente" não vê custo/folha/faturamento
  const ocultarFinanceiro = await souAssistente();

  // "hoje" em Brasília
  const b = hojeBrasilia();
  const hoje = new Date(b.ano, b.mes - 1, b.dia);
  const hojeISO = `${b.ano}-${dois(b.mes)}-${dois(b.dia)}`;
  const chaveMesAtual = `${b.ano}-${dois(b.mes)}`;

  const [
    { data: colaboradores },
    { data: empresas },
    { data: processos },
    { data: etapasProcesso },
    { data: configIntegracao },
    { data: periodosAbertos },
    { data: franquias },
    { data: feriasFuturas },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*"),
    supabase.from("empresas").select("*"),
    supabase.from("processos_integracao").select("*"),
    supabase.from("etapas_processo").select("*"),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("franquias_bse").select("*"),
    supabase.from("ferias").select("*").gte("data_inicio", hojeISO).order("data_inicio", { ascending: true }).limit(80),
  ]);

  const lista = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = (empresas ?? []) as Empresa[];

  // ------------------------------------------------------------
  // Datas: mês escolhido (padrão = mês atual)
  // ------------------------------------------------------------
  const opcoesMes = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(b.ano, b.mes - 1 - i, 1);
    return {
      chave: `${d.getFullYear()}-${dois(d.getMonth() + 1)}`,
      rotulo: `${MESES_NOME[d.getMonth()]} ${d.getFullYear()}`,
    };
  });
  const mesAtualSelecionado = opcoesMes.some((o) => o.chave === searchParams?.mes)
    ? (searchParams!.mes as string)
    : chaveMesAtual;
  const ehMesAtual = mesAtualSelecionado === chaveMesAtual;
  const [anoSel, mesSel] = mesAtualSelecionado.split("-").map(Number);
  const ultimoDia = new Date(anoSel, mesSel, 0).getDate();
  const iniMesISO = `${anoSel}-${dois(mesSel)}-01`;
  const fimMesISO = `${anoSel}-${dois(mesSel)}-${dois(ultimoDia)}`;
  const rotuloMes = MESES_NOME[mesSel - 1];

  function ativoEm(c: Colaborador, fimISO: string, atual: boolean): boolean {
    if (atual) return c.status === "ativo" || c.status === "experiencia";
    const adm = dia10(c.data_admissao);
    if (!adm || adm > fimISO) return false;
    const des = dia10(c.data_desligamento);
    return !des || des > fimISO;
  }
  const desligouNoMes = (c: Colaborador) => {
    const d = dia10(c.data_desligamento);
    return !!d && d >= iniMesISO && d <= fimMesISO;
  };
  const admitiuNoMes = (c: Colaborador) => {
    const d = dia10(c.data_admissao);
    return !!d && d >= iniMesISO && d <= fimMesISO;
  };

  // ------------------------------------------------------------
  // Filtro de empresa
  // ------------------------------------------------------------
  const empresaBSE = listaEmpresas.find((e) => normalizar(e.nome).startsWith("bse"));
  const listaFranquias = (franquias ?? []) as { id: string; nome: string; qtd_clt: number; qtd_pj: number }[];
  const franqClt = listaFranquias.reduce((a, f) => a + (f.qtd_clt || 0), 0);
  const franqPj = listaFranquias.reduce((a, f) => a + (f.qtd_pj || 0), 0);
  const franqTotal = franqClt + franqPj;

  const opcoesEmpresa = [
    { chave: "todas", rotulo: "Todas" },
    ...(empresaBSE ? [{ chave: empresaBSE.id, rotulo: empresaBSE.nome }] : []),
    ...(empresaBSE ? [{ chave: "franquias", rotulo: "Franquias" }] : []),
    ...listaEmpresas.filter((e) => e !== empresaBSE).map((e) => ({ chave: e.id, rotulo: e.nome })),
  ];
  const empresaSel = opcoesEmpresa.some((o) => o.chave === searchParams?.empresa)
    ? (searchParams!.empresa as string)
    : "todas";
  const empresaEscolhida = listaEmpresas.find((e) => e.id === empresaSel);
  const incluiFranquias = empresaSel === "todas" || empresaSel === "franquias";

  const noEscopo = (c: Colaborador) => {
    if (empresaSel === "todas") return true;
    if (empresaSel === "franquias") return false;
    return c.empresa_id === empresaSel;
  };
  const escopo = lista.filter(noEscopo);
  const ativosAgora = escopo.filter((c) => c.status === "ativo" || c.status === "experiencia");
  const ativosMes = escopo.filter((c) => ativoEm(c, fimMesISO, ehMesAtual));
  const idsEscopo = new Set(escopo.map((c) => c.id));

  const cltN = ativosMes.filter((c) => c.tipo === "CLT").length + (incluiFranquias ? franqClt : 0);
  const pjN = ativosMes.filter((c) => c.tipo === "PJ").length + (incluiFranquias ? franqPj : 0);
  const estN = ativosMes.filter((c) => c.tipo === "Estagio").length;
  const noSistema = ativosMes.length;
  const emFranquias = incluiFranquias ? franqTotal : 0;
  const totalHead = noSistema + emFranquias;

  const saldoMes = escopo.filter(admitiuNoMes).length - escopo.filter(desligouNoMes).length;

  // empresas que entram nos indicadores (Franquias não têm clima/treinamento/folha cadastrados)
  const empresasNoEscopo = empresaSel === "franquias" ? [] : empresaEscolhida ? [empresaEscolhida] : listaEmpresas;
  const media = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null);
    return v.length > 0 ? v.reduce((a, c) => a + c, 0) / v.length : null;
  };
  const climaMedio = media(empresasNoEscopo.map((e) => e.clima_pct));
  const treinoMedio = media(empresasNoEscopo.map((e) => e.treinamento_pct));

  // folha / faturamento por empresa
  const empresasFolha = empresasNoEscopo.map((e) => {
    const custo = ativosMes.filter((c) => c.empresa_id === e.id).reduce((a, c) => a + custoMensalColaborador(c), 0);
    return { empresa: e, custo, fat: e.faturamento_mensal || 0, pct: percentualFolhaSobreFaturamento(custo, e.faturamento_mensal) };
  });
  const folhaComPct = empresasFolha.filter((x) => x.pct !== null);

  // ------------------------------------------------------------
  // Integração, experiência, férias, contratos
  // ------------------------------------------------------------
  const prazoSaidaPainelDias = configIntegracao?.prazo_saida_painel_dias ?? 7;
  const todosProcessos = (processos ?? []) as ProcessoIntegracao[];
  const todasEtapas = (etapasProcesso ?? []) as EtapaProcesso[];

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
  const processosNoPainel = todosProcessos.filter(deveEstarNoPainel).filter((p) => idsEscopo.has(p.colaborador_id));
  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of todasEtapas) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }
  const atrasadasPainel = processosNoPainel.filter((p) =>
    (etapasPorProcesso.get(p.id) ?? []).some((e) => etapaAtrasada(e.prazo, e.status))
  ).length;
  const linhasIntegracao = montarLinhasIntegracao(processosNoPainel, todasEtapas, lista, listaEmpresas);

  const experienciaVencendo = ativosAgora
    .filter((c) => {
      if (!c.data_fim_experiencia) return false;
      const d = diasParaFimExperiencia(c.data_fim_experiencia);
      return d >= 0 && d <= 15;
    })
    .sort(
      (a, b) => diasParaFimExperiencia(a.data_fim_experiencia!) - diasParaFimExperiencia(b.data_fim_experiencia!)
    );

  const contratosPJVencendo = ativosAgora.filter((c) => {
    if (c.tipo !== "PJ" || !c.contrato_fim) return false;
    const d = diasParaFimExperiencia(c.contrato_fim);
    return d >= 0 && d <= 60;
  }).length;

  const feriasVencendo = ((periodosAbertos ?? []) as PeriodoAquisitivo[]).filter((p) => {
    if (!idsEscopo.has(p.colaborador_id)) return false;
    const d = diasParaVencerFerias(p.limite_concessao);
    return d >= 0 && d <= 30;
  }).length;

  const linhasAtencao = ([
    { chave: "etapas", rotulo: "Etapas de integração atrasadas", n: atrasadasPainel, tom: "red", href: "/onboarding" },
    { chave: "exp", rotulo: "Experiências terminando (até 15 dias)", n: experienciaVencendo.length, tom: "orange", href: "/colaboradores" },
    { chave: "ferias", rotulo: "Férias vencendo (até 30 dias)", n: feriasVencendo, tom: "orange", href: "/ferias" },
    { chave: "pj", rotulo: "Contratos PJ vencendo (até 60 dias)", n: contratosPJVencendo, tom: "orange", href: "/colaboradores" },
  ] as LinhaAtencao[]).sort((a, b) => Number(b.n > 0) - Number(a.n > 0));

  // aniversariantes do mês escolhido
  const aniversariantes = ativosAgora
    .filter((c) => c.data_nascimento && Number(c.data_nascimento.slice(5, 7)) === mesSel)
    .sort((a, b) => Number(a.data_nascimento!.slice(8, 10)) - Number(b.data_nascimento!.slice(8, 10)));
  const nomeEmpresaPorId = Object.fromEntries(listaEmpresas.map((e) => [e.id, e.nome]));

  // próximas férias (planejadas, solicitadas ou aprovadas) de quem está no filtro
  const colabPorId = new Map(lista.map((c) => [c.id, c]));
  const proximasFerias = ((feriasFuturas ?? []) as Ferias[])
    .filter(
      (f) =>
        !f.simulacao &&
        (f.status === "planejada" || f.status === "solicitado" || f.status === "aprovado") &&
        idsEscopo.has(f.colaborador_id)
    )
    .slice(0, 6);

  // ------------------------------------------------------------
  // Colaboradores por empresa (cartões do topo)
  // ------------------------------------------------------------
  const ativosMesGeral = lista.filter((c) => ativoEm(c, fimMesISO, ehMesAtual));
  const contar = (arr: Colaborador[]) => ({
    clt: arr.filter((c) => c.tipo === "CLT").length,
    pj: arr.filter((c) => c.tipo === "PJ").length,
    estagio: arr.filter((c) => c.tipo === "Estagio").length,
  });
  type LinhaEmpresa = { chave: string; nome: string; clt: number; pj: number; estagio: number };
  const linhasEmpresa: LinhaEmpresa[] = [];
  if (empresaBSE) {
    linhasEmpresa.push({
      chave: "bse-propria",
      nome: `${empresaBSE.nome} Própria`,
      ...contar(ativosMesGeral.filter((c) => c.empresa_id === empresaBSE.id)),
    });
    linhasEmpresa.push({ chave: "bse-franq", nome: `${empresaBSE.nome} Franquias`, clt: franqClt, pj: franqPj, estagio: 0 });
  }
  for (const e of listaEmpresas.filter((x) => x !== empresaBSE)) {
    linhasEmpresa.push({ chave: e.id, nome: e.nome, ...contar(ativosMesGeral.filter((c) => c.empresa_id === e.id)) });
  }
  const semEmpresa = ativosMesGeral.filter((c) => !c.empresa_id || !listaEmpresas.some((e) => e.id === c.empresa_id));
  if (semEmpresa.length > 0) linhasEmpresa.push({ chave: "sem", nome: "Sem empresa", ...contar(semEmpresa) });
  const totalLinha = (l: LinhaEmpresa) => l.clt + l.pj + l.estagio;

  const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(new Date());
  const subtitulo = `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${dois(b.dia)} de ${MESES_NOME[b.mes - 1].toLowerCase()} de ${b.ano} · atualizado agora`;

  const nPct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  const rotuloKpi = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737373]";

  // barra CLT / PJ / Estágio reaproveitada nos cartões do topo
  const BarraVinculo = ({ clt, pj, est, alto = 8 }: { clt: number; pj: number; est: number; alto?: number }) => {
    const t = clt + pj + est;
    return (
      <div className="flex rounded-full overflow-hidden" style={{ background: COR_TRILHA, height: alto }}>
        {t > 0 && (
          <>
            <span style={{ width: `${(clt / t) * 100}%`, background: COR_CLT }} />
            <span style={{ width: `${(pj / t) * 100}%`, background: COR_PJ }} />
            {est > 0 && <span style={{ width: `${(est / t) * 100}%`, background: COR_ESTAGIO }} />}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5" style={{ fontFamily: INTER }}>
      {/* Cabeçalho */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1
            className="text-[32px] leading-tight font-semibold text-[#262626] uppercase"
            style={{ fontFamily: OSWALD, letterSpacing: "0.02em" }}
          >
            Painel de RH
          </h1>
          <p className="text-[13px] text-[#737373] mt-1">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LegendaSemaforo />
          <FiltrosPainel
            empresas={opcoesEmpresa}
            empresaAtual={empresaSel}
            meses={opcoesMes}
            mesAtual={mesAtualSelecionado}
          />
        </div>
      </div>

      {/* Cartões do topo: total + cada empresa */}
      <div className="flex flex-wrap gap-4">
        <Cartao className="flex-[1.5_1_280px]">
          <p className={rotuloKpi}>Colaboradores</p>
          <p className="mt-2 text-[40px] leading-none font-semibold text-[#262626] tabular-nums" style={{ fontFamily: OSWALD }}>
            {totalHead}
          </p>
          <p className="text-[12px] mt-2 text-[#737373]">
            <span
              className="font-semibold"
              style={{ color: saldoMes > 0 ? TONS.green.fg : saldoMes < 0 ? TONS.red.fg : "#737373" }}
            >
              {saldoMes > 0 ? `+${saldoMes}` : saldoMes} no mês
            </span>
            {emFranquias > 0 ? ` · ${emFranquias} em franquias` : ""}
          </p>
          {totalHead === 0 ? (
            <p className="text-[13px] text-[#737373] mt-3">Sem colaboradores neste filtro.</p>
          ) : (
            <div className="mt-3">
              <BarraVinculo clt={cltN} pj={pjN} est={estN} alto={10} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-[#3d3d3d] tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-full" style={{ background: COR_CLT }} />
                  CLT {cltN} · {nPct(cltN, totalHead)}%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-full" style={{ background: COR_PJ }} />
                  PJ {pjN} · {nPct(pjN, totalHead)}%
                </span>
                {estN > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <i className="w-2 h-2 rounded-full" style={{ background: COR_ESTAGIO }} />
                    Estágio {estN}
                  </span>
                )}
              </div>
            </div>
          )}
        </Cartao>

        {linhasEmpresa.map((l) => {
          const t = totalLinha(l);
          return (
            <Cartao key={l.chave} className="flex-1 min-w-[170px]">
              <p className={`${rotuloKpi} truncate`}>{l.nome}</p>
              <p className="mt-2 text-[32px] leading-none font-semibold text-[#262626] tabular-nums" style={{ fontFamily: OSWALD }}>
                {t}
              </p>
              <p className="text-[12px] mt-2 text-[#737373] tabular-nums">
                CLT {l.clt} · PJ {l.pj}
                {l.estagio > 0 ? ` · Est. ${l.estagio}` : ""}
              </p>
              <div className="mt-3">
                <BarraVinculo clt={l.clt} pj={l.pj} est={l.estagio} />
              </div>
            </Cartao>
          );
        })}
      </div>

      {/* Clima, treinamento e custo da folha */}
      <div className={`grid grid-cols-1 gap-4 ${ocultarFinanceiro ? "lg:grid-cols-2" : "lg:grid-cols-[1fr_1fr_2.1fr]"}`}>
        <Cartao>
          <Gauge
            titulo="Clima"
            pct={climaMedio}
            meta={META_CLIMA}
            nota={empresasNoEscopo.length > 1 ? "média das empresas" : undefined}
          />
        </Cartao>
        <Cartao>
          <Gauge
            titulo="Treinamento"
            pct={treinoMedio}
            meta={META_TREINAMENTO}
            nota={empresasNoEscopo.length > 1 ? "média das empresas" : undefined}
          />
        </Cartao>

        {!ocultarFinanceiro && (
          <Cartao>
            <TituloCartao direita={<span>meta: até {LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento</span>}>
              Custo da folha ÷ faturamento
            </TituloCartao>
            {folhaComPct.length === 0 ? (
              <Vazio>Sem faturamento cadastrado neste filtro.</Vazio>
            ) : (
              <div className="space-y-4">
                {folhaComPct.map(({ empresa: e, custo, fat, pct }) => {
                  const bom = (pct as number) <= LIMITE_SAUDAVEL_FOLHA_PCT;
                  const cor = bom ? COR_SEM.bom : COR_SEM.critico;
                  return (
                    <div key={e.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-semibold text-[#262626]">{e.nome}</span>
                        <span className="text-[13px] font-semibold tabular-nums" style={{ color: bom ? TONS.green.fg : TONS.red.fg }}>
                          {bom ? "✓" : "✕"} {fmt1(pct as number)}%
                        </span>
                      </div>
                      <span className="relative block h-[10px] rounded-full mt-1.5" style={{ background: COR_TRILHA }}>
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.min(100, ((pct as number) / ESCALA_FOLHA) * 100)}%`, background: cor }}
                        />
                        <span
                          className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-black"
                          style={{ left: `${(LIMITE_SAUDAVEL_FOLHA_PCT / ESCALA_FOLHA) * 100}%` }}
                          title={`Meta: ${LIMITE_SAUDAVEL_FOLHA_PCT}%`}
                        />
                      </span>
                      <p className="text-[12px] text-[#737373] mt-1 tabular-nums">
                        folha R$ {reais(custo)} · faturamento R$ {reais(fat)}
                      </p>
                    </div>
                  );
                })}
                <p className="text-[12px] text-[#737373]">A linha preta marca a meta de {LIMITE_SAUDAVEL_FOLHA_PCT}%.</p>
              </div>
            )}
          </Cartao>
        )}
      </div>

      {/* Processo de integração */}
      <IntegracaoPainel linhas={linhasIntegracao} />

      {/* Avisos prévios e rescisões */}
      <AvisosRescisoes
        mesChave={mesAtualSelecionado}
        idsColaboradores={empresaSel === "todas" ? null : Array.from(idsEscopo)}
      />

      {/* Clima por empresa, experiência e pendências */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_.8fr] gap-4">
        <Cartao>
          <TituloCartao direita={<span>meta: acima de {META_CLIMA}%</span>}>Clima de cada empresa</TituloCartao>
          <ClimaPorEmpresa
            itens={empresasNoEscopo.map((e) => ({ nome: e.nome, pct: e.clima_pct }))}
            meta={META_CLIMA}
          />
        </Cartao>

        <Cartao>
          <TituloCartao direita={<Link href="/colaboradores" className={LINK_SUTIL}>Ver todos</Link>}>
            Experiência terminando
          </TituloCartao>
          {experienciaVencendo.length === 0 ? (
            <Vazio>Nenhum caso nos próximos 15 dias.</Vazio>
          ) : (
            <ul className="space-y-3">
              {experienciaVencendo.slice(0, 5).map((c) => {
                const dias = diasParaFimExperiencia(c.data_fim_experiencia!);
                const fim = dia10(c.data_fim_experiencia);
                const urgente = dias <= 7;
                return (
                  <li key={c.id} className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
                      style={{ background: COR_TRILHA, color: "#93440c" }}
                    >
                      {iniciais(c.nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/colaboradores/${c.id}`} className="block text-[13px] font-semibold text-[#262626] truncate hover:underline">
                        {c.nome}
                      </Link>
                      <p className="text-[12px] text-[#737373] truncate">
                        {c.cargo ? `${c.cargo} · ` : ""}termina {ddmm(fim)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Pilula tom={urgente ? "red" : "orange"}>
                        {urgente ? "✕" : "▲"} {dias} dia{dias !== 1 ? "s" : ""}
                      </Pilula>
                      <Link href="/onboarding" className={LINK_SUTIL}>
                        {urgente ? "Efetivar" : "Revisar avaliação"}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Pendências</TituloCartao>
          <ul className="divide-y divide-[#f4ebe1]">
            {linhasAtencao.map((l) => {
              const zero = l.n === 0;
              return (
                <li key={l.chave} className="py-2.5" style={{ opacity: zero ? 0.6 : 1 }}>
                  <Link href={l.href} className="flex items-center justify-between gap-3 group">
                    <span className="text-[13px] text-[#3d3d3d] group-hover:text-[#262626] min-w-0">
                      <span className="block">{l.rotulo}</span>
                    </span>
                    <Pilula tom={zero ? "green" : l.tom}>
                      {zero ? "✓" : ICONE_TOM[l.tom]} {l.n} ›
                    </Pilula>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Cartao>
      </div>

      {/* Aniversariantes e próximas férias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Cartao>
          <TituloCartao direita={<Link href="/aniversarios" className={LINK_SUTIL}>Ver todos</Link>}>
            Aniversariantes de {rotuloMes.toLowerCase()}
          </TituloCartao>
          {aniversariantes.length === 0 ? (
            <Vazio>Nenhum aniversariante neste mês.</Vazio>
          ) : (
            <ul className="space-y-2.5">
              {aniversariantes.slice(0, 7).map((c) => (
                <li key={c.id} className="flex items-baseline gap-3">
                  <span className="text-[13px] font-semibold tabular-nums shrink-0 w-11" style={{ color: "#93440c" }}>
                    {ddmm(c.data_nascimento)}
                  </span>
                  <Link href={`/colaboradores/${c.id}`} className="text-[13px] text-[#262626] truncate hover:underline min-w-0 flex-1">
                    {c.nome}
                  </Link>
                  <span className="text-[12px] text-[#737373] truncate max-w-[40%]">
                    {c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "" : ""}
                  </span>
                </li>
              ))}
              {aniversariantes.length > 7 && (
                <li className="text-[12px] text-[#737373]">+ {aniversariantes.length - 7} neste mês</li>
              )}
            </ul>
          )}
        </Cartao>

        <Cartao>
          <TituloCartao direita={<Link href="/ferias" className={LINK_SUTIL}>Ver férias</Link>}>
            Próximas férias
          </TituloCartao>
          {proximasFerias.length === 0 ? (
            <Vazio>Nenhuma férias marcada daqui para frente.</Vazio>
          ) : (
            <ul className="space-y-2.5">
              {proximasFerias.map((f) => {
                const c = colabPorId.get(f.colaborador_id);
                const [ya, ma, da] = f.data_inicio.slice(0, 10).split("-").map(Number);
                const faltam = differenceInCalendarDays(new Date(ya, ma - 1, da), hoje);
                return (
                  <li key={f.id} className="flex items-baseline gap-3">
                    <span className="text-[13px] font-semibold tabular-nums shrink-0 w-[92px]" style={{ color: "#93440c" }}>
                      {ddmm(f.data_inicio)} a {ddmm(f.data_fim)}
                    </span>
                    <Link
                      href={c ? `/colaboradores/${c.id}` : "/ferias"}
                      className="text-[13px] text-[#262626] truncate hover:underline min-w-0 flex-1"
                    >
                      {c?.nome ?? "Colaborador"}
                    </Link>
                    <span className="text-[12px] text-[#737373] whitespace-nowrap tabular-nums">
                      {faltam === 0 ? "começa hoje" : `em ${faltam} dia${faltam === 1 ? "" : "s"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
