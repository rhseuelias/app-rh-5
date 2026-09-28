/**
 * Parser de CSV simples e robusto o bastante para exports do Google Forms:
 * lida com campos entre aspas, vírgulas e quebras de linha dentro de aspas,
 * e aspas escapadas (""). Sem dependência externa.
 */
export function parseCSV(texto: string): string[][] {
  // remove BOM, se houver
  const conteudo = texto.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;

  for (let i = 0; i < conteudo.length; i++) {
    const char = conteudo[i];
    const proximo = conteudo[i + 1];

    if (dentroAspas) {
      if (char === '"' && proximo === '"') {
        campo += '"';
        i++;
      } else if (char === '"') {
        dentroAspas = false;
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroAspas = true;
    } else if (char === ",") {
      linha.push(campo);
      campo = "";
    } else if (char === "\r") {
      // ignora, o \n cuida da quebra
    } else if (char === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += char;
    }
  }

  // última linha (se o arquivo não terminar com \n)
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

export function semAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const MAPA_CAMPOS: Record<string, string[]> = {
  nome: ["nome", "nome completo", "name", "nome do candidato"],
  email: ["email", "e-mail", "endereco de e-mail", "seu e-mail"],
  telefone: ["telefone", "celular", "whatsapp", "telefone/whatsapp", "numero de telefone"],
  cargo_pretendido: ["cargo", "cargo pretendido", "vaga", "vaga pretendida", "cargo de interesse"],
  cpf: ["cpf"],
};

/**
 * Recebe o CSV cru (ex.: export de respostas do Google Forms) e devolve uma
 * lista de candidatos já mapeados nos campos conhecidos — o que não foi
 * reconhecido vira texto em `observacoes_extra` pra não perder nada.
 */
export function candidatosDoCSV(texto: string): Array<{
  nome: string | null;
  email: string | null;
  telefone: string | null;
  cargo_pretendido: string | null;
  cpf: string | null;
  observacoes_extra: string | null;
}> {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map(semAcentos);
  const indices: Record<string, number> = {};

  for (const [campo, variantes] of Object.entries(MAPA_CAMPOS)) {
    const idx = cabecalho.findIndex((h) => variantes.includes(h));
    if (idx >= 0) indices[campo] = idx;
  }

  return linhas.slice(1).map((linha) => {
    const usados = new Set(Object.values(indices));
    const extras = linha
      .map((valor, i) => ({ chave: linhas[0][i], valor }))
      .filter((c, i) => !usados.has(i) && c.valor.trim() !== "")
      .map((c) => `${c.chave}: ${c.valor}`)
      .join("; ");

    return {
      nome: indices.nome !== undefined ? linha[indices.nome]?.trim() || null : null,
      email: indices.email !== undefined ? linha[indices.email]?.trim() || null : null,
      telefone: indices.telefone !== undefined ? linha[indices.telefone]?.trim() || null : null,
      cargo_pretendido:
        indices.cargo_pretendido !== undefined ? linha[indices.cargo_pretendido]?.trim() || null : null,
      cpf: indices.cpf !== undefined ? linha[indices.cpf]?.trim() || null : null,
      observacoes_extra: extras || null,
    };
  });
}

const MAPA_CAMPOS_COLABORADOR: Record<string, string[]> = {
  nome: ["mome", "nome", "nome completo"],
  data_admissao: ["admissao", "data admissao", "data de admissao"],
  cargo: ["cargo"],
  departamento: ["departamento"],
  nivel: ["nivel"],
  regime: ["regime", "tipo"],
  empresa: ["empresa"],
  unidade: ["unidade"],
  carga_horaria: ["carga horaria"],
  salario: ["salario", "remuneracao"],
  quebra_caixa: ["quebra caixa"],
  adicional_auxilio: ["adicional auxilio"],
  comissao: ["comissao"],
};

/**
 * Aceita tanto número "brasileiro" (1.627,42 — ponto de milhar, vírgula
 * decimal) quanto número já em formato simples (1627.42 ou 1627,42).
 */
function numeroOuNulo(v: string | undefined): number | null {
  if (!v) return null;
  let limpo = v.trim();
  if (limpo.includes(".") && limpo.includes(",")) {
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if (limpo.includes(",")) {
    limpo = limpo.replace(",", ".");
  }
  const n = Number(limpo);
  return limpo !== "" && !Number.isNaN(n) ? n : null;
}

/**
 * Recebe o CSV com os dados da "Pasta de salários" (exportado da planilha
 * do RH) e devolve uma lista de colaboradores mapeados pros campos
 * conhecidos. Datas devem vir no formato AAAA-MM-DD.
 */
/**
 * Converte uma data em "aaaa-mm-dd" (formato do banco) a partir de vários
 * jeitos que a planilha pode trazer: aaaa-mm-dd, dd/mm/aaaa ou dd-mm-aaaa.
 * Devolve null se não reconhecer o formato.
 */
export function dataISOOuNula(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, d, mes, ano] = m;
    return `${ano}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function simOuNao(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "sim" || s === "s" || s === "true" || s === "1" || s === "yes";
}

const MAPA_CAMPOS_BAIXA_FERIAS: Record<string, string[]> = {
  nome: ["nome", "colaborador", "nome do colaborador"],
  data_inicio: ["data inicio", "inicio", "data de inicio", "data inicio das ferias"],
  data_fim: ["data fim", "fim", "data de fim", "data fim das ferias", "ultimo dia de ferias"],
  vendeu_abono: ["vendeu abono", "abono", "vendeu 1/3", "vendeu 1/3 (abono)"],
};

/**
 * Recebe o CSV de "férias já tiradas" (nome, data início, data fim e,
 * opcionalmente, se vendeu o abono) e devolve as linhas já mapeadas. Quem
 * não tem nome preenchido é ignorado. As datas ficam como veio no arquivo
 * (validação/format de fato acontece em `dataISOOuNula`, chamada por quem
 * for gravar no banco) — aqui só padroniza pra aaaa-mm-dd quando possível.
 */
export function feriasParaBaixaDoCSV(texto: string): Array<{
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  vendeu_abono: boolean;
}> {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map(semAcentos);
  const indices: Record<string, number> = {};
  for (const [campo, variantes] of Object.entries(MAPA_CAMPOS_BAIXA_FERIAS)) {
    const idx = cabecalho.findIndex((h) => variantes.includes(h));
    if (idx >= 0) indices[campo] = idx;
  }

  const pega = (linha: string[], campo: string) =>
    indices[campo] !== undefined ? linha[indices[campo]]?.trim() || "" : "";

  return linhas
    .slice(1)
    .filter((linha) => pega(linha, "nome") !== "")
    .map((linha) => ({
      nome: pega(linha, "nome"),
      data_inicio: dataISOOuNula(pega(linha, "data_inicio")),
      data_fim: dataISOOuNula(pega(linha, "data_fim")),
      vendeu_abono: simOuNao(pega(linha, "vendeu_abono")),
    }));
}

export function colaboradoresDoCSV(texto: string): Array<{
  nome: string;
  data_admissao: string | null;
  cargo: string | null;
  departamento: string | null;
  nivel: string | null;
  regime: string | null;
  empresa: string | null;
  unidade: string | null;
  carga_horaria: number | null;
  salario: number;
  quebra_caixa: number | null;
  adicional_auxilio: number | null;
  comissao: number | null;
}> {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map(semAcentos);
  const indices: Record<string, number> = {};

  for (const [campo, variantes] of Object.entries(MAPA_CAMPOS_COLABORADOR)) {
    const idx = cabecalho.findIndex((h) => variantes.includes(h));
    if (idx >= 0) indices[campo] = idx;
  }

  const pega = (linha: string[], campo: string) =>
    indices[campo] !== undefined ? linha[indices[campo]]?.trim() || "" : "";

  return linhas
    .slice(1)
    .filter((linha) => pega(linha, "nome") !== "")
    .map((linha) => ({
      nome: pega(linha, "nome"),
      data_admissao: pega(linha, "data_admissao") || null,
      cargo: pega(linha, "cargo") || null,
      departamento: pega(linha, "departamento") || null,
      nivel: pega(linha, "nivel") || null,
      regime: pega(linha, "regime") || null,
      empresa: pega(linha, "empresa") || null,
      unidade: pega(linha, "unidade") || null,
      carga_horaria: numeroOuNulo(pega(linha, "carga_horaria")),
      salario: numeroOuNulo(pega(linha, "salario")) ?? 0,
      quebra_caixa: numeroOuNulo(pega(linha, "quebra_caixa")),
      adicional_auxilio: numeroOuNulo(pega(linha, "adicional_auxilio")),
      comissao: numeroOuNulo(pega(linha, "comissao")),
    }));
}

// ------------------------------------------------------------
// Fichas de Admissão respondidas no Google Forms (CLT e PJ)
// ------------------------------------------------------------

export type TipoFichaGoogleForms = "CLT" | "PJ";

/**
 * Deixa o título da pergunta num formato "comparável": sem acento, sem
 * pontuação e com espaços simples. Ex.: "Vale-transporte (VT)?" vira
 * "vale transporte vt" e "Unidade / Filial" vira "unidade filial".
 */
export function chavePergunta(titulo: string): string {
  return semAcentos(titulo)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Perguntas dos formulários → campo do cadastro. Todos já no formato de `chavePergunta`. */
const MAPA_PERGUNTAS_FICHA: Record<string, string[]> = {
  nome: ["nome completo", "nome", "nome do colaborador", "nome do prestador"],
  cpf: ["cpf"],
  cnpj: ["cnpj"],
  cpf_cnpj: ["cpf cnpj", "cpf ou cnpj"],
  rg: ["rg"],
  cargo: ["cargo", "funcao"],
  departamento: ["departamento", "setor"],
  lider: ["lider direto", "lider", "gestor direto"],
  empresa: ["empresa"],
  unidade: ["unidade filial", "unidade", "filial"],
  data_nascimento: ["data de nascimento", "nascimento"],
  estado_civil: ["estado civil"],
  raca_cor: ["raca cor", "raca", "cor raca"],
  grau_instrucao: ["grau de instrucao", "escolaridade"],
  endereco: ["endereco completo", "endereco"],
  data_admissao: ["data de admissao", "admissao"],
  contrato_experiencia: ["contrato de experiencia"],
  salario_base: ["salario base r", "salario base", "salario"],
  comissao_media: ["comissao media r", "comissao media"],
  auxilio_outros: ["outros auxilios r", "outros auxilios"],
  custo_vt: ["custo vale transporte vt mensal r", "custo vale transporte mensal"],
  custo_va_vr: ["custo vale alimentacao refeicao va vr mensal r", "custo va vr mensal"],
  custo_assist_medica: ["custo assistencia medica mensal r", "custo assistencia medica"],
  custo_assist_psicologica: ["custo assistencia psicologica mensal r", "custo assistencia psicologica"],
  marque_o_que_se_aplica: ["marque o que se aplica"],
  tem_dependentes: ["tem dependentes"],
  dependentes: ["dados dos dependentes se houver", "dados dos dependentes", "dependentes"],
  banco: ["banco"],
  agencia: ["agencia"],
  conta: ["conta", "numero da conta"],
  conta_digito: ["digito da conta", "digito"],
  vale_transporte: ["vale transporte vt", "vale transporte"],
  vale_transporte_desconto: ["tera desconto do vt em folha"],
  vale_alimentacao: ["vale alimentacao refeicao va vr", "vale alimentacao"],
  vale_alimentacao_valor_desconto: [
    "valor a ser descontado do va vr em folha r",
    "valor a ser descontado do va vr em folha",
  ],
  telefone: ["telefone", "celular", "whatsapp", "telefone whatsapp"],
  email: ["e mail", "email", "endereco de e mail"],
  nome_contato_emergencia: ["contato de emergencia nome"],
  telefone_contato_emergencia: ["contato de emergencia telefone"],
  contrato_inicio: ["inicio do contrato"],
  contrato_fim: ["fim do contrato se determinado", "fim do contrato"],
  valor_nota_fiscal: ["valor da nota fiscal mensal r", "valor da nota fiscal mensal", "valor da nota fiscal"],
  observacoes: ["observacoes", "observacao"],
};

/** Colunas que o Google Forms coloca sozinho e que não interessam ao cadastro. */
const COLUNAS_IGNORADAS = new Set(["carimbo de data hora", "timestamp", "pontuacao", "score"]);

export interface DependenteImportado {
  nome: string;
  data_nascimento: string | null;
  parentesco: string | null;
  cpf: string;
  dependente_ir: boolean;
}

export interface FichaImportada {
  nome: string;
  cpf_cnpj: string | null;
  rg: string | null;
  cargo: string | null;
  departamento: string | null;
  lider: string | null;
  empresa: string | null;
  unidade: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  raca_cor: string | null;
  grau_instrucao: string | null;
  endereco: string | null;
  data_admissao: string | null;
  contrato_experiencia: string | null;
  salario_base: number | null;
  comissao_media: number | null;
  auxilio_outros: number | null;
  custo_vt: number | null;
  custo_va_vr: number | null;
  custo_assist_medica: number | null;
  custo_assist_psicologica: number | null;
  adiantamento_salario: boolean;
  primeiro_emprego: boolean;
  insalubridade: boolean;
  periculosidade: boolean;
  quebra_caixa: boolean;
  gratificacao_funcao: boolean;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  conta_digito: string | null;
  vale_transporte: boolean;
  vale_transporte_desconto: boolean;
  vale_alimentacao: boolean;
  vale_alimentacao_valor_desconto: number | null;
  telefone: string | null;
  email: string | null;
  nome_contato_emergencia: string | null;
  telefone_contato_emergencia: string | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_nota_fiscal: number | null;
  dependentes: DependenteImportado[];
  /** Observações do formulário + respostas que não têm campo próprio no cadastro. */
  observacoes: string | null;
  /** Avisos sobre essa pessoa (ex.: data que não deu pra entender). */
  avisos: string[];
  /** Campos sim/não que a pessoa de fato respondeu no formulário — na hora de
   * ATUALIZAR um cadastro que já existe, só esses são alterados (pergunta que
   * não existe no formulário não pode apagar o que já estava marcado). */
  booleanosRespondidos: string[];
}

/** Confere se "aaaa-mm-dd" é uma data que existe (ex.: recusa 1990-13-31). */
function dataRealOuNula(iso: string | null): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? iso : null;
}

/** "R$ 1.500,00" → 1500 ; "" → null. */
function valorEmReais(v: string): number | null {
  const limpo = v.replace(/[^0-9.,-]/g, "");
  return numeroOuNulo(limpo);
}

function estadoCivilDaResposta(v: string): string | null {
  const s = chavePergunta(v);
  if (!s) return null;
  if (s.startsWith("solteir")) return "solteiro";
  if (s.startsWith("casad")) return "casado";
  if (s.startsWith("divorciad") || s.startsWith("separad")) return "divorciado";
  if (s.startsWith("viuv")) return "viuvo";
  if (s.startsWith("uniao")) return "uniao_estavel";
  return null;
}

function grauInstrucaoDaResposta(v: string): string | null {
  const s = chavePergunta(v);
  if (!s) return null;
  if (s.startsWith("doutorado")) return "doutorado_pos_doutorado";
  if (s.startsWith("mestrado")) return "mestrado";
  if (s.startsWith("pos")) return "pos_graduacao";
  const nivel = s.startsWith("fundamental")
    ? "fundamental"
    : s.startsWith("medio")
      ? "medio"
      : s.startsWith("superior")
        ? "superior"
        : null;
  if (!nivel) return null;
  return `${nivel}_${s.includes("incompleto") ? "incompleto" : "completo"}`;
}

function contratoExperienciaDaResposta(v: string): string | null {
  const s = chavePergunta(v);
  if (!s) return null;
  if (s.includes("15") && s.includes("75")) return "90_dias_15_75";
  if (s.startsWith("90")) return "90_dias_45_45";
  if (s.startsWith("45")) return "45_dias_45";
  return null;
}

const RESPOSTAS_SEM_DEPENDENTE = new Set([
  "", "nao", "n", "na", "n a", "nenhum", "nenhuma", "nao tenho", "nao possuo", "nao possui", "sem dependentes",
]);

/**
 * O formulário pede um dependente por linha no formato:
 * "Nome completo, Data de nascimento, Parentesco, CPF, É dependente de IR? (Sim/Não)".
 * Linhas que seguem esse formato viram dependentes de verdade; o que não
 * der pra entender (ex.: sem CPF) volta como texto pra ir nas observações.
 */
export function dependentesDaResposta(texto: string): { dependentes: DependenteImportado[]; naoEntendidos: string[] } {
  const dependentes: DependenteImportado[] = [];
  const naoEntendidos: string[] = [];

  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (RESPOSTAS_SEM_DEPENDENTE.has(chavePergunta(linha))) continue;

    const partes = linha.split(/[;,]/).map((p) => p.trim());
    const cpf = partes[3] ?? "";
    if (partes.length >= 4 && partes[0] && /\d{3}.*\d{2}$/.test(cpf.replace(/\s/g, ""))) {
      dependentes.push({
        nome: partes[0],
        data_nascimento: dataRealOuNula(dataISOOuNula(partes[1])),
        parentesco: partes[2] || null,
        cpf,
        dependente_ir: simOuNao(partes[4]),
      });
    } else {
      naoEntendidos.push(linha);
    }
  }

  return { dependentes, naoEntendidos };
}

export interface LeituraFichasGoogleForms {
  fichas: FichaImportada[];
  /** Títulos das perguntas do arquivo que não têm campo no cadastro (foram pras observações). */
  perguntasSemCampo: string[];
}

/**
 * Lê o CSV de respostas das Fichas de Admissão do Google Forms (CLT ou PJ).
 * Reconhece as perguntas pelo título, mesmo com pequenas diferenças de
 * acento/pontuação. Se o arquivo for claramente do outro formulário
 * (ex.: tem "CNPJ" e foi escolhido CLT), para com um erro explicando.
 */
export function fichasGoogleFormsDoCSV(texto: string, tipo: TipoFichaGoogleForms): LeituraFichasGoogleForms {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return { fichas: [], perguntasSemCampo: [] };

  const titulos = linhas[0].map((t) => t.trim());
  const chaves = titulos.map(chavePergunta);

  const indices: Record<string, number> = {};
  for (const [campo, variantes] of Object.entries(MAPA_PERGUNTAS_FICHA)) {
    const idx = chaves.findIndex((c, i) => variantes.includes(c) && !Object.values(indices).includes(i));
    if (idx >= 0) indices[campo] = idx;
  }

  if (indices.nome === undefined) {
    throw new Error(
      'Não achei a pergunta "Nome completo" no arquivo. Confira se é o CSV de respostas da Ficha de Admissão (a primeira linha precisa ter os títulos das perguntas).'
    );
  }
  if (tipo === "CLT" && indices.cnpj !== undefined && indices.cpf === undefined) {
    throw new Error(
      'Esse arquivo parece ser do formulário PJ (tem a pergunta "CNPJ"). Escolha "PJ" e envie de novo.'
    );
  }
  if (tipo === "PJ" && indices.cpf !== undefined && indices.cnpj === undefined) {
    throw new Error(
      'Esse arquivo parece ser do formulário CLT (tem a pergunta "CPF" e não tem "CNPJ"). Escolha "CLT" e envie de novo.'
    );
  }

  const usados = new Set(Object.values(indices));
  const colunasExtras = titulos
    .map((titulo, i) => ({ titulo, i }))
    .filter(({ titulo, i }) => !usados.has(i) && titulo !== "" && !COLUNAS_IGNORADAS.has(chaves[i]));

  const fichas = linhas
    .slice(1)
    .map((linha): FichaImportada | null => {
      const pega = (campo: string) =>
        indices[campo] !== undefined ? (linha[indices[campo]] ?? "").trim() : "";
      const textoOuNulo = (campo: string) => pega(campo) || null;

      const nome = pega("nome").replace(/\s+/g, " ");
      if (!nome) return null;

      const avisos: string[] = [];
      const data = (campo: string, rotulo: string) => {
        const bruto = pega(campo);
        if (!bruto) return null;
        const iso = dataRealOuNula(dataISOOuNula(bruto));
        if (!iso) avisos.push(`${rotulo} "${bruto}" não foi reconhecida — preencha na ficha`);
        return iso;
      };

      const marcados = chavePergunta(pega("marque_o_que_se_aplica"));
      const booleanosRespondidos = [
        ...(marcados
          ? [
              "adiantamento_salario",
              "primeiro_emprego",
              "insalubridade",
              "periculosidade",
              "quebra_caixa",
              "gratificacao_funcao",
            ]
          : []),
        ...["vale_transporte", "vale_transporte_desconto", "vale_alimentacao"].filter((campo) => pega(campo) !== ""),
      ];
      const { dependentes, naoEntendidos } = dependentesDaResposta(pega("dependentes"));
      if (naoEntendidos.length > 0) {
        avisos.push("dependentes fora do formato (nome, nascimento, parentesco, CPF, IR) foram pras observações");
      }

      const notas = [
        pega("observacoes"),
        naoEntendidos.length > 0 ? `Dependentes (conferir e cadastrar):\n${naoEntendidos.join("\n")}` : "",
        ...colunasExtras
          .map(({ titulo, i }) => ({ titulo, valor: (linha[i] ?? "").trim() }))
          .filter(({ valor }) => valor !== "")
          .map(({ titulo, valor }) => `${titulo}: ${valor}`),
      ].filter((n) => n !== "");

      const documento =
        tipo === "PJ"
          ? pega("cnpj") || pega("cpf_cnpj") || pega("cpf")
          : pega("cpf") || pega("cpf_cnpj");

      return {
        nome,
        cpf_cnpj: documento || null,
        rg: textoOuNulo("rg"),
        cargo: textoOuNulo("cargo"),
        departamento: textoOuNulo("departamento"),
        lider: textoOuNulo("lider"),
        empresa: textoOuNulo("empresa"),
        unidade: textoOuNulo("unidade"),
        data_nascimento: data("data_nascimento", "Data de nascimento"),
        estado_civil: estadoCivilDaResposta(pega("estado_civil")),
        raca_cor: textoOuNulo("raca_cor"),
        grau_instrucao: grauInstrucaoDaResposta(pega("grau_instrucao")),
        endereco: textoOuNulo("endereco"),
        data_admissao: data("data_admissao", "Data de admissão"),
        contrato_experiencia: contratoExperienciaDaResposta(pega("contrato_experiencia")),
        salario_base: valorEmReais(pega("salario_base")),
        comissao_media: valorEmReais(pega("comissao_media")),
        auxilio_outros: valorEmReais(pega("auxilio_outros")),
        custo_vt: valorEmReais(pega("custo_vt")),
        custo_va_vr: valorEmReais(pega("custo_va_vr")),
        custo_assist_medica: valorEmReais(pega("custo_assist_medica")),
        custo_assist_psicologica: valorEmReais(pega("custo_assist_psicologica")),
        adiantamento_salario: marcados.includes("adiantamento"),
        primeiro_emprego: marcados.includes("primeiro emprego"),
        insalubridade: marcados.includes("insalubridade"),
        periculosidade: marcados.includes("periculosidade"),
        quebra_caixa: marcados.includes("quebra de caixa"),
        gratificacao_funcao: marcados.includes("gratificacao"),
        banco: textoOuNulo("banco"),
        agencia: textoOuNulo("agencia"),
        conta: textoOuNulo("conta"),
        conta_digito: textoOuNulo("conta_digito"),
        vale_transporte: simOuNao(pega("vale_transporte")),
        vale_transporte_desconto: simOuNao(pega("vale_transporte_desconto")),
        vale_alimentacao: simOuNao(pega("vale_alimentacao")),
        vale_alimentacao_valor_desconto: valorEmReais(pega("vale_alimentacao_valor_desconto")),
        telefone: textoOuNulo("telefone"),
        email: textoOuNulo("email"),
        nome_contato_emergencia: textoOuNulo("nome_contato_emergencia"),
        telefone_contato_emergencia: textoOuNulo("telefone_contato_emergencia"),
        contrato_inicio: data("contrato_inicio", "Início do contrato"),
        contrato_fim: data("contrato_fim", "Fim do contrato"),
        valor_nota_fiscal: valorEmReais(pega("valor_nota_fiscal")),
        dependentes,
        observacoes: notas.length > 0 ? notas.join("\n") : null,
        avisos,
        booleanosRespondidos,
      };
    })
    .filter((f): f is FichaImportada => f !== null);

  return { fichas, perguntasSemCampo: colunasExtras.map((c) => c.titulo) };
}
