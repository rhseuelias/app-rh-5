"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { definirAdiantamento } from "@/lib/actions-adiantamentos";
import NomeColaborador from "@/components/NomeColaborador";

export interface ItemAdiantamento {
  id: string;
  nome: string;
  cargo: string;
  empresa: string;
  unidade: string;
  recebe: boolean;
}

export default function AdiantamentosTela({ itens, empresas }: { itens: ItemAdiantamento[]; empresas: string[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens.filter((i) => i.recebe).map((i) => i.id)));
  const [empresa, setEmpresa] = useState<string>("Todas");
  const [busca, setBusca] = useState("");
  const [soSelecionados, setSoSelecionados] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(0);

  async function alternar(id: string) {
    const novo = !marcados.has(id);
    setErro("");
    setMarcados((p) => {
      const n = new Set(p);
      if (novo) n.add(id);
      else n.delete(id);
      return n;
    });
    setSalvando((x) => x + 1);
    const r = await definirAdiantamento([id], novo);
    setSalvando((x) => x - 1);
    if (!r.ok) {
      setErro(r.erro);
      setMarcados((p) => {
        const n = new Set(p);
        if (novo) n.delete(id);
        else n.add(id);
        return n;
      });
    }
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((i) => (empresa === "Todas" || i.empresa === empresa) && (!soSelecionados || marcados.has(i.id)) && (!q || i.nome.toLowerCase().includes(q)))
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR") || a.unidade.localeCompare(b.unidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [itens, empresa, busca, soSelecionados, marcados]);

  const totalMarcados = itens.filter((i) => marcados.has(i.id)).length;
  const porEmpresa = (e: string) => itens.filter((i) => i.empresa === e && marcados.has(i.id)).length;

  return (
    <div className="space-y-4">
      <div className="card !py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-display font-semibold tabular-nums">{totalMarcados}</p>
          <p className="text-sm text-stone-600">
            {totalMarcados === 1 ? "colaborador recebe" : "colaboradores recebem"} adiantamento. A lista se repete todo mês.
          </p>
        </div>
        <Link href="/departamento-pessoal/adiantamentos/relatorio" className="btn-cta no-underline">
          Ver relatório do mês
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["Todas", ...empresas].map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={empresa === e}
            onClick={() => setEmpresa(e)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${empresa === e ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
          >
            {e === "Todas" ? "Todas as empresas" : e}
            {e !== "Todas" && <span className="ml-2 opacity-70 tabular-nums">{porEmpresa(e)}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          name="busca"
          data-sem-maiuscula
          className="input !w-72"
          placeholder="Buscar colaborador"
          aria-label="Buscar colaborador"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soSelecionados} onChange={(e) => setSoSelecionados(e.target.checked)} />
          Mostrar só quem recebe
        </label>
        <span className="text-sm text-stone-500" aria-live="polite">
          {salvando > 0 ? "Salvando…" : "Tudo salvo"}
        </span>
      </div>

      {erro && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </div>
      )}

      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-200 text-left text-xs uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2.5 w-24">Recebe</th>
              <th className="px-4 py-2.5">Colaborador</th>
              <th className="px-4 py-2.5">Cargo</th>
              <th className="px-4 py-2.5">Empresa · Unidade</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-stone-500">
                  Nenhum colaborador neste filtro.
                </td>
              </tr>
            )}
            {visiveis.map((i) => {
              const ligado = marcados.has(i.id);
              return (
                <tr key={i.id} className={`border-b border-brand-100 last:border-b-0 ${ligado ? "bg-brand-50" : ""}`}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={ligado}
                      onChange={() => alternar(i.id)}
                      aria-label={`${i.nome} recebe adiantamento`}
                    />
                  </td>
                  <td className="px-4 py-2 font-semibold uppercase">
                    <NomeColaborador id={i.id}>{i.nome}</NomeColaborador>
                  </td>
                  <td className="px-4 py-2 uppercase text-stone-600">{i.cargo || "—"}</td>
                  <td className="px-4 py-2 text-stone-600">
                    {i.empresa}
                    {i.unidade && i.unidade !== i.empresa ? ` · ${i.unidade}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
