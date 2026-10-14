import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
} from "docx";
import { createClient } from "@/lib/supabase-server";
import { combinarDadosEmpresa } from "@/lib/dados-empresa";
import {
  baixarImagem,
  celulaAssinatura,
  dataPorExtenso,
  type ErroContratoPJ,
  type ResultadoContratoPJ,
  type SupabaseComStorage,
} from "@/lib/contrato-pj";
import type { Colaborador, ConfigAssinaturasPJ, Empresa } from "@/types/db";

// ------------------------------------------------------------
// Modelo "Contrato de Prestação de Serviços de Empreitada" — usado para
// colaboradores PJ da BDU (Barber Day University) na área COMERCIAL.
// Texto fiel à minuta enviada pelo RH. Só mudam: dados da contratada (nome,
// CNPJ, endereço), valor mensal e data.
//
// NÃO substitui o contrato dos barbeiros (departamento Atendimento): esse
// continua sendo o "Instrumento Particular de Parceria" em contrato-pj.ts.
// ------------------------------------------------------------

/** Valor da multa por rescisão sem aviso prévio (cláusula 10.1), exatamente como está na minuta.
 * ATENÇÃO: na minuta o número (R$ 1.500,00) e o extenso ("quatro mil e quinhentos reais") não batem.
 * Corrija aqui quando o jurídico decidir o valor certo. */
const MULTA_SEM_AVISO = "R$ 1.500,00 (quatro mil e quinhentos reais)";

// Dados da BDU que a minuta traz fixos — usados quando o cadastro da empresa
// (Projeção de Custo > Empresas / Unidades) ainda não está completo.
const BDU_RAZAO = "BARBERDAY - CENTRO DE TREINAMENTO PARA BARBEIROS LTDA";
const BDU_CNPJ = "55.581.259/0001-65";
const BDU_SEDE =
  "Alameda Rio Negro 500, Bloco 2, Andar 6, Salas 601 a 608 - Alphaville Centro Industrial – CEP 06.454-000, na cidade de Barueri/SP";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** PJ da BDU na área comercial (comercial ou vendas). Atendimento (barbeiros) nunca entra aqui. */
export function ehContratoComercialBDU(
  empresaNome: string | null | undefined,
  departamento: string | null | undefined
): boolean {
  const emp = semAcento(empresaNome ?? "");
  const dep = semAcento(departamento ?? "");
  const ehBdu = /\bbdu\b/.test(emp) || emp.includes("barber day") || emp.includes("barberday");
  const ehComercial = dep.includes("comercial") || dep.includes("vendas");
  return ehBdu && ehComercial && !dep.includes("atendimento");
}

// ---------- valor por extenso ----------

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else {
      const u = r % 10;
      partes.push(u ? `${DEZENAS[Math.floor(r / 10)]} e ${UNIDADES[u]}` : DEZENAS[Math.floor(r / 10)]);
    }
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n < 1000) return ate999(n);
  const m = Math.floor(n / 1000);
  const r = n % 1000;
  const mil = m === 1 ? "mil" : `${ate999(m)} mil`;
  if (!r) return mil;
  return `${mil}${r < 100 || r % 100 === 0 ? " e " : " "}${ate999(r)}`;
}

/** 4000 -> "R$ 4.000,00 (quatro mil reais)". Sem valor cadastrado: "R$ ________". */
export function valorMensalTexto(valor: number | null | undefined): string {
  if (!valor || valor <= 0 || valor >= 1_000_000) return "R$ ____________ (______________________)";
  const centavosTotal = Math.round(valor * 100);
  const reais = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;
  const numero = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let extenso = `${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}`;
  if (centavos) extenso += ` e ${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  if (reais === 0) extenso = `${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return `R$ ${numero} (${extenso})`;
}

// ---------- parágrafos ----------

type Parte = string | { t: string; b?: boolean };

function runs(partes: Parte[]): TextRun[] {
  return partes.map((p) =>
    typeof p === "string" ? new TextRun({ text: p, size: 22 }) : new TextRun({ text: p.t, bold: !!p.b, size: 22 })
  );
}

const titulo = (texto: string) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: texto, bold: true, size: 24 })],
  });

