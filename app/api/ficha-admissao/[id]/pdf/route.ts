import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase-server";
import { buscarFichaAdmissao, type CampoFicha } from "@/lib/ficha-admissao";

const MARGEM = 36;
const LARGURA = 595.28; // A4 retrato
const ALTURA = 841.89;
const LARGURA_UTIL = LARGURA - MARGEM * 2;

const COR_TITULO = rgb(0.06, 0.09, 0.19); // ink
const COR_FAIXA = rgb(0.251, 0.376, 0.557); // azul do modelo de referência
const COR_TEXTO = rgb(0.15, 0.18, 0.25);
const COR_LABEL = rgb(0.45, 0.48, 0.55);
const COR_LINHA = rgb(0.85, 0.86, 0.9);

function limparAcentosParaLatin1(texto: string): string {
  // StandardFonts (WinAnsi) não suporta todo unicode — normaliza o texto pra
  // evitar erro de encoding em caracteres fora do padrão (emojis etc.).
  return texto.normalize("NFC");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const dados = await buscarFichaAdmissao(params.id);
  if (!dados) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([LARGURA, ALTURA]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = ALTURA - MARGEM;

  // Se a próxima seção não couber no que sobrou da página, abre uma página
  // nova antes de desenhar — em vez de deixar o conteúdo vazar pra fora
  // (documento continua legível mesmo em fichas com muitos dependentes etc.)
  function quebrarSeNecessario(alturaNecessaria: number) {
    if (y - alturaNecessaria < MARGEM) {
      page = pdfDoc.addPage([LARGURA, ALTURA]);
      page.drawText(limparAcentosParaLatin1(`Ficha de admissão — ${dados!.colaboradorNome} (continuação)`), {
        x: MARGEM,
        y: ALTURA - MARGEM,
        size: 8,
        font,
        color: COR_LABEL,
      });
      y = ALTURA - MARGEM - 18;
    }
  }

  // Cabeçalho
  page.drawRectangle({ x: 0, y: y - 6, width: LARGURA, height: 46, color: COR_TITULO });
  page.drawText("FICHA DE ADMISSÃO", { x: MARGEM, y: y + 16, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(limparAcentosParaLatin1(dados.colaboradorNome), {
    x: MARGEM,
    y: y - 2,
    size: 10,
    font,
    color: rgb(1, 1, 1),
  });
  y -= 56;

  quebrarSeNecessario(estimarAlturaCampos(3, 3));
  y = desenharCampos(page, font, bold, y, "EMPRESA E FILIAL", [
    { label: "Empresa", valor: dados.empresaNome },
    { label: "Filial", valor: dados.filialNome },
    { label: "CNPJ", valor: dados.filialCnpj },
  ], 3);

  quebrarSeNecessario(estimarAlturaCampos(dados.pessoal.length, 2));
  y = desenharCampos(page, font, bold, y, "DADOS PESSOAIS", dados.pessoal, 2);

  quebrarSeNecessario(estimarAlturaCampos(dados.funcional.length, 2));
  y = desenharCampos(page, font, bold, y, "DADOS FUNCIONAIS", dados.funcional, 2);

  const linhasDependentes = Math.max(1, dados.dependentes.length);
  quebrarSeNecessario(estimarAlturaTabela(linhasDependentes));
  y = desenharTabela(
    page,
    font,
    bold,
    y,
    "DEPENDENTES",
    ["Nome", "Nascimento", "Parentesco", "CPF", "Dep. IR"],
    [0.34, 0.16, 0.2, 0.18, 0.12],
    dados.dependentes.length > 0
      ? dados.dependentes.map((d) => [d.nome, d.nascimento, d.parentesco, d.cpf, d.depIR])
      : [["Nenhum dependente cadastrado", "", "", "", ""]]
  );

  quebrarSeNecessario(estimarAlturaCampos(dados.bancarios.length, 2));
  y = desenharCampos(page, font, bold, y, "DADOS BANCÁRIOS", dados.bancarios, 2);

  const ALTURA_TOTAL = 15;
  quebrarSeNecessario(estimarAlturaTabela(dados.horario.length, 8) + ALTURA_TOTAL + 6);
  y = desenharTabela(
    page,
    font,
    bold,
    y,
    "HORÁRIO DE TRABALHO",
    ["Dia", "Manhã ent.", "Manhã saí.", "Tarde ent.", "Tarde saí.", "Carga"],
    [0.24, 0.15, 0.15, 0.15, 0.15, 0.16],
    dados.horario.map((h) => [h.dia, h.manhaEntrada, h.manhaSaida, h.tardeEntrada, h.tardeSaida, h.carga]),
    8 // volta 8pt pra colar o total logo abaixo da tabela, sem espaço extra
  );

  // Total de horas semanais/mensais, coladinho embaixo do quadro Horário de Trabalho
  page.drawRectangle({ x: MARGEM, y: y - ALTURA_TOTAL, width: LARGURA_UTIL, height: ALTURA_TOTAL, color: rgb(0.93, 0.97, 0.96) });
  page.drawText(
    limparAcentosParaLatin1(`Horas semanais: ${dados.horasSemanaisTotal}      Horas mensais: ${dados.horasMensaisTotal}`),
    { x: MARGEM + 4, y: y - ALTURA_TOTAL + 4, size: 8, font: bold, color: COR_TITULO }
  );
  y -= ALTURA_TOTAL + 6;

  quebrarSeNecessario(estimarAlturaCampos(dados.beneficios.length, 2));
  y = desenharCampos(page, font, bold, y, "BENEFÍCIO — VALE TRANSPORTE E VALE ALIMENTAÇÃO", dados.beneficios, 2);

  // rodapé (fica na última página, que é a que "page" está apontando aqui)
  page.drawText(`Gerado em ${new Date().toLocaleDateString("pt-BR")} pelo AppliQ RH — documento para uso interno/contabilidade.`, {
    x: MARGEM,
    y: MARGEM - 12,
    size: 7,
    font,
    color: COR_LABEL,
  });

  const bytes = await pdfDoc.save();
  const nomeArquivo = `ficha-admissao-${dados.nomeArquivoBase}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}

// Estimativas de altura usadas só pra decidir se precisa quebrar de página
// ANTES de desenhar — têm que bater com as contas de desenharCampos/desenharTabela.
function estimarAlturaCampos(qtdCampos: number, colunas: number): number {
  const alturaLinha = 13;
  const linhas = Math.ceil(qtdCampos / colunas);
  return 22 + linhas * alturaLinha + 6 + 5;
}

function estimarAlturaTabela(qtdLinhas: number, espacoFinal = 8): number {
  const alturaLinha = 15;
  return 22 + alturaLinha + qtdLinhas * alturaLinha + espacoFinal;
}

function desenharTituloSecao(page: PDFPage, bold: PDFFont, y: number, titulo: string): number {
  page.drawRectangle({ x: MARGEM, y: y - 14, width: LARGURA_UTIL, height: 16, color: COR_FAIXA });
  page.drawText(titulo, { x: MARGEM + 4, y: y - 11, size: 9, font: bold, color: rgb(1, 1, 1) });
  return y - 22;
}

function desenharCampos(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  yInicial: number,
  titulo: string,
  campos: CampoFicha[],
  colunas: number
): number {
  let y = desenharTituloSecao(page, bold, yInicial, titulo);
  const larguraColuna = LARGURA_UTIL / colunas;
  const linhas = Math.ceil(campos.length / colunas);
  const tamanhoFonte = 7.5;
  // Label e valor na mesma linha ("Nome completo: RAMON ALVES") — 13pt já dá
  // respiro suficiente entre uma linha e a próxima nesse tamanho de fonte.
  const alturaLinha = 13;

  for (let linha = 0; linha < linhas; linha++) {
    for (let col = 0; col < colunas; col++) {
      const campo = campos[linha * colunas + col];
      if (!campo) continue;
      const x = MARGEM + col * larguraColuna;
      const linhaY = y - linha * alturaLinha;
      const rotulo = limparAcentosParaLatin1(campo.label + ": ");
      page.drawText(rotulo, { x, y: linhaY, size: tamanhoFonte, font: bold, color: COR_LABEL });
      const larguraRotulo = bold.widthOfTextAtSize(rotulo, tamanhoFonte);
      const larguraDisponivel = Math.max(30, larguraColuna - larguraRotulo - 6);
      page.drawText(
        limparAcentosParaLatin1(truncarParaLargura(font, tamanhoFonte, campo.valor || "—", larguraDisponivel)),
        { x: x + larguraRotulo, y: linhaY, size: tamanhoFonte, font, color: COR_TEXTO }
      );
    }
  }

  const yFinal = y - linhas * alturaLinha - 6;
  page.drawLine({
    start: { x: MARGEM, y: yFinal + 4 },
    end: { x: MARGEM + LARGURA_UTIL, y: yFinal + 4 },
    thickness: 0.5,
    color: COR_LINHA,
  });
  return yFinal - 5;
}

function desenharTabela(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  yInicial: number,
  titulo: string,
  cabecalhos: string[],
  proporcoes: number[],
  linhas: string[][],
  espacoFinal = 8
): number {
  let y = desenharTituloSecao(page, bold, yInicial, titulo);
  const alturaLinha = 15;
  let x = MARGEM;
  const larguras = proporcoes.map((p) => p * LARGURA_UTIL);

  // cabeçalho da tabela
  page.drawRectangle({ x: MARGEM, y: y - alturaLinha, width: LARGURA_UTIL, height: alturaLinha, color: rgb(0.94, 0.95, 0.97) });
  x = MARGEM;
  cabecalhos.forEach((c, i) => {
    page.drawText(limparAcentosParaLatin1(c), { x: x + 3, y: y - alturaLinha + 4, size: 7, font: bold, color: COR_LABEL });
    x += larguras[i];
  });
  y -= alturaLinha;

  linhas.forEach((linha) => {
    x = MARGEM;
    linha.forEach((valor, i) => {
      page.drawText(limparAcentosParaLatin1(truncar(valor, 26)), {
        x: x + 3,
        y: y - alturaLinha + 4,
        size: 7,
        font,
        color: COR_TEXTO,
      });
      x += larguras[i];
    });
    page.drawLine({
      start: { x: MARGEM, y: y - alturaLinha },
      end: { x: MARGEM + LARGURA_UTIL, y: y - alturaLinha },
      thickness: 0.4,
      color: COR_LINHA,
    });
    y -= alturaLinha;
  });

  return y - espacoFinal;
}

function truncar(texto: string, max: number): string {
  if (!texto) return "—";
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

/** Trunca pelo tamanho REAL do texto na fonte (em pt), não por contagem de caracteres — usado no "Label: Valor" na mesma linha, onde a largura sobrando varia pro rótulo de cada campo. */
function truncarParaLargura(font: PDFFont, tamanhoFonte: number, texto: string, larguraMax: number): string {
  if (!texto) return "—";
  if (font.widthOfTextAtSize(texto, tamanhoFonte) <= larguraMax) return texto;
  let t = texto;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", tamanhoFonte) > larguraMax) {
    t = t.slice(0, -1);
  }
  return t + "…";
}
