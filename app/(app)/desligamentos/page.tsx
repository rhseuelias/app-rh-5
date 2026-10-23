import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";
import {
  carregarBase,
  filtrarQuadro,
  filtrarRegistros,
  intervalosDosFiltros,
  lerFiltros,
} from "@/lib/desligamentos-dados";
import {
  FAIXAS_PERMANENCIA,
  admissoesNoPeriodo,
  contar,
  emIntervalo,
  faixaDePermanencia,
  fmtPct,
  INICIATIVAS,
  inicioMesDeslocado,
  pct,
  quadroMedio,
  tempoDeCasaDias,
  turnoverGeral,
  turnoverVoluntario,
  type Intervalo,
  type RegistroDesligamento,
} from "@/lib/desligamentos-modulo";
import {
  AvisoErro,
  BarraHorizontal,
  COR_INICIATIVA,
  CabecalhoModulo,
  FiltrosGlobais,
  Kpi,
  LinkBotao,
  Secao,
  textoVariacao,
} from "@/components/desligamentos/ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function resumo(regs: RegistroDesligamento[]) {
  const vol = regs.filter((r) => r.iniciativa === "colaborador").length;
  const invol = regs.filter((r) => r.iniciativa === "empresa").length;
  const ate90 = regs.filter((r) => {
    const d = tempoDeCasaDias(r);
    return d !== null && d <= 90;
  }).length;
  const semEntrevista = regs.filter((r) => r.entrevista !== "realizada" && r.entrevista !== "nao_se_aplica").length;
  return { total: regs.length, vol, invol, ate90, semEntrevista };
}

