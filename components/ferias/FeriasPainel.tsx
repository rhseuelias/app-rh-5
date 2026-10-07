"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INTER, OSWALD } from "@/components/dashboard/Blocos";
import {
  difDias,
  fComSemana,
  fDM,
  fDMA,
  fDMAcurto,
  proximoInicioValido,
  somarDias,
  sugerirInicio,
  validarAmortizacao,
  validarLancamento,
  valorFeriasEstimado,
} from "@/lib/ferias-regras";
import { aprovarFeriasColaborador, excluirPeriodoFerias, lancarFeriasPainel } from "@/lib/actions-ferias-painel";
import { amortizarFerias, excluirFeriasAmortizada } from "@/lib/actions-ferias-amortizar";
import BotaoPdf from "@/components/BotaoPdf";

// ------------------------------------------------------------
// Tipos (o servidor monta isso em app/(app)/ferias/page.tsx)
// ------------------------------------------------------------
export interface PeriodoFerias {
  id: string;
  i: string; // início AAAA-MM-DD
  d: number; // dias
  st: "planejada" | "aprovado";
  /** período aquisitivo ao qual pertence (null = antigo, sem vínculo) */
  pid: string | null;
  /** este registro carrega a marca de "vendeu 10 dias" (abono) do período */
  ab: boolean;
}

export interface PeriodoAquisitivoLinha {
  id: string;
  ini: string;
  fim: string;
  limite: string;
  status: string;
}

export interface PessoaFerias {
  id: string;
  nome: string;
  unidade: string;
  empresa: string;
  empresaId: string | null;
  salario: number;
  /** período aquisitivo aberto (o que está valendo agora) */
  aq: { id: string; ini: string; fim: string; limite: string } | null;
  abono: boolean;
  per: PeriodoFerias[];
  /** todos os períodos aquisitivos dele (inclusive os já gozados) */
  periodos: PeriodoAquisitivoLinha[];
}

export interface OpcaoSimples {
  id: string;
  nome: string;
}

interface Props {
  hoje: string;
  anoInicial: number;
  pessoas: PessoaFerias[];
  empresas: OpcaoSimples[];
  feriados: Record<string, string>;
  mostrarValores: boolean;
  abaInicial?: "mapa" | "sit";
}

type Situacao = "vencida" | "vencendo" | "programar" | "programada" | "emdia";
interface Amortizar {
  pid: string;
  periodoId: string;
  edit: string | null; // id do registro sendo corrigido
  inicio: string;
  dias: number | string;
  abono: boolean;
  confirmarExcluir: string | null;
}
interface Rascunho {
  pid: string;
  edit: string | null; // id do período sendo remarcado
  inicio: string;
  dias: number | string;
  abono: boolean;
  st: "planejada" | "aprovado";
  travado: boolean;
}

const NM = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const COR = {
  concluida: "#d6cec5",
  aprovada: "#3d3d3d",
  planejada: "#fbb26e",
  vermelho: "#d92d20",
  texto: "#262626",
  suave: "#5c5c5c",
  mudo: "#737373",
  borda: "#f1e4d6",
  div: "#f4ebe1",
  input: "#e7ddd2",
};

const SITUACOES: { k: Situacao; nome: string; cor: string; txt: string; numCor: string; desc: string }[] = [
  { k: "vencida", nome: "Vencidas", cor: "#d92d20", txt: "#fff", numCor: "#b42318", desc: "passaram do limite" },
  { k: "vencendo", nome: "Vencendo em 60 dias", cor: "#f0913f", txt: "#262626", numCor: "#b42318", desc: "com saldo sem data" },
  { k: "programar", nome: "A programar", cor: "#fbb26e", txt: "#262626", numCor: "#262626", desc: "saldo sem data" },
  { k: "programada", nome: "Programadas", cor: "#3d3d3d", txt: "#fff", numCor: "#262626", desc: "saldo já marcado" },
  { k: "emdia", nome: "Em dia", cor: "#d6cec5", txt: "#262626", numCor: "#262626", desc: "nada pendente" },
];

