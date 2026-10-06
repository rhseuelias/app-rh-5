import { createClient } from "@/lib/supabase-server";
import { buscarPrevisaoVencimento } from "@/lib/previsao-ferias";
import { fDMA } from "@/lib/ferias-regras";
import { formatarCNPJ } from "@/lib/formatadores";

export const dynamic = "force-dynamic";

export default async function PrevisaoFeriasPage({ searchParams }: { searchParams: { empresa?: string } }) {
  const supabase = createClient();
  const { data: empData } = await supabase.from("empresas").select("id, nome").order("nome");
  const empresas = (empData ?? []) as { id: string; nome: string }[];
  const empresa = searchParams.empresa && empresas.some((e) => e.id === searchParams.empresa) ? searchParams.empresa : "";

  const dados = await buscarPrevisaoVencimento(empresa || undefined);
  const qs = empresa ? `?empresa=${empresa}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2B2118]">Previsão de Vencimento de Férias</h1>
          <p className="text-sm text-gray-600 mt-1">
            Posição em {fDMA(dados.hoje)} — {dados.total} registro(s). Mesmo modelo do relatório da contabilidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <form method="get" className="flex items-center gap-2">
            <select
              name="empresa"
              defaultValue={empresa}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              aria-label="Empresa"
            >
              <option value="">Todas as empresas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-[#2B2118] px-4 py-2 text-sm font-semibold text-white">
              Filtrar
            </button>
          </form>
          <a
            href={`/api/ferias/previsao/pdf${qs}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#2B2118] hover:bg-gray-50"
          >
            Baixar PDF
          </a>
          <a
            href={`/api/ferias/previsao/excel${qs}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#2B2118] hover:bg-gray-50"
          >
            Baixar Excel
          </a>
        </div>
      </div>

      {dados.grupos.length === 0 && <p className="text-sm text-gray-600">Nenhum colaborador encontrado.</p>}

      {dados.grupos.map((g) => (
        <section key={g.empresaId ?? "sem"} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-bold text-[#2B2118] bg-[#f3eee8]">
            Empresa: {g.empresaNome}
            {g.cnpj ? ` - CNPJ: ${formatarCNPJ(g.cnpj)}` : ""}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-2">Empregado</th>
                  <th className="px-2 py-2 text-right">Código</th>
                  <th className="px-2 py-2">Admissão</th>
                  <th className="px-2 py-2">Pér. Aquisit.</th>
                  <th className="px-2 py-2">Venc. Férias</th>
                  <th className="px-2 py-2 text-right">Dias</th>
                  <th className="px-2 py-2">Prev. Férias</th>
                  <th className="px-2 py-2">Data Limite</th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium">{l.nome}</td>
                    <td className="px-2 py-2 text-right">{l.codigo}</td>
                    <td className="px-2 py-2">{fDMA(l.admissao)}</td>
                    <td className="px-2 py-2">{fDMA(l.periodoInicio)}</td>
                    <td className="px-2 py-2">{fDMA(l.vencimento)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{l.dias}</td>
                    <td className="px-2 py-2">{fDMA(l.previsao)}</td>
                    <td className="px-2 py-2">{fDMA(l.limite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-500">{g.linhas.length} registro(s)</p>
        </section>
      ))}
    </div>
  );
}
