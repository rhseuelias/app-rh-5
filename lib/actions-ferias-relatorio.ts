"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { parseCSV, semAcentos, dataISOOuNula } from "@/lib/csv";
import { hojeEmBrasilia, somarDias, fDMA } from "@/lib/ferias-regras";

/**
 * Atualiza os períodos aquisitivos a partir do relatório "Previsão de
 * Vencimento de Férias" da contabilidade (já convertido em CSV).
 *
 * Colunas lidas (o nome do cabeçalho pode vir com ou sem acento):
 *   Código | Empregado | Empresa (opcional) | Início do período | Fim do período | Dias a gozar | Limite
 *
 * Regras por colaborador (a contabilidade manda):
 *  1. O período do relatório é criado, ou corrigido se já existir um com o mesmo início.
 *  2. Períodos anteriores a ele (que terminam antes do início dele) viram "gozado".
 *  3. Períodos seguintes que não batem com a sequência e não têm férias ligadas a eles
 *     são apagados (o sistema gera o próximo sozinho). Os que têm férias ficam e viram aviso.
 *  4. Se o relatório diz quantos dias faltam gozar e o sistema calcula outro número, vira aviso.
 */

export interface LinhaRelatorioFerias {
  nome: string;
  situacao: "ok" | "atencao" | "erro";
  acoes: string[];
  avisos: string[];
}

export interface ResultadoRelatorioFerias {
  ok: boolean;
  aplicado: boolean;
  erro?: string;
  linhas: LinhaRelatorioFerias[];
}

const CAMPOS: Record<string, string[]> = {
  codigo: ["codigo", "cod", "matricula"],
  nome: ["empregado", "nome", "colaborador", "funcionario"],
  empresa: ["empresa"],
  inicio: ["inicio do periodo", "per. aquisit.", "per aquisit", "periodo aquisitivo", "inicio", "inicio do periodo aquisitivo"],
  fim: ["fim do periodo", "venc. ferias", "venc ferias", "vencimento", "fim", "fim do periodo aquisitivo"],
  dias: ["dias a gozar", "dias", "saldo"],
  limite: ["limite", "data limite", "limite de concessao"],
};

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

interface ColabLinha {
  id: string;
  nome: string;
  matricula?: string | null;
  empresa_id: string | null;
  status: string;
}
interface PeriodoLinha {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  limite_concessao: string;
  status: string;
}
interface FeriasLinha {
  periodo_aquisitivo_id: string | null;
  dias: number;
  vendeu_abono: boolean;
}

