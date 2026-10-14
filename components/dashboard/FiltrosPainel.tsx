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

/** Filtro de empresa e seletor de mês do Painel de RH (visual do modelo 7).
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
    <div className="flex flex-wrap items-center gap-2.5" style={{ fontFamily: "'Manrope', 'Inter', sans-serif" }}>
      <div
        className="inline-flex flex-wrap gap-1 rounded-full border bg-white p-1"
        style={{ borderColor: "#d3dfdd" }}
        role="tablist"
        aria-label="Empresa"
      >
        {empresas.map((o) => {
          const ativo = o.chave === empresaAtual;
          return (
            <Link
              key={o.chave}
              href={href(o.chave, mesAtual)}
              role="tab"
              aria-selected={ativo}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
              style={ativo ? { background: "#0f5c55", color: "#fff" } : { color: "#12302c" }}
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
        className="rounded-full border bg-white px-4 py-2 text-[12.5px] font-bold focus:outline-none focus:ring-2 focus:ring-[#0f5c55]"
        style={{ borderColor: "#d3dfdd", color: "#12302c" }}
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
