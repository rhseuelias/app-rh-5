import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import { buscarPrevisaoVencimento } from "@/lib/previsao-ferias";
import { fDMA } from "@/lib/ferias-regras";
import { formatarCNPJ } from "@/lib/formatadores";

export const dynamic = "force-dynamic";

const LARG = 841.89; // A4 paisagem
const ALT = 595.28;
const M = 36;
const UTIL = LARG - M * 2;
const COR_TIT = rgb(0.06, 0.09, 0.19);
const COR_TXT = rgb(0.15, 0.18, 0.25);
const COR_LAB = rgb(0.45, 0.48, 0.55);
const COR_LIN = rgb(0.88, 0.89, 0.92);

// larguras (soma = 1): Empregado, Código, Admissão, Pér. Aquisit., Venc. Férias, Dias, Prev. Férias, Data Limite
const COLS = [
  { t: "Empregado", w: 0.34, a: "l" },
  { t: "Código", w: 0.07, a: "r" },
  { t: "Admissão", w: 0.1, a: "c" },
  { t: "Pér. Aquisit.", w: 0.1, a: "c" },
  { t: "Venc. Férias", w: 0.1, a: "c" },
  { t: "Dias", w: 0.06, a: "r" },
  { t: "Prev. Férias", w: 0.11, a: "c" },
  { t: "Data Limite", w: 0.12, a: "c" },
] as const;

function cortar(txt: string, fonte: PDFFont, tam: number, max: number): string {
  let s = txt;
  while (s.length > 1 && fonte.widthOfTextAtSize(s, tam) > max) s = s.slice(0, -1);
  return s === txt ? s : s.trimEnd() + "…";
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const empresa = new URL(req.url).searchParams.get("empresa") ?? undefined;
  const dados = await buscarPrevisaoVencimento(empresa || undefined);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let page = pdf.addPage([LARG, ALT]);
  paginas.push(page);
  let y = ALT - M;

  const titulo = (p: PDFPage) => {
    p.drawText("Previsão de Vencimento de Férias", { x: M, y: ALT - M, size: 15, font: bold, color: COR_TIT });
    p.drawText(`${empresa ? "Empresa selecionada" : "Todas as empresas"} — posição em ${fDMA(dados.hoje)} — ${dados.total} registro(s)`, {
      x: M, y: ALT - M - 14, size: 8, font, color: COR_LAB,
    });
  };
  titulo(page);
  y = ALT - M - 34;

  const novaPagina = () => {
    page = pdf.addPage([LARG, ALT]);
    paginas.push(page);
    y = ALT - M;
  };

  const cabecalhoColunas = () => {
    page.drawRectangle({ x: M, y: y - 16, width: UTIL, height: 16, color: rgb(0.93, 0.94, 0.97) });
    let x = M;
    for (const c of COLS) {
      const w = c.w * UTIL;
      const tw = bold.widthOfTextAtSize(c.t, 8);
      const tx = c.a === "l" ? x + 4 : c.a === "r" ? x + w - 4 - tw : x + (w - tw) / 2;
      page.drawText(c.t, { x: tx, y: y - 11, size: 8, font: bold, color: COR_LAB });
      x += w;
    }
    y -= 16;
  };

  if (dados.grupos.length === 0) {
    page.drawText("Nenhum colaborador encontrado.", { x: M, y: y - 10, size: 9, font, color: COR_LAB });
  }

  for (const g of dados.grupos) {
    if (y < M + 16 * 4) novaPagina();
    const rotulo = `Empresa: ${g.empresaNome}${g.cnpj ? ` - CNPJ: ${formatarCNPJ(g.cnpj)}` : ""}`;
    page.drawText(rotulo, { x: M, y: y - 10, size: 9.5, font: bold, color: COR_TIT });
    y -= 20;
    cabecalhoColunas();

    for (const l of g.linhas) {
      if (y - 16 < M + 14) {
        novaPagina();
        cabecalhoColunas();
      }
      const vals = [l.nome, l.codigo, fDMA(l.admissao), fDMA(l.periodoInicio), fDMA(l.vencimento), String(l.dias), fDMA(l.previsao), fDMA(l.limite)];
      let x = M;
      COLS.forEach((c, i) => {
        const w = c.w * UTIL;
        const s = cortar(vals[i], font, 8, w - 8);
        const tw = font.widthOfTextAtSize(s, 8);
        const tx = c.a === "l" ? x + 4 : c.a === "r" ? x + w - 4 - tw : x + (w - tw) / 2;
        page.drawText(s, { x: tx, y: y - 11, size: 8, font, color: COR_TXT });
        x += w;
      });
      y -= 16;
      page.drawLine({ start: { x: M, y }, end: { x: M + UTIL, y }, thickness: 0.4, color: COR_LIN });
    }
    page.drawText(`${g.linhas.length} registro(s)`, { x: M, y: y - 12, size: 8, font, color: COR_LAB });
    y -= 28;
  }

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  paginas.forEach((p, i) => {
    p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: M, y: M - 14, size: 8, font, color: COR_LAB });
    const t = `Gerado em ${agora}`;
    p.drawText(t, { x: LARG - M - font.widthOfTextAtSize(t, 8), y: M - 14, size: 8, font, color: COR_LAB });
  });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="previsao-vencimento-ferias.pdf"`,
    },
  });
}
