import { createClient } from "@/lib/supabase-server";
import type { Candidato, DocumentoCandidato, Empresa } from "@/types/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { converterCandidatoEmColaborador } from "@/lib/actions-candidatos";

export const dynamic = "force-dynamic";

export default async function CandidatoDetalhePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: candidato }, { data: documentos }, { data: empresas }] = await Promise.all([
    supabase.from("candidatos").select("*").eq("id", params.id).single(),
    supabase
      .from("documentos_candidato")
      .select("*")
      .eq("candidato_id", params.id)
      .order("created_at", { ascending: true }),
    supabase.from("empresas").select("*"),
  ]);

  if (!candidato) notFound();

  const c = candidato as Candidato;
  const listaDocumentos = (documentos ?? []) as DocumentoCandidato[];
  const empresa = (empresas as Empresa[] | null)?.find((e) => e.id === c.empresa_id);

  const documentosComUrl = await Promise.all(
    listaDocumentos.map(async (d) => {
      const { data } = await supabase.storage.from("documentos").createSignedUrl(d.storage_path, 60 * 60);
      return { ...d, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{c.nome || "Candidato sem nome ainda"}</h1>
          <p className="text-slate-500 text-sm">
            {c.cargo_pretendido || "cargo não informado"}
            {empresa ? ` · ${empresa.nome}` : ""}
          </p>
        </div>
        {c.convertido_colaborador_id ? (
          <Link href={`/colaboradores/${c.convertido_colaborador_id}`} className="btn-secondary text-sm">
            Ver ficha do colaborador →
          </Link>
        ) : (
          <form action={converterCandidatoEmColaborador}>
            <input type="hidden" name="candidato_id" value={c.id} />
            <button type="submit" className="btn-primary text-sm" disabled={c.status === "link_gerado"}>
              Converter em colaborador
            </button>
          </form>
        )}
      </div>

      {c.status === "link_gerado" && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            O candidato ainda não preencheu o pré-cadastro. Envie o link gerado na
            lista de candidatos.
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">Dados pessoais</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Campo label="CPF" valor={c.cpf} />
          <Campo label="RG" valor={c.rg} />
          <Campo label="Estado civil" valor={c.estado_civil} />
          <Campo
            label="Data de nascimento"
            valor={c.data_nascimento ? new Date(c.data_nascimento).toLocaleDateString("pt-BR") : null}
          />
          <Campo label="Telefone" valor={c.telefone} />
          <Campo label="E-mail" valor={c.email} />
          <Campo label="Endereço" valor={c.endereco} />
          <Campo label="Contato de emergência" valor={c.nome_contato_emergencia} />
          <Campo label="Telefone de emergência" valor={c.telefone_contato_emergencia} />
        </dl>
      </div>

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">Dados bancários</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Campo label="Banco" valor={c.banco} />
          <Campo label="Agência" valor={c.agencia} />
          <Campo label="Conta" valor={c.conta} />
          <Campo label="Pix" valor={c.pix} />
        </dl>
      </div>

      {c.observacoes && (
        <div className="card">
          <h2 className="font-medium text-slate-900 mb-3">Observações</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">{c.observacoes}</p>
        </div>
      )}

      <div className="card">
        <h2 className="font-medium text-slate-900 mb-3">Documentos anexados</h2>
        {documentosComUrl.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum documento anexado ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {documentosComUrl.map((d) => (
              <li key={d.id} className="flex justify-between items-center">
                <span>
                  {d.nome_arquivo} <span className="text-slate-400">({d.tipo})</span>
                </span>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                    Baixar →
                  </a>
                ) : (
                  <span className="text-slate-400">indisponível</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{valor || "—"}</dd>
    </div>
  );
}
