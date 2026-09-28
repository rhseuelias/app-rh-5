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
  ImageRun,
  BorderStyle,
  VerticalAlign,
} from "docx";
import { createClient } from "@/lib/supabase-server";
import type { Colaborador, ConfigAssinaturasPJ } from "@/types/db";

// Aceita tanto o cliente autenticado (createClient) quanto o cliente admin
// (createAdminClient, usado no fluxo público do link de assinatura, que não
// tem sessão de login) — só precisamos do .storage daqui.
type SupabaseComStorage = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
    };
  };
};

// ------------------------------------------------------------
// Esse arquivo monta o "Instrumento Particular de Parceria" (contrato PJ)
// no modelo que a Barbearia Seu Elias usa hoje, trocando só os dados que
// variam por colaborador (nome, CNPJ, endereço, comissões e data) — todo o
// resto do texto (cláusulas, dados do salão, testemunhas) é fixo, igual ao
// modelo em PDF que foi enviado.
//
// IMPORTANTE: esse modelo é de Minas Gerais (SEU ELIAS BARBA, CABELO E
// BIGODE LTDA, foro de Belo Horizonte). Colaboradores da unidade Alphaville
// são de outro estado e usam outro contrato — ver ehAlphaville() abaixo.
// ------------------------------------------------------------

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-09-21" -> "21 de setembro de 2026". Sem data cadastrada, usa hoje. */
function dataPorExtenso(iso: string | null): string {
  const base = iso && iso.length >= 10 ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = base.split("-").map(Number);
  const diaSemZero = String(dia).replace(/^0/, "");
  return `${diaSemZero} de ${MESES[mes - 1] ?? ""} de ${ano}`;
}

const COMISSAO_EXTENSO: Record<number, string> = {
  33: "trinta e três por cento",
  35: "trinta e cinco por cento",
  38: "trinta e oito por cento",
  40: "quarenta por cento",
  50: "cinquenta por cento",
};

function comissaoTexto(pct: number | null): string {
  if (!pct) return "—";
  const extenso = COMISSAO_EXTENSO[pct] ?? `${pct} por cento`;
  return `${pct}% (${extenso})`;
}

/** Verifica pelo nome da unidade se é a Alphaville (outro estado — outro
 * contrato, ainda não configurado aqui). Ignora acento/maiúscula. */
export function ehAlphaville(nomeUnidade: string | null | undefined): boolean {
  if (!nomeUnidade) return false;
  const normalizado = nomeUnidade
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return normalizado.includes("alphaville");
}

function tipoImagemDocx(bytes: Uint8Array): "png" | "jpg" | "gif" | "bmp" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return "png"; // desconhecido — chute seguro, a maioria dos uploads é print/png
}

async function baixarImagem(
  supabase: SupabaseComStorage,
  path: string | null | undefined
): Promise<{ bytes: Uint8Array; tipo: "png" | "jpg" | "gif" | "bmp" } | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from("documentos").download(path);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return { bytes, tipo: tipoImagemDocx(bytes) };
  } catch {
    return null;
  }
}

/** Uma assinatura dentro de uma célula do rodapé: imagem (se tiver) em cima
 * da linha, com o rótulo embaixo — igual ao modelo em PDF. */
function celulaAssinatura(
  rotulo: string,
  imagem: { bytes: Uint8Array; tipo: "png" | "jpg" | "gif" | "bmp" } | null
): TableCell {
  const filhos: Paragraph[] = [];

  if (imagem) {
    filhos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new ImageRun({
            type: imagem.tipo,
            data: imagem.bytes,
            transformation: { width: 85, height: 34 },
          }),
        ],
      })
    );
  }

  filhos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "________________", size: 14 })],
    })
  );
  filhos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: rotulo, size: 14 })],
    })
  );

  return new TableCell({
    children: filhos,
    verticalAlign: VerticalAlign.BOTTOM,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });
}

// ------------------------------------------------------------
// Helpers de parágrafo
// ------------------------------------------------------------

