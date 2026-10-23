import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { carregarBase } from "@/lib/desligamentos-dados";
import { cancelarRegistro, corrigirRegistro } from "@/lib/actions-desligamentos-modulo";
import {
  ENTREVISTAS,
  INICIATIVAS,
  MOTIVOS_POR_INICIATIVA,
  RECONTRATAVEL,
  ROTULO_AVISO,
  ROTULO_ENTREVISTA,
  ROTULO_INICIATIVA,
  ROTULO_RECONTRATAVEL,
  fmtData,
  fmtReais,
  tempoDeCasaDias,
  textoTempoDeCasa,
  type RegistroDesligamento,
} from "@/lib/desligamentos-modulo";
import { AvisoErro, CabecalhoModulo, LinkBotao } from "@/components/desligamentos/ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const POR_PAGINA = 10;

function um(p: string | string[] | undefined): string {
  return (Array.isArray(p) ? p[0] : p) ?? "";
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Auditoria {
  id: string;
  acao: string;
  usuario: string | null;
  justificativa: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  created_at: string;
}

const ROTULO_CAMPO: Record<string, string> = {
  motivo_principal: "Motivo principal",
  motivo_complementar: "Motivo complementar",
  observacoes_restritas: "Observações restritas",
  entrevista: "Entrevista",
  recontratavel: "Recontratável",
  custo_rescisorio: "Custo rescisório",
};

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);
}

