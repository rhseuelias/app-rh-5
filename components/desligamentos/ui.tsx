import Link from "next/link";
import { INICIATIVAS, PERIODOS, fmtData, fmtPct } from "@/lib/desligamentos-modulo";
import type { FiltrosDesl, BaseDesligamentos } from "@/lib/desligamentos-dados";
import type { Intervalo } from "@/lib/desligamentos-modulo";

export const COR_INICIATIVA: Record<string, string> = {
  colaborador: "#0f766e",
  empresa: "#2b2118",
  acordo: "#e8743b",
  outro: "#a8a29e",
};

export function CabecalhoModulo({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs font-medium text-stone-500">Pessoas / Desligamentos</div>
        <h1 className="text-3xl font-semibold text-slate-900">{titulo}</h1>
        {subtitulo ? <p className="text-sm text-stone-600">{subtitulo}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
    </div>
  );
}

export function AvisoErro({ texto }: { texto: string }) {
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {texto}
    </div>
  );
}

/** Filtros globais (formulário GET: funciona sem JavaScript). */
export function FiltrosGlobais({
  acao,
  filtros,
  base,
  intervalo,
}: {
  acao: string;
  filtros: FiltrosDesl;
  base: BaseDesligamentos;
  intervalo: Intervalo;
}) {
  const unidades = base.unidades.filter((u) => !filtros.empresa || u.empresa === filtros.empresa);
  return (
    <form method="get" action={acao} className="card space-y-3 !p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div>
          <label className="label" htmlFor="f-periodo">Período</label>
          <select id="f-periodo" name="periodo" defaultValue={filtros.periodo} className="input">
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>{p.rotulo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-de">De (personalizado)</label>
          <input id="f-de" name="de" type="date" defaultValue={filtros.de ?? ""} className="input" data-sem-maiuscula />
        </div>
        <div>
          <label className="label" htmlFor="f-ate">Até</label>
          <input id="f-ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} className="input" data-sem-maiuscula />
        </div>
        <div>
          <label className="label" htmlFor="f-empresa">Empresa</label>
          <select id="f-empresa" name="empresa" defaultValue={filtros.empresa} className="input">
            <option value="">Todas</option>
            {base.empresas.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-unidade">Unidade</label>
          <select id="f-unidade" name="unidade" defaultValue={filtros.unidade} className="input">
            <option value="">Todas</option>
            {unidades.map((u) => (
              <option key={u.unidade} value={u.unidade}>{u.unidade}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-ini">Iniciativa</label>
          <select id="f-ini" name="iniciativa" defaultValue={filtros.iniciativa} className="input">
            <option value="">Todas</option>
            {INICIATIVAS.map((i) => (
              <option key={i.valor} value={i.valor}>{i.rotulo}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-stone-500">
          Período analisado: {fmtData(intervalo.de)} a {fmtData(intervalo.ate)}. O filtro de unidade só mostra as unidades da empresa escolhida.
        </span>
        <button type="submit" className="btn-primary !px-4 !py-2 text-sm">Aplicar filtros</button>
      </div>
    </form>
  );
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  variacaoTexto,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  variacaoTexto?: string;
}) {
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-stone-500">{rotulo}</div>
      <div className="mt-1 font-display text-3xl font-semibold text-slate-900">{valor}</div>
      {detalhe ? <div className="text-xs text-stone-600">{detalhe}</div> : null}
      {variacaoTexto ? <div className="mt-1 text-xs font-medium text-stone-600">{variacaoTexto}</div> : null}
    </div>
  );
}

/** Texto de variação em relação ao período anterior: sempre palavra + símbolo, sem cor de "bom/ruim". */
export function textoVariacao(atual: number, anterior: number, quedaPercentual?: boolean): string {
  if (anterior === 0 && atual === 0) return "= igual ao período anterior";
  if (anterior === 0) return "Sem base de comparação no período anterior";
  const v = ((atual - anterior) / anterior) * 100;
  if (quedaPercentual) {
    return `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${fmtPct(Math.abs(v))} vs período anterior`;
  }
  if (v === 0) return "= igual ao período anterior";
  return `${v > 0 ? "▲ +" : "▼ −"}${fmtPct(Math.abs(v)).replace("%", "")}% vs período anterior`;
}

export function BarraHorizontal({
  nome,
  qtd,
  total,
  cor = "#e8743b",
  extra,
  maximo,
}: {
  nome: string;
  qtd: number;
  total: number;
  cor?: string;
  extra?: string;
  maximo?: number;
}) {
  const base = maximo && maximo > 0 ? maximo : total;
  const largura = base > 0 ? Math.max(2, Math.round((qtd / base) * 100)) : 0;
  const p = total > 0 ? (qtd / total) * 100 : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate text-slate-800">{nome}</span>
        <span className="shrink-0 text-stone-600">
          <b className="text-slate-900">{qtd}</b>
          {p !== null ? ` · ${fmtPct(p)}` : ""}
          {extra ? ` · ${extra}` : ""}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full" style={{ width: `${largura}%`, background: cor }} />
      </div>
    </div>
  );
}

export function Secao({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-stone-700">{titulo}</h2>
      {nota ? <p className="mt-1 text-xs text-stone-500">{nota}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function LinkBotao({ href, children, primario }: { href: string; children: React.ReactNode; primario?: boolean }) {
  return (
    <Link href={href} className={primario ? "btn-primary text-sm" : "btn-secondary text-sm"}>
      {children}
    </Link>
  );
}
