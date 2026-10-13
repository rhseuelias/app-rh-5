import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { grupoVT, transporteVT, type LinhaVT } from "@/lib/vale-transporte";

export const dynamic = "force-dynamic";

const CABECALHO =
  "CPF;Matricula (opcional);Valor Fixo em Auxilio Alimentacao;Mobilidade;Valor Fixo em Mobilidade;Saldo Livre;Multi;Valor Fixo em Multi";

/** 0 vira "0"; os demais viram "265,00" (vírgula, 2 casas). */
function valor(n: number): string {
  const v = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  return v === 0 ? "0" : v.toFixed(2).replace(".", ",");
}

/**
 * CSV de pedidos do CAJU (para importar no outro sistema), mesmo modelo do "pedidos-exemplo.csv":
 *  - Mobilidade                      = Total VT (diária × valor unit. × dias úteis)
 *  - Valor Fixo em Auxilio Alimentacao = Alimentação
 *  - Saldo Livre                     = Prêmio
 *  - CPF só com números
 * Aceita ?unidade=NOME para exportar só uma unidade (igual ao filtro da tela).
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const competencia = sp.get("competencia") ?? "";
  const unidadeFiltro = sp.get("unidade") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return NextResponse.json({ error: "mês inválido" }, { status: 400 });

  const [empRes, uniRes, colRes, lancRes] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("vt_lancamentos").select("*").eq("competencia", competencia).eq("operadora", "CAJU"),
  ]);
  if (lancRes.error) return NextResponse.json({ error: lancRes.error.message }, { status: 500 });

  const empresaPorId = new Map(((empRes.data ?? []) as Empresa[]).map((e) => [e.id, e]));
  const unidadePorId = new Map(((uniRes.data ?? []) as Unidade[]).map((u) => [u.id, u]));
  const colabPorId = new Map(((colRes.data ?? []) as Colaborador[]).map((c) => [c.id, c]));

  type Linha = { nome: string; cpf: string; alim: number; mob: number; saldoLivre: number };
  const itens: Linha[] = [];
  const semCpf: string[] = [];

  for (const l of (lancRes.data ?? []) as LinhaVT[]) {
    const c = colabPorId.get(l.colaborador_id);
    if (!c) continue;
    if (unidadeFiltro && grupoVT(c, empresaPorId, unidadePorId) !== unidadeFiltro) continue;
    const mob = transporteVT(l);
    const alim = Number(l.alimentacao) || 0;
    const saldoLivre = Number(l.premio) || 0;
    if (mob + alim + saldoLivre <= 0) continue; // nada a pedir para esta pessoa
    const cpf = (c.cpf_cnpj ?? "").replace(/\D/g, "");
    if (!cpf) {
      semCpf.push(c.nome);
      continue;
    }
    itens.push({ nome: c.nome, cpf, alim, mob, saldoLivre });
  }

  itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const linhas = [CABECALHO];
  for (const i of itens) {
    // CPF; Matricula (vazia); Auxilio Alimentacao; Mobilidade; Valor Fixo em Mobilidade; Saldo Livre; Multi; Valor Fixo em Multi
    linhas.push([i.cpf, "", valor(i.alim), valor(i.mob), "0", valor(i.saldoLivre), "0", "0"].join(";"));
  }

  const sufixo = unidadeFiltro ? `-${unidadeFiltro.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
  return new NextResponse(linhas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-caju-${competencia}${sufixo}.csv"`,
      "X-Linhas": String(itens.length),
      // nomes (sem acento) de quem ficou de fora por falta de CPF
      "X-Sem-Cpf": encodeURIComponent(semCpf.join(", ")),
    },
  });
}
