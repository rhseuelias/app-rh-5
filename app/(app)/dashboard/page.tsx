import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase-server";
import type {
  Colaborador,
  Empresa,
  EtapaProcesso,
  Ferias,
  ColaboradorOutraEmpresa,
  PeriodoAquisitivo,
  ProcessoIntegracao,
  Unidade,
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
import AlertasTopo from "@/components/dashboard/AlertasTopo";
import BotaoImprimir from "@/components/dashboard/BotaoImprimir";
import ColaboradoresPorAno, { type PontoAno } from "@/components/dashboard/ColaboradoresPorAno";
import DesligamentosPorAno, { type RegistroDeslDash } from "@/components/dashboard/DesligamentosPorAno";
import { montarLinhasIntegracao } from "@/components/dashboard/integracao-dados";
import { LegendaSemaforo } from "@/components/dashboard/Semaforo";
import ClimaTreinamento from "@/components/dashboard/ClimaTreinamento";
import FolhaModelo4 from "@/components/dashboard/FolhaModelo4";
import SexoPictograma from "@/components/dashboard/SexoPictograma";
import {
  Avatar,
  Cartao7,
  Pilula,
  Icone,
  Ponto,
  Selo,
  Titulo7,
  MANROPE,
  P7,
  ST7,
  TXT_ATRASO,
  corEmpresa,
  nomeProprio,
  FS,
  ROTULO_COLUNA,
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
  searchParams?: { empresa?: string; mes?: string; relatorio?: string };
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
    { data: unidades },
    { data: outrasEmpresasRaw },
    { data: historicoRaw, error: erroHistorico },
    { data: desligRaw },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*"),
    supabase.from("empresas").select("*"),
    supabase.from("processos_integracao").select("*"),
    supabase.from("etapas_processo").select("*"),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("franquias_bse").select("*"),
    supabase.from("ferias").select("*").gte("data_inicio", hojeISO).order("data_inicio", { ascending: true }).limit(80),
    supabase.from("unidades").select("*"),
    supabase.from("colaborador_outras_empresas").select("*"),
    supabase.from("historico_colaboradores").select("*"),
    supabase
      .from("desligamentos_registro")
      .select("empresa, unidade, data_desligamento, iniciativa, tipo_rescisao, status, colaborador_id, data_admissao"),
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

  // Crescimento por ano: quantos estavam ativos no fim de cada ano (até 6 anos); o ano atual vale "hoje".
  // Anos anteriores podem ser corrigidos à mão (tabela historico_colaboradores).
  const historico = ((historicoRaw ?? []) as { escopo: string; ano: number; clt: number; pj: number; estagio: number }[]).filter(
    (h) => h.escopo === empresaSel
  );
  const anosAdmissao = escopo.map((c) => Number(dia10(c.data_admissao).slice(0, 4))).filter((y) => y > 1990);
  const anoInicial = Math.max(Math.min(...(anosAdmissao.length > 0 ? anosAdmissao : [b.ano]), ...historico.map((h) => h.ano)), b.ano - 5);
  const dadosPorAno: PontoAno[] = [];
  for (let y = anoInicial; y <= b.ano; y++) {
    const hojeAno = y === b.ano;
    const ajuste = hojeAno ? undefined : historico.find((h) => h.ano === y);
    if (ajuste) {
      dadosPorAno.push({ ano: y, clt: ajuste.clt, pj: ajuste.pj, est: ajuste.estagio, manual: true });
      continue;
    }
    const ativosAno = escopo.filter((c) => ativoEm(c, `${y}-12-31`, hojeAno));
    dadosPorAno.push({
      ano: y,
      // no ano atual as franquias somam no CLT e no PJ (igual ao total do topo)
      clt: ativosAno.filter((c) => c.tipo === "CLT").length + (hojeAno && incluiFranquias ? franqClt : 0),
      pj: ativosAno.filter((c) => c.tipo === "PJ").length + (hojeAno && incluiFranquias ? franqPj : 0),
      est: ativosAno.filter((c) => c.tipo === "Estagio").length,
      hoje: hojeAno,
    });
  }

  // empresas que entram nos indicadores (Franquias não têm clima/treinamento/folha cadastrados)
  const empresasNoEscopo = empresaSel === "franquias" ? [] : empresaEscolhida ? [empresaEscolhida] : listaEmpresas;
  const media = (vals: (number | null | undefined)[]) => {
    const v = vals.filter((x): x is number => x != null && x > 0);
    return v.length > 0 ? v.reduce((a, c) => a + c, 0) / v.length : null;
  };

  // Indicadores: vêm de cada unidade (Clima e Treinamento). Se nenhuma unidade tiver
  // o número preenchido, usa o que está cadastrado na empresa.
  const unidadesNoEscopo = ((unidades ?? []) as Unidade[]).filter(
    (u) => empresaSel === "todas" || u.empresa_id === empresaSel
  );
  const unidadesComClima = unidadesNoEscopo.filter((u) => u.clima_pct != null && u.clima_pct > 0);
  const unidadesComTreino = unidadesNoEscopo.filter((u) => u.treinamento_pct != null && u.treinamento_pct > 0);
  const climaMedio =
    unidadesComClima.length > 0 ? media(unidadesComClima.map((u) => u.clima_pct)) : media(empresasNoEscopo.map((e) => e.clima_pct));
  const treinoMedio =
    unidadesComTreino.length > 0
      ? media(unidadesComTreino.map((u) => u.treinamento_pct))
      : media(empresasNoEscopo.map((e) => e.treinamento_pct));
  const climaPorUnidade = unidadesComClima.length > 0;
  const itensClima = climaPorUnidade
    ? unidadesComClima.map((u) => ({ nome: u.nome, pct: u.clima_pct as number }))
    : empresasNoEscopo.map((e) => ({ nome: e.nome, pct: e.clima_pct != null && e.clima_pct > 0 ? e.clima_pct : null }));
  const notaMedia =
    unidadesComClima.length > 1 || unidadesComTreino.length > 1
      ? "Média das unidades informadas"
      : empresasNoEscopo.length > 1
        ? "Média das empresas informadas"
        : undefined;

  // folha / faturamento por empresa. Quem recebe em mais de uma empresa tem o valor da
  // outra empresa somado ao custo dela (a pessoa continua contando uma vez só no total).
  const outrasEmpresas = (outrasEmpresasRaw ?? []) as ColaboradorOutraEmpresa[];
  const idsAtivosMes = new Set(lista.filter((c) => ativoEm(c, fimMesISO, ehMesAtual)).map((c) => c.id));
  const empresasFolha = empresasNoEscopo.map((e) => {
    const extra = outrasEmpresas
      .filter((o) => o.empresa_id === e.id && idsAtivosMes.has(o.colaborador_id))
      .reduce((a, o) => a + (Number(o.valor_mensal) || 0), 0);
    const custo =
      ativosMes.filter((c) => c.empresa_id === e.id).reduce((a, c) => a + custoMensalColaborador(c), 0) + extra;
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

  // Feminino e masculino: sistema de RH + franquias (as franquias só informam a quantidade; usa-se 40% feminino e 60% masculino)
  const PCT_FEM_FRANQUIAS = 40;
  const franqFem = Math.round((emFranquias * PCT_FEM_FRANQUIAS) / 100);
  const franqMas = emFranquias - franqFem;
  const sexoFem = ativosMes.filter((c) => c.sexo === "Feminino").length + franqFem;
  const sexoMas = ativosMes.filter((c) => c.sexo === "Masculino").length + franqMas;
  const sexoSem = ativosMes.length - ativosMes.filter((c) => c.sexo === "Feminino" || c.sexo === "Masculino").length;
  const hojeTexto = `${dois(b.dia)}/${dois(b.mes)}/${b.ano}`;
  const COR_CLT = P7.azul;
  const COR_PJ = P7.laranja;

  // barra CLT / PJ / Estágio: segmentos com 2px de espaço, pontas arredondadas
  const BarraVinculo = ({ clt, pj, est, alto = 6 }: { clt: number; pj: number; est: number; alto?: number }) => {
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
          className="flex h-[34px] items-center justify-between gap-3 border-t text-[12.5px]"
          style={{ borderColor: P7.grid, color: P7.ink }}
        >
          {l.esq}
          {l.dir}
        </div>
      ))}
    </div>
  );

  const vazio = (texto: string) => (
    <p className="text-[12.5px]" style={{ color: P7.sec }}>
      {texto}
    </p>
  );

  const modoRelatorio = searchParams?.relatorio === "1";
  const blocoKpi = (
    <>
      {/* 1. Números do topo: total + cada empresa (mesma altura) */}
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:[grid-template-columns:var(--cols)]"
        style={{ "--cols": `2.7fr repeat(${Math.max(linhasEmpresa.length, 1)}, minmax(0, 1fr))` } as CSSProperties}
      >
        <Cartao7 className="sm:col-span-2 lg:col-span-1">
          <div className="grid h-full grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          <div className="flex min-w-0 flex-col justify-between gap-4">
          <div>
            <div className={ROTULO_COLUNA} style={{ color: P7.lab }}>
              Total de colaboradores
            </div>
            <div className="mt-1 font-extrabold leading-[1.1] tabular-nums" style={{ fontFamily: MANROPE, fontSize: FS.kpi, color: P7.ink }}>
              {totalHead}
            </div>
            <div className="mt-1 text-[11.5px]" style={{ color: P7.sec }}>
              <b style={{ color: saldoMes > 0 ? "#0b7a0b" : saldoMes < 0 ? TXT_ATRASO : P7.sec }}>
                {saldoMes > 0 ? `+${saldoMes}` : saldoMes} no mês
              </b>
              {emFranquias > 0 ? ` · ${emFranquias} em franquias` : ""}
            </div>
          </div>
          {totalHead === 0 ? (
            vazio("Sem colaboradores neste filtro.")
          ) : (
            <div>
              <BarraVinculo clt={cltN} pj={pjN} est={estN} alto={6} />
              <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1 text-[11.5px]" style={{ color: P7.ink }}>
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
          </div>
          <div className="flex min-w-0 flex-col gap-2 md:border-l md:pl-6" style={{ borderColor: P7.grid }}>
            <div className={ROTULO_COLUNA} style={{ color: P7.lab }}>
              Feminino e masculino
            </div>
            <SexoPictograma fem={sexoFem} mas={sexoMas} sem={sexoSem} compacto />
          </div>
          </div>
        </Cartao7>

        {linhasEmpresa.map((l) => (
          <Cartao7 key={l.chave} className="flex flex-col justify-between gap-4">
            <div>
              <div className="truncate text-[12.5px] font-bold" style={{ color: P7.sec }}>
                <Ponto cor={corEmpresa(l.nome)} redondo />
                {l.nome}
              </div>
              <div className="mt-1 font-extrabold leading-[1.1] tabular-nums" style={{ fontFamily: MANROPE, fontSize: FS.kpiMedio, color: P7.ink }}>
                {totalLinha(l)}
              </div>
            </div>
            <div>
              <BarraVinculo clt={l.clt} pj={l.pj} est={l.estagio} />
              <div className="mt-2 text-[11.5px]" style={{ color: P7.sec }}>
                {l.clt} CLT · {l.pj} PJ{l.estagio > 0 ? ` · ${l.estagio} Est.` : ""}
              </div>
            </div>
          </Cartao7>
        ))}
      </div>

    </>
  );
  // Desligamentos por ano (módulo Desligamentos). Só registros ativos, dentro do filtro de empresa.
  const nomeEmpresaFiltro = empresaEscolhida ? normalizar(empresaEscolhida.nome) : null;
  type LinhaDeslBruta = RegistroDeslDash & { status: string; colaborador_id: string | null; data_admissao: string | null };
  const registrosDeslEscopo = ((desligRaw ?? []) as LinhaDeslBruta[]).filter(
    (r) =>
      r.status === "ativo" &&
      empresaSel !== "franquias" &&
      (empresaSel === "todas" || (nomeEmpresaFiltro !== null && normalizar(r.empresa ?? "") === nomeEmpresaFiltro))
  );
  // admissões: quem está no cadastro + quem saiu e só existe no histórico importado (com data de admissão)
  const admissoesDesl = [
    ...escopo.map((c) => dia10(c.data_admissao)).filter((d) => d.length === 10),
    ...registrosDeslEscopo.filter((r) => !r.colaborador_id && r.data_admissao).map((r) => dia10(r.data_admissao)),
  ];
  const blocoDesligamentos =
    empresaSel === "franquias" ? null : (
      <DesligamentosPorAno
        registros={registrosDeslEscopo}
        admissoes={admissoesDesl}
        anoAtual={b.ano}
        agrupar={empresaSel === "todas" ? "empresa" : "unidade"}
        nomeEscopo={empresaSel === "todas" ? "Todas as empresas" : empresaEscolhida?.nome ?? ""}
      />
    );
  const blocoCrescimento = (
    <>
      {/* Crescimento por ano */}
      <ColaboradoresPorAno dados={dadosPorAno} escopo={modoRelatorio || ocultarFinanceiro || empresaSel === "franquias" ? null : empresaSel} tabelaPronta={!erroHistorico} />

    </>
  );
  const blocoMetas = (
    <>
      {/* 2. Metas: clima e treinamento (quadrados) */}
      <Cartao7>
        <Titulo7 sub={`Meta: acima de ${META_CLIMA}%${notaMedia ? ` · ${notaMedia}` : ""}`}>Clima e treinamento</Titulo7>
        <ClimaTreinamento
          climaMedio={climaMedio}
          treinoMedio={treinoMedio}
          metaClima={META_CLIMA}
          metaTreinamento={META_TREINAMENTO}
          itens={itensClima}
        />
      </Cartao7>

    </>
  );
  const blocoFolha = (
    <>
      {!ocultarFinanceiro && (
        <Cartao7>
          <Titulo7 sub={`Da maior para a menor. A linha preta é o limite saudável de ${LIMITE_SAUDAVEL_FOLHA_PCT}%; ao lado, quanto falta para chegar nele.`}>
            Custo da folha sobre o faturamento
          </Titulo7>
          {folhaComPct.length === 0 ? (
            vazio("Sem faturamento cadastrado neste filtro.")
          ) : (
            <FolhaModelo4
              itens={folhaComPct.map(({ empresa: e, custo, fat, pct }) => ({
                id: e.id,
                nome: e.nome,
                cor: corEmpresa(e.nome),
                custo,
                fat,
                pct: pct as number,
              }))}
              limite={LIMITE_SAUDAVEL_FOLHA_PCT}
              escala={ESCALA_FOLHA}
            />
          )}
        </Cartao7>
      )}

    </>
  );

  if (modoRelatorio) {
    const nomeEscopo =
      empresaSel === "todas" ? "Todas as empresas" : empresaSel === "franquias" ? "Franquias" : empresaEscolhida?.nome ?? "";
    const totAno = (p: { clt: number; pj: number; est: number }) => p.clt + p.pj + p.est;
    const resumo: string[] = [];
    resumo.push(
      `${nomeEscopo}: ${totalHead} colaboradores (${cltN} CLT, ${pjN} PJ${estN > 0 ? `, ${estN} estágio` : ""}${
        emFranquias > 0 ? `; ${emFranquias} deles em franquias` : ""
      }). Saldo de ${rotuloMes.toLowerCase()}: ${saldoMes > 0 ? "+" : ""}${saldoMes}.`
    );
    if (dadosPorAno.length > 1) {
      const a0 = dadosPorAno[0];
      const a1 = dadosPorAno[dadosPorAno.length - 1];
      const dif = totAno(a1) - totAno(a0);
      const pc = totAno(a0) > 0 ? Math.round((dif / totAno(a0)) * 100) : null;
      resumo.push(
        `Desde ${a0.ano}, o quadro passou de ${totAno(a0)} para ${totAno(a1)} colaboradores (${dif > 0 ? "+" : ""}${dif}${
          pc !== null ? `, ${pc > 0 ? "+" : ""}${pc}%` : ""
        }).`
      );
    }
    const metaTexto = (nome: string, v: number | null, meta: number) => {
      if (v == null) return `${nome}: ainda não informado.`;
      const dif = Math.round(v) - meta;
      return `${nome}: ${Math.round(v)}% — ${dif >= 0 ? `${dif === 0 ? "na" : `${dif} pontos acima da`}` : `${-dif} pontos abaixo da`} meta de ${meta}%.`;
    };
    resumo.push(metaTexto("Clima organizacional", climaMedio, META_CLIMA));
    resumo.push(metaTexto("Treinamento", treinoMedio, META_TREINAMENTO));
    if (!ocultarFinanceiro && folhaComPct.length > 0) {
      const acima = folhaComPct.filter((x) => (x.pct as number) > LIMITE_SAUDAVEL_FOLHA_PCT);
      resumo.push(
        acima.length === 0
          ? `Custo da folha dentro do limite de ${LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento em todas as empresas.`
          : `Custo da folha acima do limite de ${LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento: ${acima
              .map((x) => `${x.empresa.nome} (${fmt1(x.pct as number)}%)`)
              .join(", ")}.`
      );
    }

    return (
      <div
        id="relatorio-diretoria"
        className="space-y-4 rounded-[16px] p-4 md:p-6"
        style={{ background: P7.bg, color: P7.ink, fontFamily: MANROPE }}
      >
        <style>{`@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap");
@page { size: A4; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; }
  #relatorio-diretoria, #relatorio-diretoria * { visibility: visible !important; }
  #relatorio-diretoria { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; padding: 0 !important; border-radius: 0 !important; }
  #relatorio-diretoria .nao-imprimir { display: none !important; }
  #relatorio-diretoria section { break-inside: avoid; box-shadow: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`}</style>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1">
          <div>
            <div className="text-[12.5px] font-semibold" style={{ color: P7.lab }}>
              Grupo Seu Elias · Recursos Humanos
            </div>
            <div
              className="font-extrabold leading-[1.1]"
              style={{ fontFamily: MANROPE, fontSize: FS.pagina, color: P7.ink, textTransform: "none", letterSpacing: 0 }}
            >
              Relatório de RH para a diretoria
            </div>
            <div className="mt-1 text-[12.5px]" style={{ color: P7.lab }}>
              {nomeEscopo} · {rotuloMes} de {anoSel} · emitido em {hojeTexto}
            </div>
          </div>
          <div className="nao-imprimir flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard?${new URLSearchParams({ empresa: empresaSel, mes: mesAtualSelecionado }).toString()}`}
              className={LINK7}
              style={LINK7_STYLE}
            >
              ‹ Voltar ao dashboard
            </Link>
            <BotaoImprimir />
          </div>
        </div>

        <Cartao7>
          <Titulo7 sub="Os principais pontos do período">Resumo</Titulo7>
          <div>
            {resumo.map((t, i) => (
              <div key={i} className="flex gap-3 border-t py-2 text-[12.5px] leading-[1.5]" style={{ borderColor: P7.grid }}>
                <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: P7.deep }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </Cartao7>

        {blocoKpi}
        {blocoCrescimento}
        {blocoDesligamentos}
        {blocoMetas}
        {blocoFolha}

        <p className="text-[11px]" style={{ color: P7.lab }}>
          Dados do sistema de RH em {hojeTexto}. Franquias entram apenas como quantidade informada. A projeção do gráfico de
          crescimento é uma estimativa baseada nos anos anteriores.
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-4 rounded-[16px] p-4 md:p-6"
      style={{ background: P7.bg, color: P7.ink, fontFamily: MANROPE }}
    >
      {/* Fonte Manrope (a mesma do modelo) */}
      <style>{`@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap");`}</style>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1">
        <div>
          <div
            className="font-extrabold leading-[1.1]"
            style={{ fontFamily: MANROPE, fontSize: FS.pagina, color: P7.ink, textTransform: "none", letterSpacing: 0 }}
          >
            Dashboard
          </div>
          <div className="mt-1 text-[12.5px]" style={{ color: P7.lab }}>
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
          <Link
            href={`/dashboard?${new URLSearchParams({ relatorio: "1", empresa: empresaSel, mes: mesAtualSelecionado }).toString()}`}
            className="inline-flex items-center rounded-full border bg-white px-3.5 py-[6px] text-[11.5px] font-semibold hover:brightness-95"
            style={{ borderColor: P7.bd, color: P7.deep }}
          >
            Relatório para a diretoria
          </Link>
        </div>
      </div>

      {blocoKpi}

      {blocoCrescimento}

      {blocoDesligamentos}

      {blocoMetas}

      {blocoFolha}

      {/* Divisão: acompanhamento dos processos de RH */}
      <div
        className="mt-3 flex items-center gap-4 rounded-[14px] px-5 py-4"
        style={{ background: `linear-gradient(90deg, ${P7.ink} 0%, ${P7.deep} 100%)`, fontFamily: MANROPE, color: "#fff" }}
      >
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold uppercase leading-tight tracking-[0.06em]">
            Acompanhamento dos Processos de RH
          </div>
          <div className="mt-[2px] text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
            Integração, rescisões, experiência e férias, o que precisa de ação agora
          </div>
        </div>
      </div>

      {/* 3. Alertas do dia: quatro quadrados com o semáforo */}
      <AlertasTopo
        etapasAtrasadas={atrasadasPainel}
        experiencia={experienciaVencendo.length}
        experienciaUrgente={expUrgente}
        feriasEPJ={feriasVencendo + contratosPJVencendo}
        idsColaboradores={empresaSel === "todas" ? null : Array.from(idsEscopo)}
      />

      {/* 4. Processo de integração (um cartão por pessoa) */}
      <IntegracaoPainel linhas={linhasIntegracao} hojeTexto={hojeTexto} />

      {/* 5. Rescisões e férias (esquerda) · experiência e aniversariantes (direita) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AvisosRescisoes
            mesChave={mesAtualSelecionado}
            idsColaboradores={empresaSel === "todas" ? null : Array.from(idsEscopo)}
          />

          <Cartao7>
            <Titulo7 sub="Começam daqui para frente" direita={<Link href="/ferias" className={LINK7} style={LINK7_STYLE}>Ver férias</Link>}>
              Próximas férias
            </Titulo7>
            {proximasFerias.length === 0
              ? vazio("Nenhuma férias marcada daqui para frente.")
              : proximasFerias.map((f) => {
                  const c = colabPorId.get(f.colaborador_id);
                  const [ya, ma, da] = f.data_inicio.slice(0, 10).split("-").map(Number);
                  const faltam = differenceInCalendarDays(new Date(ya, ma - 1, da), hoje);
                  return (
                    <Link
                      key={f.id}
                      href={c ? `/colaboradores/${c.id}` : "/ferias"}
                      className="flex items-center gap-3 border-t py-2.5 hover:bg-[#f4f8f7]"
                      style={{ borderColor: P7.grid }}
                    >
                      <span
                        className="shrink-0 rounded-[12px] px-3.5 py-2 text-center"
                        style={{ background: "#dcece9", color: "#0a4a44" }}
                      >
                        <span className="block text-[17px] font-extrabold leading-none tabular-nums">{ddmm(f.data_inicio)}</span>
                        <span className="mt-1 block text-[10.5px] font-bold tabular-nums">até {ddmm(f.data_fim)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-bold" style={{ color: P7.ink }}>
                          {c ? nomeProprio(c.nome) : "Colaborador"}
                        </span>
                        <span className="block text-[11.5px]" style={{ color: P7.lab }}>
                          {faltam === 0 ? "começa hoje" : `começa em ${faltam} dia${faltam === 1 ? "" : "s"}`}
                        </span>
                      </span>
                    </Link>
                  );
                })}
          </Cartao7>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Cartao7>
            <Titulo7 sub="Em vermelho quando faltam menos de 7 dias">Experiência terminando</Titulo7>
            {experienciaVencendo.length === 0
              ? vazio("Nenhum caso nos próximos 15 dias.")
              : experienciaVencendo.slice(0, 5).map((c) => {
                  const left = diasParaFimExperiencia(c.data_fim_experiencia!);
                  const urgente = left < 7;
                  const adm = c.data_admissao ? new Date(c.data_admissao) : null;
                  const fim = new Date(c.data_fim_experiencia!);
                  const total = adm ? Math.max(1, differenceInCalendarDays(fim, adm)) : 90;
                  const feitos = Math.max(0, Math.min(total, total - left));
                  const empNome = c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "" : "";
                  return (
                    <div key={c.id} className="mb-4 last:mb-0">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Link href={`/colaboradores/${c.id}`} className="min-w-0 truncate hover:underline">
                          <span className="text-[12.5px] font-bold" style={{ color: P7.ink }}>{nomeProprio(c.nome)}</span>{" "}
                          <span className="text-[11.5px]" style={{ color: P7.lab }}>{empNome ? `· ${empNome}` : ""}</span>
                        </Link>
                        <Pilula tom={urgente ? "bad" : "warn"}>{left} {left === 1 ? "dia" : "dias"}</Pilula>
                      </div>
                      <div className="h-[9px] rounded-full" style={{ background: P7.track }}>
                        <div
                          className="h-[9px] rounded-full"
                          style={{ width: `${(feitos / total) * 100}%`, background: urgente ? ST7.bad : P7.deep }}
                        />
                      </div>
                      <div className="mt-1 text-[11.5px]" style={{ color: P7.lab }}>
                        {feitos} de {total} dias de experiência
                      </div>
                    </div>
                  );
                })}
          </Cartao7>

          <Cartao7>
            <Titulo7 direita={<Link href="/aniversarios" className={LINK7} style={LINK7_STYLE}>Ver todos</Link>}>
              Aniversariantes de {rotuloMes.toLowerCase()}
            </Titulo7>
            {aniversariantes.length === 0
              ? vazio("Nenhum aniversariante neste mês.")
              : aniversariantes.slice(0, 5).map((c) => {
                  const empNome = c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "" : "";
                  return (
                    <Link
                      key={c.id}
                      href={`/colaboradores/${c.id}`}
                      className="flex items-center gap-3 border-t py-[7px] hover:bg-[#f4f8f7]"
                      style={{ borderColor: P7.grid }}
                    >
                      <Avatar nome={c.nome} cor={corEmpresa(empNome)} tamanho={28} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: P7.ink }}>
                        {nomeProprio(c.nome)}
                        {empNome ? (
                          <span className="text-[11.5px] font-medium" style={{ color: P7.lab }}> · {empNome}</span>
                        ) : null}
                      </span>
                      <b className="text-[12.5px] tabular-nums" style={{ color: P7.ink }}>{ddmm(c.data_nascimento)}</b>
                    </Link>
                  );
                })}
            {aniversariantes.length > 5 && (
              <p className="mt-2 text-[11.5px]" style={{ color: P7.lab }}>+ {aniversariantes.length - 5} neste mês</p>
            )}
          </Cartao7>
        </div>
      </div>
    </div>
  );
}
