import Link from "next/link";
import { buscarOpcoesPrevisao, buscarPrevisaoVencimento, fDias, type LinhaPrevisao } from "@/lib/previsao-ferias";
import { fDMA } from "@/lib/ferias-regras";
import { formatarCNPJ } from "@/lib/formatadores";
import BotaoPdf from "@/components/BotaoPdf";

export const dynamic = "force-dynamic";

function Tabela({ linhas }: { linhas: LinhaPrevisao[] }) {
  return (
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
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 font-medium">{l.nome}</td>
              <td className="px-2 py-2 text-right">{l.codigo}</td>
              <td className="px-2 py-2">{fDMA(l.admissao)}</td>
              <td className="px-2 py-2">{fDMA(l.periodoInicio)}</td>
              <td className="px-2 py-2">{fDMA(l.vencimento)}</td>
              <td className="px-2 py-2 text-right font-semibold">{fDias(l.dias)}</td>
              <td className="px-2 py-2">{fDMA(l.previsao)}</td>
              <td className="px-2 py-2">{fDMA(l.limite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap ${
        ativo ? "bg-[#2B2118] text-white border-[#2B2118]" : "bg-white text-[#2B2118] border-gray-300 hover:bg-gray-50"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function PrevisaoFeriasPage({
  searchParams,
}: {
  searchParams: { empresa?: string; unidade?: string };
}) {
  const opcoes = await buscarOpcoesPrevisao();
  const unidadeValida = opcoes.flatMap((e) => e.unidades.map((u) => ({ ...u, empresaId: e.id }))).find((u) => u.id === searchParams.unidade);
  const empresa = unidadeValida
    ? unidadeValida.empresaId
    : opcoes.some((e) => e.id === searchParams.empresa)
      ? (searchParams.empresa as string)
      : "";
  const unidade = unidadeValida?.id ?? "";

  const dados = await buscarPrevisaoVencimento(empresa || undefined, unidade || undefined);
  const params = new URLSearchParams();
  if (unidade) params.set("unidade", unidade);
  else if (empresa) params.set("empresa", empresa);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const empresaAtual = opcoes.find((e) => e.id === empresa);
  const comUnidades = opcoes.filter((e) => e.unidades.length >= 2);

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
          <BotaoPdf
            href={`/api/ferias/previsao/pdf${qs}`}
            titulo="Previsão de Vencimento de Férias — PDF"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#2B2118] hover:bg-gray-50"
          >
            Ver / Baixar PDF
          </BotaoPdf>
          <a
            href={`/api/ferias/previsao/excel${qs}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#2B2118] hover:bg-gray-50"
          >
            Baixar Excel
          </a>
        </div>
      </div>

      {/* Escolha automática: clicou, já mostra (sem botão "Filtrar") */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Chip href="/previsao-ferias" ativo={!empresa && !unidade}>
            Todas as empresas
          </Chip>
          {opcoes.map((e) => (
            <Chip key={e.id} href={`/previsao-ferias?empresa=${e.id}`} ativo={e.id === empresa && !unidade}>
              {e.unidades.length >= 2 ? `${e.nome} — todas as unidades` : e.nome}
            </Chip>
          ))}
        </div>
        {(empresa ? (empresaAtual && empresaAtual.unidades.length >= 2 ? [empresaAtual] : []) : comUnidades).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 mr-1">Unidades de {e.nome}:</span>
            {e.unidades.map((u) => (
              <Chip key={u.id} href={`/previsao-ferias?unidade=${u.id}`} ativo={u.id === unidade}>
                {u.nome}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      {dados.grupos.length === 0 && <p className="text-sm text-gray-600">Nenhum colaborador encontrado.</p>}

      {dados.grupos.map((g) => (
        <section key={g.empresaId ?? "sem"} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-bold text-[#2B2118] bg-[#f3eee8]">
            Empresa: {g.empresaNome}
            {g.cnpj ? ` - CNPJ: ${formatarCNPJ(g.cnpj)}` : ""}
          </h2>
          {g.unidades.length > 0 ? (
            g.unidades.map((u) => (
              <div key={u.unidadeId ?? "sem"} className="border-t border-gray-200 first:border-t-0">
                <h3 className="px-4 py-2 text-sm font-semibold text-[#2B2118] bg-[#faf7f3]">
                  Unidade: {u.unidadeNome}
                  {u.cnpj ? ` - CNPJ: ${formatarCNPJ(u.cnpj)}` : ""}
                </h3>
                <Tabela linhas={u.linhas} />
                <p className="px-4 py-2 text-xs text-gray-500">{u.linhas.length} registro(s) nesta unidade</p>
              </div>
            ))
          ) : (
            <Tabela linhas={g.linhas} />
          )}
          <p className="px-4 py-2 text-xs font-semibold text-gray-600 border-t border-gray-100">
            {g.linhas.length} registro(s) em {g.empresaNome}
          </p>
        </section>
      ))}
    </div>
  );
}
