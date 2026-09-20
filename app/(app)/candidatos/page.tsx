import { createClient } from "@/lib/supabase-server";
import type { Candidato, Empresa } from "@/types/db";
import CandidatoForm from "@/components/CandidatoForm";
import ImportarCandidatosCSV from "@/components/ImportarCandidatosCSV";
import CandidatoLinkAcoes from "@/components/CandidatoLinkAcoes";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  link_gerado: "Link enviado",
  preenchido: "Preenchido — aguardando revisão",
  convertido: "Convertido em colaborador",
};

const STATUS_COR: Record<string, string> = {
  link_gerado: "bg-slate-100 text-slate-600",
  preenchido: "bg-amber-100 text-amber-700",
  convertido: "bg-emerald-100 text-emerald-700",
};

export default async function CandidatosPage() {
  const supabase = createClient();

  const [{ data: candidatos }, { data: empresas }] = await Promise.all([
    supabase.from("candidatos").select("*").order("created_at", { ascending: false }),
    supabase.from("empresas").select("*"),
  ]);

  const lista = (candidatos ?? []) as Candidato[];
  const listaEmpresas = (empresas ?? []) as Empresa[];
  const empresaPorId = new Map(listaEmpresas.map((e) => [e.id, e.nome]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Pré-cadastro de candidatos</h1>
        <p className="text-slate-500 text-sm">
          Gere um link para o aprovado na entrevista preencher os dados e anexar
          documentos, ou importe respostas de um formulário do Google Forms.
        </p>
      </div>

      <div className="card">
        <h2 className="font-display font-semibold text-slate-900 mb-3">Novo pré-cadastro</h2>
        <CandidatoForm empresas={listaEmpresas} />
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Importar candidatos de um CSV (Google Forms)
        </summary>
        <div className="mt-4">
          <ImportarCandidatosCSV empresas={listaEmpresas} />
        </div>
      </details>

      <div className="card">
        <h2 className="font-display font-semibold text-slate-900 mb-3">Candidatos ({lista.length})</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum candidato cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Cargo pretendido</th>
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{c.nome || "—"}</td>
                    <td className="py-2 pr-4">{c.cargo_pretendido || "—"}</td>
                    <td className="py-2 pr-4">{c.empresa_id ? empresaPorId.get(c.empresa_id) ?? "—" : "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${STATUS_COR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <CandidatoLinkAcoes id={c.id} token={c.token} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
