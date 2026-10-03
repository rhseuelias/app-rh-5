"use client";

import { useMemo } from "react";
import { letraDaColuna, type LayoutTabela } from "@/lib/leitura-folha";

/**
 * "Como eu li o arquivo": mostra o começo do arquivo do jeito que veio e deixa
 * a pessoa dizer onde estão o nome, o CPF e os valores — para qualquer arquivo,
 * sem formato padrão. Usado quando a leitura automática não deu certo ou quando
 * a pessoa quer corrigir o que foi entendido.
 */

interface Props {
  linhas: string[][];
  layout: LayoutTabela;
  mensagem?: string;
  erro?: string | null;
  abas: { nome: string; linhas: string[][] }[];
  abaSel: number;
  aoTrocarAba: (i: number) => void;
  aoMudar: (l: LayoutTabela) => void;
  aoUsar: () => void;
  aoVoltar: () => void;
  podeVoltar: boolean;
}

const MAX_LINHAS = 14;
const MAX_COLS = 12;
const TXT = "text-[13px]";

function recorte(t: string, n = 26): string {
  const x = (t ?? "").replace(/\s+/g, " ").trim();
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

export default function AjustarLeitura({ linhas, layout, mensagem, erro, abas, abaSel, aoTrocarAba, aoMudar, aoUsar, aoVoltar, podeVoltar }: Props) {
  const nCols = useMemo(() => Math.min(MAX_COLS, linhas.reduce((m, l) => Math.max(m, l.length), 0)), [linhas]);
  const colunas = useMemo(() => Array.from({ length: nCols }, (_, i) => i), [nCols]);
  const mostradas = linhas.slice(0, MAX_LINHAS);

  const papel = (c: number): string => {
    if (c === layout.colNome) return "Nome";
    if (c === layout.colCpf) return "CPF";
    if (c === layout.colMat) return "Matrícula";
    if (c === layout.colEvento) return "Verba";
    if (layout.colsValor.includes(c)) return "Valor";
    return "";
  };
  const corPapel: Record<string, string> = {
    Nome: "bg-blue-100 text-blue-900",
    CPF: "bg-violet-100 text-violet-900",
    Matrícula: "bg-violet-100 text-violet-900",
    Verba: "bg-amber-100 text-amber-900",
    Valor: "bg-emerald-100 text-emerald-900",
  };

  // texto que descreve a coluna nas listas (título, ou o 1º valor que aparece)
  const rotuloColuna = (c: number): string => {
    const titulo = layout.linhaCab >= 0 ? linhas[layout.linhaCab]?.[c] ?? "" : "";
    const exemplo = titulo || linhas.slice(layout.linhaCab + 1).map((l) => l[c] ?? "").find((t) => t) || "";
    return `Coluna ${letraDaColuna(c)}${exemplo ? ` — ${recorte(exemplo)}` : " (vazia)"}`;
  };

  const set = (parcial: Partial<LayoutTabela>) => aoMudar({ ...layout, ...parcial });
  const unico = (campo: "colNome" | "colCpf" | "colMat" | "colEvento", v: number) => {
    const novo: LayoutTabela = { ...layout, [campo]: v };
    if (v >= 0) novo.colsValor = layout.colsValor.filter((c) => c !== v); // uma coluna não pode ser nome e valor ao mesmo tempo
    aoMudar(novo);
  };
  const alternarValor = (c: number, marcado: boolean) => {
    const sem = layout.colsValor.filter((x) => x !== c);
    set({ colsValor: marcado ? [...sem, c].sort((a, b) => a - b) : sem });
  };

  const seletor = (rotulo: string, valor: number, campo: "colNome" | "colCpf" | "colMat" | "colEvento", vazio: string) => (
    <label className={`${TXT} flex flex-col gap-1`}>
      <span className="font-medium">{rotulo}</span>
      <select className="input !py-1" value={valor} onChange={(e) => unico(campo, Number(e.target.value))}>
        <option value={-1}>{vazio}</option>
        {colunas.map((c) => (
          <option key={c} value={c}>
            {rotuloColuna(c)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {mensagem && <p className={`${TXT} rounded-md bg-amber-50 px-3 py-2 text-amber-900`}>{mensagem}</p>}
      {erro && <p className={`${TXT} rounded-md bg-red-50 px-3 py-2 text-red-800`}>{erro}</p>}

      <div>
        <h4 className="mb-1 text-[14px] font-semibold">Como eu li o arquivo</h4>
        <p className={`${TXT} mb-2 text-slate-600`}>
          Abaixo está o começo do arquivo do jeito que veio. As cores mostram o que eu entendi. Se algo estiver errado, corrija nas
          listas e clique em &quot;Usar essa leitura&quot;.
        </p>
        {abas.length > 1 && (
          <label className={`${TXT} mb-2 flex items-center gap-2`}>
            Aba da planilha:
            <select value={abaSel} onChange={(e) => aoTrocarAba(Number(e.target.value))} className="input !w-auto !py-1">
              {abas.map((a, i) => (
                <option key={a.nome} value={i}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="max-h-[300px] overflow-auto rounded-lg border border-slate-200">
          <table className={`w-full ${TXT}`}>
            <thead className="sticky top-0 bg-slate-50 text-left text-[12px]">
              <tr>
                <th className="w-10 px-2 py-1.5 text-slate-500">Linha</th>
                {colunas.map((c) => (
                  <th key={c} className="min-w-[90px] px-2 py-1.5">
                    <div className="text-slate-500">{letraDaColuna(c)}</div>
                    {papel(c) && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${corPapel[papel(c)]}`}>{papel(c)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mostradas.map((l, r) => (
                <tr key={r} className={`border-t border-slate-100 ${r === layout.linhaCab ? "bg-slate-100 font-semibold" : ""}`}>
                  <td className="px-2 py-1 text-slate-500">{r + 1}</td>
                  {colunas.map((c) => (
                    <td key={c} className="px-2 py-1">
                      {recorte(l[c] ?? "", 30)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {linhas.length > MAX_LINHAS && <p className="mt-1 text-[12px] text-slate-500">Mostrando as primeiras {MAX_LINHAS} de {linhas.length} linhas.</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className={`${TXT} flex flex-col gap-1`}>
          <span className="font-medium">Linha com os títulos das colunas</span>
          <select className="input !py-1" value={layout.linhaCab} onChange={(e) => set({ linhaCab: Number(e.target.value) })}>
            <option value={-1}>Não tem títulos</option>
            {mostradas.map((l, r) => (
              <option key={r} value={r}>
                Linha {r + 1} — {recorte(l.filter((t) => t).join(" · "), 50) || "(vazia)"}
              </option>
            ))}
          </select>
        </label>
        {seletor("Coluna do nome da pessoa", layout.colNome, "colNome", "— não tem —")}
        {seletor("Coluna do CPF (se tiver)", layout.colCpf, "colCpf", "— não tem —")}
        {seletor("Coluna da matrícula (se tiver)", layout.colMat, "colMat", "— não tem —")}
        {seletor("Coluna com o nome da verba (só se cada linha for uma verba)", layout.colEvento, "colEvento", "— não tem (uma coluna para cada verba) —")}
      </div>

      <div>
        <p className={`${TXT} mb-1 font-medium`}>Colunas com os valores em dinheiro (marque todas que devem ser lançadas)</p>
        {colunas.filter((c) => c !== layout.colNome && c !== layout.colCpf && c !== layout.colMat && c !== layout.colEvento).length === 0 && (
          <p className="mb-1 text-[12px] text-slate-500">Não sobrou nenhuma coluna para ser de valores: todas estão marcadas como nome, CPF, matrícula ou verba.</p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {colunas
            .filter((c) => c !== layout.colNome && c !== layout.colCpf && c !== layout.colMat && c !== layout.colEvento)
            .map((c) => (
              <label key={c} className={`${TXT} flex items-center gap-1.5`}>
                <input type="checkbox" checked={layout.colsValor.includes(c)} onChange={(e) => alternarValor(c, e.target.checked)} />
                {rotuloColuna(c)}
              </label>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={aoUsar}>
          Usar essa leitura
        </button>
        {podeVoltar && (
          <button type="button" className="btn-secondary" onClick={aoVoltar}>
            Voltar sem mudar
          </button>
        )}
      </div>
    </div>
  );
}
