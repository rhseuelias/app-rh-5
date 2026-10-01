import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import { adicionaisDe, totalizar, SEM_UNIDADE, MESES } from "@/lib/relatorio-salarios";

export const dynamic = "force-dynamic";

const MOEDA = '"R$" #,##0.00';
const AZUL_ESCURO = "FF0E1330";
const VERDE_CLARO = "FFEEFCFA";
const CINZA = "FFF1F5F9";

function cabecalho(sheet: ExcelJS.Worksheet, linha: number) {
  sheet.getRow(linha).eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ESCURO } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function destacar(sheet: ExcelJS.Worksheet, linha: number, cor: string, negrito = true) {
  sheet.getRow(linha).eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: negrito, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  });
}

function anchos(sheet: ExcelJS.Worksheet, larguras: number[]) {
  larguras.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function nomeArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (await souAssistente()) return NextResponse.json({ error: "sem acesso" }, { status: 403 });

  const url = new URL(req.url);
  const empresaParam = url.searchParams.get("empresa");
  const unidadeParam = url.searchParams.get("unidade");

  const [{ data: colaboradores }, { data: empresas }, { data: unidades }] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("tipo", "CLT").in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const clt = (colaboradores ?? []) as Colaborador[];
  const listaEmpresas = ((empresas ?? []) as Empresa[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeUnidadePorId: Record<string, string> = Object.fromEntries(
    ((unidades ?? []) as Unidade[]).map((u) => [u.id, u.nome])
  );

  const agora = new Date();
  const competencia = `${MESES[agora.getMonth()]}/${agora.getFullYear()}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppliQ RH";
  workbook.created = new Date();

  let nomeBase = "relatorio-salarios";

  // =====================================================
  // RESUMO DO GRUPO — uma linha por empresa
  // =====================================================
  if (empresaParam === "grupo") {
    nomeBase += "-grupo";
    const sheet = workbook.addWorksheet("Resumo do Grupo", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.addRow(["Grupo Seu Elias — Relatório de salários e custo (colaboradores CLT)"]);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.addRow([`Competência: ${competencia}`]);
    sheet.addRow([]);
    sheet.addRow(["Empresa", "CLT", "Salários", "Adicionais", "Folha (salários + adicionais)", "Custo total mensal"]);
    cabecalho(sheet, 4);

    const linhas = [
      ...listaEmpresas.map((e) => ({ nome: e.nome, lista: clt.filter((c) => c.empresa_id === e.id) })),
      { nome: "Sem empresa vinculada", lista: clt.filter((c) => !c.empresa_id) },
    ].filter((l, i, todas) => l.lista.length > 0 || i < todas.length - 1);

    const primeira = 5;
    for (const l of linhas) {
      const t = totalizar(l.lista);
      const r = sheet.rowCount + 1;
      sheet.addRow([
        l.nome,
        l.lista.length,
        t.salarios,
        t.adicionais,
        { formula: `C${r}+D${r}`, result: t.folha },
        t.custo,
      ]);
    }
    const ultima = sheet.rowCount;
    const geral = totalizar(clt);
    const rt = ultima + 1;
    sheet.addRow([
      "TOTAL DO GRUPO",
      { formula: `SUM(B${primeira}:B${ultima})`, result: clt.length },
      { formula: `SUM(C${primeira}:C${ultima})`, result: geral.salarios },
      { formula: `SUM(D${primeira}:D${ultima})`, result: geral.adicionais },
      { formula: `SUM(E${primeira}:E${ultima})`, result: geral.folha },
      { formula: `SUM(F${primeira}:F${ultima})`, result: geral.custo },
    ]);
    destacar(sheet, rt, VERDE_CLARO);

    anchos(sheet, [34, 8, 18, 18, 28, 22]);
    for (const col of ["C", "D", "E", "F"]) sheet.getColumn(col).numFmt = MOEDA;
    sheet.getRow(4).height = 32;
  } else {
    // =====================================================
    // UMA EMPRESA (todas as unidades ou uma só)
    // =====================================================
    const empresa = (empresaParam && listaEmpresas.find((e) => e.id === empresaParam)) || listaEmpresas[0];
    if (!empresa) return NextResponse.json({ error: "nenhuma empresa" }, { status: 404 });

    const listaEmpresa = clt
      .filter((c) => c.empresa_id === empresa.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const opcoesUnidade = Array.from(new Set(listaEmpresa.map((c) => c.unidade_id ?? SEM_UNIDADE)))
      .map((id) => ({ id, nome: id === SEM_UNIDADE ? "Sem unidade" : nomeUnidadePorId[id] ?? "Unidade" }))
      .sort((a, b) =>
        a.id === SEM_UNIDADE ? 1 : b.id === SEM_UNIDADE ? -1 : a.nome.localeCompare(b.nome, "pt-BR")
      );
    const temVariasUnidades = opcoesUnidade.length > 1;
    const unidadeEscolhida = temVariasUnidades ? opcoesUnidade.find((o) => o.id === unidadeParam) ?? null : null;
    const mostrarGrupos = temVariasUnidades && !unidadeEscolhida;

    const lista = unidadeEscolhida
      ? listaEmpresa.filter((c) => (c.unidade_id ?? SEM_UNIDADE) === unidadeEscolhida.id)
      : listaEmpresa;
    const grupos = (unidadeEscolhida ? [unidadeEscolhida] : opcoesUnidade).map((o) => {
      const doGrupo = lista.filter((c) => (c.unidade_id ?? SEM_UNIDADE) === o.id);
      return { ...o, lista: doGrupo, t: totalizar(doGrupo) };
    });
    const t = totalizar(lista);

    const titulo = unidadeEscolhida
      ? `${empresa.nome} — ${unidadeEscolhida.nome}`
      : mostrarGrupos
        ? `${empresa.nome} — todas as unidades`
        : empresa.nome;
    nomeBase += `-${nomeArquivo(empresa.nome)}${unidadeEscolhida ? `-${nomeArquivo(unidadeEscolhida.nome)}` : ""}`;

    // ---------- aba 1: colaboradores ----------
    const sheet = workbook.addWorksheet("Colaboradores", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.addRow([`${titulo} — Relatório de salários e custo (colaboradores CLT)`]);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.addRow([`Competência: ${competencia}`]);
    sheet.addRow([]);
    sheet.addRow(["Unidade", "Nome", "Cargo", "Salário", "Comissão / auxílios", "Benefícios", "Total (salário + adicionais)"]);
    cabecalho(sheet, 4);

    const linhasSubtotal: number[] = [];
    for (const g of grupos) {
      if (g.lista.length === 0) continue;
      const inicio = sheet.rowCount + 1;
      for (const c of g.lista) {
        const ad = adicionaisDe(c);
        const r = sheet.rowCount + 1;
        sheet.addRow([
          g.nome,
          c.nome,
          c.cargo ?? "",
          c.salario_base ?? 0,
          ad.comissaoAux,
          ad.beneficios,
          { formula: `D${r}+E${r}+F${r}`, result: (c.salario_base ?? 0) + ad.total },
        ]);
      }
      const fim = sheet.rowCount;
      if (mostrarGrupos) {
        const rs = fim + 1;
        sheet.addRow([
          `Subtotal ${g.nome}`,
          `${g.lista.length} colaborador${g.lista.length === 1 ? "" : "es"}`,
          "",
          { formula: `SUM(D${inicio}:D${fim})`, result: g.t.salarios },
          { formula: `SUM(E${inicio}:E${fim})`, result: g.lista.reduce((a, c) => a + adicionaisDe(c).comissaoAux, 0) },
          { formula: `SUM(F${inicio}:F${fim})`, result: g.lista.reduce((a, c) => a + adicionaisDe(c).beneficios, 0) },
          { formula: `SUM(G${inicio}:G${fim})`, result: g.t.folha },
        ]);
        destacar(sheet, rs, CINZA);
        linhasSubtotal.push(rs);
      }
    }

    const primeiraDados = 5;
    const ultimaDados = sheet.rowCount;
    const rTotal = ultimaDados + 1;
    const comissaoTotal = lista.reduce((a, c) => a + adicionaisDe(c).comissaoAux, 0);
    const benefTotal = lista.reduce((a, c) => a + adicionaisDe(c).beneficios, 0);
    const somar = (col: string, resultado: number) =>
      mostrarGrupos && linhasSubtotal.length > 0
        ? { formula: linhasSubtotal.map((r) => `${col}${r}`).join("+"), result: resultado }
        : { formula: `SUM(${col}${primeiraDados}:${col}${ultimaDados})`, result: resultado };
    sheet.addRow([
      `TOTAL — ${lista.length} colaborador${lista.length === 1 ? "" : "es"}`,
      "",
      "",
      somar("D", t.salarios),
      somar("E", comissaoTotal),
      somar("F", benefTotal),
      somar("G", t.folha),
    ]);
    destacar(sheet, rTotal, VERDE_CLARO);

    anchos(sheet, [22, 36, 26, 16, 20, 16, 28]);
    for (const col of ["D", "E", "F", "G"]) sheet.getColumn(col).numFmt = MOEDA;
    sheet.getRow(4).height = 32;
    sheet.views = [{ state: "frozen", ySplit: 4 }];

    // ---------- aba 2: custo ----------
    const custo = workbook.addWorksheet("Custo da empresa", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    custo.addRow([`${titulo} — Do pagamento ao custo real`]);
    custo.getRow(1).font = { bold: true, size: 14 };
    custo.addRow([`Competência: ${competencia}`]);
    custo.addRow([]);
    custo.addRow(["Item", "Valor mensal"]);
    cabecalho(custo, 4);
    custo.addRow(["Salários + adicionais (folha)", t.folha]);
    custo.addRow(["INSS patronal (20%)", t.inss]);
    custo.addRow(["FGTS (8%)", t.fgts]);
    custo.addRow(["Provisões (13º, férias, ⅓ férias, multa do FGTS)", t.passivo]);
    custo.addRow(["Custo total mensal", { formula: "SUM(B5:B8)", result: t.custo }]);
    destacar(custo, 9, VERDE_CLARO);
    custo.addRow([]);
    custo.addRow(["Custo médio por colaborador", lista.length > 0 ? t.custo / lista.length : 0]);
    custo.addRow(["Salário médio", lista.length > 0 ? t.salarios / lista.length : 0]);
    custo.addRow([]);
    custo.addRow([
      "Adicionais = comissão, auxílios, vale-transporte, VA/VR e assistências. Provisões = 13º, férias, ⅓ de férias e multa rescisória do FGTS, divididos por mês.",
    ]);
    custo.getRow(14).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    anchos(custo, [52, 20]);
    custo.getColumn("B").numFmt = MOEDA;

    // ---------- aba 3: resumo por unidade (só quando mostra todas) ----------
    if (mostrarGrupos) {
      const resumo = workbook.addWorksheet("Resumo por unidade", {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      resumo.addRow([`${empresa.nome} — Resumo por unidade`]);
      resumo.getRow(1).font = { bold: true, size: 14 };
      resumo.addRow([`Competência: ${competencia}`]);
      resumo.addRow([]);
      resumo.addRow(["Unidade", "CLT", "Salários", "Adicionais", "Custo total", "% do custo"]);
      cabecalho(resumo, 4);
      const ini = 5;
      for (const g of grupos) {
        const r = resumo.rowCount + 1;
        resumo.addRow([
          g.nome,
          g.lista.length,
          g.t.salarios,
          g.t.adicionais,
          g.t.custo,
          { formula: `E${r}/E${ini + grupos.length}`, result: t.custo > 0 ? g.t.custo / t.custo : 0 },
        ]);
      }
      const rt2 = resumo.rowCount + 1;
      resumo.addRow([
        `TOTAL — ${empresa.nome}`,
        { formula: `SUM(B${ini}:B${rt2 - 1})`, result: lista.length },
        { formula: `SUM(C${ini}:C${rt2 - 1})`, result: t.salarios },
        { formula: `SUM(D${ini}:D${rt2 - 1})`, result: t.adicionais },
        { formula: `SUM(E${ini}:E${rt2 - 1})`, result: t.custo },
        { formula: `SUM(F${ini}:F${rt2 - 1})`, result: 1 },
      ]);
      destacar(resumo, rt2, VERDE_CLARO);
      anchos(resumo, [30, 8, 18, 18, 18, 14]);
      for (const col of ["C", "D", "E"]) resumo.getColumn(col).numFmt = MOEDA;
      resumo.getColumn("F").numFmt = "0%";
      resumo.getRow(4).height = 28;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer as unknown as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeBase}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
