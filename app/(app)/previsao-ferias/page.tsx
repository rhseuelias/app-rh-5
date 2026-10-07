import Link from "next/link";
import { buscarOpcoesPrevisao, buscarPrevisaoVencimento, fDias, type LinhaPrevisao } from "@/lib/previsao-ferias";
import { fDMA } from "@/lib/ferias-regras";
import { formatarCNPJ } from "@/lib/formatadores";
import BotaoPdf from "@/components/BotaoPdf";

export const dynamic = "force-dynamic";

function diasAte(hoje: string, alvo: string): number {
  const t = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((t(alvo) - t(hoje)) / 86400000);
}

function Situacao({ hoje, vencimento }: { hoje: string; vencimento: string }) {
  const d = diasAte(hoje, vencimento);
  const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  if (d < 0)
    return <span className="mt-1 inline-flex rounded-full bg-[#2B2118] px-3 py-1 text-sm font-bold text-white">▲ Vencida há {plural(-d)}</span>;
  if (d <= 30)
    return (
      <span className="mt-1 inline-flex rounded-full bg-[#e6ded3] px-3 py-1 text-sm font-bold text-[#2B2118] ring-2 ring-inset ring-[#2B2118]">
        ◆ {d === 0 ? "Vence hoje" : `Vence em ${plural(d)}`}
      </span>
    );
  return <span className="mt-1 inline-flex rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-bold text-gray-600">✓ No prazo</span>;
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string | number; sub: string }) {
  return (
    <div className="min-w-0 border-l border-gray-200 px-6 py-5 first:border-l-0">
      <p className="text-sm font-bold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-4xl font-bold text-[#2B2118]">{valor}</p>
      <p className="mt-1 break-words text-base text-gray-600">{sub}</p>
    </div>
  );
}