function titulo(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: texto, bold: true, size: 24 })],
  });
}

function secao(numero: string, texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: `${numero}\t${texto}`, bold: true, size: 22 })],
  });
}

/** Cláusula numerada comum, com trechos em negrito quando precisar destacar
 * um dado que foi trocado (nome, CNPJ, endereço, comissão, etc.). */
function clausula(numero: string, partes: Array<string | { t: string; b?: boolean }>): Paragraph {
  const runs: TextRun[] = [new TextRun({ text: `${numero}\t`, bold: true, size: 22 })];
  for (const parte of partes) {
    if (typeof parte === "string") {
      runs.push(new TextRun({ text: parte, size: 22 }));
    } else {
      runs.push(new TextRun({ text: parte.t, bold: !!parte.b, size: 22 }));
    }
  }
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 }, children: runs });
}

function letra(rotulo: string, texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 500 },
    spacing: { after: 120 },
    children: [
      new TextRun({ text: `${rotulo}\t`, bold: true, size: 22 }),
      new TextRun({ text: texto, size: 22 }),
    ],
  });
}

function paragrafo(texto: string, opts: { after?: number; center?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 200 },
    children: [new TextRun({ text: texto, size: 22 })],
  });
}

// ------------------------------------------------------------
// Geração do documento
// ------------------------------------------------------------

export interface ResultadoContratoPJ {
  ok: true;
  buffer: Buffer;
  nomeArquivo: string;
}

export interface ErroContratoPJ {
  ok: false;
  motivo: string;
}

