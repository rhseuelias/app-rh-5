"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export interface OpcaoEmpresa {
  chave: string;
  rotulo: string;
}
export interface OpcaoMes {
  chave: string; // "2026-10"
  rotulo: string; // "Outubro 2026"
}

/** Filtro de empresa (controle segmentado) e seletor de mês do Painel de RH.
 * Tudo vai pela URL (?empresa=&mes=), então dá pra favoritar/compartilhar. */
export default function FiltrosPainel({
  empresas,
  empresaAtual,
  meses,
  mesAtual,
}: {
  empresas: OpcaoEmpresa[];
  empresaAtual: string;
  meses: OpcaoMes[];
  mesAtual: string;
}) {
  const router = useRouter();
  const href = (empresa: string, mes: string) =>
    `/dashboard?empresa=${encodeURIComponent(empresa)}&mes=${encodeURIComponent(mes)}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex flex-wrap rounded-[10px] bg-[#f0e8df] p-[3px]" role="tablist" aria-label="Empresa">
        {empresas.map((o) => {
          const ativo = o.chave === empresaAtual;
          return (
            <Link
              key={o.chave}
              href={href(o.chave, mesAtual)}
              role="tab"
              aria-selected={ativo}
              className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                ativo ? "bg-white text-[#262626] shadow-[0_1px_2px_rgba(61,40,20,.1)]" : "text-[#5c5c5c] hover:text-[#262626]"
              }`}
            >
              {o.rotulo}
            </Link>
          );
        })}
      </div>

      <label className="sr-only" htmlFor="painel-mes">
        Mês
      </label>
      <select
        id="painel-mes"
        value={mesAtual}
        onChange={(e) => router.push(href(empresaAtual, e.target.value))}
        className="rounded-[8px] border border-[#e7ddd2] bg-white px-3 py-2 text-[13px] font-semibold text-[#262626] focus:outline-none focus:ring-2 focus:ring-[#fbb26e]"
      >
        {meses.map((m) => (
          <option key={m.chave} value={m.chave}>
            {m.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}
