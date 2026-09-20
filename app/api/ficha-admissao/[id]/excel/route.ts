import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase-server";
import { buscarFichaAdmissao, type CampoFicha } from "@/lib/ficha-admissao";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const dados = await buscarFichaAdmissao(params.id);
  if (!dados) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppliQ RH";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Ficha de Admissão", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  sheet.columns = [{ width: 26 }, { width: 26 }, { width: 26 }, { width: 26 }];

  const corFaixa = "FF20AB98"; // brand
  const corCabecalhoTitulo = "FF0E1330"; // ink

  function tituloPrincipal() {
    const row = sheet.addRow([`FICHA DE ADMISSÃO — ${dados!.colaboradorNome}`]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corCabecalhoTitulo } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.height = 26;
    sheet.addRow([]);
  }

  function tituloSecao(titulo: string) {
    sheet.addRow([]);
    const row = sheet.addRow([titulo]);
    sheet.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corFaixa } };
    row.height = 18;
  }

  function camposEm2Colunas(campos: CampoFicha[]) {
    for (let i = 0; i < campos.length; i += 2) {
      const a = campos[i];
      const b = campos[i + 1];
      const row = sheet.addRow([a.label, a.valor, b?.label ?? "", b?.valor ?? ""]);
      row.getCell(1).font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
      row.getCell(3).font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
      row.getCell(2).font = { size: 10 };
      row.getCell(4).font = { size: 10 };
    }
  }

  function tabela(cabecalhos: string[], linhas: string[][]) {
    const headerRow = sheet.addRow(cabecalhos);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    });
    linhas.forEach((linha) => {
      const row = sheet.addRow(linha);
      row.eachCell((cell) => {
        cell.font = { size: 9 };
      });
    });
  }

  tituloPrincipal();

  tituloSecao("EMPRESA E FILIAL");
  camposEm2Colunas([
    { label: "Empresa", valor: dados.empresaNome },
    { label: "Filial", valor: dados.filialNome },
    { label: "CNPJ", valor: dados.filialCnpj },
  ]);

  tituloSecao("DADOS PESSOAIS");
  camposEm2Colunas(dados.pessoal);

  tituloSecao("DADOS FUNCIONAIS");
  camposEm2Colunas(dados.funcional);

  tituloSecao("DEPENDENTES");
  tabela(
    ["Nome", "Nascimento", "Parentesco", "CPF"],
    dados.dependentes.length > 0
      ? dados.dependentes.map((d) => [d.nome, d.nascimento, d.parentesco, `${d.cpf} (Dep. IR: ${d.depIR})`])
      : [["Nenhum dependente cadastrado", "", "", ""]]
  );

  tituloSecao("DADOS BANCÁRIOS");
  camposEm2Colunas(dados.bancarios);

  tituloSecao("HORÁRIO DE TRABALHO");
  tabela(
    ["Dia", "Manhã entrada/saída", "Tarde entrada/saída", "Carga diária"],
    dados.horario.map((h) => [h.dia, `${h.manhaEntrada} - ${h.manhaSaida}`, `${h.tardeEntrada} - ${h.tardeSaida}`, h.carga])
  );
  camposEm2Colunas([
    { label: "Horas semanais", valor: dados.horasSemanaisTotal },
    { label: "Horas mensais", valor: dados.horasMensaisTotal },
  ]);

  tituloSecao("BENEFÍCIO — VALE TRANSPORTE E VALE ALIMENTAÇÃO");
  camposEm2Colunas(dados.beneficios);

  const buffer = await workbook.xlsx.writeBuffer();
  const nomeArquivo = `ficha-admissao-${dados.nomeArquivoBase}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
