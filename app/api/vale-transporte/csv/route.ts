import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { cargaVT, grupoVT, type LinhaVT } from "@/lib/vale-transporte";

export const dynamic = "force-dynamic";

/** Unidades da BSE, menos Alphaville. */
function ehBseSemAlphaville(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return t.includes("bse") && !t.includes("alphaville");
}

/** CSV de recarga do BHBUS: MATRICULA;VALOR PARA CARREGAMENTO (valor em centavos, sem vírgula). */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const competencia = new URL(req.url).searchParams.get("competencia") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return NextResponse.json({ error: "mês inválido" }, { status: 400 });

  const [empRes, uniRes, colRes, lancRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("vt_lancamentos").select("*").eq("competencia", competencia).eq("operadora", "BHBUS"),
  ]);
  if (lancRes.error) return NextResponse.json({ error: lancRes.error.message }, { status: 500 });

  const empresaPorId = new Map(((empRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((uniRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colabPorId = new Map(((colRes.data ?? []) as Colaborador[]).map((c) => [c.id, c]));

  // soma por matrícula (centavos, em inteiro)
  const porMatricula = new Map<string, number>();
  const semMatricula: string[] = [];
  for (const l of (lancRes.data ?? []) as LinhaVT[]) {
    const c = colabPorId.get(l.colaborador_id);
    if (!c) continue;
    const emp = c.empresa_id ? empresaPorId.get(c.empresa_id)?.nome ?? "" : "";
    if (!ehBseSemAlphaville(`${grupoVT(c, empresaPorId, unidadePorId)} ${emp}`)) continue;
    const centavos = Math.round(cargaVT(l) * 100);
    if (centavos <= 0) continue;
    const mat = (c.matricula ?? "").trim();
    if (!mat) {
      semMatricula.push(c.nome);
      continue;
    }
    porMatricula.set(mat, (porMatricula.get(mat) ?? 0) + centavos);
  }

  const linhas = ["MATRICULA;VALOR PARA CARREGAMENTO"];
  for (const [mat, centavos] of Array.from(porMatricula.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }))) {
    linhas.push(`${mat};${centavos}`);
  }
  const corpo = linhas.join("\r\n") + "\r\n";

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recarga-bhbus-${competencia}.csv"`,
      // nomes (sem acento) de quem ficou de fora por falta de matrícula
      "X-Sem-Matricula": encodeURIComponent(semMatricula.join(", ")),
    },
  });
}
