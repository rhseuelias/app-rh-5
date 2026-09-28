"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Colaborador, TipoColaborador } from "@/types/db";
import { formatarDataBR, TIPO_COLABORADOR_LABEL } from "@/lib/calculos";

const FILTROS_TIPO: { valor: TipoColaborador | "todos"; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "CLT", label: "CLT" },
  { valor: "PJ", label: "PJ" },
  { valor: "Estagio", label: "Estagiário(a)" },
];

const STATUS_LABEL: Record<string, string> = {
  experiencia: "Experiência",
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_COR: Record<string, string> = {
  experiencia: "bg-amber-50 text-amber-600",
  ativo: "bg-emerald-50 text-emerald-600",
  afastado: "bg-slate-100 text-slate-500",
  desligado: "bg-red-50 text-red-600",
};

// Paleta de cores pro avatar de iniciais — repete em ciclo, uma cor por colaborador.
const CORES_AVATAR = [
  "bg-brand-500",
  "bg-gold-500",
  "bg-ink-600",
  "bg-rose-400",
  "bg-sky-500",
  "bg-violet-400",
  "bg-orange-400",
  "bg-teal-500",
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function corAvatar(indice: number): string {
  return CORES_AVATAR[indice % CORES_AVATAR.length];
}

/** Lista de colaboradores em cartões, com busca instantânea (filtra a cada letra digitada, sem precisar clicar em nada). */
export default function ColaboradoresLista({
  colaboradores,
  nomeEmpresaPorId,
  nomeUnidadePorId,
}: {
  colaboradores: Colaborador[];
  nomeEmpresaPorId: Record<string, string>;
  nomeUnidadePorId: Record<string, string>;
}) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoColaborador | "todos">("todos");
  const termo = busca.trim().toLowerCase();

  const filtrados = useMemo(() => {
    return colaboradores.filter((c) => {
      if (filtroTipo !== "todos" && c.tipo !== filtroTipo) return false;
      if (!termo) return true;
      const campos = [
        c.nome,
        c.cargo,
        c.departamento,
        c.cpf_cnpj,
        c.empresa_id ? nomeEmpresaPorId[c.empresa_id] : null,
        c.unidade_id ? nomeUnidadePorId[c.unidade_id] : null,
      ];
      return campos.some((v) => v && v.toLowerCase().includes(termo));
    });
  }, [termo, filtroTipo, colaboradores, nomeEmpresaPorId, nomeUnidadePorId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-sm">
            🔍
          </span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, cargo, departamento, empresa ou unidade…"
            className="input !rounded-full !pl-10"
          />
        </div>
        {termo && (
          <button
            type="button"
            onClick={() => setBusca("")}
            className="text-xs text-slate-400 hover:text-slate-600 hover:underline whitespace-nowrap transition-colors"
          >
            limpar
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTROS_TIPO.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltroTipo(f.valor)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors whitespace-nowrap ${
              filtroTipo === f.valor
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(termo || filtroTipo !== "todos") && (
        <p className="text-xs text-slate-400">
          {filtrados.length} de {colaboradores.length} cadastrados
        </p>
      )}

      {filtrados.length === 0 ? (
        <div className="card text-center text-slate-400 py-10">
          {termo ? "Nenhum colaborador encontrado para essa busca." : "Nenhum colaborador cadastrado ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtrados.map((c, i) => (
            <Link
              key={c.id}
              href={`/colaboradores/${c.id}`}
              className="card card-hover !p-3.5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-display font-bold text-[11px] shrink-0 ${corAvatar(i)}`}
                >
                  {iniciais(c.nome)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{c.nome}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {TIPO_COLABORADOR_LABEL[c.tipo] ?? c.tipo} ·{" "}
                    {c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "—" : "—"}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-600 truncate">
                {c.cargo ?? "Sem cargo"}
                {c.departamento ? ` · ${c.departamento}` : ""}
              </div>

              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-slate-400">
                  desde {formatarDataBR(c.data_admissao)}
                </span>
                <span className={`badge !text-[10px] !px-2.5 !py-0.5 ${STATUS_COR[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
