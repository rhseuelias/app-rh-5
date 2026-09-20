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
