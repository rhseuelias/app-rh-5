import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  experiencia: "Experiência",
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_COR: Record<string, string> = {
  experiencia: "bg-amber-100 text-amber-700",
  ativo: "bg-emerald-100 text-emerald-700",
  afastado: "bg-slate-200 text-slate-600",
  desligado: "bg-red-100 text-red-700",
};

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const [{ data }, { data: empresasData }, { data: unidadesData }] = await Promise.all([
    supabase.from("colaboradores").select("*").order("nome", { ascending: true }),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const todos = (data ?? []) as Colaborador[];
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const nomeEmpresaPorId = Object.fromEntries(empresas.map((e) => [e.id, e.nome]));
  const nomeUnidadePorId = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));

  const termo = (searchParams.q ?? "").trim().toLowerCase();
  const colaboradores = termo
    ? todos.filter((c) => {
        const campos = [
          c.nome,
          c.cargo,
          c.departamento,
          c.cpf_cnpj,
          c.empresa_id ? nomeEmpresaPorId[c.empresa_id] : null,
          c.unidade_id ? nomeUnidadePorId[c.unidade_id] : null,
        ];
        return campos.some((v) => v && v.toLowerCase().includes(termo));
      })
    : todos;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Colaboradores</h1>
          <p className="text-slate-500 text-sm">
            {colaboradores.length}
            {termo ? ` de ${todos.length}` : ""} cadastrados
          </p>
        </div>
        <Link href="/colaboradores/novo" className="btn-primary whitespace-nowrap">
          + Novo colaborador
        </Link>
      </div>

      <form method="get" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Buscar por nome, cargo, departamento, empresa ou unidade…"
          className="input flex-1"
        />
        <button type="submit" className="btn-secondary text-sm whitespace-nowrap">
          🔍 Buscar
        </button>
        {termo && (
          <Link href="/colaboradores" className="text-xs text-slate-400 hover:underline whitespace-nowrap">
            limpar
          </Link>
        )}
      </form>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Empresa</th>
              <th className="py-3 px-4">Unidade</th>
              <th className="py-3 px-4">Admissão</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Cargo</th>
              <th className="py-3 px-4">Departamento</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4">
                  <Link href={`/colaboradores/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.nome}
                  </Link>
                </td>
                <td className="py-3 px-4">{c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "—" : "—"}</td>
                <td className="py-3 px-4">{c.unidade_id ? nomeUnidadePorId[c.unidade_id] ?? "—" : "—"}</td>
                <td className="py-3 px-4">
                  {c.data_admissao ? new Date(c.data_admissao).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="py-3 px-4">{c.tipo}</td>
                <td className="py-3 px-4">{c.cargo ?? "—"}</td>
                <td className="py-3 px-4">{c.departamento ?? "—"}</td>
                <td className="py-3 px-4">
                  <span className={`badge ${STATUS_COR[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
              </tr>
            ))}
            {colaboradores.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  {termo ? "Nenhum colaborador encontrado para essa busca." : "Nenhum colaborador cadastrado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
