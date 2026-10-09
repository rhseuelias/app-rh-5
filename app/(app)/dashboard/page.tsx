import Link from "next/link";
import { differenceInCalendarDays, subMonths } from "date-fns";
import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  EtapaProcesso,
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
import TimelineResumo from "@/components/dashboard/TimelineResumo";
import AvisosDesligamentoPainel from "@/components/desligamento/AvisosDesligamentoPainel";
import FiltrosPainel from "@/components/dashboard/FiltrosPainel";
import EvolucaoLinhas from "@/components/dashboard/EvolucaoLinhas";
import {
  Cartao,
  TituloCartao,
  Pilula,
  SeloExemplo,
  Vazio,
  CABECALHO_TABELA,
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
const COR_CARGO = "#f0913f";
const COR_FOLHA = "#2f9e6b";
const COR_TRILHA = "#f4ebe1";

const MESES_NOME = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dois = (n: number) => String(n).padStart(2, "0");
const dia10 = (s?: string | null) => (s ? s.slice(0, 10) : "");

/** Série mensal "de exemplo" (12 pontos), terminando no valor real de hoje.
 * Determinística, só para ilustrar até o app guardar histórico de verdade. */
function gerarSerieExemplo(valorAtual: number, amplitude: number, hoje: Date) {
  const MESES = 12;
  return Array.from({ length: MESES }, (_, i) => {
    const idx = MESES - 1 - i;
    const d = subMonths(hoje, idx);
    const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    if (idx === 0) return { mes, valor: Math.round(valorAtual * 10) / 10 };
    const onda = Math.sin((MESES - idx) * 1.1) * amplitude;
    const tendencia = valorAtual - amplitude * 0.6 * (idx / MESES);
    return { mes, valor: Math.max(0, Math.round((tendencia + onda) * 10) / 10) };
  });
}

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
  exemplo?: boolean;
}

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

  const [
    { data: colaboradores },
    { data: empresas },
    { data: processos },
    { data: etapasProcesso },
    { data: configIntegracao },
    { data: periodosAbertos },
    { data: franquias },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*"),
    supabase.from("empresas").select("*"),
    supabase.from("processos_integracao").select("*"),
    supabase.from("etapas_processo").select("*"),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("franquias_bse").select("*"),
  ]);

  const lista = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = (empresas ?? []) as Empresa[];

  // ------------------------------------------------------------
  // Datas: "hoje" em Brasília, mês escolhido (padrão = mês atual)
  // ------------------------------------------------------------
  const b = hojeBrasilia();
  const hoje = new Date(b.ano, b.mes - 1, b.dia);
  const chaveMesAtual = `${b.ano}-${dois(b.mes)}`;

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
  const anoAnt = mesSel === 1 ? anoSel - 1 : anoSel;
  const mesAnt = mesSel === 1 ? 12 : mesSel - 1;
  const iniAntISO = `${anoAnt}-${dois(mesAnt)}-01`;
  const fimAntISO = `${anoAnt}-${dois(mesAnt)}-${dois(new Date(anoAnt, mesAnt, 0).getDate())}`;
  const rotuloMes = MESES_NOME[mesSel - 1];

  function ativoEm(c: Colaborador, fimISO: string, atual: boolean): boolean {
    if (atual) return c.status === "ativo" || c.status === "experiencia";
    const adm = dia10(c.data_admissao);
    if (!adm || adm > fimISO) return false;
    const des = dia10(c.data_desligamento);
    return !des || des > fimISO;
  }
  const desligouNoMes = (c: Colaborador, iniISO: string, fimISO: string) => {
    const d = dia10(c.data_desligamento);
    return !!d && d >= iniISO && d <= fimISO;
  };
  const admitiuNoMes = (c: Colaborador, iniISO: string, fimISO: string) => {
    const d = dia10(c.data_admissao);
    return !!d && d >= iniISO && d <= fimISO;
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
  const ativosMesAnterior = escopo.filter((c) => ativoEm(c, fimAntISO, false));
  const idsEscopo = new Set(escopo.map((c) => c.id));

  const cltN = ativosMes.filter((c) => c.tipo === "CLT").length + (incluiFranquias ? franqClt : 0);
  const pjN = ativosMes.filter((c) => c.tipo === "PJ").length + (incluiFranquias ? franqPj : 0);
  const estN = ativosMes.filter((c) => c.tipo === "Estagio").length;
  const noSistema = ativosMes.length;
  const emFranquias = incluiFranquias ? franqTotal : 0;
  const totalHead = noSistema + emFranquias;

  const admissoesMes = escopo.filter((c) => admitiuNoMes(c, iniMesISO, fimMesISO)).length;
  const desligMes = escopo.filter((c) => desligouNoMes(c, iniMesISO, fimMesISO)).length;
  const saldoMes = admissoesMes - desligMes;

  const turnover = noSistema > 0 ? (desligMes / noSistema) * 100 : 0;
  const desligAnt = escopo.filter((c) => desligouNoMes(c, iniAntISO, fimAntISO)).length;
  const turnoverAnt = ativosMesAnterior.length > 0 ? (desligAnt / ativosMesAnterior.length) * 100 : null;
  const deltaTurnover = turnoverAnt === null ? null : turnover - turnoverAnt;

  // absenteísmo (campo cadastrado por empresa)
  const empresasNoEscopo = empresaEscolhida ? [empresaEscolhida] : listaEmpresas;
  const valoresAbs = empresasNoEscopo.map((e) => e.absenteismo_pct).filter((v): v is number => v != null);
  const absenteismo = valoresAbs.length > 0 ? valoresAbs.reduce((a, c) => a + c, 0) / valoresAbs.length : null;

  // folha / faturamento
  const empresasFolha = empresasNoEscopo
    .map((e) => {
      const custo = ativosMes.filter((c) => c.empresa_id === e.id).reduce((a, c) => a + custoMensalColaborador(c), 0);
      return { empresa: e, custo, pct: percentualFolhaSobreFaturamento(custo, e.faturamento_mensal) };
    });
  const comFat = empresasFolha.filter((x) => x.pct !== null);
  const somaCusto = comFat.reduce((a, x) => a + x.custo, 0);
  const somaFat = comFat.reduce((a, x) => a + (x.empresa.faturamento_mensal || 0), 0);
  const folhaPct = percentualFolhaSobreFaturamento(somaCusto, somaFat);
  const maiorFolha = comFat.length > 1 ? [...comFat].sort((a, b) => (b.pct as number) - (a.pct as number))[0] : null;

  // ------------------------------------------------------------
  // Atenção — próximos 60 dias
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

  // 🧪 exemplos (o app ainda não guarda PDI nem avaliação de desempenho)
  const pdiAndamentoEx = Math.max(1, Math.round(ativosAgora.length * 0.18));
  const pdisAtrasadosEx = Math.max(0, Math.round(pdiAndamentoEx * 0.2));
  const avaliacoesPendentesEx = Math.max(0, Math.round(ativosAgora.length * 0.1));

  const linhasAtencao = ([
    { chave: "etapas", rotulo: "Etapas de integração atrasadas", n: atrasadasPainel, tom: "red", href: "/onboarding" },
    { chave: "pdis", rotulo: "PDIs atrasados", n: pdisAtrasadosEx, tom: "red", href: "/colaboradores", exemplo: true },
    { chave: "exp", rotulo: "Experiências terminando (≤15 dias)", n: experienciaVencendo.length, tom: "orange", href: "/colaboradores" },
    { chave: "aval", rotulo: "Avaliações de desempenho pendentes", n: avaliacoesPendentesEx, tom: "orange", href: "/colaboradores", exemplo: true },
    { chave: "ferias", rotulo: "Férias vencendo (≤30 dias)", n: feriasVencendo, tom: "orange", href: "/ferias" },
    { chave: "pj", rotulo: "Contratos PJ vencendo (≤60 dias)", n: contratosPJVencendo, tom: "orange", href: "/colaboradores" },
  ] as LinhaAtencao[]).sort((a, b) => Number(b.n > 0) - Number(a.n > 0));

  // aniversariantes do mês escolhido
  const aniversariantes = ativosAgora
    .filter((c) => c.data_nascimento && Number(c.data_nascimento.slice(5, 7)) === mesSel)
    .sort((a, b) => Number(a.data_nascimento!.slice(8, 10)) - Number(b.data_nascimento!.slice(8, 10)));
  const nomeEmpresaPorId = Object.fromEntries(listaEmpresas.map((e) => [e.id, e.nome]));

  // ------------------------------------------------------------
  // Colaboradores por empresa (todas, no mês escolhido)
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
  const maxLinha = Math.max(1, ...linhasEmpresa.map(totalLinha));
  const totalTodas = linhasEmpresa.reduce((a, l) => a + totalLinha(l), 0);

  // ------------------------------------------------------------
  // Tempo de empresa e cargos (escopo + mês)
  // ------------------------------------------------------------
  const faixas = [
    { faixa: "Menos de 1 ano", total: 0 },
    { faixa: "1 a 3 anos", total: 0 },
    { faixa: "3 a 5 anos", total: 0 },
    { faixa: "Mais de 5 anos", total: 0 },
  ];
  const refData = ehMesAtual ? hoje : new Date(anoSel, mesSel - 1, ultimoDia);
  for (const c of ativosMes) {
    if (!c.data_admissao) continue;
    const [ya, ma, da] = dia10(c.data_admissao).split("-").map(Number);
    const anos = differenceInCalendarDays(refData, new Date(ya, ma - 1, da)) / 365.25;
    if (anos < 1) faixas[0].total++;
    else if (anos < 3) faixas[1].total++;
    else if (anos < 5) faixas[2].total++;
    else faixas[3].total++;
  }
  const maxFaixa = Math.max(1, ...faixas.map((f) => f.total));

  const contagemCargo = new Map<string, number>();
  for (const c of ativosMes) {
    const k = c.cargo?.trim() || "Sem cargo";
    contagemCargo.set(k, (contagemCargo.get(k) ?? 0) + 1);
  }
  const cargosOrd = [...contagemCargo.entries()].sort((a, b) => b[1] - a[1]);
  const TOP = 6;
  const dadosCargo =
    cargosOrd.length > TOP
      ? [
          ...cargosOrd.slice(0, TOP).map(([nome, total]) => ({ nome, total })),
          { nome: "Outros", total: cargosOrd.slice(TOP).reduce((a, [, t]) => a + t, 0) },
        ]
      : cargosOrd.map(([nome, total]) => ({ nome, total }));
  const maxCargo = Math.max(1, ...dadosCargo.map((d) => d.total));

  // ------------------------------------------------------------
  // Visão por empresa
  // ------------------------------------------------------------
  const empresasVisao = (empresaEscolhida ? [empresaEscolhida] : listaEmpresas).map((e) => {
    const doGrupo = lista.filter((c) => c.empresa_id === e.id);
    const ativosEmp = doGrupo.filter((c) => ativoEm(c, fimMesISO, ehMesAtual));
    const custo = ativosEmp.reduce((a, c) => a + custoMensalColaborador(c), 0);
    const deslig = doGrupo.filter((c) => desligouNoMes(c, iniMesISO, fimMesISO)).length;
    return {
      empresa: e,
      headcount: ativosEmp.length,
      turnover: ativosEmp.length > 0 ? (deslig / ativosEmp.length) * 100 : 0,
      pct: percentualFolhaSobreFaturamento(custo, e.faturamento_mensal),
    };
  });
  const algumaSemPerformance = empresasVisao.some((v) => v.empresa.performance_pct == null);
  const COLS_VISAO = ocultarFinanceiro
    ? "1.2fr .8fr .8fr .8fr .8fr"
    : "1.2fr .8fr .8fr .8fr .8fr 2fr";

  // 🧪 evolução (exemplo)
  const serieAbs = gerarSerieExemplo(absenteismo ?? 3, 0.6, hoje);
  const serieTurn = gerarSerieExemplo(turnover, 0.8, hoje);

  const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(new Date());
  const subtitulo = `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${dois(b.dia)} de ${MESES_NOME[b.mes - 1].toLowerCase()} de ${b.ano} · atualizado agora`;

  const nPct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  const colsKpi = ocultarFinanceiro
    ? "lg:grid-cols-[1.2fr_1.6fr_1fr_1fr]"
    : "lg:grid-cols-[1.2fr_1.6fr_1fr_1fr_1fr]";

  const valorKpi = "font-semibold text-[#262626] tabular-nums leading-none";
  const rotuloKpi = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737373]";

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
        <FiltrosPainel
          empresas={opcoesEmpresa}
          empresaAtual={empresaSel}
          meses={opcoesMes}
          mesAtual={mesAtualSelecionado}
        />
      </div>

      {/* Faixa de indicadores */}
      <div className="rounded-[12px] border border-[#f1e4d6] overflow-hidden bg-[#f1e4d6]">
        <div className={`grid grid-cols-2 ${colsKpi} gap-px`}>
          {/* Colaboradores */}
          <div className="bg-white px-6 py-5 col-span-2 lg:col-span-1">
            <p className={rotuloKpi}>Colaboradores</p>
            <p className={`${valorKpi} text-[40px] mt-2`} style={{ fontFamily: OSWALD }}>
              {totalHead}
            </p>
            <p className="text-[12px] mt-2 text-[#737373]">
              <span style={{ color: saldoMes > 0 ? TONS.green.fg : saldoMes < 0 ? TONS.red.fg : "#737373" }} className="font-semibold">
                {saldoMes > 0 ? `+${saldoMes}` : saldoMes} no mês
              </span>
              {" · "}
              {noSistema} no sistema{emFranquias > 0 ? ` · ${emFranquias} em franquias` : ""}
            </p>
          </div>

          {/* Vínculo */}
          <div className="bg-white px-6 py-5 col-span-2 lg:col-span-1">
            <p className={rotuloKpi}>Vínculo</p>
            {totalHead === 0 ? (
              <p className="text-[13px] text-[#737373] mt-3">Sem colaboradores neste filtro.</p>
            ) : (
              <>
                <div className="flex h-[10px] rounded-full overflow-hidden mt-4" style={{ background: COR_TRILHA }}>
                  <span style={{ width: `${(cltN / totalHead) * 100}%`, background: COR_CLT }} />
                  <span style={{ width: `${(pjN / totalHead) * 100}%`, background: COR_PJ }} />
                  {estN > 0 && <span style={{ width: `${(estN / totalHead) * 100}%`, background: COR_ESTAGIO }} />}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px] text-[#3d3d3d] tabular-nums">
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
                      Estágio {estN} · {nPct(estN, totalHead)}%
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Turnover */}
          <div className="bg-white px-6 py-5">
            <p className={rotuloKpi}>Turnover (mês)</p>
            <p className={`${valorKpi} text-[28px] mt-3`}>{fmt1(turnover)}%</p>
            <p className="text-[12px] mt-2 font-semibold tabular-nums" style={{ color: deltaTurnover === null ? "#737373" : deltaTurnover <= 0 ? TONS.green.fg : TONS.red.fg }}>
              {deltaTurnover === null
                ? "—"
                : `${deltaTurnover > 0 ? "+" : ""}${fmt1(deltaTurnover)} p.p. vs mês anterior`}
            </p>
          </div>

          {/* Absenteísmo */}
          <div className="bg-white px-6 py-5">
            <p className={rotuloKpi}>Absenteísmo</p>
            <p className={`${valorKpi} text-[28px] mt-3`}>{absenteismo === null ? "—" : `${fmt1(absenteismo)}%`}</p>
            <p className="text-[12px] mt-2 text-[#737373]">{absenteismo === null ? "não informado" : "média cadastrada"}</p>
          </div>

          {/* Folha / faturamento */}
          {!ocultarFinanceiro && (
            <div className="bg-white px-6 py-5 col-span-2 lg:col-span-1">
              <p className={rotuloKpi}>Folha / faturamento</p>
              <p className={`${valorKpi} text-[28px] mt-3`} style={{ color: folhaPct === null ? "#262626" : folhaPct <= LIMITE_SAUDAVEL_FOLHA_PCT ? COR_FOLHA : TONS.red.fg }}>
                {folhaPct === null ? "—" : `${fmt1(folhaPct)}%`}
              </p>
              <p className="text-[12px] mt-2 text-[#737373]">
                meta {LIMITE_SAUDAVEL_FOLHA_PCT}%
                {maiorFolha ? ` · maior: ${maiorFolha.empresa.nome}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Desligamentos: pagamento e homologação (some se não houver ninguém) */}
      <AvisosDesligamentoPainel />

      {/* Atenção / experiência / aniversários */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr_1fr] gap-4">
        <Cartao>
          <TituloCartao>Precisa de atenção — próximos 60 dias</TituloCartao>
          <ul className="divide-y divide-[#f4ebe1]">
            {linhasAtencao.map((l) => {
              const zero = l.n === 0;
              return (
                <li key={l.chave} className="py-2.5" style={{ opacity: zero ? 0.6 : 1 }}>
                  <Link href={l.href} className="flex items-center justify-between gap-3 group">
                    <span className="text-[13px] text-[#3d3d3d] group-hover:text-[#262626] flex items-center gap-2 min-w-0">
                      <span className="truncate">{l.rotulo}</span>
                      {l.exemplo && <SeloExemplo />}
                    </span>
                    <Pilula tom={zero ? "off" : l.tom}>{l.n} ›</Pilula>
                  </Link>
                </li>
              );
            })}
          </ul>
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
                        {c.cargo ? `${c.cargo} · ` : ""}termina {fim.slice(8, 10)}/{fim.slice(5, 7)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Pilula tom={urgente ? "red" : "orange"}>{dias} dia{dias !== 1 ? "s" : ""}</Pilula>
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
                    {c.data_nascimento!.slice(8, 10)}/{c.data_nascimento!.slice(5, 7)}
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
      </div>

      {/* Colaboradores por empresa */}
      <Cartao>
        <TituloCartao
          direita={
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: COR_CLT }} />CLT</span>
              <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: COR_PJ }} />PJ</span>
            </span>
          }
        >
          Colaboradores por empresa
        </TituloCartao>
        {linhasEmpresa.length === 0 ? (
          <Vazio>Nenhuma empresa cadastrada.</Vazio>
        ) : (
          <div className="space-y-3">
            {linhasEmpresa.map((l) => {
              const t = totalLinha(l);
              return (
                <div key={l.chave} className="grid grid-cols-[130px_1fr_90px] sm:grid-cols-[170px_1fr_110px] items-center gap-3">
                  <span className="text-[13px] text-[#3d3d3d] truncate">{l.nome}</span>
                  <div className="h-6 rounded-[6px] overflow-hidden flex" style={{ background: COR_TRILHA }}>
                    {[
                      { v: l.clt, cor: COR_CLT, texto: "#fff" },
                      { v: l.pj, cor: COR_PJ, texto: "#262626" },
                      { v: l.estagio, cor: COR_ESTAGIO, texto: "#262626" },
                    ]
                      .filter((s) => s.v > 0)
                      .map((s, i) => (
                        <span
                          key={i}
                          className="flex items-center justify-center text-[12px] font-semibold tabular-nums"
                          style={{ width: `${(s.v / maxLinha) * 100}%`, background: s.cor, color: s.texto }}
                        >
                          {s.v}
                        </span>
                      ))}
                  </div>
                  <span className="text-right tabular-nums">
                    <span className="text-[20px] font-semibold text-[#262626]" style={{ fontFamily: OSWALD }}>{t}</span>
                    <span className="text-[12px] text-[#737373] ml-1.5">{nPct(t, totalTodas)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Cartao>

      {/* Integração */}
      <TimelineResumo
        processos={processosNoPainel}
        etapas={todasEtapas}
        colaboradores={lista}
        empresas={listaEmpresas}
      />

      {/* Visão por empresa */}
      {empresasVisao.length > 0 && (
        <Cartao>
          <TituloCartao>Visão por empresa</TituloCartao>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`grid gap-3 border-b border-[#f4ebe1] pb-2 ${CABECALHO_TABELA}`} style={{ gridTemplateColumns: COLS_VISAO }}>
                <div>Empresa</div>
                <div>Headcount</div>
                <div>Performance</div>
                <div>Turnover</div>
                <div>Absenteísmo</div>
                {!ocultarFinanceiro && <div>Folha / faturamento</div>}
              </div>
              {empresasVisao.map(({ empresa: e, headcount, turnover: t, pct }) => (
                <div
                  key={e.id}
                  className="grid gap-3 items-center py-3 border-b border-[#f4ebe1] last:border-b-0 text-[13px] text-[#3d3d3d] tabular-nums"
                  style={{ gridTemplateColumns: COLS_VISAO }}
                >
                  <div className="font-semibold text-[#262626] truncate">{e.nome}</div>
                  <div>{headcount}</div>
                  <div>{e.performance_pct != null ? `${e.performance_pct}%` : "—"}</div>
                  <div>{fmt1(t)}%</div>
                  <div>{e.absenteismo_pct != null ? `${fmt1(e.absenteismo_pct)}%` : "—"}</div>
                  {!ocultarFinanceiro && (
                    <div className="flex items-center gap-3">
                      {pct === null ? (
                        <span className="text-[#737373]">—</span>
                      ) : (
                        <>
                          <span
                            className="font-semibold w-12 shrink-0"
                            style={{ color: pct <= LIMITE_SAUDAVEL_FOLHA_PCT ? "#1f7a52" : TONS.red.fg }}
                          >
                            {fmt1(pct)}%
                          </span>
                          <span className="relative h-2 flex-1 rounded-full" style={{ background: COR_TRILHA }}>
                            <span
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{
                                width: `${Math.min(100, (pct / 20) * 100)}%`,
                                background: pct <= LIMITE_SAUDAVEL_FOLHA_PCT ? COR_FOLHA : "#d92d20",
                              }}
                            />
                            <span
                              className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-black"
                              style={{ left: `${(LIMITE_SAUDAVEL_FOLHA_PCT / 20) * 100}%` }}
                              title={`Meta: ${LIMITE_SAUDAVEL_FOLHA_PCT}%`}
                            />
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-[#737373] mt-3">
            {!ocultarFinanceiro && `A linha preta marca a meta de ${LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento. `}
            {algumaSemPerformance && "Performance e absenteísmo vêm do cadastro da empresa; “—” significa que ainda não foi informado."}
          </p>
        </Cartao>
      )}

      {/* Tempo de empresa, cargos e evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.3fr] gap-4">
        <Cartao>
          <TituloCartao>Tempo de empresa</TituloCartao>
          <div className="space-y-3">
            {faixas.map((f) => (
              <div key={f.faixa}>
                <div className="flex justify-between text-[13px] text-[#3d3d3d] mb-1">
                  <span>{f.faixa}</span>
                  <span className="font-semibold text-[#262626] tabular-nums">{f.total}</span>
                </div>
                <div className="h-[14px] rounded-[6px]" style={{ background: COR_TRILHA }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${(f.total / maxFaixa) * 100}%`, background: COR_CLT }} />
                </div>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao>
          <TituloCartao>Distribuição por cargo</TituloCartao>
          {dadosCargo.length === 0 ? (
            <Vazio>Sem dados de cargo neste filtro.</Vazio>
          ) : (
            <div className="space-y-2.5">
              {dadosCargo.map((d) => (
                <div key={d.nome}>
                  <div className="flex justify-between gap-2 text-[13px] text-[#3d3d3d] mb-1">
                    <span className="truncate">{d.nome}</span>
                    <span className="font-semibold text-[#262626] tabular-nums">{d.total}</span>
                  </div>
                  <div className="h-[6px] rounded-full" style={{ background: COR_TRILHA }}>
                    <div className="h-full rounded-full" style={{ width: `${(d.total / maxCargo) * 100}%`, background: COR_CARGO }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>
            Evolução dos indicadores <SeloExemplo />
          </TituloCartao>
          <EvolucaoLinhas absenteismo={serieAbs} turnover={serieTurn} />
        </Cartao>
      </div>

      <p className="text-[12px] text-[#737373]">
        Itens com o selo EXEMPLO usam números ilustrativos — o sistema ainda não guarda esse histórico ou módulo.
        O resto do painel usa os dados reais do cadastro.
      </p>
    </div>
  );
}
