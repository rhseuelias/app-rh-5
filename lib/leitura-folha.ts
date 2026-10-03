/**
 * Leitura de arquivos (CSV, Excel, PDF) para lançar proventos e descontos na
 * folha sem digitar. Aqui só tem lógica pura (sem servidor, sem banco): recebe
 * as linhas do arquivo já em texto e devolve o que foi entendido — quem é a
 * pessoa, qual é a coluna/verba e qual é o valor.
 *
 * Funciona com dois formatos de tabela:
 *  - LARGO: uma linha por pessoa e uma coluna por verba
 *      Nome | Unimed | Vale transporte
 *  - LONGO: várias linhas por pessoa, uma por verba
 *      Nome | Verba | Valor
 * Um arquivo simples "Nome | Valor" (sem cabeçalho de verba) também serve: o
 * usuário escolhe, na tela, a qual coluna da folha o arquivo inteiro pertence.
 */

// ------------------------------------------------------------
// TEXTO / NÚMEROS
// ------------------------------------------------------------

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** minúsculas, sem acento, só letras/números e espaço simples */
export function norm(s: string): string {
  return semAcento(String(s ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function soDigitos(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** "1.234,56" · "1234.56" · "R$ 1.234,56" · "(100,00)" · "100,00-" → número (null = não é número) */
export function valorBR(bruto: string | number | null | undefined): number | null {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  let t = String(bruto).trim();
  if (t === "") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (/-$/.test(t)) {
    negativo = true;
    t = t.slice(0, -1);
  }
  t = t.replace(/R\$|\s/g, "");
  if (t.startsWith("-")) {
    negativo = !negativo ? true : negativo;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;
  let limpo: string;
  if (t.includes(",")) {
    limpo = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    limpo = t.replace(/\./g, ""); // 1.234 → 1234
  } else {
    limpo = t;
  }
  const n = parseFloat(limpo);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function formatarValor(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ------------------------------------------------------------
// TIPOS
// ------------------------------------------------------------

export interface ItemLido {
  /** número da linha no arquivo (1 = primeira) — só para mostrar */
  linha: number;
  nome: string;
  cpf: string;
  matricula: string;
  /** nome da coluna/verba como veio no arquivo ("" = arquivo simples, sem verba) */
  rotulo: string;
  /** texto original da célula do valor */
  bruto: string;
  /** valor numérico (null = não deu para entender como número) */
  valor: number | null;
}

export interface LeituraTabela {
  ok: boolean;
  erro?: string;
  formato?: "largo" | "longo" | "simples";
  itens: ItemLido[];
  /** colunas/verbas reconhecidas, na ordem do arquivo */
  rotulos: string[];
  avisos: string[];
  linhasLidas: number;
}

export interface ColaboradorRef {
  id: string;
  nome: string;
  cpf?: string | null;
  matricula?: string | null;
}

export interface RubricaRef {
  id: string;
  nome: string;
  codigo: string | null;
  grupo: "provento" | "desconto";
  formato: "moeda" | "texto" | "sim_nao";
}


// ------------------------------------------------------------
// CSV (aceita ; , ou tab — o Excel brasileiro salva com ponto e vírgula)
// ------------------------------------------------------------

export function csvParaLinhas(texto: string): string[][] {
  const conteudo = texto.replace(/^\uFEFF/, "");
  // o separador é o que mais aparece fora de aspas na 1ª linha com conteúdo
  const primeira = conteudo.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const contar = (sep: string) => {
    let n = 0;
    let aspas = false;
    for (const ch of primeira) {
      if (ch === '"') aspas = !aspas;
      else if (!aspas && ch === sep) n++;
    }
    return n;
  };
  const candidatos = [";", ",", "\t"].map((sep) => ({ sep, n: contar(sep) }));
  const sep = candidatos.sort((a, b) => b.n - a.n)[0].n > 0 ? candidatos[0].sep : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < conteudo.length; i++) {
    const ch = conteudo[i];
    if (aspas) {
      if (ch === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
      continue;
    }
    if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\r") {
      // o \n cuida da quebra
    } else if (ch === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

// ------------------------------------------------------------
// LEITURA DA TABELA
// ------------------------------------------------------------

const H_NOME = ["nome", "colaborador", "funcionario", "empregado", "nome do colaborador", "nome do funcionario", "nome completo", "beneficiario", "titular"];
const H_CPF = ["cpf"];
const H_MATRICULA = ["matricula", "cod", "codigo", "cod func", "codigo funcionario", "registro", "re"];
const H_EVENTO = ["evento", "verba", "rubrica", "descricao", "descricao verba", "lancamento", "tipo", "historico", "provento desconto"];
const H_VALOR = ["valor", "total", "importe", "quantia", "valor r", "vlr", "rendimentos", "proventos", "descontos", "vencimentos", "valor total", "mensalidade"];
const IGNORAR_COLUNA = [
  "empresa", "unidade", "filial", "cargo", "funcao", "setor", "departamento", "admissao", "data", "regime", "status",
  "sexo", "cnpj", "n", "no", "item", "ordem", "observacao", "observacoes", "obs", "ponto", "cbo", "salario base", "situacao",
];

function celulaTexto(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function tipoCabecalho(h: string): "nome" | "cpf" | "matricula" | "evento" | "valor" | "ignorar" | "outro" {
  const n = norm(h);
  if (!n) return "outro";
  if (H_NOME.includes(n)) return "nome";
  if (H_CPF.includes(n)) return "cpf";
  if (H_MATRICULA.includes(n)) return "matricula";
  if (H_EVENTO.includes(n)) return "evento";
  if (H_VALOR.includes(n) || /^valor\b/.test(n)) return "valor";
  if (IGNORAR_COLUNA.includes(n)) return "ignorar";
  return "outro";
}

const COLUNA_CALCULADA = /^(total|totais|subtotal|soma|liquido|bruto|saldo)\b/;
/** a linha parece o cabeçalho de uma tabela de pessoas (tem coluna de nome, CPF ou matrícula)? */
export function ehCabecalhoDeNome(celulas: string[]): boolean {
  const tipos = celulas.map(tipoCabecalho);
  return celulas.filter((c) => c !== "").length >= 2 && (tipos.includes("nome") || tipos.includes("cpf"));
}

const PALAVRAS_TOTAL = /^(total|totais|subtotal|sub total|soma|total geral)\b/;

export function interpretarLinhas(linhasBrutas: unknown[][]): LeituraTabela {
  const vazio: LeituraTabela = { ok: false, itens: [], rotulos: [], avisos: [], linhasLidas: 0 };
  if (pareceReciboDePagamento(linhasBrutas)) return interpretarRecibos(linhasBrutas);
  const linhas = linhasBrutas.map((l) => l.map(celulaTexto));
  const naoVazias = linhas.filter((l) => l.some((c) => c !== ""));
  if (naoVazias.length < 2) {
    return { ...vazio, erro: "O arquivo está vazio ou tem só uma linha." };
  }

  // ---- 1. acha a linha de cabeçalho (nas primeiras 30 linhas) ----
  let idxCab = -1;
  let melhor = 0;
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const tipos = linhas[i].map(tipoCabecalho);
    const pontos = (tipos.includes("nome") ? 3 : 0) + (tipos.includes("cpf") ? 2 : 0) + (tipos.includes("matricula") ? 1 : 0);
    const preenchidas = linhas[i].filter((c) => c !== "").length;
    if (pontos > melhor && preenchidas >= 2) {
      melhor = pontos;
      idxCab = i;
    }
  }

  const avisos: string[] = [];
  let cabecalho: string[];
  let corpo: { linha: number; cel: string[] }[];

  if (idxCab >= 0) {
    cabecalho = linhas[idxCab];
    corpo = linhas.slice(idxCab + 1).map((cel, i) => ({ linha: idxCab + 2 + i, cel }));
  } else {
    // sem cabeçalho: assume "1ª coluna = nome, última coluna = valor"
    cabecalho = [];
    corpo = linhas.map((cel, i) => ({ linha: i + 1, cel }));
  }
  corpo = corpo.filter((l) => l.cel.some((c) => c !== ""));
  // cabeçalho repetido em outras páginas (PDF)
  if (cabecalho.length > 0) {
    const chaveCab = cabecalho.join("|");
    corpo = corpo.filter((l) => l.cel.join("|") !== chaveCab);
  }

  const itens: ItemLido[] = [];
  const rotulos: string[] = [];
  const addRotulo = (r: string) => {
    if (!rotulos.includes(r)) rotulos.push(r);
  };

  // ---- 2a. sem cabeçalho: "NOME ... valor" ----
  if (cabecalho.length === 0) {
    for (const { linha, cel } of corpo) {
      const preenchidas = cel.filter((c) => c !== "");
      if (preenchidas.length < 2) continue;
      const nome = preenchidas[0];
      const valorCel = preenchidas[preenchidas.length - 1];
      const valor = valorBR(valorCel);
      if (valor === null || valorBR(nome) !== null) continue;
      if (PALAVRAS_TOTAL.test(norm(nome))) continue;
      itens.push({ linha, nome, cpf: "", matricula: "", rotulo: "", bruto: valorCel, valor });
    }
    if (itens.length === 0) {
      return { ...vazio, erro: "Não encontrei linhas com nome e valor. Confira se o arquivo tem uma coluna de nome e outra de valor." };
    }
    addRotulo("");
    return { ok: true, formato: "simples", itens, rotulos, avisos: ["O arquivo não tem cabeçalho; usei a 1ª coluna como nome e a última como valor."], linhasLidas: corpo.length };
  }

  // ---- 2b. com cabeçalho ----
  const tipos = cabecalho.map(tipoCabecalho);
  const idxNome = tipos.indexOf("nome");
  const idxCpf = tipos.indexOf("cpf");
  const idxMat = tipos.indexOf("matricula");
  const idxEvento = tipos.indexOf("evento");

  if (idxNome < 0 && idxCpf < 0 && idxMat < 0) {
    return { ...vazio, erro: "Não achei a coluna com o nome (ou CPF) do colaborador." };
  }

  const colunasValorGenericas = tipos.map((t, i) => (t === "valor" ? i : -1)).filter((i) => i >= 0);
  const longo = idxEvento >= 0 && colunasValorGenericas.length > 0;

  const pegaPessoa = (cel: string[]) => ({
    nome: idxNome >= 0 ? cel[idxNome] ?? "" : "",
    cpf: idxCpf >= 0 ? cel[idxCpf] ?? "" : "",
    matricula: idxMat >= 0 ? cel[idxMat] ?? "" : "",
  });

  if (longo) {
    // ---- LONGO: uma linha por verba ----
    for (const { linha, cel } of corpo) {
      const p = pegaPessoa(cel);
      if (!p.nome && !p.cpf && !p.matricula) continue;
      if (PALAVRAS_TOTAL.test(norm(p.nome))) continue;
      const rotulo = (cel[idxEvento] ?? "").trim();
      if (!rotulo) continue;
      // usa a primeira coluna de valor preenchida com número diferente de zero
      let bruto = "";
      let valor: number | null = null;
      for (const ci of colunasValorGenericas) {
        const v = valorBR(cel[ci]);
        if (v !== null && (valor === null || (valor === 0 && v !== 0))) {
          bruto = cel[ci];
          valor = v;
          if (v !== 0) break;
        }
      }
      if (valor === null) continue;
      itens.push({ linha, ...p, rotulo, bruto, valor });
      addRotulo(rotulo);
    }
    if (itens.length === 0) return { ...vazio, erro: "Não encontrei valores no arquivo." };
    return { ok: true, formato: "longo", itens, rotulos, avisos, linhasLidas: corpo.length };
  }

  // ---- LARGO: uma coluna por verba ----
  const colunasVerba: number[] = [];
  tipos.forEach((t, i) => {
    if (i === idxNome || i === idxCpf || i === idxMat) return;
    if (t === "ignorar") return;
    if (!cabecalho[i]) return;
    if (COLUNA_CALCULADA.test(norm(cabecalho[i]))) return; // totais e líquidos não são verbas
    colunasVerba.push(i);
  });
  // coluna de verba só vale se tiver pelo menos 1 número
  const colunasComNumero = colunasVerba.filter((ci) => corpo.some(({ cel }) => valorBR(cel[ci]) !== null && celulaTexto(cel[ci]) !== ""));
  if (colunasComNumero.length === 0) {
    return { ...vazio, erro: "Não encontrei colunas com valores (números) no arquivo." };
  }

  for (const { linha, cel } of corpo) {
    const p = pegaPessoa(cel);
    if (!p.nome && !p.cpf && !p.matricula) continue;
    if (PALAVRAS_TOTAL.test(norm(p.nome))) continue;
    for (const ci of colunasComNumero) {
      const bruto = cel[ci] ?? "";
      if (bruto === "") continue;
      const valor = valorBR(bruto);
      if (valor === null || valor === 0) continue;
      itens.push({ linha, ...p, rotulo: cabecalho[ci], bruto, valor });
      addRotulo(cabecalho[ci]);
    }
  }
  if (itens.length === 0) return { ...vazio, erro: "Todos os valores do arquivo estão vazios ou zerados." };
  const semNumero = colunasVerba.filter((ci) => !colunasComNumero.includes(ci)).map((ci) => cabecalho[ci]);
  if (semNumero.length > 0) avisos.push(`Colunas sem valores numéricos, deixei de fora: ${semNumero.join(", ")}.`);
  return { ok: true, formato: "largo", itens, rotulos, avisos, linhasLidas: corpo.length };
}


// ------------------------------------------------------------
// RECIBOS DE PAGAMENTO (holerites) — um bloco por empregado
// ------------------------------------------------------------

export function pareceReciboDePagamento(linhas: unknown[][]): boolean {
  let n = 0;
  for (const l of linhas.slice(0, 40)) {
    if (norm(l.map(celulaTexto).join(" ")).includes("recibo de pagamento")) n++;
  }
  return n > 0;
}

/**
 * Lê os recibos de pagamento que a contabilidade manda em PDF: cada recibo traz
 * "Empregado | CPF | Cargo" e uma tabela "Cód. Descrição | Referência |
 * Rendimentos | Descontos". Cada recibo sai em 2 vias — a repetida é ignorada.
 * Vira o formato LONGO (uma linha por verba), pronto para o resto da tela.
 */
export function interpretarRecibos(linhasBrutas: unknown[][]): LeituraTabela {
  const linhas = linhasBrutas.map((l) => l.map(celulaTexto));
  const itens: ItemLido[] = [];
  const rotulos: string[] = [];
  const vistos = new Set<string>();
  let pessoa: { nome: string; cpf: string } | null = null;
  let emItens = false;
  let ignorarEsteBloco = false;
  let recibos = 0;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const junto = norm(l.join(" "));

    if (junto.startsWith("empregado cpf")) {
      const prox = linhas[i + 1] ?? [];
      const nome = (prox[0] ?? "").replace(/\s*-\s*\d+\s*$/, "").trim();
      const cpf = soDigitos(prox[1]);
      const chave = cpf || norm(nome);
      pessoa = nome ? { nome, cpf } : null;
      ignorarEsteBloco = vistos.has(chave);
      if (pessoa && !ignorarEsteBloco) {
        vistos.add(chave);
        recibos++;
      }
      emItens = false;
      continue;
    }
    if (junto.startsWith("cod descricao")) {
      emItens = true;
      continue;
    }
    if (junto.startsWith("total rendimentos") || junto.startsWith("liquido")) {
      emItens = false;
      continue;
    }
    if (emItens && pessoa && !ignorarEsteBloco) {
      // "0102 VALE TRANSPORTE" | referência | rendimentos | descontos
      const desc = l[0] ?? "";
      if (!/^\d{3,5}\s+\S/.test(desc)) continue;
      const numeros = l.slice(1).map((c) => valorBR(c));
      if (numeros.length < 3) continue;
      const rendimento = numeros[numeros.length - 2] ?? 0;
      const desconto = numeros[numeros.length - 1] ?? 0;
      const valor = rendimento && rendimento !== 0 ? rendimento : desconto;
      if (!valor) continue;
      itens.push({
        linha: i + 1,
        nome: pessoa.nome,
        cpf: pessoa.cpf,
        matricula: "",
        rotulo: desc,
        bruto: String(valor).replace(".", ","),
        valor,
      });
      if (!rotulos.includes(desc)) rotulos.push(desc);
    }
  }

  if (itens.length === 0) {
    return { ok: false, itens: [], rotulos: [], avisos: [], linhasLidas: 0, erro: "Não consegui ler as verbas desses recibos." };
  }
  return {
    ok: true,
    formato: "longo",
    itens,
    rotulos,
    avisos: [`Li ${recibos} recibo${recibos !== 1 ? "s" : ""} de pagamento (a 2ª via de cada um foi ignorada).`],
    linhasLidas: linhas.length,
  };
}

// ------------------------------------------------------------
// ACHAR O COLABORADOR
// ------------------------------------------------------------

const LIGACOES = new Set(["de", "da", "do", "dos", "das", "e"]);

function tokensNome(nome: string): string[] {
  const limpo = String(nome ?? "").replace(/\s*-\s*\d+\s*$/, ""); // "FULANO - 57" (código da contabilidade)
  return norm(limpo)
    .split(" ")
    .filter((t) => t && !LIGACOES.has(t));
}


// ------------------------------------------------------------
// SEMELHANÇA (nomes e verbas que não são totalmente iguais)
// ------------------------------------------------------------

/** número de letras diferentes entre duas palavras (erro de digitação = 1) */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = atual;
  }
  return ant[b.length];
}

/** quanto duas palavras de nome se parecem (0 a 1) */
function notaPalavra(a: string, b: string): number {
  if (a === b) return 1;
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  if (c.length === 1) return l.startsWith(c) ? 0.6 : 0; // inicial: "J" ~ "João"
  if (c.length >= 3 && l.startsWith(c)) return 0.75; // abreviado: "Fern" ~ "Fernanda"
  const d = distancia(a, b);
  if (a.length >= 4 && b.length >= 4) {
    if (d === 1) return 0.88; // erro de digitação
    if (d === 2 && Math.min(a.length, b.length) >= 8) return 0.75;
  }
  return 0;
}

/** nota de 0 a 1 para "estes dois nomes são a mesma pessoa?" (ordem das palavras não importa) */
export function notaNome(ta: string[], tb: string[]): number {
  if (ta.length === 0 || tb.length === 0) return 0;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const usados = new Set<number>();
  let soma = 0;
  let bons = 0;
  for (const t of curto) {
    let melhor = 0;
    let idx = -1;
    longo.forEach((u, i) => {
      if (usados.has(i)) return;
      const n = notaPalavra(t, u);
      if (n > melhor) {
        melhor = n;
        idx = i;
      }
    });
    if (idx >= 0) usados.add(idx);
    soma += melhor;
    if (melhor >= 0.75) bons++;
  }
  // com 1 palavra só não dá para ter certeza; com 2+ precisa bater pelo menos 2 palavras de verdade
  if (curto.length === 1 || bons < 2) return 0;
  const base = soma / curto.length;
  const proporcao = curto.length / longo.length;
  // primeiro nome precisa combinar (ou ser a primeira palavra de um dos dois)
  const primeiro = Math.max(notaPalavra(ta[0], tb[0]), notaPalavra(curto[0], longo[0]));
  if (primeiro < 0.75 && bons < curto.length) return base * 0.8 * (0.7 + 0.3 * proporcao);
  return base * (0.7 + 0.3 * proporcao);
}

export type NivelMatch = "cpf" | "matricula" | "nome" | "provavel";

export interface ResultadoMatch {
  colaborador: ColaboradorRef | null;
  nivel: NivelMatch | null;
  /** quando há mais de uma pessoa parecida e o usuário precisa escolher */
  candidatos: ColaboradorRef[];
}

function cpfNorm(s: string | null | undefined): string {
  const d = soDigitos(s);
  return d.length >= 9 && d.length <= 10 ? d.padStart(11, "0") : d;
}

export function acharColaborador(
  item: { nome: string; cpf: string; matricula: string },
  lista: ColaboradorRef[]
): ResultadoMatch {
  const cpf = cpfNorm(item.cpf);
  if (cpf.length === 11) {
    const achado = lista.filter((c) => cpfNorm(c.cpf) === cpf);
    if (achado.length === 1) return { colaborador: achado[0], nivel: "cpf", candidatos: [] };
  }
  const mat = soDigitos(item.matricula);
  if (mat) {
    const achado = lista.filter((c) => soDigitos(c.matricula) === mat);
    if (achado.length === 1) return { colaborador: achado[0], nivel: "matricula", candidatos: [] };
  }
  const tk = tokensNome(item.nome);
  if (tk.length === 0) return { colaborador: null, nivel: null, candidatos: [] };
  const chave = tk.join(" ");

  const exatos = lista.filter((c) => tokensNome(c.nome).join(" ") === chave);
  if (exatos.length === 1) return { colaborador: exatos[0], nivel: "nome", candidatos: [] };
  if (exatos.length > 1) return { colaborador: null, nivel: null, candidatos: exatos };

  // parecidos: um nome contido no outro (a contabilidade corta nomes compridos, a planilha abrevia)
  const parecidos = lista.filter((c) => {
    const ct = tokensNome(c.nome);
    if (ct.length === 0 || ct[0] !== tk[0]) return false;
    const [curto, longo] = ct.length <= tk.length ? [ct, tk] : [tk, ct];
    if (curto.length < 2) return false;
    if (curto.every((t) => longo.includes(t))) return true;
    // nome cortado no meio da última palavra
    const a = ct.join(" ");
    return (a.startsWith(chave) || chave.startsWith(a)) && Math.min(a.length, chave.length) >= 12;
  });
  if (parecidos.length === 1) return { colaborador: parecidos[0], nivel: "provavel", candidatos: [] };
  if (parecidos.length > 1) return { colaborador: null, nivel: null, candidatos: parecidos };

  // nada igual nem contido: procura o mais parecido (erro de digitação, nome do meio, inicial, abreviação)
  const notas = lista
    .map((c) => ({ c, n: notaNome(tk, tokensNome(c.nome)) }))
    .filter((x) => x.n >= 0.55)
    .sort((a, b) => b.n - a.n);
  if (notas.length === 0) return { colaborador: null, nivel: null, candidatos: [] };
  const [primeiro, segundo] = notas;
  if (primeiro.n >= 0.75 && (!segundo || primeiro.n - segundo.n >= 0.1)) {
    return { colaborador: primeiro.c, nivel: "provavel", candidatos: [] };
  }
  return { colaborador: null, nivel: null, candidatos: notas.slice(0, 4).map((x) => x.c) };
}

// ------------------------------------------------------------
// ACHAR A COLUNA DA FOLHA (verba)
// ------------------------------------------------------------

/** tira o código da frente: "0102 VALE TRANSPORTE" / "431 - Desconto" → "vale transporte" */
function semCodigo(s: string): { texto: string; codigo: string } {
  const m = String(s ?? "").trim().match(/^0*(\d{1,4})\s*[-–.:]?\s+(.*)$/);
  if (m) return { texto: norm(m[2]), codigo: m[1] };
  return { texto: norm(s), codigo: "" };
}

export function acharRubrica(rotulo: string, rubricas: RubricaRef[]): RubricaRef | null {
  if (!rotulo) return null;
  const r = semCodigo(rotulo);
  const comCod = (t: RubricaRef) => {
    const nomeSem = semCodigo(t.nome);
    return { texto: nomeSem.texto, codigo: (t.codigo ?? "").replace(/^0+/, "").trim() || nomeSem.codigo };
  };

  // 1. mesmo texto
  const exato = rubricas.filter((t) => comCod(t).texto === r.texto && r.texto !== "");
  if (exato.length === 1) return exato[0];
  // 2. mesmo código
  if (r.codigo) {
    const porCodigo = rubricas.filter((t) => comCod(t).codigo === r.codigo);
    if (porCodigo.length === 1) return porCodigo[0];
  }
  // 3. um contém o outro (mín. 4 letras)
  if (r.texto.length >= 4) {
    const contem = rubricas.filter((t) => {
      const a = comCod(t).texto;
      if (a.length < 4) return false;
      return a.includes(r.texto) || r.texto.includes(a);
    });
    if (contem.length === 1) return contem[0];
  }
  return null;
}

/** texto "sim/não" de uma célula (para colunas do tipo Sim/Não) */
export function ehSim(bruto: string): boolean {
  const n = norm(bruto);
  if (["sim", "s", "x", "ok", "yes", "1"].includes(n)) return true;
  const v = valorBR(bruto);
  return v !== null && v !== 0;
}


// ------------------------------------------------------------
// VERBA PARECIDA (descrições que não são iguais às colunas da folha)
// ------------------------------------------------------------

/** palavras que querem dizer a mesma coisa → uma palavra só */
const SINONIMOS: Record<string, string[]> = {
  saude: ["saude", "unimed", "plano", "medico", "convenio", "amil", "hapvida", "bradesco", "assistencia"],
  odonto: ["odonto", "odontologico", "dental", "dentista"],
  transporte: ["transporte", "vt", "onibus", "passe", "bilhete", "cartao"],
  alimentacao: ["alimentacao", "va", "vr", "refeicao", "ticket", "alelo", "sodexo"],
  farmacia: ["farmacia", "drogaria", "remedio", "medicamento"],
  adiantamento: ["adiantamento", "adiant", "adto", "adiantado", "antecipacao"],
  comissao: ["comissao", "comiss", "comissoes"],
  emprestimo: ["emprestimo", "consignado", "econsignado", "financiamento", "emprest"],
  extra: ["extra", "extras", "he"],
  falta: ["falta", "faltas", "ausencia"],
  atraso: ["atraso", "atrasos"],
  bonus: ["bonus", "premio", "premiacao", "gratificacao", "meta"],
  quebra: ["quebra", "diferenca"],
  caixa: ["caixa"],
  inss: ["inss", "previdencia"],
  irrf: ["irrf", "ir", "imposto"],
  fgts: ["fgts"],
  sindicato: ["sindicato", "sindical", "mensalidade"],
  ferias: ["ferias"],
  decimo: ["decimo", "13", "13o"],
  dsr: ["dsr", "descanso"],
  salario: ["salario", "salarial", "ordenado", "vencimento"],
  familia: ["familia"],
  titular: ["titular"],
  dependente: ["dependente", "dependentes"],
  utilizacao: ["utilizacao", "utilizacoes", "coparticipacao"],
  vale: ["vale"],
  avulso: ["avulso"],
};

const PALAVRA_PARA_GRUPO = new Map<string, string>();
for (const [grupo, palavras] of Object.entries(SINONIMOS)) for (const p of palavras) PALAVRA_PARA_GRUPO.set(p, grupo);

/** palavras que não ajudam a identificar a verba */
const RUIDO = new Set(["de", "da", "do", "dos", "das", "e", "em", "s", "sobre", "folha", "valor", "vlr", "ref", "referencia", "mes", "mensal", "desc", "desconto", "descontos", "provento", "proventos", "parc", "parcela", "a", "o", "no", "na", "pgto", "pagamento"]);

function conceitos(texto: string): string[] {
  const out: string[] = [];
  // "V.T." vira "vt": junta letras soltas seguidas
  const brutas = norm(texto).split(" ");
  const palavras: string[] = [];
  for (let i = 0; i < brutas.length; i++) {
    if (brutas[i].length === 1 && /^[a-z]$/.test(brutas[i]) && i + 1 < brutas.length && /^[a-z]$/.test(brutas[i + 1])) {
      let junto = brutas[i];
      while (i + 1 < brutas.length && /^[a-z]$/.test(brutas[i + 1])) junto += brutas[++i];
      palavras.push(junto);
    } else palavras.push(brutas[i]);
  }
  for (let t of palavras) {
    if (!t || RUIDO.has(t) || /^\d+$/.test(t)) continue;
    if (!PALAVRA_PARA_GRUPO.has(t) && t.length > 4 && t.endsWith("s")) t = t.slice(0, -1); // plural
    let g = PALAVRA_PARA_GRUPO.get(t);
    if (!g && t.length >= 5) {
      // erro de digitação: "comisao" ~ "comissao"
      for (const [p, grupo] of PALAVRA_PARA_GRUPO) {
        if (p.length >= 5 && Math.abs(p.length - t.length) <= 1 && distancia(p, t) === 1) {
          g = grupo;
          break;
        }
      }
    }
    const c = g ?? t;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function notaConceitos(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let comuns = 0;
  for (const x of a) {
    if (b.some((y) => y === x || (x.length >= 5 && y.length >= 5 && (distancia(x, y) <= 1 || x.startsWith(y) || y.startsWith(x))))) comuns++;
  }
  if (comuns === 0) return 0;
  const cobre = comuns / Math.min(a.length, b.length);
  const jaccard = comuns / (a.length + b.length - comuns);
  return cobre * 0.7 + jaccard * 0.3;
}

export interface RubricaParecida {
  rubrica: RubricaRef;
  nota: number;
}

/**
 * Procura a coluna da folha com o mesmo significado, mesmo com palavras
 * diferentes ("Plano saúde Unimed" ~ "Unimed Titular", "VT" ~ "Vale Transporte").
 * Só devolve quando uma coluna se destaca; se duas empatam, devolve null.
 */
export function acharRubricaParecida(rotulo: string, rubricas: RubricaRef[]): RubricaParecida | null {
  if (!rotulo) return null;
  const sem = semCodigo(rotulo).texto || norm(rotulo);
  const cr = conceitos(sem);
  if (cr.length === 0) return null;
  const textoNorm = norm(rotulo);
  const dizDesconto = /\bdesc(onto)?s?\b/.test(textoNorm);
  const dizProvento = /\b(provento|rendimento|adicional|premio|bonus)s?\b/.test(textoNorm);
  const notas = rubricas
    .map((t) => {
      let n = notaConceitos(cr, conceitos(semCodigo(t.nome).texto || t.nome));
      if (dizDesconto && t.grupo === "provento") n *= 0.8;
      if (dizProvento && t.grupo === "desconto") n *= 0.8;
      return { rubrica: t, nota: n };
    })
    .filter((x) => x.nota >= 0.6)
    .sort((a, b) => b.nota - a.nota);
  if (notas.length === 0) return null;
  const [p, q] = notas;
  if (q && p.nota - q.nota < 0.12) return null; // empate: deixa a pessoa escolher
  return p;
}

/** as colunas da folha que mais se parecem com a verba (para mostrar como dica quando não dá para escolher sozinho) */
export function rubricasMaisParecidas(rotulo: string, rubricas: RubricaRef[], quantas = 3): RubricaRef[] {
  const sem = semCodigo(rotulo).texto || norm(rotulo);
  const cr = conceitos(sem);
  return rubricas
    .map((t) => ({ t, n: notaConceitos(cr, conceitos(semCodigo(t.nome).texto || t.nome)) }))
    .filter((x) => x.n >= 0.4)
    .sort((a, b) => b.n - a.n)
    .slice(0, quantas)
    .map((x) => x.t);
}
