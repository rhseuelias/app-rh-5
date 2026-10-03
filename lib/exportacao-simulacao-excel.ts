import ExcelJS from "exceljs";
import {
  dataHoraBrasilia,
  dm,
  dma,
  origemDoColaborador,
  ROTULO_STATUS,
  totaisExportacao,
  type DadosExportacaoSimulacao,
  type StatusExportacao,
} from "./exportacao-simulacao-util";

/**
 * Excel da simulação de férias (modelo 5c), 3 abas:
 *  - "Lista": uma linha por colaborador, com datas de verdade (dá para filtrar e ordenar);
 *  - "Calendário": uma coluna por semana (de segunda-feira), M = manual, A = automática;
 *  - "Regras do cenário": as configurações usadas na simulação.
 */

const FONTE = "Arial";
const ARGB = {
  escuro: "FF262626",
  branco: "FFFFFFFF",
  cinza: "FF737373",
  contexto: "FF5C5C5C",
  unidade: "FF93440C",
  manual: "FF3D3D3D",
  auto: "FFFBB26E",
  limite: "FFFDECEA",
  cabCal: "FFF4EBE1",
  grade: "FFF0E8DF",
};
const STATUS_ESTILO: Record<StatusExportacao, { texto: string; fundo: string }> = {
  completo: { texto: "FF1F7A52", fundo: "FFE6F4EC" },
  parcial: { texto: "FF93440C", fundo: "FFFFE9D2" },
  sem_definicao: { texto: "FF737373", fundo: "FFF4EBE1" },
};
const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Data "de verdade" do Excel (sem deslocar por fuso). */
function dataExcel(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export async function gerarExcelSimulacao(dados: DadosExportacaoSimulacao): Promise<ArrayBuffer> {
  const { cabecalho, colaboradores } = dados;
  const quando = dataHoraBrasilia(dados.geradoEm);
  const tot = totaisExportacao(colaboradores);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppliQ RH";
  wb.created = dados.geradoEm;

  /* ============================ LISTA ============================ */
  const lista = wb.addWorksheet("Lista", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const larguras = [30, 16, 10, 10, 10, 6, 10, 10, 6, 18, 7, 12, 14, 13];
  lista.columns = larguras.map((w) => ({ width: w }));

  lista.getCell("A1").value = `Simulação de férias · ${cabecalho.cenarioNome}`;
  lista.getCell("A1").font = { name: FONTE, bold: true, size: 14 };
  lista.getCell("A2").value =
    `${cabecalho.status === "aprovado" ? "Aprovado" : "Rascunho"} · gerado em ${quando.data}` +
    ` · divisão ${cabecalho.divisaoTexto} · prioridade ${cabecalho.prioridadeTexto}`;
  lista.getCell("A2").font = { name: FONTE, size: 10, color: { argb: ARGB.cinza } };

  const titulos = [
    "Colaborador",
    "Unidade",
    "Limite",
    "1º início",
    "1º fim",
    "Dias",
    "2º início",
    "2º fim",
    "Dias",
    "3º período",
    "Total",
    "Origem",
    "Status",
    "Custo est.",
  ];
  const cab = lista.getRow(4);
  titulos.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { name: FONTE, bold: true, size: 10, color: { argb: ARGB.branco } };
    c.fill = fill(ARGB.escuro);
    c.alignment = { vertical: "middle", horizontal: [5, 8, 10].includes(i) ? "right" : "left" };
  });
  cab.height = 18;

  let linhaAtual = 5;
  for (const c of colaboradores) {
    const r = lista.getRow(linhaAtual);
    const [p1, p2, p3] = c.periodos;
    const custo = c.periodos.reduce((s, p) => s + (p.valorEstimado ?? 0), 0);

    r.getCell(1).value = c.nome;
    r.getCell(2).value = c.unidadeNome;
    r.getCell(3).value = dataExcel(c.limiteConcessao);
    if (p1) {
      r.getCell(4).value = dataExcel(p1.inicio);
      r.getCell(5).value = dataExcel(p1.fim);
      r.getCell(6).value = p1.dias;
    }
    if (p2) {
      r.getCell(7).value = dataExcel(p2.inicio);
      r.getCell(8).value = dataExcel(p2.fim);
      r.getCell(9).value = p2.dias;
    }
    if (p3) r.getCell(10).value = `${dm(p3.inicio)} a ${dm(p3.fim)} (${p3.dias})`;
    r.getCell(11).value = c.totalDias;
    r.getCell(12).value = origemDoColaborador(c);
    r.getCell(13).value = ROTULO_STATUS[c.status];
    if (dados.mostrarValores && c.periodos.length > 0) r.getCell(14).value = custo;

    for (let i = 1; i <= 14; i++) {
      const cell = r.getCell(i);
      cell.font = { name: FONTE, size: 10, bold: i === 11 };
      cell.alignment = { vertical: "middle", horizontal: [6, 9, 11, 14].includes(i) ? "right" : "left" };
    }
    for (const i of [3, 4, 5, 7, 8]) r.getCell(i).numFmt = "dd/mm/yy";
    r.getCell(14).numFmt = '"R$" #,##0.00';
    const est = STATUS_ESTILO[c.status];
    const st = r.getCell(13);
    st.fill = fill(est.fundo);
    st.font = { name: FONTE, size: 10, bold: true, color: { argb: est.texto } };
    linhaAtual++;
  }

  const ultimaDados = linhaAtual - 1;
  // linha de total
  const rt = lista.getRow(linhaAtual);
  rt.getCell(1).value = "Total";
  rt.getCell(11).value = tot.dias;
  rt.getCell(13).value = `${tot.completos} completo${tot.completos !== 1 ? "s" : ""}`;
  if (dados.mostrarValores) {
    rt.getCell(14).value = tot.custo;
    rt.getCell(14).numFmt = '"R$" #,##0.00';
  }
  for (let i = 1; i <= 14; i++) {
    const cell = rt.getCell(i);
    cell.font = { name: FONTE, size: 10, bold: true };
    cell.alignment = { vertical: "middle", horizontal: [11, 14].includes(i) ? "right" : "left" };
    cell.border = { top: { style: "medium", color: { argb: ARGB.escuro } } };
  }

  lista.autoFilter = `A4:N${Math.max(4, ultimaDados)}`;

  /* ========================== CALENDÁRIO ========================== */
  const ano = cabecalho.ano;
  const cal = wb.addWorksheet("Calendário", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const DIA = 86400000;
  const jan1 = Date.UTC(ano, 0, 1);
  const dez31 = Date.UTC(ano, 11, 31);
  let seg = jan1;
  while (new Date(seg).getUTCDay() !== 1) seg += DIA; // primeira segunda-feira do ano
  const semanas: number[] = [];
  for (let d = seg; d <= dez31; d += 7 * DIA) semanas.push(d);
  const nSem = semanas.length;
  const COL0 = 3; // coluna C

  cal.getColumn(1).width = 28;
  cal.getColumn(2).width = 14;
  for (let i = 0; i < nSem; i++) cal.getColumn(COL0 + i).width = 3;

  cal.getCell("A1").value = `Calendário ${ano} · semanas a partir de segunda-feira`;
  cal.getCell("A1").font = { name: FONTE, bold: true, size: 14 };
  cal.getCell("A2").value = "M = manual · A = automática · vermelho claro = semana do limite de concessão";
  cal.getCell("A2").font = { name: FONTE, size: 10, color: { argb: ARGB.cinza } };

  // linha 3: meses (na primeira semana de cada mês) / linha 4: dia da segunda-feira
  let mesAnterior = -1;
  for (let i = 0; i < nSem; i++) {
    const d = new Date(semanas[i]);
    const c3 = cal.getCell(3, COL0 + i);
    c3.fill = fill(ARGB.escuro);
    c3.font = { name: FONTE, size: 9, bold: true, color: { argb: ARGB.branco } };
    c3.alignment = { horizontal: "left", vertical: "middle" };
    if (d.getUTCMonth() !== mesAnterior) {
      c3.value = MESES_NOME[d.getUTCMonth()];
      mesAnterior = d.getUTCMonth();
    }
    const c4 = cal.getCell(4, COL0 + i);
    c4.value = String(d.getUTCDate()).padStart(2, "0");
    c4.font = { name: FONTE, size: 8, color: { argb: ARGB.cinza } };
    c4.fill = fill(ARGB.cabCal);
    c4.alignment = { horizontal: "center", vertical: "middle" };
  }
  for (const [col, texto] of [
    [1, "Colaborador"],
    [2, "Unidade"],
  ] as const) {
    const c = cal.getCell(4, col);
    c.value = texto;
    c.font = { name: FONTE, bold: true, size: 10 };
    c.fill = fill(ARGB.cabCal);
    c.alignment = { vertical: "middle" };
  }

  const indiceSemana = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return Math.max(0, Math.min(nSem - 1, Math.floor((t - seg) / (7 * DIA))));
  };
  const diaTs = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };

  let linhaCal = 5;
  let unidadeAtual = "";
  for (const c of colaboradores) {
    if (c.unidadeNome !== unidadeAtual) {
      unidadeAtual = c.unidadeNome;
      const rotulo = cal.getCell(linhaCal, 1);
      rotulo.value = unidadeAtual;
      rotulo.font = { name: FONTE, bold: true, size: 10, color: { argb: ARGB.unidade } };
      linhaCal++;
    }
    cal.getCell(linhaCal, 1).value = c.nome;
    cal.getCell(linhaCal, 1).font = { name: FONTE, size: 10 };
    cal.getCell(linhaCal, 2).value = c.unidadeNome;
    cal.getCell(linhaCal, 2).font = { name: FONTE, size: 10, color: { argb: ARGB.cinza } };

    // grade fininha
    for (let i = 0; i < nSem; i++) {
      cal.getCell(linhaCal, COL0 + i).border = {
        left: { style: "thin", color: { argb: ARGB.grade } },
        right: { style: "thin", color: { argb: ARGB.grade } },
        top: { style: "thin", color: { argb: ARGB.grade } },
        bottom: { style: "thin", color: { argb: ARGB.grade } },
      };
    }

    const marcadas = new Map<number, "manual" | "automatica">();
    for (const p of c.periodos) {
      if (diaTs(p.fim) < jan1 || diaTs(p.inicio) > dez31) continue;
      const a = indiceSemana(p.inicio);
      const b = indiceSemana(p.fim);
      for (let s = a; s <= b; s++) {
        if (marcadas.get(s) !== "manual") marcadas.set(s, p.origem);
      }
    }
    for (const [s, origem] of marcadas) {
      const cell = cal.getCell(linhaCal, COL0 + s);
      const manual = origem === "manual";
      cell.value = manual ? "M" : "A";
      cell.fill = fill(manual ? ARGB.manual : ARGB.auto);
      cell.font = { name: FONTE, size: 8, bold: true, color: { argb: manual ? ARGB.branco : ARGB.escuro } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
    const dl = diaTs(c.limiteConcessao);
    if (dl >= jan1 && dl <= dez31) {
      const s = indiceSemana(c.limiteConcessao);
      if (!marcadas.has(s)) cal.getCell(linhaCal, COL0 + s).fill = fill(ARGB.limite);
    }
    linhaCal++;
  }

  /* ====================== REGRAS DO CENÁRIO ====================== */
  const reg = wb.addWorksheet("Regras do cenário", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  reg.getColumn(1).width = 44;
  reg.getColumn(2).width = 64;
  reg.getCell("A1").value = "Regras do cenário";
  reg.getCell("A1").font = { name: FONTE, bold: true, size: 14 };
  for (const [col, texto] of [
    [1, "Regra"],
    [2, "Valor"],
  ] as const) {
    const c = reg.getCell(3, col);
    c.value = texto;
    c.font = { name: FONTE, bold: true, size: 10, color: { argb: ARGB.branco } };
    c.fill = fill(ARGB.escuro);
  }
  const linhasRegras: [string, string][] = [...cabecalho.regras, ["Gerado em", `${quando.data} às ${quando.hora}`]];
  linhasRegras.forEach(([k, v], i) => {
    const r = 4 + i;
    reg.getCell(r, 1).value = k;
    reg.getCell(r, 1).font = { name: FONTE, size: 10, bold: true };
    reg.getCell(r, 2).value = v;
    reg.getCell(r, 2).font = { name: FONTE, size: 10 };
    reg.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    reg.getCell(r, 1).alignment = { vertical: "top" };
    for (const col of [1, 2]) {
      reg.getCell(r, col).border = { bottom: { style: "thin", color: { argb: ARGB.grade } } };
    }
  });

  void dma;
  return wb.xlsx.writeBuffer();
}