const secao = (texto: string) =>
  new Paragraph({
    spacing: { before: 240, after: 200 },
    keepNext: true,
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });

const clausula = (numero: string, partes: Parte[], recuo = 0) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 200 },
    indent: recuo ? { left: recuo } : undefined,
    children: [new TextRun({ text: `${numero} `, bold: true, size: 22 }), ...runs(partes)],
  });

const item = (rotulo: string, texto: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120 },
    indent: { left: 700, hanging: 350 },
    children: [new TextRun({ text: `${rotulo} `, size: 22 }), new TextRun({ text: texto, size: 22 })],
  });

const texto = (t: string, depois = 200) =>
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: depois }, children: [new TextRun({ text: t, size: 22 })] });

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

// ---------- geração ----------

export async function gerarContratoPjComercialDocx(
  colaborador: Colaborador,
  empresa: Empresa | null,
  config: ConfigAssinaturasPJ | null,
  supabaseParaImagens?: SupabaseComStorage
): Promise<ResultadoContratoPJ | ErroContratoPJ> {
  if (colaborador.tipo !== "PJ") {
    return { ok: false, motivo: "Esse contrato é só para colaboradores do tipo PJ." };
  }

  const supabase = supabaseParaImagens ?? createClient();
  // só a assinatura do próprio profissional entra: a contratante e as testemunhas assinam à mão
  // (config é mantido na assinatura da função para ficar igual ao outro modelo)
  void config;
  const profissional = await baixarImagem(supabase, colaborador.assinatura_pj_path);

  // dados da contratante: cadastro (Projeção de Custo > Empresas / Unidades) quando completo; senão os da minuta
  const cad = combinarDadosEmpresa(empresa, null);
  const cadCompleto = !!(cad.razao && cad.cnpj && cad.endereco && cad.numero && cad.cidade && cad.uf);
  const razao = cadCompleto ? cad.razao : BDU_RAZAO;
  const cnpjContratante = cadCompleto ? cad.cnpj : BDU_CNPJ;
  const cep = cad.cep || (cad.cnpj === BDU_CNPJ ? "06.454-000" : "");
  const sede = cadCompleto
    ? `${cad.endereco} ${cad.numero}${cad.complemento ? `, ${cad.complemento}` : ""}${cad.bairro ? ` - ${cad.bairro}` : ""}${
        cep ? ` – CEP ${cep}` : ""
      }, na cidade de ${cad.cidade}/${cad.uf}`
    : BDU_SEDE;

  const nome = colaborador.nome || "—";
  const cnpj = colaborador.cpf_cnpj || "—";
  const endereco = colaborador.endereco || "—";
  const valor = valorMensalTexto(colaborador.valor_nota_fiscal);
  const dataContrato = dataPorExtenso(colaborador.contrato_inicio);

  const rodape = new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA,
          insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA,
        },
        rows: [
          new TableRow({
            children: [
              celulaAssinatura("Visto da Contratante", null),
              celulaAssinatura("Visto da Contratada", profissional),
              celulaAssinatura("Testemunha 1", null),
              celulaAssinatura("Testemunha 2", null),
            ],
          }),
        ],
      }),
    ],
  });

  const c: (Paragraph | Table)[] = [];

  c.push(titulo("CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE EMPREITADA"));

  c.push(secao("I – DAS PARTES"));
  c.push(
    clausula("1.1.", [
      { t: razao, b: true },
      `, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cnpjContratante}, com sede na ${sede}, neste ato representado por seu sócio administrador, a Sr. Elias Torres da Silva, com endereço profissional na sede da representada, neste ato denominada apenas CONTRATANTE; e`,
    ])
  );
  c.push(
    clausula("1.2.", [
      { t: nome, b: true },
      ", pessoa jurídica de direito privado, inscrito no CNPJ sob o nº ",
      { t: cnpj, b: true },
      `, com registro na ${endereco}, neste ato representada por seu titular `,
      { t: nome, b: true },
      " com endereço comercial na sede da representada, neste ato denominada CONTRATADA.",
    ])
  );

  c.push(secao("II – DO OBJETO"));
  c.push(
    clausula("2.1.", [
      "O presente contrato tem por objeto a prestação de serviços técnicos da CONTRATADA à CONTRATANTE para desenvolvimento de promoção de vendas para o Barber Day University.",
    ])
  );

  c.push(secao("III – DO PRAZO DE VIGÊNCIA"));
  c.push(
    clausula("3.1.", [
      "O presente instrumento tem prazo de vigência no ato da assinatura por período indeterminado, havendo desinteresse em uma das partes na continuidade do contrato, que seja mediante ao aviso com 30 dias de antecedência.",
    ])
  );

  c.push(secao("IV – DO PREÇO E DA FORMA DE PAGAMENTO"));
  c.push(
    clausula("4.1.", [
      "A CONTRATANTE pagará à CONTRATADA pela prestação dos serviços ora contratados o importe de ",
      { t: valor, b: true },
      ".",
    ])
  );
  c.push(
    clausula(
      "4.1.1.",
      [
        "O pagamento do valor acordado ocorrerá mediante transferência Bancária, acompanhado do respectivo documento fiscal, a ser enviado à CONTRATANTE com antecedência mínima de 05 dias do vencimento.",
      ],
      500
    )
  );
  c.push(
    clausula(
      "4.1.2.",
      [
        "Juntamente com o documento fiscal, a CONTRATADA deverá fazer prova dos recolhimentos previdenciários e encargos sobre a folha de pagamento dos colaboradores empenhados na prestação de serviço objeto deste contrato, sob pena de suspensão do pagamento até a efetiva comprovação.",
      ],
      500
    )
  );
  c.push(clausula("4.1.3.", ["O pagamento do valor acordado ocorrerá no dia 10 de cada mês."], 500));
  c.push(
    clausula("4.2.", [
      "Em caso de inadimplemento de quaisquer das parcelas acima pactuadas a CONTRATANTE arcará com multa de 2% (dois inteiros por cento) e juros moratórios de 1% (um inteiro por cento) ao mês, pro rata die, sobre o valor da(s) parcela(s) em atraso, atualizada(s) monetariamente pela variação do INPC, pro rata die.",
    ])
  );
  c.push(
    clausula("4.3.", [
      "O valor acima será automaticamente atualizado a cada 12 meses aplicando-se a variação acumulada no período pelo Índice Geral de Preço do Mercado – IGPM/FGV, divulgado pela Fundação Getúlio Vargas, ou outro que vier a lhe substituir.",
    ])
  );

  c.push(secao("V – DAS DESPESAS PARA A EXECUÇÃO DO CONTRATO"));
  c.push(
    clausula("5.1.", [
      "As despesas para a execução do presente contrato correrão por conta exclusiva da CONTRATADA. Fica claro que a CONTRATANTE não adiantará tão pouco arcará com qualquer despesa de responsabilidade da CONTRATADA.",
    ])
  );

  c.push(secao("VI – DA RELAÇÃO ENTRE OS CONTRATANTES"));
  c.push(
    clausula("6.1.", [
      "A presente contratação não configura Relação de Trabalho conforme definida em lei específica, estando sujeita, portanto, às disposições relativas ao Contrato de Prestação de Serviço descrito nos artigos 593 e seguintes da Lei 10.406/02 (Novo Código Civil).",
    ])
  );

  c.push(secao("VII – DA EXECUÇÃO DOS SERVIÇOS"));
  c.push(
    clausula("7.1.", [
      "A CONTRATADA se obriga a executar os serviços contratados com a melhor técnica e sempre de acordo com as diretrizes informadas pela CONTRATANTE e nos prazos estabelecidos pelas PARTES conforme cronograma/planejamento estipulado.",
    ])
  );
  c.push(
    clausula("7.2.", [
      "A CONTRATADA está livre ao exercício dos trabalhos quanto à forma de execução, estando vinculada, contudo, às políticas internas da empresa e sujeita a validação pela CONTRATANTE sempre que esta solicitar.",
    ])
  );

  c.push(secao("VIII – DAS DEMAIS OBRIGAÇÕES DAS PARTES"));
  c.push(clausula("8.1.", ["Além das obrigações previstas neste instrumento a CONTRATANTE se obriga a:"]));
  c.push(item("a)", "Pagar em tempo hábil e conforme ajustado neste instrumento os valores devidos à CONTRATADA;"));
  c.push(item("b)", "Fazer cumprir o presente instrumento na melhor forma possível, dentro dos princípios da boa-fé e melhor prática de mercado."));
  c.push(item("c)", "Fornecer, tempestivamente, todos os elementos, informações e documentos necessários à execução do serviço contratado."));
  c.push(clausula("8.2.", ["De igual forma, além das obrigações previstas neste instrumento, a CONTRATADA se obriga a:"]));
  c.push(item("a)", "Prestar os serviços na melhor forma e técnica zelando pela segurança jurídica e contratual do CONTRATANTE;"));
  c.push(item("b)", "Disponibilizar seu corpo pessoal, técnico e estrutura, comprometendo-se a despender todos os esforços possíveis e necessários à boa execução do objeto da contratação;"));
  c.push(item("c)", "Responder junto aos seus mandatários ou subordinados por obrigações a eles transmitidas em razão da execução dos serviços ora contratados;"));
  c.push(item("d)", "Manter-se habilitada e qualificada para a execução dos serviços contratados;"));
  c.push(
    item(
      "e)",
      "Responsabilizar-se por todos os encargos de natureza trabalhista, previdenciário, tributário, cível, administrativo ou outro de qualquer natureza, por ações ou omissões praticadas por seus prepostos, empregados, funcionários, sócios, prestadores de serviços ou quaisquer terceiros que participem da execução, ainda que parcial, direta ou indiretamente, do objeto deste contrato, por determinação ou contratação realizada pela CONTRATADA;"
    )
  );
  c.push(item("f)", "Recolher toda e qualquer taxa, imposto, encargos, emolumentos que incidirem sobre este contrato;"));
  c.push(item("g)", "Cumprir e fazer cumprir o presente instrumento na melhor forma possível, dentre dos princípios da boa-fé e melhor prática de mercado."));

  c.push(secao("IX – DAS PENALIDADES"));
  c.push(
    clausula("9.1.", [
      "A parte que infringir as disposições presentes neste instrumento arcará com multa estipulada em 5% (cinco por cento) do valor anual deste contrato, após notificação e sem prejuízo da possibilidade de Rescisão de Pleno Direito e a cobrança extrajudicial ou judicial de prejuízos apurados.",
    ])
  );

  c.push(secao("X – DA RESCISÃO CONTRATUAL"));
  c.push(
    clausula("10.1.", [
      `As PARTES convencionam que o presente instrumento poderá ser rescindido, desde que seja mediante a notificação da parte interessada à outra com no mínimo 30 (trinta) dias de antecedência, caso, uma das partes encerra o contrato sem o aviso prévio, pagará o valor de contrato ${MULTA_SEM_AVISO}.`,
    ])
  );

  c.push(secao("XI – CONFIDENCIALIDADE"));
  c.push(
    clausula("11.1.", [
      "Pelo presente instrumento particular, a CONTRATADA se compromete a guardar sob o mais absoluto sigilo sobre todas e quaisquer informações que tiver acesso, da CONTRATANTE ou mesmo de terceiros, incluindo, mas não se limitando a:",
    ])
  );
  c.push(item("a)", "Projetos desenvolvidos, produzidos ou comercializados pela CONTRATANTE ou por terceiros, por ela contratados;"));
  c.push(
    item(
      "b)",
      "Quaisquer informações pessoais ou profissionais da CONTRATADA ou de terceiros, sejam eles funcionários, prepostos, prestadores de serviços, clientes, contratantes, contratados, parceiros comerciais ou outros, inclusive os(as) sócios(as) da CONTRATANTE, que mantenham com ela relação contratual, negocial ou legal;"
    )
  );
  c.push(item("c)", "Preços de custos de produtos, procedimentos, serviços contratados ou prestados, remunerações de funcionários ou prestadores de serviços;"));
  c.push(
    item(
      "d)",
      "Estratégias de atuação no mercado interno e/ou externo, sejam elas relativas às medidas adotadas interna ou externamente pela CONTRATANTE, inclusive, descontos fornecidos a terceiros quanto aos produtos ou serviços comercializados;"
    )
  );
  c.push(
    item(
      "e)",
      "Layout, imagens, ações de marketing, propaganda, marcas de produtos e/ou serviços fornecidos pela CONTRATANTE, que ainda não estejam implantadas e em circulação pública;"
    )
  );
  c.push(
    item(
      "f)",
      "Dados financeiros das empresas, de seus(as) sócios(as), de funcionários, prepostos, prestadores de serviços, contratantes, contratados ou de quaisquer pessoas, físicas ou jurídicas, que mantenham relação contratual ou legal com a CONTRATANTE."
    )
  );
  c.push(
    clausula("11.2.", [
      "Caso seja estritamente necessário revelar as informações referidas nesse instrumento, ainda que a funcionários, prepostos ou colaboradores, deverá a PARTE reveladora, requerer expressa autorização à detentora da informação e garantir que o presente termo seja aderido pelo receptor da informação sigilosa.",
    ])
  );
  c.push(
    clausula("11.3.", [
      "A CONTRATADA se compromete a diligenciar para que os seus empregados, sócios, prepostos, prestadores de serviços e/ou colaboradores, que tomarem conhecimento das informações sigilosas, estratégicas ou confidencias da CONTRATANTE não as divulguem a terceiros alheios ao objeto do presente Contrato, responsabilizando-se pelas perdas e danos que eventuais divulgações indevidas causarem, inclusive quanto a multas contratuais previstas neste instrumento ou quanto à responsabilização civil verificada por meio de decisão judicial ou extrajudicial.",
    ])
  );
  c.push(
    clausula("11.4.", [
      "Se eventualmente a CONTRATADA for obrigada, por decisão judicial, a revelar informação sigilosa, deverá, antes da revelação, garantir o conhecimento da CONTRATANTE, bem como fazer com que o receptor tenha conhecimento do presente instrumento.",
    ])
  );
  c.push(
    clausula("11.5.", [
      "O descumprimento quanto à divulgação ou reprodução de dados ou informações sigilosas, confidencias ou estratégicas ensejará a responsabilização da CONTRATADA por danos materiais e lucros cessantes, que serão oportunamente aferidos, além de multa não compensatória no importe de R$ 100.000,00 (Cem mil reais).",
    ])
  );
  c.push(
    clausula("11.6.", [
      "Ressalvas as informações destacadas como não sigilosa, somente não estão alcançadas pelo presente instrumento as informações de conhecimento público ou que venham a ser publicados, salvo se tal publicação ocorrer em infração ao presente instrumento.",
    ])
  );

  c.push(secao("XII – DAS DEMAIS DISPOSIÇÕES"));
  c.push(
    clausula("12.1.", [
      "As comunicações necessárias em razão deste Contrato serão feitas pelas PARTES sempre por escrito, por intermédio de carta registrada, e-mail, fax com confirmação de recebimento, telegrama, serviço de courier com registro-protocolo de recebimento, ou ainda, via cartório, observando-se os endereços e dados constantes no preâmbulo deste instrumento.",
    ])
  );
  c.push(
    clausula(
      "12.1.1.",
      ["Toda e qualquer alteração nos dados mencionados no item anterior desta Cláusula deverá ser imediatamente informada por escrito à outra parte."],
      500
    )
  );
  const geral: Array<[string, string, string]> = [
    ["12.2.", "TOTALIDADE DAS AVENÇAS: ", "O presente Contrato contém a totalidade das avenças e entendimentos havidos entre as PARTES."],
    ["12.3.", "ALTERAÇÃO: ", "O presente Contrato somente poderá ser alterado por intermédio de instrumento escrito e assinado pelas PARTES."],
    [
      "12.4.",
      "AUTONOMIA: ",
      "Caso qualquer disposição deste Contrato seja considerada nula, anulável, inválida ou ineficaz, as demais disposições deste Contrato permanecerão em pleno vigor, válidas e exequíveis, devendo as PARTES negociarem um ajuste equânime da disposição considerada nula, anulável, inválida ou ineficaz de modo a assegurar a respectiva validade e exequibilidade.",
    ],
    [
      "12.5.",
      "TOLERÂNCIA: ",
      "Fica expressamente convencionado que não constituirá Novação, Compensação ou Transação a abstenção do exercício de qualquer poder, direito, recurso ou faculdade assegurados por lei ou por este instrumento, nem a eventual tolerância de atraso no cumprimento de quaisquer das obrigações aqui pactuadas, fato que não impedirá que a parte, a seu exclusivo critério, venha a exercê-los a qualquer momento.",
    ],
    ["12.6.", "CESSÃO: ", "O presente Contrato não poderá ser cedido ou transferido a qualquer título para terceiros sem o prévio e expresso consentimento por escrito das PARTES."],
    ["12.7.", "EFEITO VINCULANTE: ", "O presente Contrato é celebrado em caráter irrevogável e irretratável."],
    ["12.8.", "SUCESSÃO: ", "O presente Contrato obriga as PARTES e seus sucessores a qualquer título."],
    [
      "12.9.",
      "EXECUÇÃO ESPECÍFICA: ",
      "As obrigações assumidas pelas PARTES neste Contrato estão sujeitas a execução específica de acordo com as regras contidas nos artigos 771 e seguintes do Código de Processo Civil Brasileiro, a qual poderá ser exigida por qualquer uma das Partes.",
    ],
    ["12.10.", "REGÊNCIA: ", "O presente Contrato é regido e interpretado de acordo com as leis brasileiras."],
    [
      "12.11.",
      "MELHORES ESFORÇOS: ",
      "As PARTES envidarão seus melhores esforços para solucionar, de boa-fé e com observância de seus mútuos interesses, qualquer litígio, disputa ou reivindicação resultante de, ou relativa a, este Termo, seu não-cumprimento e/ou sua validade.",
    ],
    [
      "12.12.",
      "FORO: ",
      "Fica desde já eleito, com a renúncia de quaisquer outros, por mais privilegiados que sejam, o Foro da Comarca de Belo Horizonte, Estado de Minas Gerais, para dirimir quaisquer controvérsias oriundas do presente Termo ou de quaisquer contratos, documentos ou acordos a ele relacionados.",
    ],
  ];
  for (const [num, rot, corpo] of geral) c.push(clausula(num, [{ t: rot, b: true }, corpo]));

  c.push(
    texto(
      "E por estarem assim justas e contratadas, firmam o presente Termo em 02 (duas) vias de igual teor e forma, na presença das 2 (duas) testemunhas abaixo identificadas, para que produzam todos os seus efeitos legais.",
      300
    )
  );
  c.push(texto(`Belo Horizonte/MG, ${dataContrato}.`, 700));

  const centro = (t: string, negrito: boolean, depois: number) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: depois },
      children: [new TextRun({ text: t, bold: negrito, size: 22 })],
    });

  c.push(centro(razao, true, 20));
  c.push(centro(`CNPJ nº ${cnpjContratante}`, false, 700));

  if (profissional) {
    c.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new ImageRun({ type: profissional.tipo, data: profissional.bytes, transformation: { width: 130, height: 50 } })],
      })
    );
  }
  c.push(centro(nome, true, 20));
  c.push(centro(`CNPJ sob o nº ${cnpj}`, false, 700));

  c.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "TESTEMUNHAS:", bold: true, size: 22 })] }));
  const bloco = () =>
    ["NOME:", "RG:", "CPF:", "END.:"].map((r) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: r, size: 22 })] }));
  c.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA,
        insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA,
      },
      rows: [
        new TableRow({
          children: [0, 1].map(
            () =>
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA },
                children: bloco(),
              })
          ),
        }),
      ],
    })
  );

  const doc = new Document({ sections: [{ properties: {}, footers: { default: rodape }, children: c }] });
  const buffer = await Packer.toBuffer(doc);
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return { ok: true, buffer, nomeArquivo: `contrato-prestacao-servicos-${base || "colaborador"}.docx` };
}