export async function gerarContratoPjDocx(
  colaborador: Colaborador,
  nomeUnidade: string | null,
  config: ConfigAssinaturasPJ | null,
  supabaseParaImagens?: SupabaseComStorage
): Promise<ResultadoContratoPJ | ErroContratoPJ> {
  if (colaborador.tipo !== "PJ") {
    return { ok: false, motivo: "Esse contrato é só para colaboradores do tipo PJ." };
  }
  if (ehAlphaville(nomeUnidade)) {
    return {
      ok: false,
      motivo:
        "Esse modelo de contrato é de Minas Gerais e não vale para a unidade Alphaville (outro estado). Ainda não temos o modelo do contrato da Alphaville cadastrado.",
    };
  }

  const supabase = supabaseParaImagens ?? createClient();

  const [salao, testemunha1, testemunha2, profissional] = await Promise.all([
    baixarImagem(supabase, config?.assinatura_salao_path),
    baixarImagem(supabase, config?.assinatura_testemunha1_path),
    baixarImagem(supabase, config?.assinatura_testemunha2_path),
    baixarImagem(supabase, colaborador.assinatura_pj_path),
  ]);

  const nome = colaborador.nome || "—";
  const cnpj = colaborador.cpf_cnpj || "—";
  const endereco = colaborador.endereco || "—";
  const dataContrato = dataPorExtenso(colaborador.contrato_inicio);
  const comissaoCorte = comissaoTexto(colaborador.comissao_corte_pct);
  const comissaoQuimica = comissaoTexto(colaborador.comissao_quimica_pct);

  const rodape = new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
          new TableRow({
            children: [
              celulaAssinatura("Salão Parceiro", salao),
              celulaAssinatura("Prof. Parceiro", profissional),
              celulaAssinatura("Testemunha 1", testemunha1),
              celulaAssinatura("Testemunha 2", testemunha2),
            ],
          }),
        ],
      }),
    ],
  });

  const corpo: (Paragraph | Table)[] = [];

  corpo.push(
    titulo(
      "INSTRUMENTO PARTICULAR DE PARCEIRA ENTRE SALÃO-PARCEIRO E PROFISSIONAL PARCEIRO PARA OS FINS QUE ESPECIFICA."
    )
  );

  corpo.push(secao("1.", "DAS PARTES"));
  corpo.push(
    clausula("1.1.", [
      { t: nome, b: true },
      ", brasileiro, barbeiro, inscrito sob o CNPJ n° ",
      { t: cnpj, b: true },
      ", registrado no ",
      { t: `endereço na ${endereco}`, b: true },
      ", doravante denominado PROFISSIONAL PARCEIRO:",
    ])
  );
  corpo.push(
    clausula("1.2.", [
      "SEU ELIAS BARBA, CABELO E BIGODE LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 18.713.580/0001-20, com seus atos constitutivos registrados na JUCEMG, com sede na Rua Zilah Correa de Araujo, 268 -loja 56 – Ouro Preto, Belo Horizonte - MG, CEP n° 31310-450, doravante denominado SALÃO PARCEIRO",
    ])
  );

  corpo.push(secao("2.", "DO OBJETO"));
  corpo.push(
    clausula("2.1.", [
      'O SALÃO-PARCEIRO ajusta com o PROFISSIONAL-PARCEIRO uma PARCERIA, através da qual o PROFISSIONAL-PARCEIRO, utilizando-se de suas ferramentas próprias e conhecimentos específicos na área de barbeiro, somará esforços com o SALÃO-PARCEIRO, incluindo "know how", capacidade financeira, direitos de exploração de ponto comercial, clientela e mão de obra, para atingirem os objetivos da prestação de serviços na área acima especificada.',
    ])
  );
  corpo.push(
    clausula("2.2.", [
      "O PROFISSIONAL-PARCEIRO é profissional autônomo, sem qualquer vínculo empregatício e atenderá seus clientes utilizando a estrutura física da SALÃO-PARCEIRO que é composta de:",
    ])
  );
  corpo.push(letra("a)", "Cadeiras específicas para barbeiros, bancadas, espelhos e armários;"));
  corpo.push(letra("b)", "Serviços de recepcionista;"));
  corpo.push(letra("c)", "Lavatórios;"));
  corpo.push(letra("d)", "Área para refeição;"));
  corpo.push(letra("e)", "Programa específico para agendamento e controle dos recebimentos;"));
  corpo.push(letra("f)", "Xampus, cremes e produtos, não incluindo ferramentas, tais como máquinas, tesouras, etc,;"));
  corpo.push(letra("g)", "Serviços de contabilidade; e"));
  corpo.push(letra("h)", "Outros serviços ou equipamentos necessários a execução dos serviços."));

  corpo.push(secao("3.", "DA VIGÊNCIA"));
  corpo.push(clausula("3.1.", ["O presente instrumento vigorará no prazo de 12 meses."]));

  corpo.push(secao("4.", "DAS CONDIÇÕES DA PARCERIA"));
  corpo.push(
    clausula("4.1.", [
      "Os serviços serão executados pelo PROFISSIONAL-PARCEIRO conforme a sua disponibilidade e conveniência, de forma totalmente independente, a clientes previamente agendados nos horários e nos dias estabelecidos pelo PROFISSIONAL-PARCEIRO, de comum acordo com os demais profissionais que executam idêntica atividade no mesmo local e sob as mesmas condições ora conveniadas.",
    ])
  );
  corpo.push(
    clausula("4.2.", [
      "Os serviços poderão ser executados em quaisquer das unidades do SALÃO-PARCEIRO, incluindo todas suas filiais. O local será previamente acordado entre as partes e descrito através de sistema de controle ou comunicação diversa.",
    ])
  );
  corpo.push(
    clausula("4.3.", [
      "O PROFISSIONAL-PARCEIRO executará os serviços dentro das instalações da SALÃO-PARCEIRO, porém utilizará de suas próprias ferramentas de trabalho, do modo e no tempo que lhe convier dentro das regras da PARCERIA.",
    ])
  );
  corpo.push(
    clausula("4.4.", [
      "O horário de funcionamento do SALÃO PARCEIRO será das 09:00 às 20:00 horas de segunda a sexta e 08:00 às 18:00 aos sábados.",
    ])
  );

  corpo.push(secao("5.", "DAS CONDIÇÕES E PERIODICIDADE DE PAGAMENTO DO PROFISSIONAL-PARCEIRO"));
  corpo.push(
    clausula("5.1.", [
      "Os preços pelos serviços oferecidos e prestados serão fixados pelo SALÃO-PARCEIRO, considerando as condições de custos, precificação e condições de mercado.",
    ])
  );
  corpo.push(
    clausula("5.2.", [
      "O SALÃO-PARCEIRO por intermédio de sua estrutura de controle de serviços prestados, apresentará ao PROFISSIONAL-PARCEIRO todos os serviços prestados de maneira comum.",
    ])
  );
  corpo.push(
    clausula("5.3.", [
      "O relatório de serviços previsto no item anterior será apresentado mensalmente pelo SALÃO-PARCEIRO para aprovação do PROFISSIONAL-PARCEIRO o qual, após análise, solicitará a liquidação do saldo.",
    ])
  );
  corpo.push(
    clausula("5.4.", [
      "O prazo previsto no item 5.3 poderá ser alterado a qualquer momento, bastando para isso uma manifestação por parte do PROFISSIONAL-PARCEIRO por escrito, solicitando a alteração.",
    ])
  );
  corpo.push(
    clausula("5.5.", [
      "A cota parte a ser paga para o PROFISSIONAL-PARCEIRO será um percentual, sobre o faturamento bruto, conforme demonstrado abaixo:",
    ])
  );
  corpo.push(
    letra(
      "a)",
      `Cortes com tesoura, cortes a máquina, corte e barba, barba, pezinho e sobrancelha – ${comissaoCorte};`
    )
  );
  corpo.push(
    letra(
      "b)",
      `Selagem, relaxamento, tintura, hidratação, progressiva na franja, camuflagem, cabelos brancos, luzes, escova, platinado e demais serviços não constantes anteriormente – ${comissaoQuimica}.`
    )
  );
  corpo.push(
    clausula("5.6.", [
      "Conforme acordado entre as partes SALÃO-PARCEIRO e PROFISSIONAL-PARCEIRO fica estabelecido o 5° (quinto) dia útil do mês subsequente ao período em que o PROFISSIONAL-PARCEIRO tenha exercido suas atividades laborais para o pagamento dos mesmos, observada a data de liquidação dos serviços executados e cobrados em cartão de débito e/ou crédito. Nesta hipótese, o pagamento fica condicionado ao recebimento da operadora do cartão.",
    ])
  );
  corpo.push(
    clausula("5.7.", [
      "Os pagamentos serão realizados através de transferência bancária para a conta que o PROFISSIONAL-PARCEIRO indicar, com a ressalva que a conta tem que ser vinculada ao CNPJ deste contrato de parceria.",
    ])
  );
  corpo.push(
    clausula("5.8.", [
      "As notas fiscais deverão ser entregues até antes desta data. Caso a nota não seja enviada o pagamento não será liberado até a entrega da mesma.",
    ])
  );
  corpo.push(
    clausula("5.9.", [
      "Os valores das Notas Fiscais a serem entregues pelos PROFISSIONAIS-PARCEIROS serão enviados até o 2° dia útil pelo do gerente da unidade.",
    ])
  );

  corpo.push(secao("6.", "DOS DEVERES DO SALÃO PARCEIRO"));
  corpo.push(
    clausula("6.1.", [
      "Manter estrutura de controle para os recebimentos centralizados e demonstrativos dos serviços efetuados em parceria, a fim de prestar contas juntos aos PROFISSIONAIS-PARCEIROS.",
    ])
  );
  corpo.push(
    clausula("6.2.", [
      "Manter o ambiente de trabalho dentro das condições de higiene e limpeza, com os equipamentos necessários ao desenvolvimento da atividade em perfeita condição de uso.",
    ])
  );
  corpo.push(
    clausula("6.3.", [
      "Manter aberta a estrutura física de prestação de serviços, salvo casos de força maior, casos fortuitos ou determinações dos Órgãos Públicos.",
    ])
  );
  corpo.push(
    clausula("6.4.", [
      "Manter recepcionista e profissionais para gerenciar a agenda dos PROFISSIONAIS-PARCEIROS, conforme interesse e disponibilidade destes.",
    ])
  );
  corpo.push(
    clausula("6.5.", [
      "Para cumprimento do disposto acima o PROFISSIONAL-PARCEIRO informará as datas e horários disponíveis em sua agenda previamente.",
    ])
  );
  corpo.push(
    clausula("6.6.", [
      "Realizar a retenção de sua cota-parte percentual, fixada no contrato de parceria, bem como dos valores de recolhimento de tributos e contribuições sociais e previdenciárias devidas pelo profissional-parceiro incidentes sobre a cota-parte que a este couber na parceria.",
    ])
  );

  corpo.push(secao("7.", "DOS DEVERES DO PROFISSIONAL PARCEIRO"));
  corpo.push(
    clausula("7.1.", [
      "Os PROFISSIONAIS-PARCEIROS deverão ser qualificados, perante as autoridades fazendárias, como pequenos empresários, microempresários ou microempreendedores individuais.",
    ])
  );
  corpo.push(clausula("7.2.", ["Manter da regularidade de sua inscrição perante as autoridades fazendárias."]));
  corpo.push(
    clausula("7.3.", ["Apresentar regularidade fiscal a fim de garantir a segurança fiscal necessária da parceria."])
  );
  corpo.push(
    clausula("7.4.", [
      "Cumprir todas as exigências sanitárias estabelecidas pela ANVISA. Também se responsabilizar por atos de imperícia e negligência que vier causar dano aos clientes, independente de dolo ou culpa.",
    ])
  );
  corpo.push(
    clausula("7.5.", [
      "Cumprir com o agendamento feito a fim de manter o bom atendimento e a prestação de serviços com a qualidade ofertada pelo SALÃO-PARCEIRO.",
    ])
  );
  corpo.push(
    clausula("7.6.", [
      "O profissional-parceiro não poderá assumir as responsabilidades e obrigações decorrentes da administração da pessoa jurídica do salão-parceiro, de ordem contábil, fiscal, trabalhista e previdenciária incidentes, ou quaisquer outras relativas ao funcionamento do negócio.",
    ])
  );

  corpo.push(secao("8.", "DA RESCISÃO CONTRATUAL"));
  corpo.push(
    clausula("8.1.", [
      "O presente contrato poderá ser rescindido unilateralmente, sem nenhum prejuízo às PARTES desde que seja comunicada com antecedência mínima de 30 dias.",
    ])
  );
  corpo.push(
    clausula("8.2.", [
      "Ensejará a rescisão contratual a parte que descumprir qualquer das cláusulas estabelecidas neste contrato ou infringir disposição legal, bem como agir de má-fé.",
    ])
  );

  corpo.push(secao("9.", "CLÁUSULA DE NÃO RECRUTAMENTO"));
  corpo.push(
    clausula("9.1.", [
      "Fica estabelecida a CLÁUSULA DE NÃO RECRUTAMENTO, pela qual o PROFISSIONAL PARCEIRO se obriga, em caso de eventual encerramento da parceria existente, a não recrutar profissionais, empregados, parceiros, colaboradores, enfim, qualquer pessoa que componha o staff do GRUPO SEU ELIAS pelo período de 24 (vinte e quatro) meses, contados da data da rescisão do Instrumento de Parceria.",
    ])
  );
  corpo.push(
    clausula("9.2.", [
      "Estabelece-se, também, o compromisso de não contactar, captar, prospectar clientes das BARBEARIAS SEU ELIAS.",
    ])
  );
  corpo.push(
    clausula("9.3.", [
      "Em caso de descumprimento da obrigação de não fazer estabelecida nesta cláusula, será devida multa não compensatória equivalente a 30% (trinta inteiros por cento) do faturamento do PROFISSIONAL PARCEIRO nos últimos doze meses de vigência do Instrumento de Parceria, além das perdas e danos eventualmente apuradas.",
    ])
  );

  corpo.push(secao("10.", "CLÁUSULA DE CONFIDENCIALIDADE"));
  corpo.push(
    clausula("10.1.", [
      "Pelo presente instrumento particular, o PROFISSIONAL PARCEIRO se compromete a guardar sob o mais absoluto sigilo sobre todas e quaisquer informações que tiver acesso, seja do SALÃO PARCEIRO ou mesmo de terceiros, incluindo, mas não se limitando a:",
    ])
  );
  corpo.push(letra("a)", "Formulações de todos produtos desenvolvidos, produzidos ou comercializados;"));
  corpo.push(
    letra(
      "b)",
      "Informações relativas aos cursos, palestras, aulas, exposições, congressos, feiras ou outros atos semelhantes, antes de se tornarem públicos, realizados ou preparados pelo SALÃO PARCEIRO, por seus(as) sócios(as), funcionários, prepostos ou outros;"
    )
  );
  corpo.push(
    letra(
      "c)",
      "Quaisquer informações pessoais ou profissionais de terceiros, sejam eles funcionários, prepostos, prestadores de serviços, clientes, contratantes, contratados, parceiros comerciais ou outros, inclusive os(as) sócios(as) do SALÃO PARCEIRO;"
    )
  );
  corpo.push(
    letra(
      "d)",
      "Preços de custos de produtos, cursos, palestras, exposições, congressos, feiras, procedimentos, serviços contratados ou prestados, remunerações de funcionários, parceiros ou prestadores de serviços;"
    )
  );
  corpo.push(
    letra(
      "e)",
      "Estratégias de atuação no mercado interno e/ou externo, sejam elas relativas às medidas adotadas interna ou externamente pelo SALÃO PARCEIRO, inclusive, descontos fornecidos a terceiros quanto aos produtos ou serviços comercializados;"
    )
  );
  corpo.push(
    letra(
      "f)",
      "Layout, imagens, ações de marketing, propaganda, marcas de produtos e/ou serviços, que ainda não estejam implantados e em circulação pública;"
    )
  );
  corpo.push(
    letra(
      "g)",
      "Dados financeiros das empresas, de seus(as) sócios(as), de funcionários, prepostos, prestadores de serviços, contratantes, contratados ou de quaisquer pessoas, físicas ou jurídicas, que mantenham relação contratual ou legal com o SALÃO PARCEIRO."
    )
  );
  corpo.push(
    clausula("10.2.", [
      "Caso seja estritamente necessário revelar as informações referidas neste instrumento, ainda que a funcionários, prepostos ou colaboradores, deverá o PROFISSIONAL PARCEIRO, requerer expressa autorização à detentora da informação e garantir que o presente termo seja aderido pelo receptor da informação sigilosa.",
    ])
  );
  corpo.push(
    clausula("10.3.", [
      "O PROFISSIONAL PARCEIRO se compromete a diligenciar para que os seus empregados, sócios, prepostos, prestadores de serviços e/ou colaboradores, que tomarem conhecimento das informações sigilosas, estratégicas ou confidencias da CONTRATANTE não as divulguem a terceiros alheios ao objeto do presente Contrato, responsabilizando-se pelas perdas e danos que eventuais divulgações indevidas causarem, inclusive quanto a multas contratuais previstas neste instrumento ou quanto à responsabilização civil verificada por meio de decisão judicial ou extrajudicial.",
    ])
  );
  corpo.push(
    clausula("10.4.", [
      "Se eventualmente o PROFISSIONAL PARCEIRO for obrigado, por decisão judicial, a revelar informação sigilosa, deverá, antes da revelação, garantir o conhecimento do SALÃO PARCEIRO, bem como fazer com que o receptor tenha conhecimento do presente instrumento.",
    ])
  );
  corpo.push(
    clausula("10.5.", [
      "O descumprimento quanto à divulgação ou reprodução de dados ou informações sigilosas, confidencias ou estratégicas ensejará a responsabilização do PROFISSIONAL PARCEIRO por danos materiais e lucros cessantes, que serão oportunamente aferidos, além de multa não compensatória equivalente a 30% (trinta inteiros por cento) do faturamento do PROFISSIONAL PARCEIRO nos últimos doze meses de vigência do Instrumento de Parceria, além das perdas e danos eventualmente apuradas.",
    ])
  );
  corpo.push(
    clausula("10.6.", [
      "Ressalvadas as informações destacadas como não sigilosa, somente não estão alcançadas pelo presente instrumento as informações de conhecimento público ou que venham a ser publicadas, salvo se tal publicação ocorrer em infração ao presente instrumento.",
    ])
  );

  corpo.push(secao("11.", "DAS CONDIÇÕES GERAIS"));
  corpo.push(
    clausula("11.1.", [
      "Este instrumento contratual será homologado conforme previsto no § 9º do Art 1º da Lei 13.352/16 pelo sindicato dos trabalhadores e sindicato patronal.",
    ])
  );
  corpo.push(
    clausula("11.2.", [
      "As comunicações necessárias em razão deste Contrato serão feitas pelas PARTES sempre por escrito, por intermédio de carta registrada, e-mail, fax com confirmação de recebimento, telegrama, serviço de courier com registro-protocolo de recebimento, ou ainda, via cartório, observando-se os endereços e dados constantes no preâmbulo deste instrumento.",
    ])
  );
  corpo.push(
    clausula("11.3.", [
      "Toda e qualquer alteração nos dados mencionados no item anterior desta Cláusula deverá ser imediatamente informada por escrito à outra parte.",
    ])
  );
  corpo.push(
    clausula("11.4.", [
      { t: "TOTALIDADE DAS AVENÇAS: ", b: true },
      "O presente Contrato contém a totalidade das avenças e entendimentos havidos entre as PARTES.",
    ])
  );
  corpo.push(
    clausula("11.5.", [
      { t: "ALTERAÇÃO: ", b: true },
      "O presente Contrato somente poderá ser alterado por intermédio de instrumento escrito e assinado pelas PARTES.",
    ])
  );
  corpo.push(
    clausula("11.6.", [
      { t: "AUTONOMIA: ", b: true },
      "Caso qualquer disposição deste Contrato seja considerada nula, anulável, inválida ou ineficaz, as demais disposições deste Contrato permanecerão em pleno vigor, válidas e exequíveis, devendo as PARTES negociarem um ajuste equânime da disposição considerada nula, anulável, inválida ou ineficaz de modo a assegurar a respectiva validade e exequibilidade.",
    ])
  );
  corpo.push(
    clausula("11.7.", [
      { t: "TOLERÂNCIA: ", b: true },
      "Fica expressamente convencionado que não constituirá Novação, Compensação ou Transação a abstenção do exercício de qualquer poder, direito, recurso ou faculdade assegurados por lei ou por este instrumento, nem a eventual tolerância de atraso no cumprimento de quaisquer das obrigações aqui pactuadas, fato que não impedirá que a parte, a seu exclusivo critério, venha a exercê-los a qualquer momento.",
    ])
  );
  corpo.push(
    clausula("11.8.", [
      { t: "CESSÃO: ", b: true },
      "O presente Contrato não poderá ser cedido ou transferido a qualquer título para terceiros sem o prévio e expresso consentimento por escrito das PARTES.",
    ])
  );
  corpo.push(
    clausula("11.9.", [
      { t: "EFEITO VINCULANTE: ", b: true },
      "O presente Contrato é celebrado em caráter irrevogável e irretratável.",
    ])
  );
  corpo.push(
    clausula("11.10.", [
      { t: "SUCESSÃO: ", b: true },
      "O presente Contrato obriga as PARTES e seus sucessores a qualquer título.",
    ])
  );
  corpo.push(
    clausula("11.11.", [
      { t: "EXECUÇÃO ESPECÍFICA: ", b: true },
      "As obrigações assumidas pelas PARTES neste Contrato estão sujeitas a execução específica de acordo com as regras contidas nos artigos 771 e seguintes do Código de Processo Civil Brasileiro, a qual poderá ser exigida por qualquer uma das PARTES.",
    ])
  );
  corpo.push(
    clausula("11.12.", [
      { t: "REGÊNCIA: ", b: true },
      "O presente Contrato é regido e interpretado de acordo com as leis brasileiras.",
    ])
  );
  corpo.push(
    clausula("11.13.", [
      { t: "MELHORES ESFORÇOS: ", b: true },
      "As PARTES envidarão seus melhores esforços para solucionar, de boa-fé e com observância de seus mútuos interesses, qualquer litígio, disputa ou reivindicação resultante de, ou relativa a, este Termo, seu não-cumprimento e/ou sua validade.",
    ])
  );
  corpo.push(
    clausula("11.14.", [
      { t: "ADESÃO ÀS CONDIÇÕES DE ASSINATURA ELETRÔNICA: ", b: true },
      "As PARTES declaram, completamente livres de vícios de consentimento, espontânea vontade em firmar este instrumento por intermédio de módulo de assinatura eletrônica, nos termos do § 2º, do artigo 10, da MP nº 2.200-2, de 24/08/2001.",
    ])
  );
  corpo.push(
    clausula("11.15.", [
      { t: "FORO: ", b: true },
      "Fica desde já eleito, com a renúncia de quaisquer outros, por mais privilegiados que sejam, o Foro da Comarca de Belo Horizonte/MG, para dirimir quaisquer controvérsias oriundas do presente Termo ou de quaisquer contratos, documentos ou acordos a ele relacionados.",
    ])
  );

  corpo.push(
    paragrafo(
      "E por estarem assim justas e contratadas, firmam o presente Termo em 02 (duas) vias de igual teor e forma, na presença das 2 (duas) testemunhas abaixo identificadas, para que produzam todos os seus efeitos legais.",
      { after: 300 }
    )
  );

  corpo.push(paragrafo(`Belo Horizonte, ${dataContrato}.`, { after: 500 }));

  corpo.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: nome.toUpperCase(), bold: true, size: 22 })],
    })
  );
  corpo.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({ text: `CNPJ n° ${cnpj}`, size: 22 })],
    })
  );

  if (salao) {
    corpo.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new ImageRun({ type: salao.tipo, data: salao.bytes, transformation: { width: 130, height: 50 } }),
        ],
      })
    );
  }
  corpo.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "SEU ELIAS BARBA, CABELO E BIGODE LTDA", bold: true, size: 22 })],
    })
  );
  corpo.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({ text: "CNPJ sob o nº 18.713.580/0001-20", size: 22 })],
    })
  );

  corpo.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "TESTEMUNHAS:", bold: true, size: 22 })],
    })
  );

  corpo.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              },
              children: [
                paragrafo("NOME: Monallysa Kissila Machado Reis", { after: 40 }),
                paragrafo("RG: MG 15 188 514", { after: 40 }),
                paragrafo("CPF: 024 121 456 44", { after: 40 }),
                paragrafo(
                  "END.: Rua Almenara 80 Bloco 11 apto 104 – Pedra Azul – Contagem/MG CEP: 32183-170",
                  { after: 40 }
                ),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              },
              children: [
                paragrafo("NOME: Ramon Alves Cordeiro", { after: 40 }),
                paragrafo("RG: MG 10 583 238", { after: 40 }),
                paragrafo("CPF: 039 094 776 82", { after: 40 }),
                paragrafo("END.: Rua Viçosa 816 apto 503 São Pedro Belo Horizonte/MG CEP: 30330-160", {
                  after: 40,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        footers: { default: rodape },
        children: corpo,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const nomeArquivoBase = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return {
    ok: true,
    buffer,
    nomeArquivo: `contrato-pj-${nomeArquivoBase || "colaborador"}.docx`,
  };
}
