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

function semAcentos(texto: string): string {
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
