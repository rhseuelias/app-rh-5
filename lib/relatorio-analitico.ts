import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, FolhaCompetencia, FolhaLancamento, FolhaTipo, Unidade } from "@/types/db";
import { colaboradorAtivoFolha } from "@/lib/folha-calculos";
import { carregarPontoComHeranca } from "@/lib/ponto-herdado";
import type { ColunaRel, GrupoRel, LinhaRel, OpcaoEscopo, RelatorioAnalitico } from "@/lib/relatorio-analitico-tipos";

const pad = (n: number) => String(n).padStart(2, "0");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function fmt2(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mês atual no horário de Brasília (o servidor roda em UTC)
export function competenciaAtualSP(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(
    new Date()
  );
  const ano = partes.find((x) => x.type === "year")?.value ?? "";
  const mes = partes.find((x) => x.type === "month")?.value ?? "";
  return `${ano}-${mes}`;
}

// A folha de SETEMBRO cobre de 22/08 a 21/09
export function periodoTexto(comp: string): string {
  const [a, m] = comp.split("-").map(Number);
  const ini = new Date(a, m - 2, 22);
  const fim = new Date(a, m - 1, 21);
  return `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)} – ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}/${String(fim.getFullYear()).slice(2)}`;
}

export function rotuloMesCompleto(comp: string): string {
  const [a, m] = comp.split("-").map(Number);
  const nome = MESES[(m || 1) - 1] ?? comp;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${a}`;
}

function titulo(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((p) => (p.length <= 2 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

interface Func {
  id: string;
  nome: string;
  empresa: string;
  unidade: string | null;
}

function semUnidade(f: Func): boolean {
  return !f.unidade || f.unidade.toUpperCase() === f.empresa.toUpperCase();
}

function rotuloUnidade(f: Func): string {
  return semUnidade(f) ? f.empresa : `${f.empresa}-${titulo(f.unidade as string)}`;
}

function casaEscopo(f: Func, chave: string): boolean {
  if (chave === "todas") return true;
  if (chave.startsWith("e:")) return f.empresa === chave.slice(2);
  if (chave.startsWith("s:")) return f.empresa === chave.slice(2) && semUnidade(f);
  if (chave.startsWith("u:")) {
    const [emp, uni] = chave.slice(2).split("|");
    return f.empresa === emp && f.unidade === uni;
  }
  return true;
}

// "17 - hora extra 50% - Referência" -> código 17, rótulo "hora extra 50%"
function partirNome(nome: string, codigo: string | null) {
  const m = /^\s*(\d+)\s*-\s*(.+?)(?:\s+-\s+(Valor|Refer[eê]ncia))?\s*$/i.exec(nome);
  if (m) return { codigo: m[1], rotulo: m[2] };
  return { codigo: (codigo ?? "").trim(), rotulo: nome };
}

export async function montarRelatorioAnalitico(
  competencia: string,
  escopo: string
): Promise<{ erro: string } | { relatorio: RelatorioAnalitico; opcoes: OpcaoEscopo[] }> {
  const supabase = createClient();

  const [empresasRes, unidadesRes, colaboradoresRes, competenciaRes, tiposRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("folha_competencias").select("*").eq("competencia", competencia).maybeSingle(),
    supabase.from("folha_tipos").select("*").eq("ativo", true).order("ordem"),
  ]);
  const falha = empresasRes.error ?? unidadesRes.error ?? colaboradoresRes.error ?? competenciaRes.error ?? tiposRes.error;
  if (falha) return { erro: `Não foi possível ler os dados: ${falha.message}` };

  const empresas = (empresasRes.data ?? []) as Empresa[];
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u.nome]));
  const empresaPorId = new Map(empresas.map((e) => [e.id, e.nome]));
  const ordemEmpresa = new Map(empresas.map((e, i) => [e.nome, i]));
  const competenciaRow = competenciaRes.data as FolhaCompetencia | null;

  const todos: Func[] = ((colaboradoresRes.data ?? []) as Colaborador[])
    .filter((c) => colaboradorAtivoFolha(c) && c.tipo !== "PJ")
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      empresa: c.empresa_id ? empresaPorId.get(c.empresa_id) ?? "SEM EMPRESA" : "SEM EMPRESA",
      unidade: c.unidade_id ? unidadePorId.get(c.unidade_id) ?? null : null,
    }))
    .sort(
      (a, b) =>
        (ordemEmpresa.get(a.empresa) ?? 999) - (ordemEmpresa.get(b.empresa) ?? 999) ||
        rotuloUnidade(a).localeCompare(rotuloUnidade(b), "pt-BR") ||
        a.nome.localeCompare(b.nome, "pt-BR")
    );

  // opções do seletor (mesmas dos botões da planilha)
  const opcoes: OpcaoEscopo[] = [{ chave: "todas", rotulo: "Geral — todas as unidades" }];
  const nomesEmpresa: string[] = [];
  todos.forEach((f) => {
    if (!nomesEmpresa.includes(f.empresa)) nomesEmpresa.push(f.empresa);
  });
  for (const e of nomesEmpresa) {
    const doEmp = todos.filter((f) => f.empresa === e);
    const unidades = Array.from(new Set(doEmp.filter((f) => !semUnidade(f)).map((f) => f.unidade as string))).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    if (unidades.length === 0) {
      opcoes.push({ chave: `e:${e}`, rotulo: e });
      continue;
    }
    opcoes.push({ chave: `e:${e}`, rotulo: `${e} (todas as unidades)` });
    unidades.forEach((u) => opcoes.push({ chave: `u:${e}|${u}`, rotulo: `${e}-${titulo(u)}` }));
    if (doEmp.some(semUnidade)) opcoes.push({ chave: `s:${e}`, rotulo: `${e}-sem unidade` });
  }
  const escopoValido = opcoes.some((o) => o.chave === escopo) ? escopo : "todas";
  const escopoRotulo = opcoes.find((o) => o.chave === escopoValido)?.rotulo ?? "Geral";

  const noEscopo = todos.filter((f) => casaEscopo(f, escopoValido));

  // colunas (só proventos e descontos) e valores do mês
  const tipos = ((tiposRes.data ?? []) as FolhaTipo[]).filter((t) => t.categoria === "provento" || t.categoria === "desconto");
  const colunasBase: ColunaRel[] = tipos
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.categoria === b.t.categoria ? a.i - b.i : a.t.categoria === "provento" ? -1 : 1))
    .map(({ t }) => {
      const p = partirNome(t.nome, t.codigo);
      return {
        id: t.id,
        nome: t.nome,
        codigo: p.codigo,
        rotulo: p.rotulo,
        grupo: t.categoria as "provento" | "desconto",
        formato: (["moeda", "texto", "sim_nao"].includes(t.formato) ? t.formato : "texto") as ColunaRel["formato"],
        horas: /refer[eê]ncia/i.test(t.nome),
        destaque: p.codigo === "431",
      };
    });

  const valoresPor: Record<string, Record<string, FolhaLancamento>> = {};
  const pontoPor: Record<string, string> = {};
  // Ponto / Observações: vale o do mês ou, se não houver, o do mês anterior mais recente (igual à tela de lançamentos)
  if (noEscopo.length > 0) {
    const pontos = await carregarPontoComHeranca(
      supabase,
      competencia,
      noEscopo.map((f) => f.id)
    );
    for (const [colabId, p] of Object.entries(pontos)) pontoPor[colabId] = p.texto;
  }
  if (competenciaRow && noEscopo.length > 0) {
    const ids = noEscopo.map((f) => f.id);
    const lancRes = await supabase.from("folha_lancamentos").select("*").eq("competencia_id", competenciaRow.id).in("colaborador_id", ids);
    for (const l of (lancRes.data ?? []) as FolhaLancamento[]) (valoresPor[l.colaborador_id] ??= {})[l.tipo_id] = l;
  }

  function celula(col: ColunaRel, colabId: string): { texto: string; numero: number } {
    const l = valoresPor[colabId]?.[col.id];
    if (!l) return { texto: "", numero: 0 };
    if (col.formato === "moeda") {
      const n = l.valor ?? 0;
      return { texto: n !== 0 ? fmt2(n) : "", numero: n };
    }
    if (col.formato === "sim_nao") return { texto: /^(sim|s|true|1)$/i.test((l.valor_texto ?? "").trim()) ? "SIM" : "", numero: 0 };
    return { texto: l.valor_texto ?? "", numero: 0 };
  }

  // agrupa por unidade
  const porRotulo = new Map<string, Func[]>();
  for (const f of noEscopo) {
    const r = rotuloUnidade(f);
    if (!porRotulo.has(r)) porRotulo.set(r, []);
    porRotulo.get(r)!.push(f);
  }

  const grupos: GrupoRel[] = [];
  for (const [rotulo, funcs] of Array.from(porRotulo.entries())) {
    const linhasBrutas = funcs.map((f) => {
      const valores: Record<string, string> = {};
      const numeros: Record<string, number> = {};
      let totalP = 0;
      let totalD = 0;
      for (const col of colunasBase) {
        const c = celula(col, f.id);
        if (c.texto !== "") valores[col.id] = c.texto;
        if (col.formato === "moeda") {
          numeros[col.id] = c.numero;
          if (!col.horas) {
            if (col.grupo === "provento") totalP += c.numero;
            else totalD += c.numero;
          }
        }
      }
      return { f, valores, numeros, totalP, totalD };
    });

    const colunas = colunasBase.filter((col) => linhasBrutas.some((l) => (l.valores[col.id] ?? "") !== ""));
    const linhas: LinhaRel[] = linhasBrutas.map((l) => ({
      id: l.f.id,
      nome: l.f.nome,
      ponto: pontoPor[l.f.id] ?? "",
      valores: l.valores,
      numeros: l.numeros,
      totalP: l.totalP,
      totalD: l.totalD,
    }));
    const totaisColuna: Record<string, number> = {};
    for (const col of colunas) {
      if (col.formato === "moeda") totaisColuna[col.id] = linhas.reduce((a, l) => a + (l.numeros[col.id] ?? 0), 0);
    }
    grupos.push({
      rotulo,
      empresa: funcs[0].empresa,
      colunas,
      linhas,
      totaisColuna,
      totalP: linhas.reduce((a, l) => a + l.totalP, 0),
      totalD: linhas.reduce((a, l) => a + l.totalD, 0),
    });
  }

  const resumoColunas = colunasBase
    .filter((col) => col.formato === "moeda")
    .map((col) => ({ coluna: col, total: grupos.reduce((a, g) => a + (g.totaisColuna[col.id] ?? 0), 0) }))
    .filter((x) => x.total !== 0);

  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return {
    opcoes,
    relatorio: {
      competencia,
      rotuloMes: rotuloMesCompleto(competencia),
      periodo: periodoTexto(competencia),
      escopoRotulo,
      mesFechado: competenciaRow?.fechado ?? false,
      grupos,
      resumoUnidades: grupos.map((g) => ({ rotulo: g.rotulo, funcionarios: g.linhas.length, totalP: g.totalP, totalD: g.totalD })),
      resumoColunas,
      totalFuncionarios: noEscopo.length,
      totalP: grupos.reduce((a, g) => a + g.totalP, 0),
      totalD: grupos.reduce((a, g) => a + g.totalD, 0),
      geradoEm: agora,
    },
  };
}
