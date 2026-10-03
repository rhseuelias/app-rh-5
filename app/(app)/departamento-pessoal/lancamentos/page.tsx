import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, FolhaCompetencia, FolhaLancamento, FolhaTipo, Unidade } from "@/types/db";
import { colaboradorAtivoFolha } from "@/lib/folha-calculos";
import { rotuloCompetencia } from "@/lib/beneficios-calculos";
import { carregarPontoComHeranca, mesCurto } from "@/lib/ponto-herdado";
import LancamentosGrade, {
  type FormatoRubrica,
  type FuncionarioGrade,
  type GrupoRubrica,
  type MovimentoGrade,
  type OpcaoMes,
  type RubricaGrade,
} from "@/components/lancamentos/LancamentosGrade";

export const dynamic = "force-dynamic";
// a leitura por IA (Importar arquivo) pode levar até ~1 minuto
export const maxDuration = 60;

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Mês atual no horário de Brasília (o servidor roda em UTC).
function competenciaAtualSP(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(
    new Date()
  );
  const ano = partes.find((x) => x.type === "year")?.value ?? "";
  const mes = partes.find((x) => x.type === "month")?.value ?? "";
  return `${ano}-${mes}`;
}

// A folha de SETEMBRO cobre de 22/08 a 21/09 (mesmo período da planilha).
function periodoDaCompetencia(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  const ini = new Date(a, m - 2, 22);
  const fim = new Date(a, m - 1, 21);
  return {
    iniISO: iso(ini),
    fimISO: iso(fim),
    texto: `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)} – ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}/${String(fim.getFullYear()).slice(2)}`,
  };
}

const ORDEM_GRUPO: Record<string, number> = { provento: 0, desconto: 1 };

