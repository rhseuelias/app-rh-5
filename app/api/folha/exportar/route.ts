import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, FolhaCompetencia, FolhaLancamento, FolhaTipo, Unidade } from "@/types/db";
import { colaboradorAtivoFolha, rotuloGrupoColaborador } from "@/lib/folha-calculos";
import { VERBAS_MODELO, gerarXlsxMovimentoVariavel, type LinhaMovimento } from "@/lib/xlsx-movimento-variavel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function erro(mensagem: string, status: number) {
  return new NextResponse(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// "OURO MINAS" -> "Ouro Minas"; siglas curtas (BDU, BSE) continuam em maiúsculas.
function formatarNomeUnidade(rotulo: string): string {
  const limpo = rotulo.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  const minusculas = ["de", "da", "do", "das", "dos", "e"];
  return limpo
    .split(" ")
    .map((p) => {
      const baixa = p.toLowerCase();
      if (minusculas.includes(baixa)) return baixa;
      if (p.length <= 3) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + baixa.slice(1);
    })
    .join(" ");
}

function normalizarCodigo(c: string | null | undefined): string {
  const s = (c ?? "").trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

// O código de uma coluna da folha: o campo "código" ou, se estiver vazio, o
// número que vem no começo do nome ("17 - hora extra 50% - Referência").
function codigoDoTipo(t: FolhaTipo): string {
  const direto = normalizarCodigo(t.codigo);
  if (direto) return direto;
  const m = /^\s*(\d+)\s*-/.exec(t.nome);
  return m ? normalizarCodigo(m[1]) : "";
}

function listar(nomes: string[], limite = 6): string {
  if (nomes.length <= limite) return nomes.join(", ");
  return `${nomes.slice(0, limite).join(", ")} e mais ${nomes.length - limite}`;
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro("Sessão expirada. Entre no sistema de novo.", 401);

  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia") ?? "";
  const unidade = searchParams.get("unidade") ?? "";
  if (!/^\d{4}-\d{2}$/.test(competencia) || !unidade) return erro("Pedido inválido.", 400);

  const [empresasRes, unidadesRes, colaboradoresRes, competenciaRes, tiposRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("folha_competencias").select("*").eq("competencia", competencia).maybeSingle(),
    supabase.from("folha_tipos").select("*").neq("categoria", "espelhamento").order("ordem"),
  ]);
  const falha = empresasRes.error ?? unidadesRes.error ?? colaboradoresRes.error ?? competenciaRes.error ?? tiposRes.error;
  if (falha) return erro(`Não foi possível ler os dados: ${falha.message}`, 500);

  const competenciaRow = competenciaRes.data as FolhaCompetencia | null;
  if (!competenciaRow) return erro("Esse mês ainda não tem lançamentos.", 404);

  const empresasPorId: Record<string, Empresa> = {};
  for (const e of (empresasRes.data ?? []) as Empresa[]) empresasPorId[e.id] = e;
  const unidadesPorId: Record<string, Unidade> = {};
  for (const u of (unidadesRes.data ?? []) as Unidade[]) unidadesPorId[u.id] = u;

  // Mesma regra da tela da folha: só quem entra na folha (PJ fica de fora),
  // agrupado por unidade.
  type ColaboradorExport = Colaborador & { matricula?: string | null };
  const colaboradores = ((colaboradoresRes.data ?? []) as ColaboradorExport[])
    .filter((c) => colaboradorAtivoFolha(c) && c.tipo !== "PJ")
    .filter((c) => rotuloGrupoColaborador(c, empresasPorId, unidadesPorId) === unidade)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (colaboradores.length === 0) return erro("Nenhum colaborador encontrado nessa unidade.", 404);

  const tipos = ((tiposRes.data ?? []) as FolhaTipo[]).filter((t) => t.ativo);

  const { data: lancData, error: lancErro } = await supabase
    .from("folha_lancamentos")
    .select("*")
    .eq("competencia_id", competenciaRow.id)
    .in(
      "colaborador_id",
      colaboradores.map((c) => c.id)
    );
  if (lancErro) return erro(`Não foi possível ler os lançamentos: ${lancErro.message}`, 500);

  const lancPorColaborador: Record<string, Record<string, FolhaLancamento>> = {};
  for (const l of (lancData ?? []) as FolhaLancamento[]) {
    (lancPorColaborador[l.colaborador_id] ??= {})[l.tipo_id] = l;
  }

  function valorDaCelula(tipo: FolhaTipo, colaboradorId: string): number | null {
    const l = lancPorColaborador[colaboradorId]?.[tipo.id];
    if (!l) return null;
    if (tipo.formato === "texto") {
      const n = Number(String(l.valor_texto ?? "").trim().replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) && n !== 0 ? n : null;
    }
    if (tipo.formato === "sim_nao") return null;
    return l.valor && l.valor !== 0 ? l.valor : null;
  }

  // liga cada verba do modelo a uma coluna da folha, pelo código
  const tipoPorVerba = VERBAS_MODELO.map((v) => tipos.find((t) => codigoDoTipo(t) === normalizarCodigo(v.codigo)) ?? null);

  const linhas: LinhaMovimento[] = colaboradores.map((c) => ({
    cpf: (c.cpf_cnpj ?? "").trim(),
    nome: c.nome.trim(),
    matricula: (c.matricula ?? "").trim(),
    valores: tipoPorVerba.map((t) => (t ? valorDaCelula(t, c.id) : null)),
  }));

  // avisos mostrados na tela depois do download
  const avisos: string[] = [];
  const semMatricula = colaboradores.filter((c) => !(c.matricula ?? "").trim()).map((c) => c.nome);
  if (semMatricula.length > 0) avisos.push(`Sem matrícula: ${listar(semMatricula)}`);
  const semCpf = colaboradores.filter((c) => !(c.cpf_cnpj ?? "").trim()).map((c) => c.nome);
  if (semCpf.length > 0) avisos.push(`Sem CPF: ${listar(semCpf)}`);

  const usadas = new Set(tipoPorVerba.filter((t): t is FolhaTipo => t !== null).map((t) => t.id));
  const foraDoModelo = tipos
    .filter((t) => !usadas.has(t.id))
    .filter((t) => colaboradores.some((c) => valorDaCelula(t, c.id) !== null))
    .map((t) => t.nome);
  if (foraDoModelo.length > 0) {
    avisos.push(`Colunas com valores que não existem no modelo da contabilidade (ficaram de fora): ${listar(foraDoModelo)}`);
  }

  const arquivo = gerarXlsxMovimentoVariavel(linhas);
  const nome = `MovimentoVariavel ${formatarNomeUnidade(unidade)}.xlsx`;
  const nomeAscii = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");

  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "X-Nome-Arquivo": encodeURIComponent(nome),
      "X-Avisos": encodeURIComponent(JSON.stringify(avisos)),
      "Cache-Control": "no-store",
    },
  });
}
