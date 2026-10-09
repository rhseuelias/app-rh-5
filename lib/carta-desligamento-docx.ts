// Carta de aviso em Word (.docx), no mesmo modelo do PDF — editável.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { br } from "@/lib/desligamento";
import { TITULO_CARTA, assinaturasCarta, cidadeEData, paragrafosCarta, type DadosCarta } from "@/lib/carta-dados";

const TEAL = "1FB89A";
const AZUL = "1B3A6B";
const FONT = "Arial";
const W = 10706; // largura útil da página A4 com margens de 600
const COLS = [3300, 2300, 1300, 2000, 1806];

const semBorda = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const linhaTeal = { style: BorderStyle.SINGLE, size: 6, color: TEAL };
const caixaTeal = { style: BorderStyle.SINGLE, size: 8, color: TEAL };

function celula(rotulo: string, valor: string, de: number, ate: number) {
  const largura = COLS.slice(de, ate).reduce((a, b) => a + b, 0);
  return new TableCell({
    columnSpan: ate - de,
    width: { size: largura, type: WidthType.DXA },
    borders: { top: semBorda, left: semBorda, right: semBorda, bottom: linhaTeal },
    margins: { top: 30, bottom: 50, left: 60, right: 60 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: rotulo, bold: true, size: 14, color: AZUL, font: FONT })],
      }),
      new Paragraph({
        spacing: { before: 20, after: 0 },
        children: [new TextRun({ text: valor || " ", size: 17, color: AZUL, font: FONT })],
      }),
    ],
  });
}

const linha = (cs: TableCell[]) => new TableRow({ children: cs });

const txt = (t: string) => new TextRun({ text: t, size: 18, color: "1F2937", font: FONT });
const par = (t: string, depois = 360) =>
  new Paragraph({ spacing: { before: 0, after: depois, line: 276 }, children: [txt(t)] });

function assinatura(nome: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 700, after: 0 },
      indent: { right: 5000 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F2937", space: 1 } },
      children: [new TextRun({ text: "", size: 18, font: FONT })],
    }),
    new Paragraph({ spacing: { before: 40, after: 0 }, children: [new TextRun({ text: nome, size: 16, color: "1F2937", font: FONT })] }),
  ];
}

export async function gerarCartaDocx(d: DadosCarta): Promise<Buffer> {
  const e = d.empresa;
  const c = d.colaborador;

  const titulo = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            borders: { top: caixaTeal, bottom: caixaTeal, left: caixaTeal, right: caixaTeal },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: TITULO_CARTA[d.tipo], bold: true, size: 21, color: AZUL, font: FONT })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const campos = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: COLS,
    borders: { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda },
    rows: [
      linha([celula("Empresa", e.razao, 0, 3), celula("CNPJ/CPF", e.cnpj, 3, 5)]),
      linha([celula("Endereço", e.endereco, 0, 2), celula("Número", e.numero, 2, 3), celula("Complemento", e.complemento, 3, 5)]),
      linha([celula("Bairro", e.bairro, 0, 2), celula("Cidade", e.cidade, 2, 4), celula("UF", e.uf, 4, 5)]),
      linha([celula("Empregado", c.nome, 0, 3), celula("Data Admissão", br(c.admissao), 3, 4), celula("Ctps/Série ou CPF", c.cpf, 4, 5)]),
      linha([celula("Endereço do empregado", c.endereco, 0, 5)]),
    ],
  });

  const paragrafos = paragrafosCarta(d);
  const corpo = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            borders: { top: caixaTeal, bottom: caixaTeal, left: caixaTeal, right: caixaTeal },
            margins: { top: 140, bottom: 200, left: 160, right: 160 },
            shading: { type: ShadingType.CLEAR, fill: "FFFFFF" },
            children: [
              ...paragrafos.map((p) => par(p)),
              par(cidadeEData(d), 200),
              ...assinaturasCarta(d).flatMap((n) => assinatura(n)),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "AppliQ RH",
    title: `${TITULO_CARTA[d.tipo]} - ${c.nome}`,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 600, bottom: 800, left: 600, right: 600 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F2937", space: 4 } },
                children: [new TextRun({ text: "Página: 1 de 1", size: 15, color: "1F2937", font: FONT })],
              }),
            ],
          }),
        },
        children: [titulo, campos, corpo],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