export async function importarPeriodosRelatorio(formData: FormData): Promise<ResultadoRelatorioFerias> {
  const aplicar = formData.get("aplicar") === "1";
  const arquivo = formData.get("arquivo") as File | null;
  const falha = (erro: string): ResultadoRelatorioFerias => ({ ok: false, aplicado: false, erro, linhas: [] });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Você precisa entrar no sistema de novo.");
  if (!arquivo || arquivo.size === 0) return falha("Escolha o arquivo CSV.");

  const tabela = parseCSV(await arquivo.text());
  if (tabela.length < 2) return falha("O arquivo está vazio ou sem linhas de dados.");

  const cab = tabela[0].map(semAcentos);
  const idx: Record<string, number> = {};
  for (const [campo, variantes] of Object.entries(CAMPOS)) {
    const i = cab.findIndex((h) => variantes.includes(h));
    if (i >= 0) idx[campo] = i;
  }
  for (const obrig of ["nome", "inicio", "fim", "limite"]) {
    if (idx[obrig] === undefined) {
      return falha(`Não achei a coluna "${obrig === "nome" ? "Empregado" : obrig === "inicio" ? "Início do período" : obrig === "fim" ? "Fim do período" : "Limite"}" no cabeçalho do arquivo.`);
    }
  }
  const pega = (l: string[], c: string) => (idx[c] !== undefined ? (l[idx[c]] ?? "").trim() : "");

  const [{ data: colabData }, { data: empData }, { data: perData }, { data: feriasData }] = await Promise.all([
    supabase.from("colaboradores").select("id, nome, matricula, empresa_id, status"),
    supabase.from("empresas").select("id, nome"),
    supabase.from("periodos_aquisitivos").select("*"),
    supabase.from("ferias").select("periodo_aquisitivo_id, dias, vendeu_abono").neq("status", "cancelado").eq("simulacao", false),
  ]);
  const colaboradores = ((colabData ?? []) as ColabLinha[]).filter((c) => c.status !== "desligado");
  const empresaPorId = new Map(((empData ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]));
  const periodos = (perData ?? []) as PeriodoLinha[];
  const ferias = (feriasData ?? []) as FeriasLinha[];

  const feriasPorPeriodo = new Map<string, FeriasLinha[]>();
  for (const f of ferias) {
    if (!f.periodo_aquisitivo_id) continue;
    if (!feriasPorPeriodo.has(f.periodo_aquisitivo_id)) feriasPorPeriodo.set(f.periodo_aquisitivo_id, []);
    feriasPorPeriodo.get(f.periodo_aquisitivo_id)!.push(f);
  }

  const hoje = hojeEmBrasilia();
  const linhas: LinhaRelatorioFerias[] = [];
  let algumaMudanca = false;

  for (const l of tabela.slice(1)) {
    const nomeRel = pega(l, "nome");
    if (!nomeRel) continue;
    const linha: LinhaRelatorioFerias = { nome: nomeRel, situacao: "ok", acoes: [], avisos: [] };
    linhas.push(linha);

    const inicio = dataISOOuNula(pega(l, "inicio"));
    const fim = dataISOOuNula(pega(l, "fim"));
    const limite = dataISOOuNula(pega(l, "limite"));
    if (!inicio || !fim || !limite) {
      linha.situacao = "erro";
      linha.avisos.push("Alguma das datas (início, fim ou limite) está vazia ou fora do formato dd/mm/aaaa.");
      continue;
    }
    if (fim <= inicio || limite <= fim) {
      linha.situacao = "erro";
      linha.avisos.push("As datas estão fora de ordem (início < fim < limite).");
      continue;
    }

    // ---- quem é o colaborador ----
    let pool = colaboradores;
    const empresaCsv = semAcentos(pega(l, "empresa"));
    if (empresaCsv) {
      const filtrado = pool.filter((c) => {
        const en = semAcentos(empresaPorId.get(c.empresa_id ?? "") ?? "");
        return en && (en.includes(empresaCsv) || empresaCsv.includes(en));
      });
      if (filtrado.length > 0) pool = filtrado;
    }
    const codigo = soDigitos(pega(l, "codigo"));
    const nomeNorm = semAcentos(nomeRel);
    let achados = codigo ? pool.filter((c) => soDigitos(c.matricula) === codigo) : [];
    if (achados.length !== 1) achados = pool.filter((c) => semAcentos(c.nome) === nomeNorm);
    if (achados.length !== 1 && nomeNorm.length >= 12) {
      // a contabilidade corta nomes compridos
      achados = pool.filter((c) => semAcentos(c.nome).startsWith(nomeNorm));
    }
    if (achados.length === 0) {
      linha.situacao = "erro";
      linha.avisos.push("Não achei esse colaborador no sistema (confira o nome ou a matrícula).");
      continue;
    }
    if (achados.length > 1) {
      linha.situacao = "erro";
      linha.avisos.push("Achei mais de um colaborador com esse nome. Corrija o nome no arquivo.");
      continue;
    }
    const colab = achados[0];
    const dele = periodos.filter((p) => p.colaborador_id === colab.id);

    // ---- 1) o período do relatório ----
    const novoStatus = fim < hoje ? "vencido" : "aberto";
    const mesmo = dele.find((p) => String(p.inicio).slice(0, 10) === inicio);
    let periodoId = mesmo?.id ?? null;
    if (mesmo) {
      const igual =
        String(mesmo.fim).slice(0, 10) === fim && String(mesmo.limite_concessao).slice(0, 10) === limite;
      const precisaReabrir = mesmo.status === "gozado" && Number(pega(l, "dias")) > 0;
      if (!igual || precisaReabrir) {
        linha.acoes.push(
          `Corrige o período ${fDMA(inicio)} a ${fDMA(fim)} (limite ${fDMA(limite)})${precisaReabrir ? " e reabre, pois ainda há dias a gozar" : ""}.`
        );
        algumaMudanca = true;
        if (aplicar) {
          await supabase
            .from("periodos_aquisitivos")
            .update({ fim, limite_concessao: limite, ...(precisaReabrir ? { status: novoStatus } : {}) })
            .eq("id", mesmo.id);
        }
      } else {
        linha.acoes.push("Período já está igual ao do relatório.");
      }
    } else {
      linha.acoes.push(`Cria o período ${fDMA(inicio)} a ${fDMA(fim)} (limite ${fDMA(limite)}).`);
      algumaMudanca = true;
      if (aplicar) {
        const { data: criado } = await supabase
          .from("periodos_aquisitivos")
          .insert({ colaborador_id: colab.id, inicio, fim, limite_concessao: limite, status: novoStatus })
          .select("id")
          .single();
        periodoId = (criado as { id: string } | null)?.id ?? null;
      }
    }

    // ---- 2) e 3) os outros períodos dele ----
    const proximoInicio = somarDias(fim, 1);
    for (const p of dele) {
      if (p.id === mesmo?.id) continue;
      const pIni = String(p.inicio).slice(0, 10);
      const pFim = String(p.fim).slice(0, 10);
      const rotulo = `${fDMA(pIni)} a ${fDMA(pFim)}`;
      if (pFim < inicio) {
        if (p.status !== "gozado") {
          linha.acoes.push(`Período anterior ${rotulo}: marca como gozado.`);
          algumaMudanca = true;
          if (aplicar) await supabase.from("periodos_aquisitivos").update({ status: "gozado" }).eq("id", p.id);
        }
        continue;
      }
      if (pIni === proximoInicio) continue; // sequência certa, fica
      const comFerias = (feriasPorPeriodo.get(p.id) ?? []).length > 0;
      if (comFerias) {
        linha.situacao = "atencao";
        linha.avisos.push(
          `O período ${rotulo} não bate com o calendário da contabilidade e tem férias ligadas a ele. Revise na ficha do colaborador.`
        );
      } else if (p.status !== "gozado") {
        linha.acoes.push(`Apaga o período ${rotulo} (não bate com a contabilidade e não tem férias). O sistema gera o próximo sozinho.`);
        algumaMudanca = true;
        if (aplicar) await supabase.from("periodos_aquisitivos").delete().eq("id", p.id);
      }
    }

    // ---- 4) dias a gozar ----
    const diasRel = pega(l, "dias");
    if (diasRel !== "" && fim < hoje) {
      const previstos = Number(diasRel.replace(",", "."));
      if (!Number.isNaN(previstos)) {
        const doPeriodo = periodoId ? feriasPorPeriodo.get(periodoId) ?? [] : [];
        const usados = doPeriodo.reduce((s, f) => s + (f.dias || 0), 0);
        const abono = doPeriodo.some((f) => f.vendeu_abono) ? 10 : 0;
        const saldoSistema = Math.max(0, 30 - usados - abono);
        if (saldoSistema !== previstos) {
          linha.situacao = linha.situacao === "erro" ? "erro" : "atencao";
          linha.avisos.push(
            `A contabilidade mostra ${previstos} dias a gozar neste período, mas o sistema calcula ${saldoSistema}. ` +
              `Registre as férias já tiradas (ou o abono) para o saldo bater.`
          );
        }
      }
    }
  }

  if (aplicar && algumaMudanca) {
    revalidatePath("/ferias");
    revalidatePath("/colaboradores");
    revalidatePath("/dashboard");
    revalidatePath("/calendario");
  }
  return { ok: true, aplicado: aplicar, linhas };
}
