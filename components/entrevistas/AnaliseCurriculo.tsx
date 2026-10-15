"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Aba "Análise do currículo" da ficha do candidato.
 * Chama /api/analise-curriculo (IA) e mostra as 10 etapas como seções que abrem e fecham.
 * A análise é apoio ao entrevistador: não dá nota nem aprova/reprova.
 */

interface Props {
  candidatoId: string;
  temCurriculo: boolean;
  nomeCurriculo: string | null;
  /** Cargos cadastrados em "Cargos" (para escolher a descrição usada). */
  cargos: { id: string; cargo: string; empresa: string }[];
  /** Cargo que combina com a vaga (escolhido automaticamente). */
  cargoAutoId: string | null;
  vagaRotulo: string;
  textoInicial: string | null;
  emInicial: string | null;
  /** Verdadeiro quando o currículo acabou de ser anexado: a análise começa sozinha ao abrir a aba. */
  autoIniciar: boolean;
  aoIniciou: () => void;
  aoGuardar: (texto: string, em: string) => void;
}

/* ---------------- leitura simples do texto em Markdown ---------------- */

function inline(t: string): ReactNode[] {
  const partes = t.replace(/<br\s*\/?>/gi, " ").split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g);
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p) || /^__[^_]+__$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p) || /^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const ETIQUETAS: [RegExp, string][] = [
  [/^evidenciado/i, "bg-green-100 text-green-800"],
  [/^parcialmente/i, "bg-amber-100 text-amber-800"],
  [/^n[aã]o identificado/i, "bg-red-100 text-red-800"],
  [/^a validar/i, "bg-teal-100 text-teal-800"],
];

function celula(t: string): ReactNode {
  const limpo = t.replace(/\*\*/g, "").trim();
  for (const [re, cls] of ETIQUETAS) {
    if (re.test(limpo)) return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{limpo}</span>;
  }
  return inline(t);
}