const cartao = "bg-white border border-[#f1e4d6] rounded-[12px]";
const rotuloMini = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737373]";
const cabTabela = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[#737373]";

export default function FeriasPainel({
  hoje,
  anoInicial,
  pessoas,
  empresas,
  feriados,
  mostrarValores,
  abaInicial = "mapa",
}: Props) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aba, setAba] = useState<"mapa" | "sit">(abaInicial);
  const [ano, setAno] = useState(anoInicial);
  const [empresaSel, setEmpresaSel] = useState("");
  const [dr, setDr] = useState<Rascunho | null>(null);
  const [am, setAm] = useState<Amortizar | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDr(null);
        setAm(null);
      }
    };
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("keydown", k);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function avisar(t: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 4000);
  }

  const brl = (v: number) => (mostrarValores ? "R$ " + Math.round(v).toLocaleString("pt-BR") : "R$ •••");

  // ------------------------------------------------------------
  // Dados derivados
  // ------------------------------------------------------------
  const lista = useMemo(
    () => (empresaSel ? pessoas.filter((p) => p.empresaId === empresaSel) : pessoas),
    [pessoas, empresaSel]
  );
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  const fimDe = (x: PeriodoFerias) => somarDias(x.i, x.d - 1);
  const doPeriodoAberto = (p: PessoaFerias) => p.per.filter((x) => (p.aq ? x.pid === p.aq.id || x.pid === null : true));
  const saldoDe = (p: PessoaFerias, excluirId: string | null = null, abono: boolean = p.abono) =>
    30 - doPeriodoAberto(p).filter((x) => x.id !== excluirId).reduce((s, x) => s + x.d, 0) - (abono ? 10 : 0);
  const valorDia = (p: PessoaFerias) => valorFeriasEstimado(p.salario, 1);

  const situacaoDe = (p: PessoaFerias): Situacao => {
    const s = p.aq ? Math.max(0, saldoDe(p)) : 0;
    const dl = p.aq ? difDias(hoje, p.aq.limite) : 9999;
    if (s > 0 && dl < 0) return "vencida";
    if (s > 0 && dl <= 60) return "vencendo";
    if (s > 0) return "programar";
    if (p.per.some((x) => fimDe(x) >= hoje)) return "programada";
    return "emdia";
  };

  const diasAno = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 366 : 365;
  const diasDoMes = NM.map((_, m) => new Date(ano, m + 1, 0).getDate());
  const colunasMes = diasDoMes.map((n) => `${n}fr`).join(" ");
  const inicioAno = `${ano}-01-01`;
  const doy = (s: string) => difDias(inicioAno, s);
  const pct = (v: number) => (Math.max(0, Math.min(diasAno, v)) / diasAno) * 100 + "%";
  const anoDeHoje = Number(hoje.slice(0, 4));
  const mesDeHoje = Number(hoje.slice(5, 7)) - 1;

  // conflitos: mesma unidade, mesmas datas, férias que ainda não terminaram
  const { conflitos, aneis } = useMemo(() => {
    const cs: { texto: string; sub: string; tardio: { pid: string; id: string } }[] = [];
    const an = new Set<string>();
    const unidades = [...new Set(lista.map((p) => p.unidade))];
    for (const u of unidades) {
      const ativos: { p: PessoaFerias; x: PeriodoFerias }[] = [];
      lista
        .filter((p) => p.unidade === u)
        .forEach((p) => p.per.forEach((x) => (fimDe(x) >= hoje ? ativos.push({ p, x }) : null)));
      for (let a = 0; a < ativos.length; a++) {
        for (let b = a + 1; b < ativos.length; b++) {
          const A = ativos[a];
          const B = ativos[b];
          if (A.p.id === B.p.id) continue;
          if (A.x.i <= fimDe(B.x) && B.x.i <= fimDe(A.x)) {
            an.add(A.x.id);
            an.add(B.x.id);
            const de = A.x.i > B.x.i ? A.x.i : B.x.i;
            const ate = fimDe(A.x) < fimDe(B.x) ? fimDe(A.x) : fimDe(B.x);
            const tardio = A.x.i > B.x.i ? A : B;
            cs.push({
              texto: `${A.p.nome} e ${B.p.nome}`,
              sub: `${u} · juntos de ${fDM(de)} a ${fDM(ate)}`,
              tardio: { pid: tardio.p.id, id: tardio.x.id },
            });
          }
        }
      }
    }
    return { conflitos: cs, aneis: an };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, hoje]);

  // custo e pessoas em férias por mês (no ano escolhido)
  const { custo, cnt } = useMemo(() => {
    const c = NM.map(() => 0);
    const n = NM.map(() => new Set<string>());
    lista.forEach((p) =>
      p.per.forEach((x) => {
        for (let k = 0; k < x.d; k++) {
          const d = somarDias(x.i, k);
          if (Number(d.slice(0, 4)) !== ano) continue;
          const m = Number(d.slice(5, 7)) - 1;
          c[m] += valorDia(p);
          n[m].add(p.id);
        }
      })
    );
    return { custo: c, cnt: n.map((s) => s.size) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, ano]);
  const maxN = Math.max(1, ...cnt);
  const maxC = Math.max(1, ...custo);
  const totalCusto = custo.reduce((a, b) => a + b, 0);
  const pico = custo.indexOf(Math.max(...custo));
  const aPagar = lista.reduce(
    (s, p) => s + p.per.filter((x) => x.i >= hoje).reduce((t, x) => t + x.d * valorDia(p), 0),
    0
  );

  // KPIs
  const emFerias = lista.filter((p) => p.per.some((x) => x.i <= hoje && fimDe(x) >= hoje));
  const saindo: { p: PessoaFerias; x: PeriodoFerias }[] = [];
  lista.forEach((p) =>
    p.per.forEach((x) => {
      if (x.i > hoje && difDias(hoje, x.i) <= 30) saindo.push({ p, x });
    })
  );
  const urgentes = lista.filter((p) => ["vencida", "vencendo"].includes(situacaoDe(p)));
  const primeiro = (n: string) => n.split(" ")[0];
  const kpis = [
    {
      label: "Em férias hoje",
      valor: String(emFerias.length),
      cor: COR.texto,
      sub: emFerias.length
        ? emFerias
            .map((p) => {
              const x = p.per.find((y) => y.i <= hoje && fimDe(y) >= hoje)!;
              return `${primeiro(p.nome)} até ${fDM(fimDe(x))}`;
            })
            .join(", ")
        : "ninguém",
    },
    {
      label: "Saindo em 30 dias",
      valor: String(saindo.length),
      cor: COR.texto,
      sub: saindo.length ? saindo.map((s) => `${primeiro(s.p.nome)} em ${fDM(s.x.i)}`).join(", ") : "ninguém",
    },
    {
      label: "Vencidas ou em 60 dias",
      valor: String(urgentes.length),
      cor: urgentes.length ? "#b42318" : COR.texto,
      sub: urgentes.length ? urgentes.map((p) => primeiro(p.nome)).join(", ") : "nenhum período em risco",
    },
    {
      label: "Conflitos",
      valor: String(conflitos.length),
      cor: conflitos.length ? "#b42318" : COR.texto,
      sub: conflitos.length ? "mesma unidade, mesmas datas" : "nenhuma sobreposição",
    },
    {
      label: `Custo estimado em ${ano}`,
      valor: mostrarValores ? `R$ ${(totalCusto / 1000).toFixed(1).replace(".", ",")} mil` : "R$ •••",
      cor: COR.texto,
      sub: mostrarValores ? `${Math.round((aPagar / Math.max(1, totalCusto)) * 100)}% ainda por pagar` : "valores ocultos",
    },
  ];

  // ------------------------------------------------------------
  // Painel de lançamento
  // ------------------------------------------------------------
  function abrirNovo(pid?: string, inicio?: string) {
    setAm(null);
    if (!pid) {
      setDr({ pid: "", edit: null, inicio: "", dias: 30, abono: false, st: "planejada", travado: false });
      return;
    }
    const p = porId.get(pid);
    if (!p) return;
    if (!p.aq) {
      avisar(`${primeiro(p.nome)} não tem período aquisitivo aberto. Gere o período na ficha do colaborador.`);
      return;
    }
    const dias = Math.max(5, Math.min(30, saldoDe(p)));
    setDr((atual) => ({
      pid,
      edit: null,
      inicio: inicio || sugerirInicio(hoje, dias, p.aq!.limite, feriados),
      dias,
      abono: p.abono,
      st: "planejada",
      travado: !!atual?.travado,
    }));
  }
  function abrirEdit(pid: string, feriasId: string) {
    setAm(null);
    const p = porId.get(pid);
    const x = p?.per.find((y) => y.id === feriasId);
    if (!p || !x) return;
    setDr({ pid, edit: feriasId, inicio: x.i, dias: x.d, abono: p.abono, st: x.st, travado: true });
  }
  const patch = (parcial: Partial<Rascunho>) => setDr((a) => (a ? { ...a, ...parcial } : a));

  // ------------------------------------------------------------
  // Amortizar férias antigas (já tiradas e ainda não registradas)
  // ------------------------------------------------------------
  const saldoPeriodo = (p: PessoaFerias, periodoId: string) => {
    const itens = p.per.filter((x) => x.pid === periodoId);
    return 30 - itens.reduce((s, x) => s + x.d, 0) - (itens.some((x) => x.ab) ? 10 : 0);
  };
  function escolherPeriodoAm(p: PessoaFerias, periodoId: string) {
    setAm({
      pid: p.id,
      periodoId,
      edit: null,
      inicio: "",
      dias: Math.max(1, Math.min(30, saldoPeriodo(p, periodoId))),
      abono: p.per.some((x) => x.pid === periodoId && x.ab),
      confirmarExcluir: null,
    });
  }
  function abrirAmortizar(pid?: string) {
    setDr(null);
    const p = pid ? porId.get(pid) : undefined;
    if (!p) {
      setAm({ pid: "", periodoId: "", edit: null, inicio: "", dias: 15, abono: false, confirmarExcluir: null });
      return;
    }
    escolherPeriodoAm(p, p.aq?.id ?? p.periodos[0]?.id ?? "");
  }
  const patchAm = (parcial: Partial<Amortizar>) =>
    setAm((a) => (a ? { ...a, ...parcial, confirmarExcluir: null } : a));

  const pessoaAm = am?.pid ? porId.get(am.pid) : undefined;
  const periodoAm = pessoaAm?.periodos.find((x) => x.id === am?.periodoId);
  const itensAm = pessoaAm && periodoAm ? pessoaAm.per.filter((x) => x.pid === periodoAm.id) : [];
  const diasAm = Math.round(Number(am?.dias) || 0);
  const fimAm = am && am.inicio && diasAm >= 1 ? somarDias(am.inicio, diasAm - 1) : "";
  const validacaoAm = useMemo(() => {
    if (!am || !pessoaAm || !periodoAm) return null;
    return validarAmortizacao({
      hoje,
      inicio: am.inicio,
      fim: fimAm,
      outrosDias: itensAm.filter((x) => x.id !== am.edit).map((x) => x.d),
      abono: am.abono,
      outros: pessoaAm.per.filter((x) => x.id !== am.edit).map((x) => ({ i: x.i, f: fimDe(x) })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [am, pessoaAm, periodoAm, hoje, fimAm]);

  function salvarAm() {
    if (!am || !pessoaAm || !validacaoAm || validacaoAm.erros.length > 0) return;
    const entrada = {
      colaboradorId: pessoaAm.id,
      periodoId: am.periodoId,
      feriasId: am.edit,
      inicio: am.inicio,
      fim: fimAm,
      abono: am.abono,
    };
    startTransition(async () => {
      const r = await amortizarFerias(entrada);
      avisar(r.mensagem);
      if (r.ok) {
        setAm((a) => (a ? { ...a, edit: null, inicio: "", confirmarExcluir: null } : a));
        router.refresh();
      }
    });
  }
  function excluirAm(id: string) {
    if (!am) return;
    if (am.confirmarExcluir !== id) {
      setAm({ ...am, confirmarExcluir: id });
      return;
    }
    startTransition(async () => {
      const r = await excluirFeriasAmortizada(id);
      avisar(r.mensagem);
      if (r.ok) {
        setAm((a) => (a ? { ...a, edit: a.edit === id ? null : a.edit, inicio: a.edit === id ? "" : a.inicio, confirmarExcluir: null } : a));
        router.refresh();
      }
    });
  }

  const pessoaDr = dr?.pid ? porId.get(dr.pid) : undefined;
  const validacao = useMemo(() => {
    if (!dr || !pessoaDr) return null;
    const outros = doPeriodoAberto(pessoaDr).filter((x) => x.id !== dr.edit);
    const v = validarLancamento({
      hoje,
      limite: pessoaDr.aq?.limite ?? null,
      feriados,
      outrosDias: outros.map((x) => x.d),
      abono: dr.abono,
      inicio: dr.inicio,
      dias: Number(dr.dias) || 0,
    });
    const sobre: { nome: string; de: string; ate: string }[] = [];
    const avisos = [...v.avisos];
    if (dr.inicio && v.fim) {
      pessoas.forEach((o) => {
        if (o.id === pessoaDr.id || o.unidade !== pessoaDr.unidade) return;
        o.per.forEach((x) => {
          const xf = fimDe(x);
          if (x.i <= v.fim && xf >= dr.inicio) sobre.push({ nome: o.nome, de: fDM(x.i), ate: fDM(xf) });
        });
      });
      if (sobre.length) {
        avisos.push(
          `Coincide com ${sobre.length === 1 ? "1 pessoa" : sobre.length + " pessoas"} da ${pessoaDr.unidade}.`
        );
      }
    }
    return { ...v, avisos, sobre, ok: v.erros.length === 0 && !!pessoaDr.aq };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dr, pessoaDr, pessoas, hoje, feriados]);

  function salvar() {
    if (!dr || !pessoaDr?.aq || !validacao?.ok) return;
    const entrada = {
      colaboradorId: pessoaDr.id,
      periodoId: pessoaDr.aq.id,
      feriasId: dr.edit,
      inicio: dr.inicio,
      dias: Number(dr.dias) || 0,
      abono: dr.abono,
      status: dr.st,
    };
    startTransition(async () => {
      const r = await lancarFeriasPainel(entrada);
      avisar(r.mensagem);
      if (r.ok) {
        setDr(null);
        router.refresh();
      }
    });
  }
  function excluir() {
    if (!dr?.edit) return;
    const id = dr.edit;
    startTransition(async () => {
      const r = await excluirPeriodoFerias(id);
      avisar(r.mensagem);
      if (r.ok) {
        setDr(null);
        router.refresh();
      }
    });
  }
  function aprovar(pid: string) {
    startTransition(async () => {
      const r = await aprovarFeriasColaborador(pid);
      avisar(r.mensagem);
      if (r.ok) router.refresh();
    });
  }

  // ------------------------------------------------------------
  // Pedaços de tela
  // ------------------------------------------------------------
  const unidades = [...new Set(lista.map((p) => p.unidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const corPeriodo = (x: PeriodoFerias) =>
    fimDe(x) < hoje ? COR.concluida : x.st === "aprovado" ? COR.aprovada : COR.planejada;
  const nomeStatus = (x: PeriodoFerias) => (fimDe(x) < hoje ? "concluída" : x.st === "aprovado" ? "aprovada" : "planejada");

  const queryRel = new URLSearchParams();
  queryRel.set("ano", String(ano));
  if (empresaSel) queryRel.set("empresa", empresaSel);
  const qs = queryRel.toString();

  const anos = [anoInicial - 1, anoInicial, anoInicial + 1, anoInicial + 2];

  const blocos = SITUACOES.filter((s) => lista.some((p) => situacaoDe(p) === s.k)).map((s) => ({
    ...s,
    pessoas: lista
      .filter((p) => situacaoDe(p) === s.k)
      .sort((a, b) => (a.aq?.limite ?? "9999") .localeCompare(b.aq?.limite ?? "9999")),
  }));
  const situacoesResumo = SITUACOES.map((s) => ({ ...s, n: lista.filter((p) => situacaoDe(p) === s.k).length }));

  const ordemUrg: Record<Situacao, number> = { vencida: 0, vencendo: 1, programar: 2, programada: 3, emdia: 4 };
  const opcoesPessoa = [...lista]
    .filter((p) => !!p.aq)
    .sort((a, b) => ordemUrg[situacaoDe(a)] - ordemUrg[situacaoDe(b)])
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      empresaId: p.empresaId,
      label: `${p.nome} · ${Math.max(0, saldoDe(p))} dias a marcar`,
    }));

  const opcoesAm = [...lista]
    .filter((p) => p.periodos.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => ({ id: p.id, nome: p.nome, empresaId: p.empresaId, label: `${p.nome}${p.empresa ? ` · ${p.empresa}` : ""}` }));

  const emDia = dr && validacao && pessoaDr;

  return (
    <div className="space-y-5" style={{ fontFamily: INTER }}>
      {/* Cabeçalho */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <h1
            className="text-[32px] leading-none font-semibold text-[#262626] uppercase"
            style={{ fontFamily: OSWALD, letterSpacing: "0.02em" }}
          >
            Férias
          </h1>
          <p className="text-[13px] text-[#5c5c5c]">
            Relatório e lançamento · {lista.length} colaborador{lista.length !== 1 ? "es" : ""} CLT · posição em{" "}
            {fDMA(hoje)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={empresaSel}
            onChange={(e) => setEmpresaSel(e.target.value)}
            className="bg-white border border-[#e7ddd2] rounded-lg px-3 py-2 text-[13px] font-medium"
            aria-label="Empresa"
          >
            <option value="">Empresa: todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="bg-white border border-[#e7ddd2] rounded-lg px-3 py-2 text-[13px] font-medium"
            aria-label="Ano"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <BotaoPdf href={`/api/ferias/relatorio/pdf?${qs}`} className={botaoClaro} titulo="Relatório de férias — PDF">
            PDF
          </BotaoPdf>
          <a href={`/api/ferias/relatorio/excel?${qs}`} className={botaoClaro}>
            Excel
          </a>
          <Link href="/ferias/simulacao" className={botaoClaro}>
            Simulação
          </Link>
          <button type="button" onClick={() => abrirAmortizar()} className={botaoClaro}>
            Amortizar férias antigas
          </button>
          {mostrarValores && (
            <Link href="/ferias/importar-relatorio" className={botaoClaro}>
              Importar relatório
            </Link>
          )}
          <button type="button" onClick={() => abrirNovo()} className="rounded-lg bg-[#262626] hover:bg-[#3d3d3d] text-white text-[13px] font-semibold px-4 py-2.5">
            + Lançar férias
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className={`${cartao} grid grid-cols-2 lg:grid-cols-5 overflow-hidden`}>
        {kpis.map((k, i) => (
          <div key={k.label} className={`px-6 py-5 flex flex-col gap-1.5 min-w-0 ${i < kpis.length - 1 ? "lg:border-r border-[#f4ebe1]" : ""} ${i < 4 ? "border-b lg:border-b-0 border-[#f4ebe1]" : ""}`}>
            <div className={rotuloMini}>{k.label}</div>
            <div className="text-[28px] leading-none font-semibold tabular-nums" style={{ fontFamily: OSWALD, color: k.cor }}>
              {k.valor}
            </div>
            <div className="text-[12px] text-[#5c5c5c] truncate" title={k.sub}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Abas + legenda */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex bg-[#f0e8df] rounded-lg p-[3px] text-[13px]" role="tablist">
          {(
            [
              ["mapa", "Mapa do ano"],
              ["sit", "Por situação"],
            ] as const
          ).map(([k, rot]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className="px-4 py-[7px] rounded-md"
              style={{
                background: aba === k ? "#fff" : "transparent",
                fontWeight: aba === k ? 600 : 500,
                color: aba === k ? COR.texto : COR.suave,
              }}
            >
              {rot}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-[12px] font-medium text-[#5c5c5c]">
          <Legenda cor={COR.concluida} rot="Concluída" />
          <Legenda cor={COR.aprovada} rot="Aprovada" />
          <Legenda cor={COR.planejada} rot="Planejada" />
          <Legenda cor={COR.planejada} rot="Conflito" anel />
          <span className="flex items-center gap-1.5">
            <span className="w-[2px] h-3" style={{ background: COR.vermelho }} />
            Limite de concessão
          </span>
        </div>
      </div>

      {aba === "mapa" && (
        <div className="space-y-5">
          <section className={`${cartao} px-6 py-5 overflow-x-auto`}>
            <div className="min-w-[900px]">
              <div className="flex justify-between items-baseline pb-3 gap-4">
                <div className="text-[14px] font-semibold">Mapa de {ano}</div>
                <div className="text-[12px] text-[#737373]">
                  Clique na linha de alguém para lançar férias naquela data. Clique numa barra para remarcar.
                </div>
              </div>

              {/* pessoas por mês */}
              <div className="grid items-end gap-4 pb-2.5" style={{ gridTemplateColumns: "220px 1fr 150px" }}>
                <span className="text-[12px] text-[#737373]">Pessoas em férias no mês</span>
                <div className="grid gap-1 h-16 items-end" style={{ gridTemplateColumns: colunasMes }}>
                  {NM.map((nome, m) => {
                    const atual = ano === anoDeHoje && m === mesDeHoje;
                    const futuro = ano > anoDeHoje || (ano === anoDeHoje && m > mesDeHoje);
                    return (
                      <div key={nome} className="flex flex-col items-center gap-[3px] h-full justify-end">
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: cnt[m] ? COR.texto : "#a39a91" }}>
                          {cnt[m]}
                        </span>
                        <div
                          className="w-full rounded-t-[3px]"
                          style={{
                            height: Math.max(3, (cnt[m] / maxN) * 44),
                            background: atual ? "#262626" : futuro ? COR.planejada : COR.concluida,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <span />
              </div>

              {/* cabeçalho */}
              <div className="grid gap-4 py-2 border-t border-b" style={{ gridTemplateColumns: "220px 1fr 150px", borderTopColor: COR.div, borderBottomColor: COR.input }}>
                <span className={cabTabela}>Colaborador</span>
                <div className="grid" style={{ gridTemplateColumns: colunasMes }}>
                  {NM.map((nome, m) => (
                    <span
                      key={nome}
                      className="pl-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                      style={{ color: ano === anoDeHoje && m === mesDeHoje ? COR.texto : COR.mudo }}
                    >
                      {nome}
                    </span>
                  ))}
                </div>
                <div className={`grid ${cabTabela}`} style={{ gridTemplateColumns: "60px 1fr" }}>
                  <span className="text-right">A marcar</span>
                  <span className="text-right">Limite</span>
                </div>
              </div>

              {unidades.length === 0 && <p className="text-[13px] text-[#737373] py-6">Nenhum colaborador CLT neste filtro.</p>}

              {unidades.map((u) => {
                const doGrupo = lista.filter((p) => p.unidade === u).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
                const emp = [...new Set(doGrupo.map((p) => p.empresa))].filter(Boolean).join(" / ");
                return (
                  <div key={u} className="flex flex-col">
                    <div className="text-[12px] font-semibold text-[#93440c] pt-3.5 pb-1">
                      {u} {emp && <span className="font-normal text-[#737373]">· {emp}</span>}
                    </div>
                    {doGrupo.map((p) => {
                      const saldo = p.aq ? Math.max(0, saldoDe(p)) : 0;
                      const dl = p.aq ? difDias(hoje, p.aq.limite) : 9999;
                      const urg = saldo > 0 && dl <= 60;
                      const rascunho =
                        validacao && dr && dr.pid === p.id && dr.inicio && Number(dr.dias) > 0 && validacao.fim ? validacao : null;
                      const temLimite = !!p.aq && saldo > 0 && Number(p.aq.limite.slice(0, 4)) === ano;
                      return (
                        <div
                          key={p.id}
                          className="grid gap-4 items-center py-1.5 border-t"
                          style={{ gridTemplateColumns: "220px 1fr 150px", borderTopColor: COR.div }}
                        >
                          <span className="text-[13px] font-medium truncate" title={p.nome}>
                            {p.nome}
                          </span>
                          <div
                            className="relative h-6 rounded cursor-copy hover:bg-[#fbf6f0]"
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const frac = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width));
                              let d = somarDias(inicioAno, Math.floor(frac * diasAno));
                              if (d <= hoje) d = somarDias(hoje, 1);
                              abrirNovo(p.id, proximoInicioValido(d, feriados));
                            }}
                          >
                            <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: colunasMes }}>
                              {NM.map((m) => (
                                <div key={m} style={{ borderLeft: `1px solid ${COR.div}` }} />
                              ))}
                            </div>
                            {ano === anoDeHoje && (
                              <div
                                className="absolute pointer-events-none"
                                style={{ top: -6, bottom: -6, left: pct(doy(hoje)), borderLeft: "1.5px dashed #262626", opacity: 0.35 }}
                              />
                            )}
                            {p.per.map((x) => {
                              const a = Math.max(0, doy(x.i));
                              const b = Math.min(diasAno, doy(fimDe(x)) + 1);
                              if (b <= 0 || a >= diasAno) return null;
                              const feito = fimDe(x) < hoje;
                              const oculto = dr?.edit === x.id;
                              return (
                                <div
                                  key={x.id}
                                  title={`${fDM(x.i)} a ${fDM(fimDe(x))} · ${x.d} dias · ${nomeStatus(x)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!feito) abrirEdit(p.id, x.id);
                                  }}
                                  className="absolute rounded-[3px]"
                                  style={{
                                    top: 4,
                                    height: 16,
                                    left: pct(a),
                                    width: pct(Math.max(0, b - a)),
                                    background: oculto ? "transparent" : corPeriodo(x),
                                    boxShadow: aneis.has(x.id) && !oculto ? `0 0 0 2px ${COR.vermelho}` : "none",
                                    cursor: feito ? "default" : "pointer",
                                  }}
                                />
                              );
                            })}
                            {rascunho && (
                              <div
                                className="absolute pointer-events-none rounded-[4px] box-border"
                                style={{
                                  top: 2,
                                  height: 20,
                                  border: "2px dashed #262626",
                                  background: "rgba(251,178,110,.35)",
                                  left: pct(Math.max(0, doy(dr!.inicio))),
                                  width: pct(Math.min(diasAno, doy(rascunho.fim) + 1) - Math.max(0, doy(dr!.inicio))),
                                }}
                              />
                            )}
                            {temLimite && (
                              <div
                                className="absolute pointer-events-none"
                                style={{ top: -2, bottom: -2, width: 2, background: COR.vermelho, left: pct(doy(p.aq!.limite)) }}
                              />
                            )}
                          </div>
                          <div className="grid items-center text-[13px] tabular-nums" style={{ gridTemplateColumns: "60px 1fr" }}>
                            <span className="text-right font-semibold" style={{ color: saldo ? COR.texto : "#a39a91" }}>
                              {p.aq ? `${saldo}d` : "—"}
                            </span>
                            <span className="text-right" style={{ color: urg ? "#b42318" : COR.suave, fontWeight: urg ? 600 : 400 }}>
                              {p.aq ? fDMAcurto(p.aq.limite) : "sem período"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <p className="pt-3.5 text-[12px] text-[#737373]">
                {ano === anoDeHoje ? `Linha tracejada: hoje, ${fDM(hoje)}. ` : ""}
                &quot;A marcar&quot; são os dias do período aquisitivo que ainda não têm data.
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className={`${cartao} px-6 py-5 flex flex-col gap-1.5`}>
              <div className="text-[14px] font-semibold pb-1.5">Conflitos na mesma unidade</div>
              {conflitos.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-3 items-center py-3 border-t border-[#f4ebe1]">
                  <div className="flex flex-col gap-[3px] min-w-0">
                    <span className="text-[13px] font-medium">{c.texto}</span>
                    <span className="text-[12px] text-[#737373]">{c.sub}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => abrirEdit(c.tardio.pid, c.tardio.id)}
                    className="rounded-lg bg-[#262626] hover:bg-[#3d3d3d] text-white text-[12px] font-semibold px-3.5 py-2"
                  >
                    Remarcar
                  </button>
                </div>
              ))}
              {conflitos.length === 0 && (
                <p className="text-[13px] text-[#737373] py-3 border-t border-[#f4ebe1]">
                  Nenhuma sobreposição de férias na mesma unidade.
                </p>
              )}
            </section>

            <section className={`${cartao} px-6 py-5 flex flex-col gap-2.5`}>
              <div className="flex justify-between items-baseline gap-3">
                <div className="text-[14px] font-semibold">Custo estimado por mês</div>
                <span className="text-[12px] text-[#737373]">salário ÷ 30 × dias + 1/3</span>
              </div>
              <div className="grid gap-1 h-[70px] items-end" style={{ gridTemplateColumns: colunasMes }}>
                {NM.map((nome, m) => (
                  <div
                    key={nome}
                    title={brl(custo[m])}
                    className="rounded-t-[3px]"
                    style={{
                      height: Math.max(2, (custo[m] / maxC) * 100) + "%",
                      background: ano > anoDeHoje || (ano === anoDeHoje && m >= mesDeHoje) ? COR.planejada : COR.concluida,
                    }}
                  />
                ))}
              </div>
              <div className="grid gap-1 text-[11px] text-[#737373] text-center" style={{ gridTemplateColumns: colunasMes }}>
                {NM.map((nome) => (
                  <span key={nome}>{nome}</span>
                ))}
              </div>
              <div className="flex justify-between text-[12px] text-[#5c5c5c]">
                <span>
                  Total no ano <b className="text-[#262626]">{brl(totalCusto)}</b>
                </span>
                <span>
                  Pico em {NM[pico].toLowerCase()} <b className="text-[#262626]">{brl(custo[pico])}</b>
                </span>
              </div>
            </section>
          </div>
        </div>
      )}

      {aba === "sit" && (
        <div className="space-y-5">
          <section className={`${cartao} px-6 py-5 flex flex-col gap-2.5`}>
            <div className="flex justify-between items-baseline">
              <div className="text-[14px] font-semibold">Situação dos períodos aquisitivos</div>
              <span className="text-[12px] text-[#737373]">do mais urgente para o mais tranquilo</span>
            </div>
            <div className="flex h-7 rounded-md overflow-hidden gap-[3px]">
              {situacoesResumo.map((s) => (
                <div
                  key={s.k}
                  className="flex items-center px-2.5 text-[12px] font-semibold"
                  style={{ flex: s.n, background: s.cor, color: s.txt, display: s.n ? "flex" : "none" }}
                >
                  {s.n}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 pt-1.5">
              {situacoesResumo.map((s) => (
                <div key={s.k} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.cor }} />
                    <span className="text-[13px] font-semibold">{s.nome}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[28px] leading-none font-semibold" style={{ fontFamily: OSWALD, color: s.numCor }}>
                      {s.n}
                    </span>
                    <span className="text-[12px] text-[#5c5c5c]">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${cartao} px-6 pt-2 pb-4 overflow-x-auto`}>
            <div className="min-w-[1000px]">
              <div
                className={`grid gap-4 pt-3.5 pb-2.5 border-b ${cabTabela}`}
                style={{ gridTemplateColumns: "1.5fr 1fr 1.1fr .5fr 1.7fr .8fr 210px", borderBottomColor: COR.input }}
              >
                <span>Colaborador</span>
                <span>Período aquisitivo</span>
                <span>Limite de concessão</span>
                <span className="text-right">A marcar</span>
                <span>Férias marcadas</span>
                <span className="text-right">A pagar (est.)</span>
                <span />
              </div>
              {blocos.length === 0 && <p className="text-[13px] text-[#737373] py-6">Nenhum colaborador CLT neste filtro.</p>}
              {blocos.map((b) => (
                <div key={b.k} className="flex flex-col">
                  <div className="flex items-center gap-2 pt-[18px] pb-1.5">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: b.cor }} />
                    <span className="text-[13px] font-semibold">{b.nome}</span>
                    <span className="text-[12px] font-medium text-[#737373]">{b.pessoas.length}</span>
                  </div>
                  {b.pessoas.map((p) => {
                    const sd = p.aq ? Math.max(0, saldoDe(p)) : 0;
                    const dl = p.aq ? difDias(hoje, p.aq.limite) : 9999;
                    const urg = sd > 0 && dl <= 60;
                    const futuros = p.per.filter((x) => x.i >= hoje).reduce((t, x) => t + x.d, 0);
                    const visiveis = p.per.filter((x) => fimDe(x) >= hoje || (p.aq ? x.pid === p.aq.id : false));
                    const prim = b.k === "vencida" || b.k === "vencendo";
                    return (
                      <div
                        key={p.id}
                        className="grid gap-4 items-center py-3 border-t text-[13px] tabular-nums"
                        style={{ gridTemplateColumns: "1.5fr 1fr 1.1fr .5fr 1.7fr .8fr 210px", borderTopColor: COR.div }}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium truncate" title={p.nome}>
                            {p.nome}
                          </span>
                          <span className="text-[12px] text-[#737373]">
                            {p.unidade}
                            {p.empresa ? ` · ${p.empresa}` : ""}
                          </span>
                        </div>
                        <span className="text-[#5c5c5c]">{p.aq ? `${fDMAcurto(p.aq.ini)} a ${fDMAcurto(p.aq.fim)}` : "—"}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{p.aq ? fDMA(p.aq.limite) : "—"}</span>
                          {urg && (
                            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-[10px] whitespace-nowrap" style={{ color: "#b42318", background: "#fdecea" }}>
                              {dl < 0 ? `vencido há ${-dl} dias` : `em ${dl} dias`}
                            </span>
                          )}
                        </div>
                        <span className="text-right font-semibold" style={{ color: sd ? COR.texto : "#a39a91" }}>
                          {sd}d
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {visiveis.map((x) => {
                            const feito = fimDe(x) < hoje;
                            const estilo = feito
                              ? { background: "#f4ebe1", color: COR.suave }
                              : x.st === "aprovado"
                              ? { background: "#3d3d3d", color: "#fff" }
                              : { background: "#ffe9d2", color: "#93440c" };
                            return (
                              <span
                                key={x.id}
                                title={feito ? "concluída" : "clique para remarcar"}
                                onClick={() => (feito ? undefined : abrirEdit(p.id, x.id))}
                                className="text-[12px] font-medium px-2 py-[3px] rounded-md whitespace-nowrap"
                                style={{
                                  ...estilo,
                                  boxShadow: aneis.has(x.id) ? `inset 0 0 0 1.5px ${COR.vermelho}` : "none",
                                  cursor: feito ? "default" : "pointer",
                                }}
                              >
                                {fDM(x.i)} a {fDM(fimDe(x))}
                              </span>
                            );
                          })}
                          {visiveis.length === 0 && <span className="text-[12px] text-[#737373]">nada marcado</span>}
                        </div>
                        <span className="text-right text-[#3d3d3d]">{sd + futuros ? brl((sd + futuros) * valorDia(p)) : "—"}</span>
                        <div className="flex justify-end gap-1.5">
                          {p.per.some((x) => x.st === "planejada" && fimDe(x) >= hoje) && (
                            <button type="button" disabled={pendente} onClick={() => aprovar(p.id)} className={botaoMini(false)}>
                              Aprovar
                            </button>
                          )}
                          {sd > 0 && p.aq && (
                            <button type="button" onClick={() => abrirNovo(p.id)} className={botaoMini(prim)}>
                              Lançar férias
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
          <p className="text-[12px] text-[#737373]">
            Limite de concessão: data até a qual as férias do período aquisitivo precisam ser gozadas (CLT art. 134).
            Depois disso o pagamento é em dobro (art. 137).
          </p>
        </div>
      )}

      {/* Painel lateral de lançamento */}
      {dr && (
        <>
          <div onClick={() => setDr(null)} className="fixed inset-0 z-20" style={{ background: "rgba(38,38,38,.18)" }} />
          <div
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] bg-white z-[21] flex flex-col"
            style={{ boxShadow: "-20px 0 60px -20px rgba(61,40,20,.35)", fontFamily: INTER }}
            role="dialog"
            aria-label={dr.edit ? "Remarcar férias" : "Lançar férias"}
          >
            <div className="flex justify-between items-center px-7 py-6 border-b border-[#f4ebe1]">
              <div className="text-[22px] leading-none font-semibold uppercase" style={{ fontFamily: OSWALD, letterSpacing: "0.02em" }}>
                {dr.edit ? "Remarcar férias" : "Lançar férias"}
              </div>
              <button
                type="button"
                onClick={() => setDr(null)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-lg border border-[#e7ddd2] bg-white text-[18px] text-[#5c5c5c]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto px-7 py-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <span className={rotuloMini}>Colaborador</span>
                <SeletorColaborador
                  opcoes={opcoesPessoa}
                  empresas={empresas}
                  valor={dr.pid}
                  nomeValor={pessoaDr?.nome ?? ""}
                  bloqueado={dr.travado}
                  vazio="Escolha quem vai sair de férias"
                  onEscolher={(id) => abrirNovo(id)}
                />
              </div>

              {emDia && pessoaDr.aq && (
                <div className="flex flex-col gap-5">
                  <div className="bg-[#faf7f3] rounded-[10px] px-4 py-3.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                    <div className="flex flex-col gap-1 text-[12px] leading-[1.4] text-[#5c5c5c]">
                      <span className="text-[13px] font-medium text-[#262626]">
                        {pessoaDr.unidade}
                        {pessoaDr.empresa ? ` · ${pessoaDr.empresa}` : ""}
                      </span>
                      <span>
                        Aquisitivo {fDMA(pessoaDr.aq.ini)} a {fDMA(pessoaDr.aq.fim)}
                      </span>
                      <span>
                        Limite {fDMA(pessoaDr.aq.limite)} ·{" "}
                        <b style={{ color: difDias(hoje, pessoaDr.aq.limite) <= 60 ? "#b42318" : COR.texto }}>
                          {difDias(hoje, pessoaDr.aq.limite) < 0
                            ? `vencido há ${-difDias(hoje, pessoaDr.aq.limite)} dias`
                            : `faltam ${difDias(hoje, pessoaDr.aq.limite)} dias`}
                        </b>
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[32px] leading-none font-semibold" style={{ fontFamily: OSWALD }}>
                        {Math.max(0, validacao.disp)}
                      </span>
                      <span className="text-[11px] text-[#737373]">dias disponíveis</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className={rotuloMini}>Início</span>
                      <input
                        type="date"
                        value={dr.inicio}
                        onChange={(e) => patch({ inicio: e.target.value })}
                        className="text-[14px] font-medium px-3 py-[9px] border border-[#e7ddd2] rounded-lg"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={rotuloMini}>Dias</span>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={dr.dias}
                        onChange={(e) => patch({ dias: e.target.value })}
                        className="text-[14px] font-medium px-3 py-[9px] border border-[#e7ddd2] rounded-lg w-full"
                      />
                    </label>
                  </div>
                  <div className="flex gap-1.5 -mt-2">
                    {[30, 20, 15, 14, 10, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => patch({ dias: n })}
                        className="flex-1 text-center text-[12px] font-semibold py-1.5 rounded-md"
                        style={{
                          background: Number(dr.dias) === n ? "#262626" : "#f4ebe1",
                          color: Number(dr.dias) === n ? "#fff" : "#3d3d3d",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <button type="button" onClick={() => patch({ abono: !dr.abono })} className="flex justify-between items-center gap-3 text-left">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium">Vender 10 dias (abono pecuniário)</span>
                      <span className="text-[12px] text-[#737373]">Desconta 10 dias do saldo, pagos em dinheiro</span>
                    </span>
                    <span
                      className="w-[38px] h-[22px] rounded-[11px] p-[3px] box-border shrink-0"
                      style={{ background: dr.abono ? "#262626" : "#e7ddd2" }}
                    >
                      <span className="block w-4 h-4 rounded-full bg-white" style={{ marginLeft: dr.abono ? 16 : 0 }} />
                    </span>
                  </button>

                  <div className="border-t border-[#f4ebe1] pt-4 flex flex-col gap-2.5 text-[13px]">
                    <Linha rot="Período" valor={dr.inicio && validacao.fim ? `${fComSemana(dr.inicio)} a ${fComSemana(validacao.fim)}` : "—"} forte />
                    <Linha rot="Retorno" valor={dr.inicio && validacao.fim ? fComSemana(somarDias(validacao.fim, 1)) : "—"} />
                    <Linha rot="Pagamento até" valor={dr.inicio ? `${fComSemana(somarDias(dr.inicio, -2))} · 2 dias antes` : "—"} />
                    <Linha rot="Férias + 1/3 (est.)" valor={brl(valorFeriasEstimado(pessoaDr.salario, Number(dr.dias) || 0))} forte />
                    {dr.abono && <Linha rot="Abono (est.)" valor={brl(valorFeriasEstimado(pessoaDr.salario, 10))} forte />}
                  </div>

                  <div className="flex flex-col gap-2">
                    {validacao.erros.map((t) => (
                      <Mensagem key={t} icone="!" fg="#b42318" bg="#fdecea" t={t} />
                    ))}
                    {validacao.avisos.map((t) => (
                      <Mensagem key={t} icone="!" fg="#93440c" bg="#fff3e6" t={t} />
                    ))}
                    {validacao.erros.length + validacao.avisos.length === 0 && (
                      <Mensagem icone="✓" fg="#1f7a52" bg="#e6f4ec" t="Dentro das regras da CLT para fracionamento, início e saldo." />
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className={rotuloMini}>Fora na mesma unidade no período</span>
                    {validacao.sobre.map((s, i) => (
                      <div key={i} className="flex justify-between text-[13px] py-1.5 border-t border-[#f4ebe1]">
                        <span>{s.nome}</span>
                        <span className="text-[#5c5c5c] tabular-nums">
                          {s.de} a {s.ate}
                        </span>
                      </div>
                    ))}
                    {validacao.sobre.length === 0 && <span className="text-[13px] text-[#737373]">Ninguém.</span>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className={rotuloMini}>Lançar como</span>
                    <div className="flex bg-[#f0e8df] rounded-lg p-[3px] text-[13px]">
                      {(
                        [
                          ["planejada", "Planejada"],
                          ["aprovado", "Aprovada"],
                        ] as const
                      ).map(([k, rot]) => (
                        <button
                          type="button"
                          key={k}
                          onClick={() => patch({ st: k })}
                          className="flex-1 text-center py-[7px] rounded-md"
                          style={{ background: dr.st === k ? "#fff" : "transparent", fontWeight: dr.st === k ? 600 : 500 }}
                        >
                          {rot}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 px-7 py-5 border-t border-[#f4ebe1]">
              {dr.edit && (
                <button
                  type="button"
                  onClick={excluir}
                  disabled={pendente}
                  className="text-[13px] font-semibold px-3.5 py-[11px] rounded-lg bg-white"
                  style={{ border: "1px solid #f3c6c0", color: "#b42318" }}
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                onClick={() => setDr(null)}
                className="flex-1 text-[13px] font-semibold py-[11px] rounded-lg border border-[#e7ddd2] bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={!validacao?.ok || pendente}
                className="flex-[2] text-[13px] font-semibold py-[11px] rounded-lg"
                style={{
                  background: validacao?.ok && !pendente ? "#262626" : "#e7ddd2",
                  color: validacao?.ok && !pendente ? "#fff" : "#737373",
                  cursor: validacao?.ok && !pendente ? "pointer" : "not-allowed",
                }}
              >
                {pendente ? "Salvando…" : dr.edit ? "Salvar alteração" : "Lançar férias"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Painel lateral: amortizar férias antigas */}
      {am && (
        <>
          <div onClick={() => setAm(null)} className="fixed inset-0 z-20" style={{ background: "rgba(38,38,38,.18)" }} />
          <div
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[440px] bg-white z-[21] flex flex-col"
            style={{ boxShadow: "-20px 0 60px -20px rgba(61,40,20,.35)", fontFamily: INTER }}
            role="dialog"
            aria-label="Amortizar férias antigas"
          >
            <div className="flex justify-between items-center px-7 py-6 border-b border-[#f4ebe1]">
              <div className="text-[22px] leading-none font-semibold uppercase" style={{ fontFamily: OSWALD, letterSpacing: "0.02em" }}>
                {am.edit ? "Corrigir férias antigas" : "Amortizar férias antigas"}
              </div>
              <button
                type="button"
                onClick={() => setAm(null)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-lg border border-[#e7ddd2] bg-white text-[18px] text-[#5c5c5c]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto px-7 py-6 flex flex-col gap-5">
              <p className="text-[12px] leading-[1.5] text-[#737373]">
                Registre férias que o colaborador já tirou e que ainda não estão no sistema. Elas descontam dos dias a gozar do período
                aquisitivo escolhido.
              </p>

              <div className="flex flex-col gap-1.5">
                <span className={rotuloMini}>Colaborador</span>
                <SeletorColaborador
                  opcoes={opcoesAm}
                  empresas={empresas}
                  valor={am.pid}
                  nomeValor={pessoaAm?.nome ?? ""}
                  vazio="Escolha o colaborador"
                  onEscolher={(id) => abrirAmortizar(id)}
                />
              </div>

              {pessoaAm && periodoAm && validacaoAm && (
                <div className="flex flex-col gap-5">
                  <label className="flex flex-col gap-1.5">
                    <span className={rotuloMini}>Período aquisitivo</span>
                    <select
                      value={am.periodoId}
                      onChange={(e) => escolherPeriodoAm(pessoaAm, e.target.value)}
                      className="text-[14px] font-medium px-3 py-2.5 border border-[#e7ddd2] rounded-lg bg-white"
                    >
                      {pessoaAm.periodos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {fDMAcurto(p.ini)} a {fDMAcurto(p.fim)} · {Math.max(0, saldoPeriodo(pessoaAm, p.id))} dias a gozar
                          {p.status === "gozado" ? " · gozado" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="bg-[#faf7f3] rounded-[10px] px-4 py-3.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                    <div className="flex flex-col gap-1 text-[12px] leading-[1.4] text-[#5c5c5c]">
                      <span className="text-[13px] font-medium text-[#262626]">
                        {pessoaAm.unidade}
                        {pessoaAm.empresa ? ` · ${pessoaAm.empresa}` : ""}
                      </span>
                      <span>
                        Aquisitivo {fDMA(periodoAm.ini)} a {fDMA(periodoAm.fim)}
                      </span>
                      <span>Limite {fDMA(periodoAm.limite)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[32px] leading-none font-semibold" style={{ fontFamily: OSWALD }}>
                        {Math.max(0, validacaoAm.disp)}
                      </span>
                      <span className="text-[11px] text-[#737373]">dias a gozar</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className={rotuloMini}>Início das férias</span>
                      <input
                        type="date"
                        value={am.inicio}
                        max={somarDias(hoje, -1)}
                        onChange={(e) => patchAm({ inicio: e.target.value })}
                        className="text-[14px] font-medium px-3 py-[9px] border border-[#e7ddd2] rounded-lg"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={rotuloMini}>Quantos dias</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={am.dias}
                        onChange={(e) => patchAm({ dias: e.target.value })}
                        className="text-[14px] font-medium px-3 py-[9px] border border-[#e7ddd2] rounded-lg w-full"
                      />
                    </label>
                  </div>
                  <div className="flex gap-1.5 -mt-2">
                    {[30, 20, 15, 14, 10, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => patchAm({ dias: n })}
                        className="flex-1 text-center text-[12px] font-semibold py-1.5 rounded-md"
                        style={{
                          background: diasAm === n ? "#262626" : "#f4ebe1",
                          color: diasAm === n ? "#fff" : "#3d3d3d",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {am.inicio && fimAm && (
                    <p className="text-[13px] -mt-2 text-[#3d3d3d]">
                      Período: <b>{fComSemana(am.inicio)}</b> a <b>{fComSemana(fimAm)}</b> · {diasAm} dia{diasAm !== 1 ? "s" : ""}
                    </p>
                  )}
                  <p className="text-[12px] -mt-3 text-[#737373]">
                    Se não souber a data exata, use uma data aproximada. O que vale para o saldo é a quantidade de dias.
                  </p>

                  <button type="button" onClick={() => patchAm({ abono: !am.abono })} className="flex justify-between items-center gap-3 text-left">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium">Vendeu 10 dias (abono pecuniário)</span>
                      <span className="text-[12px] text-[#737373]">Desconta 10 dias do saldo deste período</span>
                    </span>
                    <span
                      className="w-[38px] h-[22px] rounded-[11px] p-[3px] box-border shrink-0"
                      style={{ background: am.abono ? "#262626" : "#e7ddd2" }}
                    >
                      <span className="block w-4 h-4 rounded-full bg-white" style={{ marginLeft: am.abono ? 16 : 0 }} />
                    </span>
                  </button>

                  {am.inicio && validacaoAm.erros.map((e) => <Mensagem key={e} icone="!" fg="#b42318" bg="#fdecea" t={e} />)}
                  {am.inicio && validacaoAm.erros.length === 0 && (
                    <Mensagem icone="✓" fg="#1f7a52" bg="#e6f4ec" t={`Pronto para ${am.edit ? "salvar a correção" : "registrar"}: ${validacaoAm.dias} dias.`} />
                  )}

                  <div className="flex flex-col gap-1.5">
                    <span className={rotuloMini}>Férias já registradas neste período</span>
                    {itensAm.length === 0 && <span className="text-[13px] text-[#737373]">Nada registrado ainda.</span>}
                    {itensAm
                      .slice()
                      .sort((a, b) => (a.i < b.i ? -1 : 1))
                      .map((x) => {
                        const passada = fimDe(x) < hoje;
                        const emEdicao = am.edit === x.id;
                        return (
                          <div
                            key={x.id}
                            className="flex items-center justify-between gap-2 py-2 border-t border-[#f4ebe1] text-[13px]"
                            style={{ background: emEdicao ? "#fff3e6" : "transparent" }}
                          >
                            <span className="tabular-nums">
                              {fDMA(x.i)} a {fDMA(fimDe(x))} · {x.d} dias
                              {x.ab ? " · abono" : ""}
                              {!passada && <span className="text-[#737373]"> · futura (use o mapa)</span>}
                            </span>
                            {passada && (
                              <span className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={pendente}
                                  onClick={() => setAm({ ...am, edit: x.id, inicio: x.i, dias: x.d, abono: itensAm.some((y) => y.ab), confirmarExcluir: null })}
                                  className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#e7ddd2] bg-white"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={pendente}
                                  onClick={() => excluirAm(x.id)}
                                  className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-white"
                                  style={{
                                    border: "1px solid #f3c6c0",
                                    color: am.confirmarExcluir === x.id ? "#fff" : "#b42318",
                                    background: am.confirmarExcluir === x.id ? "#b42318" : "#fff",
                                  }}
                                >
                                  {am.confirmarExcluir === x.id ? "Confirmar" : "Excluir"}
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {pessoaAm && !periodoAm && (
                <Mensagem icone="!" fg="#93440c" bg="#fff3e6" t="Este colaborador ainda não tem período aquisitivo. Gere o período na ficha dele." />
              )}
            </div>

            <div className="flex gap-2.5 px-7 py-5 border-t border-[#f4ebe1]">
              {am.edit ? (
                <button
                  type="button"
                  onClick={() => patchAm({ edit: null, inicio: "" })}
                  className="flex-1 text-[13px] font-semibold py-[11px] rounded-lg border border-[#e7ddd2] bg-white"
                >
                  Cancelar correção
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAm(null)}
                  className="flex-1 text-[13px] font-semibold py-[11px] rounded-lg border border-[#e7ddd2] bg-white"
                >
                  Fechar
                </button>
              )}
              <button
                type="button"
                onClick={salvarAm}
                disabled={!validacaoAm || validacaoAm.erros.length > 0 || pendente}
                className="flex-[2] text-[13px] font-semibold py-[11px] rounded-lg"
                style={{
                  background: validacaoAm && validacaoAm.erros.length === 0 && !pendente ? "#262626" : "#e7ddd2",
                  color: validacaoAm && validacaoAm.erros.length === 0 && !pendente ? "#fff" : "#737373",
                  cursor: validacaoAm && validacaoAm.erros.length === 0 && !pendente ? "pointer" : "not-allowed",
                }}
              >
                {pendente ? "Salvando…" : am.edit ? "Salvar correção" : "Registrar férias"}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 bottom-7 -translate-x-1/2 bg-[#262626] text-white text-[13px] font-medium px-[18px] py-3 rounded-[10px] z-30 flex gap-2.5 items-center"
          style={{ boxShadow: "0 10px 30px -10px rgba(0,0,0,.4)" }}
        >
          <span className="font-bold" style={{ color: "#7fd3a8" }}>
            ✓
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

const botaoClaro =
  "text-[13px] font-semibold px-3.5 py-[9px] rounded-lg border border-[#e7ddd2] bg-white text-[#262626] hover:bg-[#fbf6f0]";

function botaoMini(primario: boolean): string {
  return primario
    ? "text-[12px] font-semibold px-3 py-[7px] rounded-lg whitespace-nowrap bg-[#262626] text-white border border-[#262626]"
    : "text-[12px] font-semibold px-3 py-[7px] rounded-lg whitespace-nowrap bg-white text-[#262626] border border-[#e7ddd2]";
}

function Legenda({ cor, rot, anel }: { cor: string; rot: string; anel?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-3.5 h-2 rounded-[2px]"
        style={{ background: cor, boxShadow: anel ? `0 0 0 2px ${COR.vermelho}` : "none" }}
      />
      {rot}
    </span>
  );
}

function Linha({ rot, valor, forte }: { rot: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#5c5c5c]">{rot}</span>
      {forte ? <b>{valor}</b> : <span>{valor}</span>}
    </div>
  );
}

function Mensagem({ icone, fg, bg, t }: { icone: string; fg: string; bg: string; t: string }) {
  return (
    <div className="grid grid-cols-[16px_1fr] gap-2 items-start px-3 py-2.5 rounded-lg text-[12px] leading-[1.45]" style={{ background: bg, color: fg }}>
      <b>{icone}</b>
      <span>{t}</span>
    </div>
  );
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Escolha rápida de colaborador: filtro por empresa + busca pelo nome, e uma lista clicável. */
function SeletorColaborador({
  opcoes,
  empresas,
  valor,
  nomeValor,
  bloqueado,
  vazio,
  onEscolher,
}: {
  opcoes: { id: string; nome: string; empresaId: string | null; label: string }[];
  empresas: OpcaoSimples[];
  valor: string;
  nomeValor: string;
  bloqueado?: boolean;
  vazio: string;
  onEscolher: (id: string) => void;
}) {
  const [emp, setEmp] = useState("");
  const [busca, setBusca] = useState("");

  if (valor) {
    return (
      <div className="flex items-center justify-between gap-3 border border-[#e7ddd2] rounded-lg px-3 py-2.5 bg-white">
        <span className="text-[14px] font-medium truncate">{nomeValor}</span>
        {!bloqueado && (
          <button type="button" onClick={() => onEscolher("")} className="text-[12px] font-semibold text-[#b85c12] hover:text-[#93440c] shrink-0">
            Trocar
          </button>
        )}
      </div>
    );
  }

  const termo = semAcento(busca.trim());
  const filtradas = opcoes.filter((o) => (!emp || o.empresaId === emp) && (!termo || semAcento(o.nome).includes(termo)));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1.3fr] gap-2">
        <select
          value={emp}
          onChange={(e) => setEmp(e.target.value)}
          aria-label="Filtrar por empresa"
          className="text-[13px] font-medium px-2.5 py-2 border border-[#e7ddd2] rounded-lg bg-white"
        >
          <option value="">Empresa: todas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome"
          aria-label="Buscar pelo nome"
          className="text-[13px] px-2.5 py-2 border border-[#e7ddd2] rounded-lg"
        />
      </div>
      <p className="text-[12px] text-[#737373]">{vazio} ({filtradas.length})</p>
      <ul className="max-h-[220px] overflow-auto border border-[#e7ddd2] rounded-lg divide-y divide-[#f4ebe1]">
        {filtradas.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onEscolher(o.id)} className="w-full text-left text-[13px] px-3 py-2.5 hover:bg-[#fbf6f0]">
              {o.label}
            </button>
          </li>
        ))}
        {filtradas.length === 0 && <li className="text-[13px] text-[#737373] px-3 py-3">Ninguém encontrado com esse filtro.</li>}
      </ul>
    </div>
  );
}
