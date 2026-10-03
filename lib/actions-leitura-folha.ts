"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

/**
 * Ações da "Importar arquivo" dos Lançamentos da folha:
 *  - lerPlanilhaExcel: abre um .xlsx e devolve as linhas em texto (a leitura de CSV e PDF é feita no navegador);
 *  - importarLancamentosFolha: grava de uma vez os valores que o usuário conferiu na prévia.
 */

type CelulaBruta = ExcelJS.CellValue;

/** segundos → "04:15" (ou "35:58:00" se tiver segundos) */
function horasDeSegundos(total: number): string {
  const t = Math.max(0, Math.round(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sg = t % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  return sg ? `${dois(h)}:${dois(m)}:${dois(sg)}` : `${dois(h)}:${dois(m)}`;
}

// formato de célula que mostra hora/duração: "hh:mm", "[h]:mm:ss", "h:mm AM/PM"…
const FORMATO_HORA = /(^|[^a-z])(\[h+\]|h{1,2}):m{1,2}/i;

function textoDaCelula(v: CelulaBruta, formato?: string): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") {
    // número formatado como hora/duração no Excel: 0,177 vira "04:15"
    if (formato && FORMATO_HORA.test(formato) && v >= 0) return horasDeSegundos(v * 86400);
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000).replace(".", ",");
  }
  if (typeof v === "boolean") return v ? "SIM" : "";
  if (v instanceof Date) {
    // hora ou duração (o Excel guarda como data em 30/12/1899 + fração do dia)
    if (v.getUTCFullYear() <= 1900) return horasDeSegundos((v.getTime() - Date.UTC(1899, 11, 30)) / 1000);
    const d = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return textoDaCelula(o.result as CelulaBruta, formato); // fórmula → resultado
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((p) => p.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim(); // link
    if ("error" in o) return "";
  }
  return String(v).trim();
}

export type ResultadoLeituraExcel =
  | { ok: true; abas: { nome: string; linhas: string[][] }[] }
  | { ok: false; erro: string };

export async function lerPlanilhaExcel(formData: FormData): Promise<ResultadoLeituraExcel> {
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) return { ok: false, erro: "Escolha um arquivo." };
  if (/\.xls$/i.test(arquivo.name)) {
    return { ok: false, erro: 'Esse é um Excel antigo (.xls). Abra no Excel e use "Salvar como" → .xlsx (ou CSV) e envie de novo.' };
  }
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const abas = wb.worksheets
      .map((ws) => {
        const linhas: string[][] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cel: string[] = [];
          row.eachCell({ includeEmpty: true }, (c, col) => {
            cel[col - 1] = textoDaCelula(c.value, c.numFmt);
          });
          for (let i = 0; i < cel.length; i++) if (cel[i] === undefined) cel[i] = "";
          if (cel.some((x) => x !== "")) linhas.push(cel);
        });
        return { nome: ws.name, linhas };
      })
      .filter((a) => a.linhas.length > 0);
    if (abas.length === 0) return { ok: false, erro: "A planilha está vazia." };
    return { ok: true, abas };
  } catch {
    return { ok: false, erro: "Não consegui abrir essa planilha. Tente salvá-la como CSV e enviar de novo." };
  }
}

export interface ItemImportacao {
  colaboradorId: string;
  tipoId: string;
  valor: number;
  valorTexto: string | null;
}

export type ResultadoImportacao = { ok: true; gravados: number } | { ok: false; erro: string };

export async function importarLancamentosFolha(competencia: string, itens: ItemImportacao[]): Promise<ResultadoImportacao> {
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { ok: false, erro: "Mês inválido." };
  if (itens.length === 0) return { ok: false, erro: "Não há nada para lançar." };

  const supabase = createClient();

  // mês: cria se não existir; recusa se estiver fechado
  const { data: comp, error: erroComp } = await supabase
    .from("folha_competencias")
    .select("id, fechado")
    .eq("competencia", competencia)
    .maybeSingle();
  if (erroComp) return { ok: false, erro: erroComp.message };
  let competenciaId = comp?.id as string | undefined;
  if (comp?.fechado) return { ok: false, erro: "Esse mês está fechado — reabra o mês pra poder lançar." };
  if (!competenciaId) {
    const { data: nova, error } = await supabase.from("folha_competencias").insert({ competencia }).select("id").single();
    if (error || !nova) return { ok: false, erro: error?.message ?? "Não foi possível criar o mês." };
    competenciaId = nova.id as string;
  }

  // colunas calculadas pelo sistema não aceitam valor digitado/importado
  const tipoIds = Array.from(new Set(itens.map((i) => i.tipoId)));
  const { data: tipos } = await supabase.from("folha_tipos").select("id, calculo_automatico").in("id", tipoIds);
  const bloqueados = new Set((tipos ?? []).filter((t) => t.calculo_automatico).map((t) => t.id as string));

  // se o mesmo colaborador+coluna vier duas vezes, vale a última
  const porChave = new Map<string, ItemImportacao>();
  for (const i of itens) {
    if (bloqueados.has(i.tipoId)) continue;
    if (!Number.isFinite(i.valor)) continue;
    porChave.set(`${i.colaboradorId}:${i.tipoId}`, i);
  }
  const agora = new Date().toISOString();
  const linhas = Array.from(porChave.values()).map((i) => ({
    competencia_id: competenciaId,
    colaborador_id: i.colaboradorId,
    tipo_id: i.tipoId,
    valor: i.valor,
    valor_texto: i.valorTexto,
    updated_at: agora,
  }));
  if (linhas.length === 0) return { ok: false, erro: "Nenhum valor válido para lançar." };

  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await supabase
      .from("folha_lancamentos")
      .upsert(linhas.slice(i, i + 200), { onConflict: "competencia_id,colaborador_id,tipo_id" });
    if (error) {
      const msg = /row-level security|permission denied|policy/i.test(error.message)
        ? "O banco não permitiu salvar (falta permissão na tabela)."
        : error.message;
      return { ok: false, erro: msg };
    }
  }

  revalidatePath("/departamento-pessoal/lancamentos");
  return { ok: true, gravados: linhas.length };
}