export default async function LancamentosFolhaPage({ searchParams }: { searchParams: { competencia?: string } }) {
  const supabase = createClient();

  const [empresasRes, unidadesRes, colaboradoresRes, competenciasRes, tiposRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("folha_competencias").select("*").order("competencia", { ascending: false }),
    supabase.from("folha_tipos").select("*").order("ordem"),
  ]);

  const erroBase = empresasRes.error ?? colaboradoresRes.error ?? competenciasRes.error ?? tiposRes.error;
  if (erroBase) {
    return (
      <div className="card">
        <p className="text-sm text-red-700">Não foi possível carregar os dados da folha: {erroBase.message}</p>
      </div>
    );
  }

  const empresas = (empresasRes.data ?? []) as Empresa[];
  const unidadePorId = new Map(((unidadesRes.data ?? []) as Unidade[]).map((u) => [u.id, u.nome]));
  const todos = (colaboradoresRes.data ?? []) as Colaborador[];
  const competencias = (competenciasRes.data ?? []) as FolhaCompetencia[];
  const tiposTodos = ((tiposRes.data ?? []) as FolhaTipo[]).filter((t) => t.categoria === "provento" || t.categoria === "desconto");
  const tipos = tiposTodos.filter((t) => t.ativo);
  const tiposDesligados = tiposTodos.filter((t) => !t.ativo);

  const competencia = /^\d{4}-\d{2}$/.test(searchParams.competencia ?? "") ? (searchParams.competencia as string) : competenciaAtualSP();
  const competenciaRow = competencias.find((c) => c.competencia === competencia);
  const periodo = periodoDaCompetencia(competencia);

  const opcoesMes: OpcaoMes[] = Array.from(new Set([competenciaAtualSP(), competencia, ...competencias.map((c) => c.competencia)]))
    .sort((a, b) => (a < b ? 1 : -1))
    .map((valor) => ({ valor, rotulo: rotuloCompetencia(valor) }));

  // ---- funcionários: quem está ativo na folha (PJ fica de fora), por empresa ----
  const empresaPorId = new Map(empresas.map((e) => [e.id, e.nome]));
  const ordemEmpresa = new Map(empresas.map((e, i) => [e.nome, i]));
  const nomeEmpresa = (c: Colaborador) => (c.empresa_id ? empresaPorId.get(c.empresa_id) ?? "SEM EMPRESA" : "SEM EMPRESA");

  const naFolha = todos.filter((c) => colaboradorAtivoFolha(c) && c.tipo !== "PJ");
  const rotuloRegime = (c: Colaborador) => (c.tipo === "Estagio" ? "Estágio" : String(c.tipo));

  const funcionarios: FuncionarioGrade[] = naFolha
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      empresa: nomeEmpresa(c),
      unidade: c.unidade_id ? unidadePorId.get(c.unidade_id) ?? null : null,
      regime: rotuloRegime(c),
      cpf: c.cpf_cnpj ?? null,
      matricula: c.matricula ?? null,
      novo: !!c.data_admissao && c.data_admissao.slice(0, 10) >= periodo.iniISO && c.data_admissao.slice(0, 10) <= periodo.fimISO,
    }))
    .sort(
      (a, b) =>
        (ordemEmpresa.get(a.empresa) ?? 999) - (ordemEmpresa.get(b.empresa) ?? 999) || a.nome.localeCompare(b.nome, "pt-BR")
    );

  // ---- últimas movimentações do período (admitidos e desligados) ----
  const eventos: { data: string; sinal: "+" | "-"; nome: string }[] = [];
  for (const c of todos) {
    if (c.tipo === "PJ") continue;
    const adm = c.data_admissao?.slice(0, 10);
    const des = c.data_desligamento?.slice(0, 10);
    if (adm && adm >= periodo.iniISO && adm <= periodo.fimISO) eventos.push({ data: adm, sinal: "+", nome: c.nome });
    if (des && des >= periodo.iniISO && des <= periodo.fimISO) eventos.push({ data: des, sinal: "-", nome: c.nome });
  }
  const movimentos: MovimentoGrade[] = eventos
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 4)
    .map((e) => ({ sinal: e.sinal, nome: e.nome }));

  // ---- colunas (rubricas): só proventos e descontos ----
  const paraRubrica = (t: FolhaTipo): RubricaGrade => ({
    id: t.id,
    nome: t.nome,
    codigo: t.codigo ?? null,
    grupo: (t.categoria === "provento" ? "provento" : "desconto") as GrupoRubrica,
    formato: (["moeda", "texto", "sim_nao"].includes(t.formato) ? t.formato : "texto") as FormatoRubrica,
    automatico: t.calculo_automatico === true,
  });
  const rubricas: RubricaGrade[] = tipos
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (ORDEM_GRUPO[a.t.categoria] ?? 9) - (ORDEM_GRUPO[b.t.categoria] ?? 9) || a.i - b.i)
    .map(({ t }) => paraRubrica(t));
  const desabilitadas: RubricaGrade[] = tiposDesligados.map(paraRubrica);
  const formatoPorId = new Map(rubricas.map((r) => [r.id, r.formato]));

  // ---- valores do mês e observações de ponto ----
  const valoresIniciais: Record<string, Record<string, string>> = {};
  const pontoIniciais: Record<string, string> = {};
  const pontoHerdadoDe: Record<string, string> = {};

  // Ponto / Observações: vale o que foi escrito neste mês ou, se não houver, o do mês anterior mais recente
  if (naFolha.length > 0) {
    const pontos = await carregarPontoComHeranca(
      supabase,
      competencia,
      naFolha.map((c) => c.id)
    );
    for (const [colabId, p] of Object.entries(pontos)) {
      pontoIniciais[colabId] = p.texto;
      if (p.deMes) pontoHerdadoDe[colabId] = mesCurto(p.deMes);
    }
  }

  if (competenciaRow && naFolha.length > 0) {
    const ids = naFolha.map((c) => c.id);
    const lancRes = await supabase.from("folha_lancamentos").select("*").eq("competencia_id", competenciaRow.id).in("colaborador_id", ids);

    for (const l of (lancRes.data ?? []) as FolhaLancamento[]) {
      const formato = formatoPorId.get(l.tipo_id);
      if (!formato) continue;
      let texto = "";
      if (formato === "moeda") texto = l.valor && l.valor !== 0 ? fmt(l.valor) : "";
      else if (formato === "sim_nao") texto = /^(sim|s|true|1)$/i.test((l.valor_texto ?? "").trim()) ? "SIM" : "";
      else texto = l.valor_texto ?? "";
      if (texto !== "") (valoresIniciais[l.colaborador_id] ??= {})[l.tipo_id] = texto;
    }
  }

  return (
    <LancamentosGrade
      key={competencia}
      competencia={competencia}
      periodo={periodo.texto}
      mesFechado={competenciaRow?.fechado ?? false}
      opcoesMes={opcoesMes}
      rubricas={rubricas}
      desabilitadas={desabilitadas}
      funcionarios={funcionarios}
      valoresIniciais={valoresIniciais}
      pontoIniciais={pontoIniciais}
      pontoHerdadoDe={pontoHerdadoDe}
      movimentos={movimentos}
    />
  );
}
