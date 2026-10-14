import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
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
import { Gauge, ClimaPorEmpresa, LegendaSemaforo } from "@/components/dashboard/Semaforo";
import {
  Cartao7,
  Icone,
  Ponto,
  Selo,
  Titulo7,
  MANROPE,
  P7,
  ST7,
  TXT_ATRASO,
  corEmpresa,
  LINK7,
  LINK7_STYLE,
  type K,
} from "@/components/dashboard/tema7";

export const dynamic = "force-dynamic";

const COR_ESTAGIO = "#9fb5b1";

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
const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");
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
    const v = vals.filter((x): x is number => x != null && x > 0);
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

  // "Pendências de hoje": quadradinhos grandes com o semáforo
  const expUrgente = experienciaVencendo.filter((c) => diasParaFimExperiencia(c.data_fim_experiencia!) < 7).length;
  const pendencias: { chave: string; n: number; k: K; texto: string; href: string }[] = [
    { chave: "etapas", n: atrasadasPainel, k: atrasadasPainel > 0 ? "bad" : "good", texto: atrasadasPainel === 1 ? "Etapa de integração atrasada" : "Etapas de integração atrasadas", href: "/onboarding" },
    { chave: "exp", n: experienciaVencendo.length, k: experienciaVencendo.length === 0 ? "good" : expUrgente > 0 ? "bad" : "warn", texto: experienciaVencendo.length === 1 ? "Experiência terminando (até 15 dias)" : "Experiências terminando (até 15 dias)", href: "/colaboradores" },
    { chave: "ferias", n: feriasVencendo, k: feriasVencendo > 0 ? "bad" : "good", texto: feriasVencendo === 1 ? "Período de férias vencendo (até 30 dias)" : "Períodos de férias vencendo (até 30 dias)", href: "/ferias" },
    { chave: "pj", n: contratosPJVencendo, k: contratosPJVencendo > 0 ? "warn" : "good", texto: contratosPJVencendo === 1 ? "Contrato PJ vencendo (até 60 dias)" : "Contratos PJ vencendo (até 60 dias)", href: "/colaboradores" },
  ];

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

  const nPct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  const hojeTexto = `${dois(b.dia)}/${dois(b.mes)}/${b.ano}`;
  const COR_CLT = P7.azul;
  const COR_PJ = P7.laranja;

  // barra CLT / PJ / Estágio: segmentos com 2px de espaço, pontas arredondadas
  const BarraVinculo = ({ clt, pj, est, alto = 8 }: { clt: number; pj: number; est: number; alto?: number }) => {
    const partes = [
      { v: clt, cor: COR_CLT },
      { v: pj, cor: COR_PJ },
      { v: est, cor: COR_ESTAGIO },
    ].filter((x) => x.v > 0);
    const raio = alto / 2;
    return (
      <div className="flex gap-[2px]" style={{ height: alto, background: partes.length === 0 ? P7.track : undefined, borderRadius: raio }}>
        {partes.map((x, i) => (
          <div
            key={i}
            style={{
              flex: x.v,
              background: x.cor,
              borderRadius: `${i === 0 ? raio : 2}px ${i === partes.length - 1 ? raio : 2}px ${i === partes.length - 1 ? raio : 2}px ${i === 0 ? raio : 2}px`,
            }}
          />
        ))}
      </div>
    );
  };

  const lista7 = (linhas: { chave: string; esq: ReactNode; dir: ReactNode }[]) => (
    <div>
      {linhas.map((l) => (
        <div
          key={l.chave}
          className="flex items-center justify-between gap-3 border-t py-2 text-[13px]"
          style={{ borderColor: P7.grid, color: P7.ink }}
        >
          {l.esq}
          {l.dir}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="space-y-5 rounded-[20px] p-4 md:p-6"
      style={{ background: P7.bg, color: P7.ink, fontFamily: MANROPE }}
    >
      {/* Fonte Manrope (a mesma do modelo) */}
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap");`}</style>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            className="text-[34px] font-extrabold leading-[1.05]"
            style={{ fontFamily: MANROPE, color: P7.ink, textTransform: "none", letterSpacing: 0 }}
          >
            Dashboard
          </div>
          <div className="mt-[7px] text-[13.5px]" style={{ color: P7.lab }}>
            Como estamos em relação às metas · {rotuloMes.toLowerCase()} de {anoSel}
          </div>
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

      {/* Topo: total + cada empresa */}
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:[grid-template-columns:var(--cols)]"
        style={{ "--cols": `1.6fr repeat(${Math.max(linhasEmpresa.length, 1)}, minmax(0, 1fr))` } as CSSProperties}
      >
        <Cartao7 className="flex flex-col justify-between gap-4 sm:col-span-2 lg:col-span-1">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: P7.lab }}>
              Total de colaboradores
            </div>
            <div className="mt-1.5 text-[60px] font-extrabold leading-[1.05]" style={{ fontFamily: MANROPE, color: P7.ink }}>
              {totalHead}
            </div>
            <div className="mt-1 text-[12.5px]" style={{ color: P7.sec }}>
              <b style={{ color: saldoMes > 0 ? "#0b7a0b" : saldoMes < 0 ? TXT_ATRASO : P7.sec }}>
                {saldoMes > 0 ? `+${saldoMes}` : saldoMes} no mês
              </b>
              {emFranquias > 0 ? ` · ${emFranquias} em franquias` : ""}
            </div>
          </div>
          {totalHead === 0 ? (
            <p className="text-[13px]" style={{ color: P7.sec }}>
              Sem colaboradores neste filtro.
            </p>
          ) : (
            <div>
              <BarraVinculo clt={cltN} pj={pjN} est={estN} alto={16} />
              <div className="mt-2.5 flex flex-wrap gap-x-[22px] gap-y-1 text-[13px]" style={{ color: P7.ink }}>
                <span>
                  <Ponto cor={COR_CLT} />
                  <b>{cltN}</b> CLT · {nPct(cltN, totalHead)}%
                </span>
                <span>
                  <Ponto cor={COR_PJ} />
                  <b>{pjN}</b> PJ · {nPct(pjN, totalHead)}%
                </span>
                {estN > 0 && (
                  <span>
                    <Ponto cor={COR_ESTAGIO} />
                    <b>{estN}</b> Estágio
                  </span>
                )}
              </div>
            </div>
          )}
        </Cartao7>

        {linhasEmpresa.map((l) => (
          <Cartao7 key={l.chave} style={{ padding: "18px 20px" }}>
            <div className="truncate text-[13px] font-bold" style={{ color: P7.sec }}>
              <Ponto cor={corEmpresa(l.nome)} redondo />
              {l.nome}
            </div>
            <div className="mb-2.5 mt-1.5 text-[38px] font-extrabold leading-tight" style={{ fontFamily: MANROPE, color: P7.ink }}>
              {totalLinha(l)}
            </div>
            <BarraVinculo clt={l.clt} pj={l.pj} est={l.estagio} />
            <div className="mt-[7px] text-[12px]" style={{ color: P7.sec }}>
              {l.clt} CLT · {l.pj} PJ{l.estagio > 0 ? ` · ${l.estagio} Est.` : ""}
            </div>
          </Cartao7>
        ))}
      </div>

      {/* Clima, treinamento e custo da folha */}
      <div className={`grid grid-cols-1 gap-4 ${ocultarFinanceiro ? "lg:grid-cols-2" : "lg:grid-cols-[1fr_1fr_2.1fr]"}`}>
        <Cartao7>
          <Gauge
            titulo="Clima organizacional"
            pct={climaMedio}
            meta={META_CLIMA}
            nota={empresasNoEscopo.length > 1 ? "Média das empresas informadas" : undefined}
          />
        </Cartao7>
        <Cartao7>
          <Gauge
            titulo="Treinamento"
            pct={treinoMedio}
            meta={META_TREINAMENTO}
            nota={empresasNoEscopo.length > 1 ? "Média das empresas informadas" : undefined}
          />
        </Cartao7>

        {!ocultarFinanceiro && (
          <Cartao7>
            <Titulo7 sub={`A marca preta é o limite de ${LIMITE_SAUDAVEL_FOLHA_PCT}%. Verde está bem, vermelho pede atenção.`}>
              Custo da folha sobre o faturamento
            </Titulo7>
            {folhaComPct.length === 0 ? (
              <p className="text-[13px]" style={{ color: P7.sec }}>
                Sem faturamento cadastrado neste filtro.
              </p>
            ) : (
              <div>
                {folhaComPct.map(({ empresa: e, custo, fat, pct }) => {
                  const bom = (pct as number) <= LIMITE_SAUDAVEL_FOLHA_PCT;
                  const k: K = bom ? "good" : "bad";
                  return (
                    <div
                      key={e.id}
                      className="mb-5 grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[130px_1fr_auto]"
                    >
                      <div>
                        <div className="text-[14px] font-bold" style={{ color: P7.ink }}>{e.nome}</div>
                        <div className="mt-[3px] text-[11px] leading-[1.35]" style={{ color: P7.lab }}>
                          Folha R$ {reais(custo)} · Faturamento R$ {reais(fat)}
                        </div>
                      </div>
                      <div className="relative h-[18px] rounded-[9px]" style={{ background: P7.track }}>
                        <div
                          className="h-[18px] rounded-[9px]"
                          style={{ width: `${Math.min(100, ((pct as number) / ESCALA_FOLHA) * 100)}%`, background: ST7[k] }}
                        />
                        <div
                          className="absolute -top-[5px] h-[28px] w-[2px]"
                          style={{ left: `${(LIMITE_SAUDAVEL_FOLHA_PCT / ESCALA_FOLHA) * 100}%`, background: P7.ink }}
                          title={`Limite: ${LIMITE_SAUDAVEL_FOLHA_PCT}%`}
                        />
                      </div>
                      <div className="min-w-[150px] sm:text-right">
                        <div className="text-[24px] font-extrabold" style={{ fontFamily: MANROPE, color: P7.ink }}>
                          {fmt1(pct as number)}%
                        </div>
                        <Selo k={k}>{bom ? "Dentro do limite" : "Acima do limite"}</Selo>
                      </div>
                    </div>
                  );
                })}
                <div className="hidden grid-cols-[130px_1fr_150px] gap-4 text-[11px] sm:grid" style={{ color: P7.lab, marginTop: -8 }}>
                  <span />
                  <div className="relative h-[14px]">
                    <span className="absolute left-0">0%</span>
                    <span
                      className="absolute -translate-x-1/2 font-bold"
                      style={{ left: `${(LIMITE_SAUDAVEL_FOLHA_PCT / ESCALA_FOLHA) * 100}%`, color: P7.ink }}
                    >
                      {LIMITE_SAUDAVEL_FOLHA_PCT}%
                    </span>
                    <span className="absolute right-0">{ESCALA_FOLHA}%</span>
                  </div>
                  <span />
                </div>
              </div>
            )}
          </Cartao7>
        )}
      </div>

      {/* Processo de integração */}
      <IntegracaoPainel linhas={linhasIntegracao} hojeTexto={hojeTexto} />

      {/* Avisos prévios e rescisões */}
      <AvisosRescisoes
        mesChave={mesAtualSelecionado}
        idsColaboradores={empresaSel === "todas" ? null : Array.from(idsEscopo)}
      />

      {/* Clima por empresa, experiência e pendências */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr_.8fr]">
        <Cartao7>
          <Titulo7 sub={`Comparado com a meta de ${META_CLIMA}%`}>Clima de cada empresa</Titulo7>
          <ClimaPorEmpresa
            itens={empresasNoEscopo.map((e) => ({ nome: e.nome, pct: e.clima_pct != null && e.clima_pct > 0 ? e.clima_pct : null }))}
            meta={META_CLIMA}
          />
        </Cartao7>

        <Cartao7>
          <Titulo7 sub="Em vermelho quando faltam menos de 7 dias">Experiência terminando</Titulo7>
          {experienciaVencendo.length === 0 ? (
            <p className="text-[13px]" style={{ color: P7.sec }}>Nenhum caso nos próximos 15 dias.</p>
          ) : (
            experienciaVencendo.slice(0, 5).map((c) => {
              const left = diasParaFimExperiencia(c.data_fim_experiencia!);
              const urgente = left < 7;
              const adm = c.data_admissao ? new Date(c.data_admissao) : null;
              const fim = new Date(c.data_fim_experiencia!);
              const total = adm ? Math.max(1, differenceInCalendarDays(fim, adm)) : 90;
              const feitos = Math.max(0, Math.min(total, total - left));
              const empNome = c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "" : "";
              return (
                <div key={c.id} className="mb-4">
                  <div className="mb-[7px] flex items-center justify-between gap-2">
                    <Link href={`/colaboradores/${c.id}`} className="min-w-0 truncate hover:underline">
                      <span className="text-[13px] font-bold" style={{ color: P7.ink }}>{c.nome}</span>{" "}
                      <span className="text-[11.5px]" style={{ color: P7.lab }}>{empNome ? `· ${empNome}` : ""}</span>
                    </Link>
                    {urgente ? (
                      <Selo k="bad">{left} {left === 1 ? "dia" : "dias"}</Selo>
                    ) : (
                      <span className="whitespace-nowrap text-[12.5px] font-bold" style={{ color: P7.ink }}>{left} dias</span>
                    )}
                  </div>
                  <div className="h-[10px] rounded-[5px]" style={{ background: P7.track }}>
                    <div
                      className="h-[10px] rounded-[5px]"
                      style={{ width: `${(feitos / total) * 100}%`, background: urgente ? ST7.bad : P7.deep }}
                    />
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: P7.lab }}>
                    {feitos} de {total} dias de experiência
                  </div>
                </div>
              );
            })
          )}
        </Cartao7>

        <Cartao7>
          <Titulo7>Pendências de hoje</Titulo7>
          <div className="flex flex-col gap-2.5">
            {pendencias.map((p) => (
              <Link
                key={p.chave}
                href={p.href}
                className="flex items-center gap-3.5 rounded-[12px] p-4 hover:brightness-95"
                style={{ background: P7.bg }}
              >
                <div className="min-w-[44px] text-[38px] font-extrabold leading-none" style={{ fontFamily: MANROPE, color: P7.ink }}>
                  {p.n}
                </div>
                <div>
                  <div className="mb-1"><Icone k={p.k} /></div>
                  <div className="text-[13px] font-semibold leading-[1.3]" style={{ color: P7.ink }}>{p.texto}</div>
                </div>
              </Link>
            ))}
          </div>
        </Cartao7>
      </div>

      {/* Aniversariantes e próximas férias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao7>
          <Titulo7 direita={<Link href="/aniversarios" className={LINK7} style={LINK7_STYLE}>Ver todos</Link>}>
            Aniversariantes de {rotuloMes.toLowerCase()}
          </Titulo7>
          {aniversariantes.length === 0 ? (
            <p className="text-[13px]" style={{ color: P7.sec }}>Nenhum aniversariante neste mês.</p>
          ) : (
            lista7(
              aniversariantes.slice(0, 7).map((c) => ({
                chave: c.id,
                esq: (
                  <Link href={`/colaboradores/${c.id}`} className="min-w-0 truncate hover:underline">
                    {c.nome}
                    {c.empresa_id && nomeEmpresaPorId[c.empresa_id] ? (
                      <span className="text-[11.5px]" style={{ color: P7.lab }}> · {nomeEmpresaPorId[c.empresa_id]}</span>
                    ) : null}
                  </Link>
                ),
                dir: <b className="tabular-nums">{ddmm(c.data_nascimento)}</b>,
              }))
            )
          )}
          {aniversariantes.length > 7 && (
            <p className="mt-2 text-[12px]" style={{ color: P7.lab }}>+ {aniversariantes.length - 7} neste mês</p>
          )}
        </Cartao7>

        <Cartao7>
          <Titulo7 sub="Começam daqui para frente" direita={<Link href="/ferias" className={LINK7} style={LINK7_STYLE}>Ver férias</Link>}>
            Próximas férias
          </Titulo7>
          {proximasFerias.length === 0 ? (
            <p className="text-[13px]" style={{ color: P7.sec }}>Nenhuma férias marcada daqui para frente.</p>
          ) : (
            lista7(
              proximasFerias.map((f) => {
                const c = colabPorId.get(f.colaborador_id);
                const [ya, ma, da] = f.data_inicio.slice(0, 10).split("-").map(Number);
                const faltam = differenceInCalendarDays(new Date(ya, ma - 1, da), hoje);
                return {
                  chave: f.id,
                  esq: (
                    <Link href={c ? `/colaboradores/${c.id}` : "/ferias"} className="min-w-0 truncate hover:underline">
                      {c?.nome ?? "Colaborador"}
                      <span className="text-[11.5px]" style={{ color: P7.lab }}>
                        {" "}· {faltam === 0 ? "começa hoje" : `em ${faltam} dia${faltam === 1 ? "" : "s"}`}
                      </span>
                    </Link>
                  ),
                  dir: <b className="tabular-nums whitespace-nowrap">{ddmm(f.data_inicio)} a {ddmm(f.data_fim)}</b>,
                };
              })
            )
          )}
        </Cartao7>
      </div>
    </div>
  );
}
