"use client";

import { useMemo, useRef, useState } from "react";
import { importarLancamentosFolha, lerPlanilhaExcel } from "@/lib/actions-leitura-folha";
import { iaAnalisar, iaExtrairItens, type ItemIA } from "@/lib/actions-ia-folha";
import {
  acharColaborador,
  acharRubrica,
  acharRubricaParecida,
  rubricasMaisParecidas,
  norm,
  csvParaLinhas,
  ehSim,
  formatarValor,
  interpretarLinhas,
  valorBR,
  type ColaboradorRef,
  type ItemLido,
  type LeituraTabela,
  type ResultadoMatch,
  type RubricaRef,
} from "@/lib/leitura-folha";
import { linhasDoPdf } from "@/lib/pdf-linhas";

export interface FuncionarioImportacao extends ColaboradorRef {
  empresa: string;
  unidade: string | null;
}

interface Props {
  competencia: string;
  rotuloMes: string;
  mesFechado: boolean;
  funcionarios: FuncionarioImportacao[];
  rubricas: (RubricaRef & { automatico: boolean })[];
  /** valores que já estão na planilha agora (colaborador → coluna → texto) */
  valoresAtuais: Record<string, Record<string, string>>;
  aoFechar: () => void;
  aoConcluir: () => void;
}

type Etapa = "escolher" | "lendo" | "previa" | "salvando" | "pronto";

interface PessoaLida {
  chave: string;
  nome: string;
  cpf: string;
  matricula: string;
  itens: ItemLido[];
  match: ResultadoMatch;
}

const TXT = "text-[13px]";
const NIVEL_ROTULO: Record<string, string> = {
  cpf: "pelo CPF",
  matricula: "pela matrícula",
  nome: "pelo nome",
  provavel: "nome parecido — confira",
};