function meses(i: Intervalo): string[] {
  const lista: string[] = [];
  let m = i.de.slice(0, 7);
  const fim = i.ate.slice(0, 7);
  while (m <= fim && lista.length < 36) {
    lista.push(m);
    m = inicioMesDeslocado(`${m}-01`, 1).slice(0, 7);
  }
  return lista;
}

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function DesligamentosDashboard({ searchParams }: { searchParams: SP }) {
  if (await souAssistente()) redirect("/dashboard");

  const filtros = lerFiltros(searchParams);
  const { atual, anterior } = intervalosDosFiltros(filtros);
  const res = await carregarBase();

  const acoes = (
    <>
      <LinkBotao href="/desligamentos/historico">Histórico</LinkBotao>
      <LinkBotao href="/desligamentos/registrar" primario>+ Registrar desligamento</LinkBotao>
    </>
  );

  if (!res.ok) {
    return (
      <div className="space-y-5">
        <CabecalhoModulo titulo="Desligamentos" acoes={acoes} />
        <AvisoErro texto={res.erro} />
      </div>
    );
  }
  const base = res.base;

  const ativos = filtrarRegistros(base.registros.filter((r) => r.status === "ativo"), filtros);
  const regsAtual = ativos.filter((r) => emIntervalo(r.data_desligamento, atual));
  const regsAnterior = ativos.filter((r) => emIntervalo(r.data_desligamento, anterior));
  const quadro = filtrarQuadro(base.quadro, filtros);

  const rA = resumo(regsAtual);
  const rP = resumo(regsAnterior);
  const qmA = quadroMedio(quadro, atual);
  const qmP = quadroMedio(quadro, anterior);
  const tgA = turnoverGeral(admissoesNoPeriodo(quadro, atual), rA.total, qmA);
  const tgP = turnoverGeral(admissoesNoPeriodo(quadro, anterior), rP.total, qmP);
  const tvA = turnoverVoluntario(rA.vol, qmA);

  const variacaoPP =
    tgA !== null && tgP !== null
      ? `${tgA > tgP ? "▲ +" : tgA < tgP ? "▼ −" : "= "}${Math.abs(tgA - tgP).toFixed(1).replace(".", ",")} p.p. vs período anterior`
      : "Sem base de comparação no período anterior";

  // gráfico A: evolução mensal por iniciativa
  const listaMeses = meses(atual);
  const porMes = listaMeses.map((m) => {
    const doMes = regsAtual.filter((r) => r.data_desligamento.slice(0, 7) === m);
    const partes = INICIATIVAS.map((i) => ({ chave: i.valor, qtd: doMes.filter((r) => r.iniciativa === i.valor).length }));
    return { m, total: doMes.length, partes };
  });
  const maxMes = Math.max(1, ...porMes.map((x) => x.total));

  // gráfico B: iniciativa (rosca)
  let acumulado = 0;
  const fatias = INICIATIVAS.map((i) => {
    const qtd = regsAtual.filter((r) => r.iniciativa === i.valor).length;
    const ini = acumulado;
    acumulado += rA.total > 0 ? (qtd / rA.total) * 100 : 0;
    return { ...i, qtd, ini, fim: acumulado };
  });
  const gradiente =
    rA.total > 0
      ? fatias.map((f) => `${COR_INICIATIVA[f.valor]} ${f.ini}% ${f.fim}%`).join(", ")
      : "#e7e5e4 0% 100%";

  // C: permanência
  const permanencia = FAIXAS_PERMANENCIA.map((f) => ({
    rotulo: f.rotulo,
    qtd: regsAtual.filter((r) => faixaDePermanencia(tempoDeCasaDias(r)) === f.chave).length,
  }));
  const semData = regsAtual.filter((r) => tempoDeCasaDias(r) === null).length;

  // D: empresa e unidade (% do quadro médio)
  const empresasNoPeriodo = contar(regsAtual, (r) => r.empresa);
  const porEmpresa = empresasNoPeriodo.map((e) => {
    const q = quadro.filter((c) => c.empresa === (e.nome === "Não informado" ? "" : e.nome));
    const qm = quadroMedio(q, atual);
    const unidades = contar(
      regsAtual.filter((r) => (r.empresa ?? "Não informado") === e.nome),
      (r) => r.unidade
    ).map((u) => {
      const qu = q.filter((c) => c.unidade === (u.nome === "Não informado" ? "" : u.nome));
      return { ...u, qm: quadroMedio(qu, atual) };
    });
    return { ...e, qm, unidades };
  });

  // E, F: cargo e motivos
  const cargos = contar(regsAtual, (r) => r.cargo).slice(0, 8);
  const motivos = contar(regsAtual, (r) => r.motivo_principal);

  return (
    <div className="space-y-5">
      <CabecalhoModulo
        titulo="Desligamentos"
        subtitulo="Visão do período: quantos saíram, por quê e em relação ao tamanho da equipe."
        acoes={acoes}
      />

      <FiltrosGlobais acao="/desligamentos" filtros={filtros} base={base} intervalo={atual} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi rotulo="Total de desligamentos" valor={String(rA.total)} variacaoTexto={textoVariacao(rA.total, rP.total)} />
        <Kpi
          rotulo="Voluntários"
          valor={String(rA.vol)}
          detalhe={`${fmtPct(pct(rA.vol, rA.total))} do total`}
          variacaoTexto={textoVariacao(rA.vol, rP.vol)}
        />
        <Kpi
          rotulo="Involuntários"
          valor={String(rA.invol)}
          detalhe={`${fmtPct(pct(rA.invol, rA.total))} do total`}
          variacaoTexto={textoVariacao(rA.invol, rP.invol)}
        />
        <Kpi
          rotulo="Saídas com até 90 dias de casa"
          valor={String(rA.ate90)}
          detalhe={`${fmtPct(pct(rA.ate90, rA.total))} do total`}
          variacaoTexto={textoVariacao(rA.ate90, rP.ate90)}
        />
        <Kpi
          rotulo="Turnover geral"
          valor={fmtPct(tgA)}
          detalhe={`Voluntário: ${fmtPct(tvA)} · quadro médio ${qmA.toFixed(1).replace(".", ",")}`}
          variacaoTexto={variacaoPP}
        />
        <Kpi
          rotulo="Sem entrevista de desligamento"
          valor={String(rA.semEntrevista)}
          detalhe="Registros sem entrevista realizada"
          variacaoTexto={textoVariacao(rA.semEntrevista, rP.semEntrevista)}
        />
      </div>
      <p className="text-xs text-stone-500">
        Turnover geral = [(admissões + desligamentos) ÷ 2] ÷ quadro médio × 100. Turnover voluntário = desligamentos por iniciativa do colaborador ÷ quadro médio × 100.
        {rA.total === 0 ? " Nenhum desligamento registrado neste período e filtros." : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Secao titulo="Desligamentos por mês e iniciativa">
            <div className="flex h-48 items-end gap-3">
              {porMes.map((x) => {
                const [a, mm] = x.m.split("-");
                return (
                  <div key={x.m} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs font-semibold text-slate-800">{x.total}</span>
                    <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(x.total / maxMes) * 140}px` }}>
                      {x.partes.map((p) =>
                        p.qtd > 0 ? (
                          <div key={p.chave} style={{ flexGrow: p.qtd, background: COR_INICIATIVA[p.chave] }} title={`${p.qtd}`} />
                        ) : null
                      )}
                    </div>
                    <span className="text-xs text-stone-600">{NOMES_MES[Number(mm) - 1]}/{a.slice(2)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-600">
              {INICIATIVAS.map((i) => (
                <span key={i.valor} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_INICIATIVA[i.valor] }} />
                  {i.rotulo}
                </span>
              ))}
            </div>
          </Secao>
        </div>

        <Secao titulo="Por iniciativa">
          <div className="flex items-center gap-4">
            <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradiente})` }}>
              <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white font-display text-xl font-semibold">
                {rA.total}
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {fatias.map((f) => (
                <li key={f.valor} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_INICIATIVA[f.valor] }} />
                  <span className="text-slate-800">{f.rotulo}</span>
                  <span className="text-stone-600">{f.qtd} · {fmtPct(pct(f.qtd, rA.total))}</span>
                </li>
              ))}
            </ul>
          </div>
        </Secao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Tempo de empresa na saída" nota={semData > 0 ? `${semData} registro(s) sem data de admissão ficaram de fora.` : undefined}>
          <div className="space-y-3">
            {permanencia.map((p) => (
              <BarraHorizontal key={p.rotulo} nome={p.rotulo} qtd={p.qtd} total={rA.total} />
            ))}
          </div>
        </Secao>

        <Secao titulo="Cargos com mais saídas">
          <div className="space-y-3">
            {cargos.length === 0 ? <p className="text-sm text-stone-500">Sem dados no período.</p> : null}
            {cargos.map((c) => (
              <BarraHorizontal key={c.nome} nome={c.nome} qtd={c.qtd} total={rA.total} maximo={cargos[0]?.qtd} />
            ))}
          </div>
        </Secao>
      </div>

      <Secao
        titulo="Saídas por empresa e unidade, em relação ao quadro"
        nota="O percentual compara as saídas com o quadro médio do período. Número absoluto sozinho não indica problema."
      >
        <div className="space-y-5">
          {porEmpresa.length === 0 ? <p className="text-sm text-stone-500">Sem dados no período.</p> : null}
          {porEmpresa.map((e) => (
            <div key={e.nome}>
              <BarraHorizontal
                nome={e.nome}
                qtd={e.qtd}
                total={rA.total}
                extra={e.qm > 0 ? `${fmtPct(pct(e.qtd, e.qm))} do quadro` : "sem quadro"}
                cor="#2b2118"
              />
              {e.unidades.length > 1 || (e.unidades[0] && e.unidades[0].nome !== "Não informado") ? (
                <div className="ml-4 mt-2 space-y-2 border-l-2 border-stone-200 pl-4">
                  {e.unidades.map((u) => (
                    <BarraHorizontal
                      key={u.nome}
                      nome={u.nome}
                      qtd={u.qtd}
                      total={rA.total}
                      extra={u.qm > 0 ? `${fmtPct(pct(u.qtd, u.qm))} do quadro` : undefined}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Secao>

      <Secao
        titulo="Motivos principais"
        nota={`Base: ${rA.total} desligamento(s) com motivo informado. O motivo é escolhido por quem registra, nunca sugerido pelo sistema.`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {motivos.length === 0 ? <p className="text-sm text-stone-500">Sem dados no período.</p> : null}
          {motivos.map((m) => (
            <BarraHorizontal key={m.nome} nome={m.nome} qtd={m.qtd} total={rA.total} maximo={motivos[0]?.qtd} />
          ))}
        </div>
      </Secao>
    </div>
  );
}
