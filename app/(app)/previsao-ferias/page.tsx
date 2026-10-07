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

// Etiqueta de situação: escura = vencida, pêssego = vence em até 30 dias, branca = no prazo
function Situacao({ hoje, vencimento }: { hoje: string; vencimento: string }) {
  const d = diasAte(hoje, vencimento);
  const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold";
  if (d < 0)
    return (
      <span className={`${base} bg-[#2B2118] text-white`}>
        <span className="h-[5px] w-[5px] rounded-full bg-[#FBB26E]" />
        Vencida há {plural(-d)}
      </span>
    );
  if (d <= 30)
    return (
      <span className={`${base} bg-[#FDE0C0] text-[#7A3A00]`}>
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        {d === 0 ? "Vence hoje" : `Vence em ${plural(d)}`}
      </span>
    );
  return (
    <span className={`${base} border border-[#DDD3C7] bg-white text-[#2B2118]`}>
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      No prazo
    </span>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string | number; sub: string }) {
  return (
    <div className="min-w-0 border-l border-[#ECE4DA] px-4 py-3 first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{titulo}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[22px] font-semibold leading-none text-[#2B2118]">{valor}</span>
        <span className="min-w-0 truncate text-[11.5px] text-slate-600">{sub}</span>
      </p>
    </div>
  );
}

function Tabela({ linhas, hrefLimite, ordenado, hoje }: { linhas: LinhaPrevisao[]; hrefLimite: string; ordenado: boolean; hoje: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] font-semibold text-slate-600">
            <th className="px-4 py-2">Empregado</th>
            <th className="px-2 py-2 text-right">Código</th>
            <th className="px-2 py-2">Admissão</th>
            <th className="px-2 py-2">Pér. Aquisit.</th>
            <th className="px-2 py-2">Venc. Férias</th>
            <th className="px-2 py-2 text-right">Dias</th>
            <th className="px-2 py-2">Prev. Férias</th>
            <th className="px-2 py-2 pr-4">
              <Link
                href={hrefLimite}
                scroll={false}
                title={ordenado ? "Voltar à ordem por nome" : "Ordenar pela Data Limite mais próxima"}
                className={`inline-flex items-center gap-1 hover:underline ${ordenado ? "font-bold text-[#2B2118]" : ""}`}
              >
                Data Limite {ordenado ? "▲" : "↕"}
              </Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-[#ECE4DA] leading-snug">
              <td className="px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.01em]">{l.nome}</td>
              <td className="px-2 py-1.5 text-right">{l.codigo}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{fDMA(l.admissao)}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{fDMA(l.periodoInicio)}</td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>{fDMA(l.vencimento)}</span>
                  <Situacao hoje={hoje} vencimento={l.vencimento} />
                </div>
              </td>
              <td className="px-2 py-1.5 text-right">{fDias(l.dias)}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{fDMA(l.previsao)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 pr-4 font-bold">{fDMA(l.limite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chip({ href, ativo, pequeno, children }: { href: string; ativo: boolean; pequeno?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full border font-semibold whitespace-nowrap ${pequeno ? "px-2.5 py-1 text-[10.5px]" : "px-3 py-1.5 text-[11.5px]"} ${
        ativo ? "border-[#2B2118] bg-[#2B2118] text-white" : "border-[#ECE4DA] bg-white text-[#2B2118] hover:bg-gray-50"
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

  const btn =
    "rounded-lg border border-[#ECE4DA] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2B2118] hover:bg-gray-50";

  return (
    <div className="space-y-3.5 text-[12px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight text-[#2B2118]">Previsão de vencimento de férias</h1>
          <p className="mt-0.5 text-[12px] text-slate-600">
            Posição em {fDMA(dados.hoje)} — {dados.total} registro(s). Mesmo modelo do relatório da contabilidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <BotaoPdf href={`/api/ferias/previsao/pdf${qs}`} titulo="Previsão de Vencimento de Férias — PDF" className={btn}>
            Ver / Baixar PDF
          </BotaoPdf>
          <a href={`/api/ferias/previsao/excel${qs}`} className={btn}>
            Baixar Excel
          </a>
        </div>
      </div>

      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#ECE4DA] bg-white md:grid-cols-4 print:hidden">
        <Kpi titulo="Registros" valor={dados.total} sub="nesta seleção" />
        <Kpi titulo="Vencidas" valor={vencidas} sub="com vencimento passado" />
        <Kpi titulo="Vencem em 30 dias" valor={em30} sub="precisam de atenção" />
        <Kpi titulo="Próximo vencimento" valor={proximo ? fDMA(proximo.vencimento).slice(0, 5) : "—"} sub={proximo ? proximo.nome.split(" ").slice(0, 2).join(" ") : "sem registros"} />
      </section>

      {/* Escolha automática: clicou, já mostra (sem botão "Filtrar") */}
      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        <Chip href={`/previsao-ferias${ordenado ? "?ordem=limite" : ""}`} ativo={!empresa && !unidade}>
          Todas as empresas
        </Chip>
        {opcoes.map((e) => (
          <Chip key={e.id} href={`/previsao-ferias?empresa=${e.id}${ordenado ? "&ordem=limite" : ""}`} ativo={e.id === empresa && !unidade}>
            {e.unidades.length >= 2 ? `${e.nome} — todas as unidades` : e.nome}
          </Chip>
        ))}
        {(empresa ? (empresaAtual && empresaAtual.unidades.length >= 2 ? [empresaAtual] : []) : comUnidades).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-1.5">
            <span className="mx-1.5 h-[18px] w-px bg-[#ECE4DA]" />
            <span className="text-[11.5px] font-semibold text-slate-600">Unidades de {e.nome}:</span>
            {e.unidades.map((u) => (
              <Chip key={u.id} pequeno href={`/previsao-ferias?unidade=${u.id}${ordenado ? "&ordem=limite" : ""}`} ativo={u.id === unidade}>
                {u.nome}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      {dados.grupos.length === 0 && <p className="text-[12px] text-slate-600">Nenhum colaborador encontrado.</p>}

      {dados.grupos.map((g) => (
        <section key={g.empresaId ?? "sem"} className="overflow-hidden rounded-xl border border-[#ECE4DA] bg-white">
          <h2 className="flex items-center justify-between bg-[#f3eee8] px-4 py-2 font-sans text-[11.5px] font-bold uppercase tracking-wide text-[#2B2118]">
            <span>
              Empresa: {g.empresaNome}
              {g.cnpj ? ` — CNPJ: ${formatarCNPJ(g.cnpj)}` : ""}
            </span>
            <span className="font-medium normal-case tracking-normal text-slate-600">{g.linhas.length} registro(s)</span>
          </h2>
          {g.unidades.length > 0 ? (
            g.unidades.map((u) => (
              <div key={u.unidadeId ?? "sem"} className="border-t border-[#ECE4DA] first:border-t-0">
                <h3 className="bg-[#faf7f3] px-4 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-[#2B2118]">
                  Unidade: {u.unidadeNome}
                  {u.cnpj ? ` — CNPJ: ${formatarCNPJ(u.cnpj)}` : ""}
                  <span className="ml-2 font-medium normal-case tracking-normal text-slate-600">{u.linhas.length} registro(s)</span>
                </h3>
                <Tabela linhas={u.linhas} hrefLimite={hrefLimite} ordenado={ordenado} hoje={dados.hoje} />
              </div>
            ))
          ) : (
            <Tabela linhas={g.linhas} hrefLimite={hrefLimite} ordenado={ordenado} hoje={dados.hoje} />
          )}
        </section>
      ))}
    </div>
  );
}