function Tabela({ linhas, hrefLimite, ordenado, hoje }: { linhas: LinhaPrevisao[]; hrefLimite: string; ordenado: boolean; hoje: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-[19px]">
        <thead>
          <tr className="text-left text-base font-bold text-gray-600 border-b border-gray-200">
            <th className="px-6 py-3">Empregado</th>
            <th className="px-3 py-3 text-right">Código</th>
            <th className="px-3 py-3">Admissão</th>
            <th className="px-3 py-3">Pér. Aquisit.</th>
            <th className="px-3 py-3">Venc. Férias</th>
            <th className="px-3 py-3 text-right">Dias</th>
            <th className="px-3 py-3">Prev. Férias</th>
            <th className="px-3 py-3">
              <Link
                href={hrefLimite}
                scroll={false}
                title={ordenado ? "Voltar à ordem por nome" : "Ordenar pela Data Limite mais próxima"}
                className={`inline-flex items-center gap-1 hover:underline ${ordenado ? "text-[#2B2118] font-bold" : ""}`}
              >
                Data Limite {ordenado ? "▲" : "↕"}
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              <td className="px-6 py-4 font-bold">{l.nome}</td>
              <td className="px-3 py-4 text-right">{l.codigo}</td>
              <td className="px-3 py-4">{fDMA(l.admissao)}</td>
              <td className="px-3 py-4">{fDMA(l.periodoInicio)}</td>
              <td className="px-3 py-4">{fDMA(l.vencimento)}<br /><Situacao hoje={hoje} vencimento={l.vencimento} /></td>
              <td className="px-3 py-4 text-right text-xl font-bold">{fDias(l.dias)}</td>
              <td className="px-3 py-4">{fDMA(l.previsao)}</td>
              <td className="px-3 py-4 font-bold">{fDMA(l.limite)}</td>
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
      className={`rounded-full border px-5 py-3 text-lg font-bold whitespace-nowrap ${
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
  searchParams: { empresa?: string; unidade?: string; ordem?: string };
}) {
  const opcoes = await buscarOpcoesPrevisao();
  const unidadeValida = opcoes.flatMap((e) => e.unidades.map((u) => ({ ...u, empresaId: e.id }))).find((u) => u.id === searchParams.unidade);
  const empresa = unidadeValida
    ? unidadeValida.empresaId
    : opcoes.some((e) => e.id === searchParams.empresa)
      ? (searchParams.empresa as string)
      : "";
  const unidade = unidadeValida?.id ?? "";

  const ordenado = searchParams.ordem === "limite";
  const dados = await buscarPrevisaoVencimento(empresa || undefined, unidade || undefined, ordenado ? "limite" : undefined);
  const params = new URLSearchParams();
  if (unidade) params.set("unidade", unidade);
  else if (empresa) params.set("empresa", empresa);
  if (ordenado) params.set("ordem", "limite");
  const qs = params.toString() ? `?${params.toString()}` : "";
  // link do cabeçalho "Data Limite": liga/desliga a ordem
  const semOrdem = new URLSearchParams(params);
  semOrdem.delete("ordem");
  const comOrdem = new URLSearchParams(semOrdem);
  comOrdem.set("ordem", "limite");
  const alvo = ordenado ? semOrdem : comOrdem;
  const hrefLimite = `/previsao-ferias${alvo.toString() ? `?${alvo.toString()}` : ""}`;

  const empresaAtual = opcoes.find((e) => e.id === empresa);
  const comUnidades = opcoes.filter((e) => e.unidades.length >= 2);

  const todas = dados.grupos.flatMap((g) => g.linhas);
  const vencidas = todas.filter((l) => diasAte(dados.hoje, l.vencimento) < 0).length;
  const em30 = todas.filter((l) => {
    const d = diasAte(dados.hoje, l.vencimento);
    return d >= 0 && d <= 30;
  }).length;
  const proximo = todas
    .filter((l) => diasAte(dados.hoje, l.vencimento) >= 0)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];

  return (
    <div className="ferias-leg space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-[#2B2118]">Previsão de Vencimento de Férias</h1>
          <p className="text-lg text-gray-600 mt-1">
            Posição em {fDMA(dados.hoje)} — {dados.total} registro(s). Mesmo modelo do relatório da contabilidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <BotaoPdf
            href={`/api/ferias/previsao/pdf${qs}`}
            titulo="Previsão de Vencimento de Férias — PDF"
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-lg font-bold text-[#2B2118] hover:bg-gray-50"
          >
            Ver / Baixar PDF
          </BotaoPdf>
          <a
            href={`/api/ferias/previsao/excel${qs}`}
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-lg font-bold text-[#2B2118] hover:bg-gray-50"
          >
            Baixar Excel
          </a>
        </div>
      </div>

      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white md:grid-cols-4 print:hidden">
        <Kpi titulo="Registros" valor={dados.total} sub="nesta seleção" />
        <Kpi titulo="Vencidas" valor={vencidas} sub="com vencimento passado" />
        <Kpi titulo="Vencem em 30 dias" valor={em30} sub="precisam de atenção" />
        <Kpi titulo="Próximo vencimento" valor={proximo ? fDMA(proximo.vencimento).slice(0, 5) : "—"} sub={proximo ? proximo.nome.split(" ").slice(0, 2).join(" ") : "sem registros"} />
      </section>

      {/* Escolha automática: clicou, já mostra (sem botão "Filtrar") */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Chip href={`/previsao-ferias${ordenado ? "?ordem=limite" : ""}`} ativo={!empresa && !unidade}>
            Todas as empresas
          </Chip>
          {opcoes.map((e) => (
            <Chip key={e.id} href={`/previsao-ferias?empresa=${e.id}${ordenado ? "&ordem=limite" : ""}`} ativo={e.id === empresa && !unidade}>
              {e.unidades.length >= 2 ? `${e.nome} — todas as unidades` : e.nome}
            </Chip>
          ))}
        </div>
        {(empresa ? (empresaAtual && empresaAtual.unidades.length >= 2 ? [empresaAtual] : []) : comUnidades).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-gray-600 mr-1">Unidades de {e.nome}:</span>
            {e.unidades.map((u) => (
              <Chip key={u.id} href={`/previsao-ferias?unidade=${u.id}${ordenado ? "&ordem=limite" : ""}`} ativo={u.id === unidade}>
                {u.nome}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      {dados.grupos.length === 0 && <p className="text-lg text-gray-600">Nenhum colaborador encontrado.</p>}

      {dados.grupos.map((g) => (
        <section key={g.empresaId ?? "sem"} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <h2 className="px-6 py-4 text-2xl font-bold text-[#2B2118] bg-[#f3eee8]">
            Empresa: {g.empresaNome}
            {g.cnpj ? ` - CNPJ: ${formatarCNPJ(g.cnpj)}` : ""}
          </h2>
          {g.unidades.length > 0 ? (
            g.unidades.map((u) => (
              <div key={u.unidadeId ?? "sem"} className="border-t border-gray-200 first:border-t-0">
                <h3 className="px-6 py-3 text-xl font-bold text-[#2B2118] bg-[#faf7f3]">
                  Unidade: {u.unidadeNome}
                  {u.cnpj ? ` - CNPJ: ${formatarCNPJ(u.cnpj)}` : ""}
                </h3>
                <Tabela linhas={u.linhas} hrefLimite={hrefLimite} ordenado={ordenado} hoje={dados.hoje} />
                <p className="px-6 py-3 text-base text-gray-600">{u.linhas.length} registro(s) nesta unidade</p>
              </div>
            ))
          ) : (
            <Tabela linhas={g.linhas} hrefLimite={hrefLimite} ordenado={ordenado} hoje={dados.hoje} />
          )}
          <p className="px-6 py-3 text-base font-bold text-gray-700 border-t border-gray-100">
            {g.linhas.length} registro(s) em {g.empresaNome}
          </p>
        </section>
      ))}
    </div>
  );
}