export default async function HistoricoDesligamentos({ searchParams }: { searchParams: SP }) {
  if (await souAssistente()) redirect("/dashboard");

  const q = um(searchParams.q).trim();
  const empresa = um(searchParams.empresa);
  const unidade = um(searchParams.unidade);
  const iniciativa = um(searchParams.iniciativa);
  const situacao = um(searchParams.situacao);
  const de = um(searchParams.de);
  const ate = um(searchParams.ate);
  const ordem = um(searchParams.ordem) || "data";
  const dir = um(searchParams.dir) === "asc" ? "asc" : "desc";
  const pagina = Math.max(1, Number(um(searchParams.pagina)) || 1);
  const sel = um(searchParams.sel);
  const msg = um(searchParams.msg);

  const res = await carregarBase();
  const acoes = (
    <>
      <LinkBotao href="/desligamentos">Dashboard</LinkBotao>
    </>
  );
  if (!res.ok) {
    return (
      <div className="space-y-5">
        <CabecalhoModulo titulo="Histórico de desligamentos" acoes={acoes} />
        <AvisoErro texto={res.erro} />
      </div>
    );
  }
  const base = res.base;

  const qn = semAcento(q);
  let lista = base.registros.filter(
    (r) =>
      (!qn || semAcento(r.nome).includes(qn) || semAcento(r.matricula ?? "").includes(qn)) &&
      (!empresa || r.empresa === empresa) &&
      (!unidade || r.unidade === unidade) &&
      (!iniciativa || r.iniciativa === iniciativa) &&
      (!situacao || r.status === situacao) &&
      (!de || r.data_desligamento >= de) &&
      (!ate || r.data_desligamento <= ate)
  );

  const chave: Record<string, (r: RegistroDesligamento) => string> = {
    data: (r) => r.data_desligamento,
    nome: (r) => semAcento(r.nome),
    empresa: (r) => semAcento(`${r.empresa ?? ""} ${r.unidade ?? ""}`),
    cargo: (r) => semAcento(r.cargo ?? ""),
    iniciativa: (r) => r.iniciativa,
  };
  const f = chave[ordem] ?? chave.data;
  lista = [...lista].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0) * (dir === "asc" ? 1 : -1));

  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const paginaAtual = Math.min(pagina, paginas);
  const visiveis = lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const registroSel = sel ? base.registros.find((r) => r.id === sel) ?? null : null;
  let auditoria: Auditoria[] = [];
  if (registroSel) {
    const supabase = createClient();
    const { data } = await supabase
      .from("desligamentos_auditoria")
      .select("id, acao, usuario, justificativa, antes, depois, created_at")
      .eq("registro_id", registroSel.id)
      .order("created_at", { ascending: true });
    auditoria = (data ?? []) as Auditoria[];
  }

  const filtrosAtuais: Record<string, string> = { q, empresa, unidade, iniciativa, situacao, de, ate };
  function href(extra: Record<string, string>): string {
    const p = new URLSearchParams();
    const todos = { ...filtrosAtuais, ordem, dir, pagina: String(paginaAtual), ...extra };
    for (const [k, v] of Object.entries(todos)) if (v) p.set(k, v);
    return `/desligamentos/historico?${p.toString()}`;
  }
  function hrefOrdem(campo: string): string {
    const novaDir = ordem === campo && dir === "asc" ? "desc" : "asc";
    return href({ ordem: campo, dir: novaDir, pagina: "1" });
  }
  const seta = (campo: string) => (ordem === campo ? (dir === "asc" ? " ↑" : " ↓") : "");
  const exportar = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filtrosAtuais)) if (v) p.set(k, v);
    return `/api/desligamentos/exportar?${p.toString()}`;
  })();

  const unidadesFiltro = base.unidades.filter((u) => !empresa || u.empresa === empresa);

  return (
    <div className="space-y-5">
      <CabecalhoModulo
        titulo="Histórico de desligamentos"
        subtitulo="Todos os registros, inclusive cancelados. O histórico nunca é apagado."
        acoes={
          <>
            <a href={exportar} className="btn-secondary text-sm">Exportar (CSV)</a>
            {acoes}
          </>
        }
      />

      {msg ? (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">✓ {msg}</div>
      ) : null}

      <form method="get" action="/desligamentos/historico" className="card space-y-3 !p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <div className="col-span-2">
            <label className="label" htmlFor="h-q">Buscar</label>
            <input id="h-q" name="q" defaultValue={q} placeholder="Nome ou matrícula" className="input" data-sem-maiuscula />
          </div>
          <div>
            <label className="label" htmlFor="h-de">De</label>
            <input id="h-de" type="date" name="de" defaultValue={de} className="input" data-sem-maiuscula />
          </div>
          <div>
            <label className="label" htmlFor="h-ate">Até</label>
            <input id="h-ate" type="date" name="ate" defaultValue={ate} className="input" data-sem-maiuscula />
          </div>
          <div>
            <label className="label" htmlFor="h-emp">Empresa</label>
            <select id="h-emp" name="empresa" defaultValue={empresa} className="input">
              <option value="">Todas</option>
              {base.empresas.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="h-uni">Unidade</label>
            <select id="h-uni" name="unidade" defaultValue={unidade} className="input">
              <option value="">Todas</option>
              {unidadesFiltro.map((u) => <option key={u.unidade} value={u.unidade}>{u.unidade}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="h-ini">Iniciativa</label>
            <select id="h-ini" name="iniciativa" defaultValue={iniciativa} className="input">
              <option value="">Todas</option>
              {INICIATIVAS.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="h-sit">Situação</label>
            <select id="h-sit" name="situacao" defaultValue={situacao} className="input">
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/desligamentos/historico" className="btn-secondary !px-4 !py-2 text-sm">Limpar</Link>
          <button type="submit" className="btn-primary !px-4 !py-2 text-sm">Aplicar filtros</button>
        </div>
      </form>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="card !p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-xs text-stone-600">
                <th className="px-4 py-3"><Link href={hrefOrdem("nome")}>Colaborador{seta("nome")}</Link></th>
                <th className="px-3 py-3"><Link href={hrefOrdem("empresa")}>Empresa / Unidade{seta("empresa")}</Link></th>
                <th className="px-3 py-3"><Link href={hrefOrdem("cargo")}>Cargo{seta("cargo")}</Link></th>
                <th className="px-3 py-3"><Link href={hrefOrdem("data")}>Data{seta("data")}</Link></th>
                <th className="px-3 py-3"><Link href={hrefOrdem("iniciativa")}>Iniciativa{seta("iniciativa")}</Link></th>
                <th className="px-3 py-3">Tempo</th>
                <th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500">Nenhum registro com esses filtros.</td></tr>
              ) : null}
              {visiveis.map((r) => (
                <tr key={r.id} className={`border-b border-stone-200 ${r.id === sel ? "bg-brand-50" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={href({ sel: r.id, msg: "" })} className="font-semibold text-slate-900 hover:underline">{r.nome}</Link>
                    <div className="text-xs text-stone-500">{r.matricula ? `Matrícula ${r.matricula}` : "Sem matrícula"}</div>
                  </td>
                  <td className="px-3 py-3">{[r.empresa, r.unidade].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-3">{r.cargo ?? "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{fmtData(r.data_desligamento)}</td>
                  <td className="px-3 py-3">{ROTULO_INICIATIVA[r.iniciativa]}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{textoTempoDeCasa(tempoDeCasaDias(r))}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.status === "ativo" ? (
                      <span className="font-medium text-emerald-800">✓ Ativo</span>
                    ) : (
                      <span className="font-medium text-stone-500">○ Cancelado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-stone-600">
            <span>
              {total === 0 ? "0 registros" : `Mostrando ${(paginaAtual - 1) * POR_PAGINA + 1} a ${Math.min(paginaAtual * POR_PAGINA, total)} de ${total} registros`} · {POR_PAGINA} por página
            </span>
            <span className="flex items-center gap-2">
              {paginaAtual > 1 ? <Link className="btn-secondary !px-3 !py-1" href={href({ pagina: String(paginaAtual - 1) })}>‹ Anterior</Link> : null}
              <span>Página {paginaAtual} de {paginas}</span>
              {paginaAtual < paginas ? <Link className="btn-secondary !px-3 !py-1" href={href({ pagina: String(paginaAtual + 1) })}>Próxima ›</Link> : null}
            </span>
          </div>
        </section>

        <aside className="space-y-5">
          {!registroSel ? (
            <div className="card text-sm text-stone-600">Clique no nome de um colaborador para ver os detalhes, corrigir ou cancelar o registro.</div>
          ) : (
            <>
              <section className="card space-y-3">
                <h2 className="text-sm font-semibold text-stone-700">Detalhes do registro</h2>
                <div>
                  <div className="text-base font-bold text-slate-900">{registroSel.nome}</div>
                  <div className="text-xs text-stone-600">
                    {[registroSel.empresa, registroSel.unidade, registroSel.cargo, registroSel.vinculo].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-stone-500">Admissão</dt><dd>{fmtData(registroSel.data_admissao)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Desligamento</dt><dd>{fmtData(registroSel.data_desligamento)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Comunicação</dt><dd>{fmtData(registroSel.data_comunicacao)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Último dia trabalhado</dt><dd>{fmtData(registroSel.ultimo_dia_trabalhado)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Iniciativa</dt><dd>{ROTULO_INICIATIVA[registroSel.iniciativa]}</dd></div>
                  <div><dt className="text-xs text-stone-500">Tipo de rescisão</dt><dd>{registroSel.tipo_rescisao}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-stone-500">Motivo principal</dt><dd>{registroSel.motivo_principal}</dd></div>
                  <div><dt className="text-xs text-stone-500">Aviso-prévio</dt><dd>{registroSel.aviso_previo ? ROTULO_AVISO[registroSel.aviso_previo] : "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Entrevista</dt><dd>{registroSel.entrevista ? ROTULO_ENTREVISTA[registroSel.entrevista] : "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Recontratável</dt><dd>{registroSel.recontratavel ? ROTULO_RECONTRATAVEL[registroSel.recontratavel] : "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Custo rescisório</dt><dd>{registroSel.custo_rescisorio !== null ? fmtReais(Number(registroSel.custo_rescisorio)) : "—"}</dd></div>
                  <div><dt className="text-xs text-stone-500">Registrado por</dt><dd className="break-all">{registroSel.registrado_por ?? "—"}</dd></div>
                </dl>
                {base.podeVerRestrito ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3 text-sm">
                    <div className="text-xs font-semibold text-stone-600">🔒 Campos restritos</div>
                    <div><span className="text-xs text-stone-500">Motivo complementar</span><div>{registroSel.motivo_complementar || "—"}</div></div>
                    <div><span className="text-xs text-stone-500">Observações restritas</span><div>{registroSel.observacoes_restritas || "—"}</div></div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-stone-300 p-3 text-xs text-stone-600">
                    🔒 Motivo complementar e observações restritas: visíveis só para perfis autorizados.
                  </div>
                )}
                {registroSel.status === "cancelado" ? (
                  <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
                    ○ Cancelado em {registroSel.cancelado_em ? fmtDataHora(registroSel.cancelado_em) : "—"} por {registroSel.cancelado_por ?? "—"}.
                    <div className="mt-1 text-xs">Justificativa: {registroSel.cancelado_justificativa}</div>
                  </div>
                ) : null}
              </section>

              {registroSel.status === "ativo" && base.podeVerRestrito ? (
                <section className="card space-y-4">
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-stone-700">Corrigir registro</summary>
                    <form action={corrigirRegistro} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={registroSel.id} />
                      <div>
                        <label className="label">Motivo principal</label>
                        <select name="motivo_principal" defaultValue={MOTIVOS_POR_INICIATIVA[registroSel.iniciativa].includes(registroSel.motivo_principal) ? registroSel.motivo_principal : ""} className="input">
                          {!MOTIVOS_POR_INICIATIVA[registroSel.iniciativa].includes(registroSel.motivo_principal) ? <option value="">{registroSel.motivo_principal}</option> : null}
                          {MOTIVOS_POR_INICIATIVA[registroSel.iniciativa].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Entrevista</label>
                        <select name="entrevista" defaultValue={registroSel.entrevista ?? ""} className="input">
                          <option value="">—</option>
                          {ENTREVISTAS.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Recontratável</label>
                        <select name="recontratavel" defaultValue={registroSel.recontratavel ?? ""} className="input">
                          <option value="">—</option>
                          {RECONTRATAVEL.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Custo rescisório</label>
                        <input name="custo_rescisorio" defaultValue={registroSel.custo_rescisorio !== null ? String(registroSel.custo_rescisorio).replace(".", ",") : ""} className="input" data-sem-maiuscula inputMode="decimal" />
                      </div>
                      <div>
                        <label className="label">Motivo complementar</label>
                        <textarea name="motivo_complementar" defaultValue={registroSel.motivo_complementar ?? ""} className="input min-h-[60px]" data-sem-maiuscula />
                      </div>
                      <div>
                        <label className="label">Observações restritas</label>
                        <textarea name="observacoes_restritas" defaultValue={registroSel.observacoes_restritas ?? ""} className="input min-h-[60px]" data-sem-maiuscula />
                      </div>
                      <div>
                        <label className="label">Justificativa da correção <span className="text-red-700">*</span></label>
                        <input name="justificativa" required minLength={5} className="input" data-sem-maiuscula />
                      </div>
                      <button type="submit" className="btn-primary !px-4 !py-2 text-sm">Salvar correção</button>
                    </form>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-red-800">Cancelar registro</summary>
                    <form action={cancelarRegistro} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={registroSel.id} />
                      <p className="text-xs text-stone-600">
                        Use só se o desligamento foi lançado por engano. O registro fica no histórico como cancelado e o colaborador volta à situação que tinha antes.
                      </p>
                      <div>
                        <label className="label">Justificativa <span className="text-red-700">*</span></label>
                        <input name="justificativa" required minLength={5} className="input" data-sem-maiuscula />
                      </div>
                      <button type="submit" className="btn-secondary !border-red-300 !px-4 !py-2 text-sm !text-red-800">Cancelar este registro</button>
                    </form>
                  </details>
                </section>
              ) : null}

              <section className="card">
                <h2 className="text-sm font-semibold text-stone-700">Trilha de auditoria</h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {auditoria.length === 0 ? <li className="text-stone-500">Sem eventos.</li> : null}
                  {auditoria.map((a) => (
                    <li key={a.id}>
                      <b className="capitalize">{a.acao}</b>
                      <div className="text-xs text-stone-600">{a.usuario ?? "—"} · {fmtDataHora(a.created_at)}</div>
                      {a.justificativa ? <div className="text-xs text-stone-600">Justificativa: {a.justificativa}</div> : null}
                      {a.acao === "corrigido" && a.depois
                        ? Object.keys(a.depois).map((k) => (
                            <div key={k} className="text-xs text-stone-600">
                              {ROTULO_CAMPO[k] ?? k}: alterado
                              {base.podeVerRestrito ? ` (de "${String(a.antes?.[k] ?? "—")}" para "${String(a.depois?.[k] ?? "—")}")` : ""}
                            </div>
                          ))
                        : null}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
