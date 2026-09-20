import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa } from "@/types/db";

export const dynamic = "force-dynamic";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default async function AniversariosPage() {
  const supabase = createClient();
  const [{ data }, { data: empresas }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*")
      .not("data_nascimento", "is", null)
      .in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
  ]);

  const colaboradores = (data ?? []) as Colaborador[];
  const nomeEmpresaPorId = Object.fromEntries(
    ((empresas ?? []) as Empresa[]).map((e) => [e.id, e.nome])
  );
  const hoje = new Date();

  const ordenados = [...colaboradores].sort((a, b) => {
    const da = new Date(a.data_nascimento!);
    const db = new Date(b.data_nascimento!);
    const keyA = (da.getMonth() + 1) * 100 + da.getDate();
    const keyB = (db.getMonth() + 1) * 100 + db.getDate();
    return keyA - keyB;
  });

  // tempo de casa: marcos de 1, 5 e 10 anos
  function marco(c: Colaborador): string | null {
    if (!c.data_admissao) return null;
    const anos = hoje.getFullYear() - new Date(c.data_admissao).getFullYear();
    if ([1, 5, 10, 15, 20].includes(anos)) return `${anos} ano${anos > 1 ? "s" : ""} de empresa`;
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Aniversários</h1>
        <p className="text-slate-500 text-sm">
          Natalícios e marcos de tempo de casa (1, 5, 10, 15, 20 anos)
        </p>
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="py-3 px-4">Colaborador</th>
              <th className="py-3 px-4">Empresa</th>
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4">Mês</th>
              <th className="py-3 px-4">Marco de empresa</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((c) => {
              const d = new Date(c.data_nascimento!);
              const marcoEmpresa = marco(c);
              const mesAtual = d.getMonth() === hoje.getMonth();
              return (
                <tr
                  key={c.id}
                  className={`border-t border-slate-100 ${mesAtual ? "bg-brand-50/40" : ""}`}
                >
                  <td className="py-3 px-4 font-medium text-slate-800">{c.nome}</td>
                  <td className="py-3 px-4 text-slate-500">
                    {c.empresa_id ? nomeEmpresaPorId[c.empresa_id] ?? "—" : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </td>
                  <td className="py-3 px-4">{MESES[d.getMonth()]}</td>
                  <td className="py-3 px-4">
                    {marcoEmpresa && (
                      <span className="badge bg-pink-100 text-pink-700">{marcoEmpresa}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {ordenados.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Nenhuma data de nascimento cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