function chaveDaPessoa(i: { nome: string; cpf: string; matricula: string }): string {
  const cpf = i.cpf.replace(/\D/g, "");
  if (cpf.length >= 9) return `cpf:${cpf}`;
  if (i.matricula.trim()) return `mat:${i.matricula.replace(/\D/g, "") || i.matricula.trim()}`;
  return `nome:${i.nome.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

// ---- o app lembra das escolhas anteriores (guardado só neste navegador) ----
const CHAVE_MEMORIA = "folha_importacao_memoria_v1";
interface Memoria {
  colunas: Record<string, string>;
  pessoas: Record<string, string>;
}
function lerMemoria(): Memoria {
  try {
    const bruto = typeof window !== "undefined" ? window.localStorage.getItem(CHAVE_MEMORIA) : null;
    if (bruto) {
      const m = JSON.parse(bruto) as Partial<Memoria>;
      return { colunas: m.colunas ?? {}, pessoas: m.pessoas ?? {} };
    }
  } catch {
    /* sem memória: tudo bem */
  }
  return { colunas: {}, pessoas: {} };
}
function gravarMemoria(m: Memoria) {
  try {
    window.localStorage.setItem(CHAVE_MEMORIA, JSON.stringify(m));
  } catch {
    /* sem memória: tudo bem */
  }
}

type OrigemSugestao = "ia" | "parecida" | "lembrada";

function agruparPessoas(itens: ItemLido[], funcionarios: ColaboradorRef[]): PessoaLida[] {
  const mapaPessoas = new Map<string, PessoaLida>();
  for (const it of itens) {
    const chave = chaveDaPessoa(it);
    let p = mapaPessoas.get(chave);
    if (!p) {
      p = { chave, nome: it.nome, cpf: it.cpf, matricula: it.matricula, itens: [], match: acharColaborador(it, funcionarios) };
      mapaPessoas.set(chave, p);
    }
    p.itens.push(it);
  }
  return Array.from(mapaPessoas.values());
}

/** junta o que a IA extraiu (já conferido no servidor) no mesmo formato da leitura por regras */
function leituraDaIA(itensIA: ItemIA[], avisos: string[]): LeituraTabela {
  const itens: ItemLido[] = itensIA.map((x, i) => ({
    linha: i + 1,
    nome: x.nome,
    cpf: x.cpf,
    matricula: x.matricula,
    rotulo: x.rotulo,
    bruto: formatarValor(x.valor),
    valor: x.valor,
  }));
  const rotulos: string[] = [];
  for (const it of itens) if (!rotulos.includes(it.rotulo)) rotulos.push(it.rotulo);
  return { ok: itens.length > 0, formato: "longo", itens, rotulos, avisos, linhasLidas: itens.length, erro: itens.length ? undefined : "A IA não achou valores nesse arquivo." };
}

const PEDACO_LINHAS = 100;
const MAX_PEDACOS = 12;

export default function ImportarArquivoFolha({
  competencia,
  rotuloMes,
  mesFechado,
  funcionarios,
  rubricas,
  valoresAtuais,
  aoFechar,
  aoConcluir,
}: Props) {
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [abas, setAbas] = useState<{ nome: string; linhas: string[][] }[]>([]);
  const [abaSel, setAbaSel] = useState(0);
  const [leitura, setLeitura] = useState<LeituraTabela | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [excluir, setExcluir] = useState<Record<string, boolean>>({});
  const [modo, setModo] = useState<"substituir" | "somar">("substituir");
  const [soPendentes, setSoPendentes] = useState(false);
  const [gravados, setGravados] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const [linhasAtuais, setLinhasAtuais] = useState<string[][]>([]);
  /** linhas como a IA deve ler (CSV/TXT: o texto cru, sem cortar nas vírgulas) */
  const [linhasParaIA, setLinhasParaIA] = useState<string[][]>([]);
  const [statusIA, setStatusIA] = useState("");
  const [iaIndisponivel, setIaIndisponivel] = useState("");
  const [sugColunas, setSugColunas] = useState<Record<string, { id: string; origem: OrigemSugestao }>>({});
  const [lembradas, setLembradas] = useState<Record<string, string>>({});
  const [iaPessoas, setIaPessoas] = useState<Record<string, string>>({});
  const execucao = useRef(0);

  const rubricasUsaveis = useMemo(() => rubricas.filter((r) => !r.automatico), [rubricas]);
  const rubricaPorId = useMemo(() => new Map(rubricasUsaveis.map((r) => [r.id, r])), [rubricasUsaveis]);
  const funcPorId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);

  // ------------------------------------------------------------------
  // 1. ler o arquivo
  // ------------------------------------------------------------------
  function mostrarLeitura(r: LeituraTabela): Record<string, string> {
    const memoria = lerMemoria();
    const sug: Record<string, { id: string; origem: OrigemSugestao }> = {};
    const novoMapa: Record<string, string> = {};
    for (const rot of r.rotulos) {
      const exata = acharRubrica(rot, rubricasUsaveis);
      const lembrada = memoria.colunas[norm(rot)];
      if (lembrada && rubricaPorId.has(lembrada)) {
        novoMapa[rot] = lembrada;
        if (exata?.id !== lembrada) sug[rot] = { id: lembrada, origem: "lembrada" };
      } else if (exata) {
        novoMapa[rot] = exata.id;
      } else {
        const parecida = acharRubricaParecida(rot, rubricasUsaveis);
        novoMapa[rot] = parecida?.rubrica.id ?? "";
        if (parecida) sug[rot] = { id: parecida.rubrica.id, origem: "parecida" };
      }
    }
    // pessoas que o app já aprendeu em outra importação (nome do arquivo → colaborador)
    const lemb: Record<string, string> = {};
    for (const p of agruparPessoas(r.itens, funcionarios)) {
      const exato = p.match.nivel === "cpf" || p.match.nivel === "matricula" || p.match.nivel === "nome";
      const id = memoria.pessoas[norm(p.nome)];
      if (!exato && id && funcPorId.has(id)) lemb[p.chave] = id;
    }
    setMapa(novoMapa);
    setEscolha({});
    setExcluir({});
    setSugColunas(sug);
    setLembradas(lemb);
    setIaPessoas({});
    setLeitura(r);
    setEtapa("previa");
    return novoMapa;
  }

  /** lê o arquivo inteiro pela IA, em pedaços (cada pedaço é uma chamada curta) */
  async function extrairComIA(linhas: string[][], nomeArq: string, id: number): Promise<LeituraTabela | { erro: string; semChave?: boolean }> {
    const pedacos: string[][][] = [];
    for (let i = 0; i < linhas.length; i += PEDACO_LINHAS) pedacos.push(linhas.slice(i, i + PEDACO_LINHAS));
    if (pedacos.length > MAX_PEDACOS) {
      return { erro: `Esse arquivo é grande demais para a IA ler de uma vez (${linhas.length} linhas). Divida em partes menores.` };
    }
    const todos: ItemIA[] = [];
    let descartados = 0;
    let ultimoNome = "";
    for (let i = 0; i < pedacos.length; i++) {
      if (execucao.current !== id) return { erro: "cancelado" };
      setStatusIA(`A IA está lendo o arquivo… parte ${i + 1} de ${pedacos.length}`);
      const r = await iaExtrairItens({ nomeArquivo: nomeArq, linhas: pedacos[i], ultimoNome });
      if (!r.ok) return { erro: r.erro, semChave: r.semChave };
      todos.push(...r.itens);
      descartados += r.descartados;
      ultimoNome = r.ultimoNome;
    }
    const avisos = ["Esse arquivo foi lido pela IA. Confira os valores com atenção antes de confirmar."];
    if (descartados > 0) avisos.push(`${descartados} valor${descartados === 1 ? "" : "es"} que a IA devolveu não estava${descartados === 1 ? "" : "m"} escrito${descartados === 1 ? "" : "s"} no arquivo e foi${descartados === 1 ? "" : "ram"} descartado${descartados === 1 ? "" : "s"}.`);
    return leituraDaIA(todos, avisos);
  }

  /** a IA só cuida do que as regras não resolveram: colunas sem destino e pessoas não achadas ou duvidosas */
  async function refinarComIA(r: LeituraTabela, mapaInicial: Record<string, string>, nomeArq: string, id: number) {
    const memoria = lerMemoria();
    const lembradasAgora: Record<string, string> = {};
    for (const p of agruparPessoas(r.itens, funcionarios)) {
      const mid = memoria.pessoas[norm(p.nome)];
      if (mid && funcPorId.has(mid)) lembradasAgora[p.chave] = mid;
    }
    const pendRotulos = r.rotulos.filter((rot) => !mapaInicial[rot]);
    const todasPessoas = agruparPessoas(r.itens, funcionarios);
    const pendPessoas = todasPessoas.filter((p) => !p.match.colaborador && !lembradasAgora[p.chave]);
    if (pendRotulos.length === 0 && pendPessoas.length === 0) {
      setStatusIA("");
      return;
    }
    setStatusIA("A IA está conferindo colunas e pessoas…");

    const colunasArquivo = pendRotulos.map((rot) => {
      const its = r.itens.filter((i) => i.rotulo === rot);
      const nums = its.map((i) => i.valor).filter((v): v is number => v !== null);
      return { rotulo: rot, amostras: its.slice(0, 4).map((i) => i.bruto), soma: nums.length ? nums.reduce((a, b) => a + b, 0) : null };
    });
    const colunasFolha = rubricasUsaveis.map((x) => ({ id: x.id, nome: x.nome, grupo: x.grupo, formato: x.formato }));
    const colaboradores = funcionarios.map((f) => ({ id: f.id, nome: f.nome, detalhe: [f.empresa, f.unidade].filter(Boolean).join(" · ") }));

    const lotes: { chave: string; nome: string; matricula: string }[][] = [];
    const pessoasPend = pendPessoas.map((p) => ({ chave: p.chave, nome: p.nome, matricula: p.matricula }));
    for (let i = 0; i < pessoasPend.length; i += 80) lotes.push(pessoasPend.slice(i, i + 80));
    if (lotes.length === 0) lotes.push([]);

    for (let i = 0; i < lotes.length; i++) {
      if (execucao.current !== id) return;
      const resp = await iaAnalisar({
        nomeArquivo: nomeArq,
        colunasArquivo: i === 0 ? colunasArquivo : [],
        colunasFolha: i === 0 ? colunasFolha : [],
        pessoas: lotes[i],
        colaboradores: lotes[i].length ? colaboradores : [],
      });
      if (execucao.current !== id) return;
      if (!resp.ok) {
        setStatusIA("");
        if (!resp.semChave) setIaIndisponivel(resp.erro); // sem chave = IA desligada: segue só com as regras, sem aviso
        return;
      }
      // só preenche o que ainda está vazio (se a pessoa já mexeu, vale o que ela escolheu)
      if (Object.keys(resp.colunas).length) {
        setMapa((m) => {
          const novo = { ...m };
          for (const [rot, v] of Object.entries(resp.colunas)) if (!novo[rot]) novo[rot] = v.rubricaId;
          return novo;
        });
        setSugColunas((x) => ({ ...x, ...Object.fromEntries(Object.entries(resp.colunas).map(([rot, v]) => [rot, { id: v.rubricaId, origem: "ia" as OrigemSugestao }])) }));
      }
      if (Object.keys(resp.pessoas).length) {
        setIaPessoas((x) => ({ ...x, ...Object.fromEntries(Object.entries(resp.pessoas).map(([ch, v]) => [ch, v.colaboradorId])) }));
      }
    }
    setStatusIA("");
  }

  async function aplicarLinhas(linhas: string[][], opcoes?: { forcarIA?: boolean; nomeArq?: string; linhasIA?: string[][] }) {
    const nomeArq = opcoes?.nomeArq ?? nomeArquivo;
    const id = ++execucao.current;
    const linhasIA = opcoes?.linhasIA ?? linhas;
    setLinhasAtuais(linhas);
    setLinhasParaIA(linhasIA);
    setIaIndisponivel("");
    setStatusIA("");

    let r: LeituraTabela | null = opcoes?.forcarIA ? null : interpretarLinhas(linhas);
    if (!r || !r.ok || r.itens.length === 0) {
      // as regras não entenderam: tenta a IA
      const erroRegras = r?.erro ?? "Não consegui entender esse arquivo.";
      setEtapa(opcoes?.forcarIA && leitura ? "previa" : "lendo");
      setStatusIA("A IA está lendo o arquivo…");
      const ia = await extrairComIA(linhasIA, nomeArq, id);
      if (execucao.current !== id) return;
      setStatusIA("");
      if (!("itens" in ia)) {
        if (opcoes?.forcarIA && leitura) {
          setErro(ia.erro);
          setEtapa("previa");
        } else {
          setErro(ia.semChave ? erroRegras : `${erroRegras} A IA também não conseguiu: ${ia.erro}`);
          setEtapa("escolher");
        }
        return;
      }
      if (!ia.ok) {
        const refazendo = !!opcoes?.forcarIA && !!leitura;
        setErro(refazendo ? (ia.erro ?? "A IA não achou valores nesse arquivo.") : `${erroRegras} ${ia.erro ?? ""}`.trim());
        setEtapa(refazendo ? "previa" : "escolher");
        return;
      }
      r = ia;
    }
    setErro(null);
    const mapaInicial = mostrarLeitura(r);
    await refinarComIA(r, mapaInicial, nomeArq, id);
  }

  async function lerArquivo(arquivo: File) {
    setErro(null);
    setEtapa("lendo");
    setNomeArquivo(arquivo.name);
    setAbas([]);
    setAbaSel(0);
    try {
      const nome = arquivo.name.toLowerCase();
      if (nome.endsWith(".pdf")) {
        const linhas = await linhasDoPdf(arquivo);
        if (linhas.length === 0) {
          throw new Error("Esse PDF não tem texto para eu ler (pode ser uma foto ou digitalização). Use um PDF gerado pelo sistema, ou uma planilha.");
        }
        await aplicarLinhas(linhas, { nomeArq: arquivo.name });
      } else if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
        const texto = await arquivo.text();
        const cruas = texto
          .replace(/^\uFEFF/, "")
          .split(/\r?\n/)
          .filter((l) => l.trim() !== "")
          .map((l) => [l]);
        await aplicarLinhas(csvParaLinhas(texto), { nomeArq: arquivo.name, linhasIA: cruas });
      } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
        const fd = new FormData();
        fd.set("arquivo", arquivo);
        const r = await lerPlanilhaExcel(fd);
        if (!r.ok) throw new Error(r.erro);
        setAbas(r.abas);
        // abre a aba que mais parece uma lista de pessoas (a com mais linhas)
        let melhor = 0;
        r.abas.forEach((a, i) => {
          if (a.linhas.length > r.abas[melhor].linhas.length) melhor = i;
        });
        setAbaSel(melhor);
        await aplicarLinhas(r.abas[melhor].linhas, { nomeArq: arquivo.name });
      } else {
        throw new Error("Tipo de arquivo não aceito. Envie Excel (.xlsx), CSV ou PDF.");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler esse arquivo.");
      setEtapa("escolher");
    }
  }

  function trocarAba(i: number) {
    setAbaSel(i);
    void aplicarLinhas(abas[i].linhas);
  }

  // ------------------------------------------------------------------
  // 2. juntar linhas por pessoa e achar o colaborador
  // ------------------------------------------------------------------
  const pessoas: PessoaLida[] = useMemo(() => (leitura ? agruparPessoas(leitura.itens, funcionarios) : []), [leitura, funcionarios]);

  // os parecidos vêm primeiro na lista de escolha
  const opcoesDaPessoa = (p: PessoaLida): FuncionarioImportacao[] => {
    const parecidos = p.match.candidatos.map((c) => funcPorId.get(c.id)).filter((f): f is FuncionarioImportacao => !!f);
    return [...parecidos, ...funcionarios.filter((f) => !parecidos.some((c) => c.id === f.id))];
  };

  const matchExato = (p: PessoaLida): boolean => p.match.nivel === "cpf" || p.match.nivel === "matricula" || p.match.nivel === "nome";
  /** ordem: o que você escolheu > CPF/matrícula/nome igual > o que o app lembrou > nome parecido > IA */
  const colaboradorDe = (p: PessoaLida): string =>
    escolha[p.chave] ?? (matchExato(p) ? p.match.colaborador?.id : undefined) ?? lembradas[p.chave] ?? p.match.colaborador?.id ?? iaPessoas[p.chave] ?? "";
  const soLembrada = (p: PessoaLida): boolean => !escolha[p.chave] && !matchExato(p) && !!lembradas[p.chave];
  /** a pessoa foi achada só pela IA (nem as regras nem o usuário decidiram) */
  const soIA = (p: PessoaLida): boolean => !escolha[p.chave] && !p.match.colaborador && !lembradas[p.chave] && !!iaPessoas[p.chave];

  // ------------------------------------------------------------------
  // 3. o que vai ser lançado
  // ------------------------------------------------------------------
  const lancamentos = useMemo(() => {
    const acum = new Map<
      string,
      { colaboradorId: string; tipoId: string; valor: number; valorTexto: string | null; atual: string; nomeLido: string }
    >();
    for (const p of pessoas) {
      if (excluir[p.chave]) continue;
      const colabId = colaboradorDe(p);
      if (!colabId) continue;
      for (const it of p.itens) {
        const rubId = mapa[it.rotulo];
        if (!rubId) continue;
        const rub = rubricaPorId.get(rubId);
        if (!rub) continue;
        const chave = `${colabId}:${rubId}`;
        const atual = valoresAtuais[colabId]?.[rubId] ?? "";
        let item = acum.get(chave);
        if (!item) {
          item = { colaboradorId: colabId, tipoId: rubId, valor: 0, valorTexto: null, atual, nomeLido: p.nome };
          acum.set(chave, item);
        }
        if (rub.formato === "moeda") {
          item.valor += it.valor ?? 0;
        } else if (rub.formato === "sim_nao") {
          item.valorTexto = ehSim(it.bruto) ? "SIM" : item.valorTexto;
        } else {
          item.valorTexto = item.valorTexto ? `${item.valorTexto} ${it.bruto}` : it.bruto;
        }
      }
    }
    const lista = Array.from(acum.values()).map((x) => {
      const rub = rubricaPorId.get(x.tipoId)!;
      if (rub.formato === "moeda") {
        const antes = valorBR(x.atual) ?? 0;
        const valor = modo === "somar" ? antes + x.valor : x.valor;
        return { ...x, valor: Math.round(valor * 100) / 100, antes };
      }
      return { ...x, antes: 0 };
    });
    return lista.filter((x) => x.valor !== 0 || x.valorTexto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, excluir, escolha, iaPessoas, lembradas, mapa, rubricaPorId, valoresAtuais, modo]);

  const semColaborador = pessoas.filter((p) => !colaboradorDe(p) && !excluir[p.chave]);
  const provaveis = pessoas.filter((p) => !escolha[p.chave] && !soLembrada(p) && (p.match.nivel === "provavel" || soIA(p)));
  const rotulosSemColuna = (leitura?.rotulos ?? []).filter((r) => !mapa[r]);
  const substituidos = lancamentos.filter((l) => l.atual && modo === "substituir" && (valorBR(l.atual) ?? 0) !== l.valor && l.atual !== "").length;

  // ------------------------------------------------------------------
  // 4. gravar
  // ------------------------------------------------------------------
  async function confirmar() {
    setErro(null);
    setEtapa("salvando");
    const r = await importarLancamentosFolha(
      competencia,
      lancamentos.map((l) => ({ colaboradorId: l.colaboradorId, tipoId: l.tipoId, valor: l.valor, valorTexto: l.valorTexto }))
    );
    if (!r.ok) {
      setErro(r.erro);
      setEtapa("previa");
      return;
    }
    // o app aprende: na próxima vez, essas colunas e pessoas já vêm escolhidas
    const mem = lerMemoria();
    for (const rot of leitura?.rotulos ?? []) if (rot && mapa[rot]) mem.colunas[norm(rot)] = mapa[rot];
    for (const p of pessoas) {
      const id = colaboradorDe(p);
      if (id && !excluir[p.chave] && p.nome && !matchExato(p)) mem.pessoas[norm(p.nome)] = id;
    }
    gravarMemoria(mem);
    setGravados(r.gravados);
    setEtapa("pronto");
  }

  // ------------------------------------------------------------------
  // tela
  // ------------------------------------------------------------------
  const pessoasVisiveis = soPendentes ? pessoas.filter((p) => !colaboradorDe(p) || (!soLembrada(p) && (p.match.nivel === "provavel" || soIA(p)))) : pessoas;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Importar arquivo para a folha"
        className="flex max-h-[92vh] w-full max-w-[980px] flex-col rounded-[10px] bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Importar arquivo para a folha</h3>
            <p className={`${TXT} text-slate-600`}>
              Mês: <b>{rotuloMes}</b>. Aceita Excel (.xlsx), CSV e PDF. Entende colunas e nomes parecidos. Nada é lançado antes de você conferir e confirmar.
            </p>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md px-2 py-1 text-[13px] text-slate-600 hover:bg-slate-100">
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mesFechado && (
            <p className={`${TXT} mb-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900`}>
              Esse mês está fechado. Reabra o mês antes de importar.
            </p>
          )}
          {erro && <p className={`${TXT} mb-3 rounded-md bg-red-50 px-3 py-2 text-red-800`}>{erro}</p>}

          {/* ----------------------- escolher / lendo ----------------------- */}
          {(etapa === "escolher" || etapa === "lendo") && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f && etapa === "escolher") void lerArquivo(f);
                }}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center"
              >
                <p className="text-[15px] font-medium">
                  {etapa === "lendo" ? statusIA || `Lendo ${nomeArquivo}…` : "Arraste o arquivo aqui ou escolha no computador"}
                </p>
                <button
                  type="button"
                  disabled={etapa === "lendo" || mesFechado}
                  onClick={() => entrada.current?.click()}
                  className="btn-primary disabled:opacity-50"
                >
                  Escolher arquivo
                </button>
                <input
                  ref={entrada}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lerArquivo(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className={`${TXT} space-y-1 text-slate-700`}>
                <p>
                  <b>Como o arquivo deve ser:</b>
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <b>Uma linha por pessoa</b>, com o nome (ou CPF) e uma coluna para cada verba. Ex.: Nome · Unimed · Vale transporte.
                  </li>
                  <li>
                    <b>Ou uma linha por verba</b>: Nome · Verba · Valor.
                  </li>
                  <li>
                    <b>Ou só duas colunas</b> (Nome · Valor): depois você escolhe a qual coluna da folha o arquivo pertence.
                  </li>
                  <li>
                    <b>Recibos de pagamento em PDF</b> (da contabilidade) também são lidos: um por pessoa.
                  </li>
                  <li>PDF precisa ter texto (não pode ser foto ou digitalização).</li>
                </ul>
              </div>
            </div>
          )}

          {/* ----------------------------- prévia ----------------------------- */}
          {(etapa === "previa" || etapa === "salvando") && leitura && (
            <div className="space-y-5">
              <div className={`${TXT} flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700`}>
                <span>
                  Arquivo: <b>{nomeArquivo}</b>
                </span>
                <span>
                  {pessoas.length} pessoa{pessoas.length === 1 ? "" : "s"} · {leitura.rotulos.length} coluna{leitura.rotulos.length === 1 ? "" : "s"} no arquivo
                </span>
                {abas.length > 1 && (
                  <label className="flex items-center gap-2">
                    Aba:
                    <select value={abaSel} onChange={(e) => trocarAba(Number(e.target.value))} className="input !w-auto !py-1">
                      {abas.map((a, i) => (
                        <option key={a.nome} value={i}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="text-blue-700 underline"
                  onClick={() => {
                    execucao.current++;
                    setStatusIA("");
                    setLeitura(null);
                    setEtapa("escolher");
                  }}
                >
                  Trocar arquivo
                </button>
                <button
                  type="button"
                  className="text-blue-700 underline disabled:opacity-50"
                  disabled={!!statusIA || etapa === "salvando"}
                  title="A IA lê o arquivo do zero, sem usar as regras. Use se os valores ou as colunas vieram errados."
                  onClick={() => void aplicarLinhas(linhasAtuais, { forcarIA: true, linhasIA: linhasParaIA })}
                >
                  Ler de novo com IA
                </button>
              </div>
              {statusIA && (
                <p className={`${TXT} rounded-md bg-blue-50 px-3 py-2 text-blue-900`} role="status">
                  {statusIA} Pode ir conferindo, as sugestões aparecem em amarelo.
                </p>
              )}
              {iaIndisponivel && (
                <p className={`${TXT} rounded-md bg-slate-50 px-3 py-2 text-slate-700`}>
                  A IA não ajudou dessa vez: {iaIndisponivel} O que as regras entenderam continua valendo.
                </p>
              )}
              {leitura.avisos.map((a, i) => (
                <p key={i} className={`${TXT} rounded-md bg-slate-50 px-3 py-2 text-slate-700`}>
                  {a}
                </p>
              ))}

              {/* --- passo 1: colunas --- */}
              <section>
                <h4 className="mb-1 text-[14px] font-semibold">1 · Para qual coluna da folha vai cada valor?</h4>
                <p className={`${TXT} mb-2 text-slate-600`}>
                  Já escolhi o que reconheci (o que a IA sugeriu fica em amarelo). Onde estiver &quot;Não importar&quot;, a coluna do arquivo fica de fora.
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className={`w-full ${TXT}`}>
                    <thead className="bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2">No arquivo</th>
                        <th className="px-3 py-2 text-right">Valores</th>
                        <th className="px-3 py-2 text-right">Soma</th>
                        <th className="px-3 py-2">Coluna da folha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leitura.rotulos.map((rot) => {
                        const itensRot = leitura.itens.filter((i) => i.rotulo === rot);
                        const soma = itensRot.reduce((s, i) => s + (i.valor ?? 0), 0);
                        const rubSel = mapa[rot] ? rubricaPorId.get(mapa[rot]) : null;
                        return (
                          <tr key={rot || "_unica"} className="border-t border-slate-100">
                            <td className="px-3 py-2">{rot || <i className="text-slate-500">(arquivo inteiro)</i>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{itensRot.length}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatarValor(soma)}</td>
                            <td className="px-3 py-2">
                              <select
                                aria-label={`Coluna da folha para ${rot || "o arquivo"}`}
                                value={mapa[rot] ?? ""}
                                onChange={(e) => setMapa((m) => ({ ...m, [rot]: e.target.value }))}
                                className={`input !py-1 ${!mapa[rot] || (sugColunas[rot]?.id === mapa[rot] && sugColunas[rot].origem !== "lembrada") ? "!border-amber-400 !bg-amber-50" : ""}`}
                              >
                                <option value="">— Não importar —</option>
                                <optgroup label="Proventos">
                                  {rubricasUsaveis
                                    .filter((r) => r.grupo === "provento")
                                    .map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.nome}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Descontos">
                                  {rubricasUsaveis
                                    .filter((r) => r.grupo === "desconto")
                                    .map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.nome}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                              {mapa[rot] && sugColunas[rot]?.id === mapa[rot] && (
                                <span className={`mt-1 block text-[11px] ${sugColunas[rot].origem === "lembrada" ? "text-slate-500" : "text-amber-800"}`}>
                                  {sugColunas[rot].origem === "ia"
                                    ? "Sugerido pela IA — confira."
                                    : sugColunas[rot].origem === "parecida"
                                    ? "Nome parecido — confira."
                                    : "Lembrei da última importação."}
                                </span>
                              )}
                              {!mapa[rot] && rubricasMaisParecidas(rot, rubricasUsaveis).length > 0 && (
                                <span className="mt-1 block text-[11px] text-slate-600">
                                  Parecidas: {rubricasMaisParecidas(rot, rubricasUsaveis).map((x) => x.nome).join(", ")}
                                </span>
                              )}
                              {rubSel && rubSel.formato !== "moeda" && (
                                <span className="mt-1 block text-[11px] text-slate-500">
                                  Coluna de {rubSel.formato === "texto" ? "texto" : "Sim/Não"}: o texto do arquivo vai como está.
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* --- passo 2: pessoas --- */}
              <section>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[14px] font-semibold">2 · Quem é cada pessoa?</h4>
                  <label className={`${TXT} flex items-center gap-2`}>
                    <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
                    Mostrar só o que precisa de atenção ({semColaborador.length + provaveis.length})
                  </label>
                </div>
                <p className={`${TXT} mb-2 text-slate-600`}>
                  Procurei pelo CPF, pela matrícula e pelo nome, mesmo que o nome esteja abreviado ou com erro de digitação (sugestões em amarelo). O que você confirma aqui eu lembro na próxima vez. Quem não foi achado fica de fora até você escolher o colaborador.
                </p>
                <div className="max-h-[320px] overflow-auto rounded-lg border border-slate-200">
                  <table className={`w-full ${TXT}`}>
                    <thead className="sticky top-0 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="w-8 px-3 py-2" aria-label="Incluir"></th>
                        <th className="px-3 py-2">No arquivo</th>
                        <th className="px-3 py-2">Colaborador na folha</th>
                        <th className="px-3 py-2 text-right">Valores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pessoasVisiveis.map((p) => {
                        const colabId = colaboradorDe(p);
                        const provavel = !escolha[p.chave] && !soLembrada(p) && (p.match.nivel === "provavel" || soIA(p));
                        const itensDaPessoa = p.itens.filter((i) => mapa[i.rotulo]).length;
                        return (
                          <tr key={p.chave} className={`border-t border-slate-100 ${excluir[p.chave] ? "opacity-50" : ""}`}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Incluir ${p.nome}`}
                                checked={!excluir[p.chave] && !!colabId}
                                disabled={!colabId}
                                onChange={(e) => setExcluir((x) => ({ ...x, [p.chave]: !e.target.checked }))}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{p.nome || "(sem nome)"}</div>
                              {(p.cpf || p.matricula) && (
                                <div className="text-[11px] text-slate-500">{[p.cpf && `CPF ${p.cpf}`, p.matricula && `Mat. ${p.matricula}`].filter(Boolean).join(" · ")}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                aria-label={`Colaborador para ${p.nome}`}
                                value={colabId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEscolha((x) => ({ ...x, [p.chave]: v }));
                                  setExcluir((x) => ({ ...x, [p.chave]: v === "" }));
                                }}
                                className={`input !py-1 ${!colabId ? "!border-red-300 !bg-red-50" : provavel ? "!border-amber-400 !bg-amber-50" : ""}`}
                              >
                                <option value="">— escolher colaborador —</option>
                                {opcoesDaPessoa(p).map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.nome} — {f.unidade ?? f.empresa}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {escolha[p.chave]
                                  ? "escolhido por você"
                                  : soLembrada(p)
                                  ? "lembrei da última importação"
                                  : soIA(p)
                                  ? "sugerido pela IA — confira"
                                  : p.match.nivel
                                  ? NIVEL_ROTULO[p.match.nivel]
                                  : p.match.candidatos.length > 1
                                  ? "mais de um parecido — escolha"
                                  : "não encontrado"}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{itensDaPessoa}</td>
                          </tr>
                        );
                      })}
                      {pessoasVisiveis.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                            Tudo certo por aqui.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* --- passo 3: conferência --- */}
              <section>
                <h4 className="mb-1 text-[14px] font-semibold">3 · O que será lançado</h4>
                <div className={`${TXT} mb-2 flex flex-wrap items-center gap-x-5 gap-y-1`}>
                  <span className="font-medium">Se a célula já tiver valor:</span>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="modo" checked={modo === "substituir"} onChange={() => setModo("substituir")} />
                    Trocar pelo valor do arquivo
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="modo" checked={modo === "somar"} onChange={() => setModo("somar")} />
                    Somar ao que já está
                  </label>
                </div>
                <div className="max-h-[260px] overflow-auto rounded-lg border border-slate-200">
                  <table className={`w-full ${TXT}`}>
                    <thead className="sticky top-0 bg-slate-50 text-left text-[12px] uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Colaborador</th>
                        <th className="px-3 py-2">Coluna</th>
                        <th className="px-3 py-2 text-right">Já está</th>
                        <th className="px-3 py-2 text-right">Vai ficar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentos.map((l) => {
                        const rub = rubricaPorId.get(l.tipoId)!;
                        const nome = funcPorId.get(l.colaboradorId)?.nome ?? l.nomeLido;
                        const tem = !!l.atual;
                        return (
                          <tr key={`${l.colaboradorId}:${l.tipoId}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5">{nome}</td>
                            <td className="px-3 py-1.5">{rub.nome}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{tem ? l.atual : "—"}</td>
                            <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${tem && modo === "substituir" ? "text-amber-800" : ""}`}>
                              {rub.formato === "moeda" ? formatarValor(l.valor) : l.valorTexto}
                            </td>
                          </tr>
                        );
                      })}
                      {lancamentos.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                            Ainda não há nada para lançar. Escolha as colunas da folha e confira as pessoas acima.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* ----------------------------- pronto ----------------------------- */}
          {etapa === "pronto" && (
            <div className="space-y-3 py-6 text-center">
              <p className="text-[18px] font-semibold text-emerald-800">Pronto! {gravados} valor{gravados === 1 ? "" : "es"} lançado{gravados === 1 ? "" : "s"}.</p>
              <p className={`${TXT} text-slate-600`}>A planilha vai atualizar agora. Confira os valores na grade.</p>
              <button type="button" className="btn-primary" onClick={aoConcluir}>
                Ver a planilha
              </button>
            </div>
          )}
        </div>

        {/* rodapé */}
        {(etapa === "previa" || etapa === "salvando") && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
            <div className={`${TXT} flex-1 text-slate-700`}>
              <b>{lancamentos.length}</b> valor{lancamentos.length === 1 ? "" : "es"} para lançar
              {semColaborador.length > 0 && (
                <span className="text-red-800"> · {semColaborador.length} pessoa{semColaborador.length === 1 ? "" : "s"} sem colaborador (ficam de fora)</span>
              )}
              {rotulosSemColuna.length > 0 && <span className="text-amber-800"> · {rotulosSemColuna.length} coluna{rotulosSemColuna.length === 1 ? "" : "s"} do arquivo não importada{rotulosSemColuna.length === 1 ? "" : "s"}</span>}
              {substituidos > 0 && <span className="text-amber-800"> · {substituidos} vai trocar um valor que já estava</span>}
            </div>
            <button type="button" onClick={aoFechar} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={lancamentos.length === 0 || etapa === "salvando" || mesFechado}
              className="btn-primary disabled:opacity-50"
            >
              {etapa === "salvando" ? "Lançando…" : `Confirmar e lançar ${lancamentos.length}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
