"use client";

import { useState } from "react";

interface EmpresaOpt {
  id: string;
  nome: string;
}
interface UnidadeOpt {
  id: string;
  nome: string;
  empresa_id: string | null;
}

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const CAMPO = {
  fontFamily: INTER,
  fontSize: 13,
  padding: "9px 12px",
  border: "1px solid #e7ddd2",
  borderRadius: 8,
  background: "#fff",
  color: "#262626",
} as const;
const ROTULO = {
  fontFamily: INTER,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#737373",
} as const;

/**
 * Campos "Empresa" + "Unidades" do formulário de nova simulação.
 * Quando a empresa tem mais de uma unidade, aparece uma lista pra marcar uma, algumas ou todas.
 * Envia as marcadas em `unidades_ids` (e a empresa em `empresa_id`).
 */
export default function EmpresaUnidadesNovo({ empresas, unidades }: { empresas: EmpresaOpt[]; unidades: UnidadeOpt[] }) {
  const [empresaId, setEmpresaId] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string> | null>(null); // null = todas

  const doEscopo = unidades
    .filter((u) => !empresaId || u.empresa_id === empresaId)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeEmpresa = Object.fromEntries(empresas.map((e) => [e.id, e.nome]));
  const selecionadas = marcadas ?? new Set(doEscopo.map((u) => u.id));
  const todas = selecionadas.size === doEscopo.length;

  function alternar(id: string) {
    const novo = new Set(selecionadas);
    if (novo.has(id)) {
      if (novo.size === 1) return; // sempre fica pelo menos uma
      novo.delete(id);
    } else {
      novo.add(id);
    }
    setMarcadas(novo.size === doEscopo.length ? null : novo);
  }

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span style={ROTULO}>Empresa</span>
        <select
          name="empresa_id"
          value={empresaId}
          onChange={(e) => {
            setEmpresaId(e.target.value);
            setMarcadas(null);
          }}
          style={CAMPO}
        >
          <option value="">Todas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </label>

      {doEscopo.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span style={ROTULO}>Unidades</span>
          <div className="flex flex-wrap items-center gap-2" style={{ maxWidth: 520 }}>
            <button
              type="button"
              onClick={() => setMarcadas(null)}
              style={{
                fontFamily: INTER,
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid " + (todas ? "#262626" : "#e7ddd2"),
                background: todas ? "#262626" : "#fff",
                color: todas ? "#fff" : "#262626",
                cursor: "pointer",
              }}
            >
              Todas
            </button>
            {doEscopo.map((u) => {
              const ativo = selecionadas.has(u.id);
              return (
                <label
                  key={u.id}
                  style={{
                    fontFamily: INTER,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid " + (ativo && !todas ? "#262626" : "#e7ddd2"),
                    background: ativo && !todas ? "#f4ebe1" : "#fff",
                    color: "#262626",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <input type="checkbox" checked={ativo} onChange={() => alternar(u.id)} />
                  {u.nome}
                  {!empresaId && u.empresa_id && nomeEmpresa[u.empresa_id] ? (
                    <span style={{ color: "#737373" }}>· {nomeEmpresa[u.empresa_id]}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* o que vai pro servidor: só as marcadas */}
      {doEscopo.length > 1 && Array.from(selecionadas).map((id) => <input key={id} type="hidden" name="unidades_ids" value={id} />)}
    </>
  );
}