const ehTabela = (l: string) => l.trim().startsWith("|");
const ehSeparador = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
const partirLinha = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function Corpo({ linhas }: { linhas: string[] }) {
  const saida: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (ehTabela(l)) {
      const bloco: string[] = [];
      while (i < linhas.length && ehTabela(linhas[i])) bloco.push(linhas[i++]);
      const linhasTab = bloco.filter((x) => !ehSeparador(x)).map(partirLinha);
      const [cab, ...resto] = linhasTab;
      if (!cab) continue;
      saida.push(
        <div key={k++} className="overflow-x-auto rounded-lg border border-brand-200 my-2">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="bg-brand-50">
                {cab.map((c, j) => (
                  <th key={j} className="px-2.5 py-2 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resto.map((r, j) => (
                <tr key={j} className="border-t border-brand-200 align-top">
                  {cab.map((_, c) => (
                    <td key={c} className="px-2.5 py-2">
                      {celula(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*([-*•])\s+/.test(l)) {
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*•])\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*•])\s+/, ""));
      saida.push(
        <ul key={k++} className="list-disc pl-5 space-y-1 my-1.5">
          {itens.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const itens: string[] = [];
      while (i < linhas.length && /^\s*\d+[.)]\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*\d+[.)]\s+/, ""));
      saida.push(
        <ol key={k++} className="list-decimal pl-5 space-y-1 my-1.5">
          {itens.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ol>
      );
      continue;
    }
    const h = l.match(/^\s*#{3,6}\s+(.*)$/);
    if (h) {
      saida.push(
        <h4 key={k++} className="mt-3 mb-1 font-bold text-brand-600">
          {inline(h[1])}
        </h4>
      );
      i++;
      continue;
    }
    saida.push(
      <p key={k++} className="my-1.5">
        {inline(l.trim())}
      </p>
    );
    i++;
  }
  return <>{saida}</>;
}

interface Secao {
  titulo: string;
  numero: string;
  linhas: string[];
}

function separar(texto: string): { abertura: string[]; secoes: Secao[] } {
  const abertura: string[] = [];
  const secoes: Secao[] = [];
  let atual: Secao | null = null;
  for (const l of texto.split("\n")) {
    const m = l.match(/^\s*##\s+(.*)$/);
    if (m) {
      const t = m[1].trim();
      const n = t.match(/^(\d+)[.)]?\s*(.*)$/);
      atual = { titulo: n ? n[2] : t, numero: n ? n[1] : "", linhas: [] };
      secoes.push(atual);
    } else if (atual) atual.linhas.push(l);
    else abertura.push(l);
  }
  return { abertura, secoes };
}

function quando(em: string | null): string {
  if (!em) return "";
  try {
    const d = new Date(em);
    const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    return `${dia} às ${hora}`;
  } catch {
    return "";
  }
}

const ABERTAS = new Set(["1", "4", "8"]);

export default function AnaliseCurriculo({ candidatoId, temCurriculo, nomeCurriculo, cargos, cargoAutoId, vagaRotulo, textoInicial, emInicial, autoIniciar, aoIniciou, aoGuardar }: Props) {
  const [texto, setTexto] = useState<string>(textoInicial ?? "");
  const [em, setEm] = useState<string | null>(emInicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [cargoId, setCargoId] = useState<string>(cargoAutoId ?? "");
  const escolhido = cargos.find((c) => c.id === cargoId) ?? null;
  const temCargo = !!escolhido;
  const cargoRotulo = escolhido ? `${escolhido.cargo} · ${escolhido.empresa}` : vagaRotulo;
  const caixa = useRef<HTMLDivElement>(null);
  const rodando = useRef(false);

  async function analisar() {
    if (rodando.current) return;
    rodando.current = true;
    setCarregando(true);
    setErro(null);
    setTexto("");
    let acumulado = "";
    try {
      const r = await fetch("/api/analise-curriculo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidatoId, cargoId }),
      });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok || tipo.includes("application/json") || !r.body) {
        const j = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErro(j?.erro ?? "Não foi possível analisar agora.");
        setTexto(textoInicial ?? "");
      } else {
        const leitor = r.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          acumulado += dec.decode(value, { stream: true });
          setTexto(acumulado.replace(/__ERRO__[\s\S]*$/, ""));
        }
        acumulado += dec.decode();
        if (acumulado.includes("__ERRO__")) {
          setErro("A análise foi interrompida. Clique em “Analisar de novo”.");
          setTexto(acumulado.replace(/__ERRO__[\s\S]*$/, ""));
        } else {
          const agora = new Date().toISOString();
          setTexto(acumulado);
          setEm(agora);
          aoGuardar(acumulado, agora);
        }
      }
    } catch {
      setErro("Não foi possível analisar agora. Confira a internet e tente de novo.");
      if (acumulado) setTexto(acumulado);
    } finally {
      rodando.current = false;
      setCarregando(false);
    }
  }

  // Currículo acabou de ser anexado: começa sozinho (uma vez).
  useEffect(() => {
    if (autoIniciar) {
      aoIniciou();
      if (temCurriculo && temCargo) void analisar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie com Command + C.");
    }
  }

  function imprimir() {
    const el = caixa.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) {
      setErro("O navegador bloqueou a janela. Permita pop-ups para imprimir.");
      return;
    }
    const html = el.innerHTML.replace(/<details/g, "<details open");
    w.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Análise do currículo</title><style>
      body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#2b2118;margin:24px}
      table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
      summary{font-weight:700;font-size:16px;margin-top:14px;cursor:default;list-style:none}h4{margin:10px 0 4px}
      </style></head><body><h2>Análise do currículo · ${cargoRotulo.replace(/</g, "&lt;")}</h2>${html}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const { abertura, secoes } = separar(texto);
  const pronto = !!texto && !carregando;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-200 bg-white p-3.5 space-y-3">
        <span className="block text-xs font-bold uppercase tracking-wider text-ink-500">Documentos usados</span>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className={`rounded-full px-3 py-1 ${temCurriculo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {temCurriculo ? `✓ Currículo: ${nomeCurriculo ?? "anexado"}` : "✗ Falta anexar o currículo"}
          </span>
          <span className={`rounded-full px-3 py-1 ${temCargo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {temCargo ? `✓ Descrição do cargo: ${cargoRotulo}` : `✗ Falta a descrição do cargo (${cargoRotulo})`}
          </span>
        </div>
        <label className="block">
          <span className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">Descrição do cargo usada na análise</span>
          <select className="input" value={cargoId} disabled={carregando} onChange={(ev) => setCargoId(ev.target.value)}>
            <option value="">{cargoAutoId ? "—" : `Escolha o cargo (vaga: ${vagaRotulo})`}</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cargo} · {c.empresa}
              </option>
            ))}
          </select>
        </label>
        {!temCurriculo && <p className="text-sm text-ink-500">Anexe o currículo na aba “Candidato”. A análise começa sozinha.</p>}
        {temCurriculo && !temCargo && (
          <p className="text-sm text-ink-500">{cargos.length ? "Escolha acima o cargo cadastrado." : "Nenhum cargo cadastrado. Cadastre na tela “Cargos” e volte aqui."}</p>
        )}
        {temCurriculo && temCargo && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" disabled={carregando} onClick={() => void analisar()}>
              {carregando ? "Analisando… pode levar cerca de 1 minuto" : texto ? "Analisar de novo" : "Analisar currículo"}
            </button>
            {pronto && (
              <>
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => void copiar()}>
                  {copiado ? "Copiado ✓" : "Copiar texto"}
                </button>
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={imprimir}>
                  Imprimir / PDF
                </button>
              </>
            )}
            {em && pronto && <span className="text-xs text-ink-500">Feita em {quando(em)}</span>}
          </div>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        <b>Apoio ao entrevistador.</b> A análise usa só o que está no currículo e na descrição do cargo. Não dá nota, não aprova e não reprova. A decisão é sua. O currículo é enviado à IA apenas para esta análise.
      </div>

      {texto && (
        <div ref={caixa} className="space-y-3">
          {abertura.some((l) => l.trim()) && (
            <div className="text-sm text-ink-500">
              <Corpo linhas={abertura} />
            </div>
          )}
          {secoes.map((s, idx) => (
            <details key={`${s.numero}-${idx}`} open={ABERTAS.has(s.numero) || undefined} className="rounded-xl border border-brand-200 bg-white overflow-hidden">
              <summary className="cursor-pointer px-3.5 py-3 font-bold text-base flex items-center gap-2.5">
                {s.numero && <span className="grid place-items-center w-7 h-7 shrink-0 rounded-full bg-brand-100 text-brand-600 text-sm">{s.numero}</span>}
                {s.titulo}
              </summary>
              <div className="border-t border-brand-200 px-3.5 pb-3.5 pt-2 text-[15px] leading-relaxed">
                <Corpo linhas={s.linhas} />
              </div>
            </details>
          ))}
          {secoes.length === 0 && (
            <div className="rounded-xl border border-brand-200 bg-white p-3.5 text-[15px] leading-relaxed whitespace-pre-wrap">{texto}</div>
          )}
        </div>
      )}
    </div>
  );
}
