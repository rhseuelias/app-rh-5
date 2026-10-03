// Gera a planilha "Movimento Variável" no modelo da contabilidade, sem
// bibliotecas externas: mesma aba, mesmos cabeçalhos (inclusive os espaços
// duplos), mesma ordem e mesmas larguras de coluna do arquivo modelo.
import { deflateRawSync } from "zlib";

export const ABA_MODELO = "Movimento Variável";

export interface VerbaModelo {
  codigo: string;
  cabecalho: string;
}

// Colunas fixas do modelo: CPF, Nome e Matricula (nessa ordem)
export const COLUNAS_FIXAS = ["CPF", "Nome", "Matricula"];

// As verbas do modelo, na ordem do arquivo. O texto do cabeçalho é copiado
// letra por letra do modelo (note os dois espaços antes do último traço).
export const VERBAS_MODELO: VerbaModelo[] = [
  { codigo: "17", cabecalho: "17 - hora extra 50%  - Referência" },
  { codigo: "22", cabecalho: "22 - hora extra 100%  - Referência" },
  { codigo: "42", cabecalho: "42 - comissão s/ vendas  - Valor" },
  { codigo: "107", cabecalho: "107 - desconto farmácia  - Valor" },
  { codigo: "385", cabecalho: "385 - desconto quebra de caixa  - Valor" },
  { codigo: "431", cabecalho: "431 - desconto de vale avulso  - Valor" },
  { codigo: "442", cabecalho: "442 - gratificação - folha  - Valor" },
  { codigo: "170", cabecalho: "170 - assistência médica total pago pela empresa  - Valor" },
  { codigo: "183", cabecalho: "183 - vale transporte custo da empresa  - Valor" },
  { codigo: "555", cabecalho: "555 - reembolso de despesas  - Valor" },
];

// largura das 3 primeiras colunas (CPF, Nome, Matricula); as das verbas acompanham o tamanho do cabeçalho
const LARGURAS_FIXAS = [15.1640625, 76, 9.83203125];
function larguraVerba(cabecalho: string): number {
  return Math.min(60, Math.max(14, Math.round(cabecalho.length * 1.05 + 3)));
}

export interface LinhaMovimento {
  cpf: string;
  nome: string;
  matricula: string;
  /** um valor por verba, na mesma ordem da lista de verbas usada para gerar o arquivo (null = célula vazia) */
  valores: (number | null)[];
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // remove caracteres de controle que o XML não aceita
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function letraColuna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function montarZip(arquivos: { nome: string; dados: Buffer }[]): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let deslocamento = 0;
  const agora = new Date();
  const dosHora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dosData = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();

  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const comprimido = deflateRawSync(a.dados);
    const crc = crc32(a.dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosHora, 10);
    local.writeUInt16LE(dosData, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(a.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nome, comprimido);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosHora, 12);
    cd.writeUInt16LE(dosData, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comprimido.length, 20);
    cd.writeUInt32LE(a.dados.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(deslocamento, 42);
    central.push(cd, nome);

    deslocamento += 30 + nome.length + comprimido.length;
  }

  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fim.writeUInt16LE(0, 20);
  return Buffer.concat([...partes, diretorio, fim]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function gerarXlsxMovimentoVariavel(linhas: LinhaMovimento[], verbas: VerbaModelo[] = VERBAS_MODELO): Buffer {
  const textos: string[] = [];
  const indiceTexto = new Map<string, number>();
  let totalReferencias = 0;
  const si = (s: string): number => {
    totalReferencias++;
    let i = indiceTexto.get(s);
    if (i === undefined) {
      i = textos.length;
      textos.push(s);
      indiceTexto.set(s, i);
    }
    return i;
  };
  const celulaTexto = (ref: string, s: string) => `<c r="${ref}" t="s"><v>${si(s)}</v></c>`;

  const cabecalhos = [...COLUNAS_FIXAS, ...verbas.map((v) => v.cabecalho)];
  const totalColunas = cabecalhos.length;

  let linhasXml = `<row r="1" spans="1:${totalColunas}">${cabecalhos
    .map((h, i) => celulaTexto(`${letraColuna(i)}1`, h))
    .join("")}</row>`;

  linhas.forEach((l, idx) => {
    const r = idx + 2;
    const celulas: string[] = [];
    if (l.cpf) celulas.push(celulaTexto(`A${r}`, l.cpf));
    if (l.nome) celulas.push(celulaTexto(`B${r}`, l.nome));
    if (l.matricula) celulas.push(celulaTexto(`C${r}`, l.matricula)); // texto: mantém o zero à esquerda
    l.valores.forEach((v, i) => {
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      celulas.push(`<c r="${letraColuna(3 + i)}${r}"><v>${Number(v.toFixed(2))}</v></c>`);
    });
    linhasXml += `<row r="${r}" spans="1:${totalColunas}">${celulas.join("")}</row>`;
  });

  const ultimaLinha = linhas.length + 1;
  const colunasXml = [...LARGURAS_FIXAS, ...verbas.map((v) => larguraVerba(v.cabecalho))].map(
    (w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
  ).join("");

  const planilha =
    XML +
    `<worksheet xmlns="${NS}" xmlns:r="${NS_REL}">` +
    `<dimension ref="A1:${letraColuna(totalColunas - 1)}${ultimaLinha}"/>` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr baseColWidth="10" defaultColWidth="8.83203125" defaultRowHeight="15"/>` +
    `<cols>${colunasXml}</cols>` +
    `<sheetData>${linhasXml}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`;

  const textosXml =
    XML +
    `<sst xmlns="${NS}" count="${totalReferencias}" uniqueCount="${textos.length}">` +
    textos.map((t) => `<si><t xml:space="preserve">${xmlEsc(t)}</t></si>`).join("") +
    `</sst>`;

  const estilos =
    XML +
    `<styleSheet xmlns="${NS}">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const livro =
    XML +
    `<workbook xmlns="${NS}" xmlns:r="${NS_REL}">` +
    `<bookViews><workbookView xWindow="0" yWindow="500" windowWidth="28800" windowHeight="16260"/></bookViews>` +
    `<sheets><sheet name="${xmlEsc(ABA_MODELO)}" sheetId="1" r:id="rId1"/></sheets>` +
    `<calcPr calcId="0"/>` +
    `</workbook>`;

  const relLivro =
    XML +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId3" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const relRaiz =
    XML +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const tipos =
    XML +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`;

  return montarZip([
    { nome: "[Content_Types].xml", dados: Buffer.from(tipos, "utf8") },
    { nome: "_rels/.rels", dados: Buffer.from(relRaiz, "utf8") },
    { nome: "xl/workbook.xml", dados: Buffer.from(livro, "utf8") },
    { nome: "xl/_rels/workbook.xml.rels", dados: Buffer.from(relLivro, "utf8") },
    { nome: "xl/styles.xml", dados: Buffer.from(estilos, "utf8") },
    { nome: "xl/sharedStrings.xml", dados: Buffer.from(textosXml, "utf8") },
    { nome: "xl/worksheets/sheet1.xml", dados: Buffer.from(planilha, "utf8") },
  ]);
}
