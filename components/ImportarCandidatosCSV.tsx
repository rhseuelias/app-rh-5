"use client";

import { useState, useTransition } from "react";
import type { Empresa } from "@/types/db";
import { importarCandidatosCSV } from "@/lib/actions-candidatos";

export default function ImportarCandidatosCSV({ empresas }: { empresas: Empresa[] }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function enviar(formData: FormData) {
    setErro(null);
    setOk(false);
    startTransition(async () => {
      try {
        await importarCandidatosCSV(formData);
        setOk(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao importar o CSV.");
      }
    });
  }

  return (
    <form action={enviar} className="space-y-3">
      <p className="text-xs text-slate-500">
        Exporte as respostas do Google Forms como CSV (Respostas → ⋮ → Fazer
        download (.csv)) e envie o arquivo aqui. Colunas como nome, e-mail,
        telefone, cargo e CPF são reconhecidas automaticamente; o resto entra
        como observação, pra não perder nada.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Arquivo CSV</label>
          <input type="file" name="arquivo" accept=".csv,text/csv" required className="input" />
        </div>
        <div>
          <label className="label">Empresa/Unidade (aplica a todos)</label>
          <select name="empresa_id" className="input" defaultValue="">
            <option value="">—</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-emerald-600">Candidatos importados com sucesso.</p>}
      <button type="submit" disabled={isPending} className="btn-secondary text-sm">
        {isPending ? "Importando..." : "Importar CSV"}
      </button>
    </form>
  );
}
