"use client";

import type { Empresa } from "@/types/db";
import { criarCandidato } from "@/lib/actions-candidatos";

export default function CandidatoForm({ empresas }: { empresas: Empresa[] }) {
  return (
    <form action={criarCandidato} className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="label">Nome do candidato</label>
        <input name="nome" className="input" placeholder="opcional — o candidato pode preencher" />
      </div>
      <div>
        <label className="label">Cargo pretendido</label>
        <input name="cargo_pretendido" className="input" />
      </div>
      <div>
        <label className="label">Empresa/Unidade</label>
        <select name="empresa_id" className="input" defaultValue="">
          <option value="">—</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3">
        <button type="submit" className="btn-primary">
          Gerar link de pré-cadastro
        </button>
      </div>
    </form>
  );
}
