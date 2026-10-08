"use client";

import { useRouter } from "next/navigation";

export interface OpcaoUnidadeVT {
  nome: string;
  /** Carga a recarregar da unidade, já formatada (ou "—" se não tem cartões). */
  carga: string;
}

/** Caixa de seleção da unidade: ao escolher, abre a mesma tela com a unidade nova. */
export default function SeletorUnidadeVT({
  opcoes,
  atual,
  competencia,
}: {
  opcoes: OpcaoUnidadeVT[];
  atual: string;
  competencia: string;
}) {
  const router = useRouter();

  return (
    <div>
      <label className="label" htmlFor="vt-unidade">
        Unidade
      </label>
      <select
        id="vt-unidade"
        className="input min-w-[240px] !py-3 text-base font-semibold"
        value={atual}
        onChange={(e) =>
          router.push(`/departamento-pessoal/vale-transporte?competencia=${competencia}&unidade=${encodeURIComponent(e.target.value)}`)
        }
      >
        {opcoes.length === 0 && <option value="">Nenhuma unidade encontrada</option>}
        {opcoes.map((o) => (
          <option key={o.nome} value={o.nome}>
            {o.nome} · {o.carga}
          </option>
        ))}
      </select>
    </div>
  );
}
