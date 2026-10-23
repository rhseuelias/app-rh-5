import { redirect } from "next/navigation";
import { souAssistente } from "@/lib/permissoes";
import { salvarConfigDesligamentos } from "@/lib/actions-desligamentos-modulo";
import {
  carregarBase,
  filtrarQuadro,
  filtrarRegistros,
  intervalosComBase,
  lerFiltros,
} from "@/lib/desligamentos-dados";
import {
  FAIXAS_PERMANENCIA,
  INICIATIVAS,
  admissoesNoPeriodo,
  contar,
  emIntervalo,
  faixaDePermanencia,
  fmtPct,
  fmtReais,
  pct,
  quadroMedio,
  tempoDeCasaDias,
  turnoverGeral,
  turnoverVoluntario,
} from "@/lib/desligamentos-modulo";
import {
  AvisoErro,
  BarraHorizontal,
  COR_INICIATIVA,
  CabecalhoModulo,
  FiltrosGlobais,
  LinkBotao,
  Secao,
  textoVariacao,
} from "@/components/desligamentos/ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

interface Alerta {
  chave: string;
  nivel: "atencao" | "ok";
  titulo: string;
  texto: string;
}

export default async function AnaliseEstrategica({ searchParams }: { searchParams: SP }) {
  if (await souAssistente()) redirect("/dashboard");

  const filtros = lerFiltros(searchParams);
  const res = await carregarBase();
  const acoes = <LinkBotao href="/desligamentos">Dashboard</LinkBotao>;

  if (!res.ok) {
    return (
      <div className="space-y-5">
        <CabecalhoModulo titulo="Análise estratégica" acoes={acoes} />
        <AvisoErro texto={res.erro} />
      </div>
    );
  }
  const base = res.base;
  const { atual, anterior } = intervalosComBase(filtros, base);
  const cfg = base.config;

  const ativos = filtrarRegistros(base.registros.filter((r) => r.status === "ativo"), filtros);
  const regs = ativos.filter((r) => emIntervalo(r.data_desligamento, atual));
  const regsAnt = ativos.filter((r) => emIntervalo(r.data_desligamento, anterior));
  const quadro = filtrarQuadro(base.quadro, filtros);

  const total = regs.length;
  const vol = regs.filter((r) => r.iniciativa === "colaborador").length;
  const invol = regs.filter((r) => r.iniciativa === "empresa").length;
  const acordo = regs.filter((r) => r.iniciativa === "acordo").length;
  const outros = regs.filter((r) => r.iniciativa === "outro").length;

  const qm = quadroMedio(quadro, atual);
  const qmAnt = quadroMedio(quadro, anterior);
  const tgAtual = turnoverGeral(admissoesNoPeriodo(quadro, atual), total, qm);
  const tgAnt = turnoverGeral(admissoesNoPeriodo(quadro, anterior), regsAnt.length, qmAnt);
  const tvAtual = turnoverVoluntario(vol, qm);
  const tvAnt = turnoverVoluntario(regsAnt.filter((r) => r.iniciativa === "colaborador").length, qmAnt);

  // entrevistas (quem não se aplica fica fora da conta)
  const aplicaveis = regs.filter((r) => r.entrevista !== "nao_se_aplica");
  const feitas = aplicaveis.filter((r) => r.entrevista === "realizada").length;
  const pctEntrevistas = pct(feitas, aplicaveis.length);

  // custos
  const comCusto = regs.filter((r) => r.custo_rescisorio !== null);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_rescisorio ?? 0), 0);

  // até 90 dias
  const ate90 = regs.filter((r) => {
    const d = tempoDeCasaDias(r);
    return d !== null && d <= 90;
  }).length;
  const pct90 = pct(ate90, total);

  // empresa e unidade
  const empresasLista = contar(regs, (r) => r.empresa).map((e) => {
    const nomeReal = e.nome === "Não informado" ? "" : e.nome;
    const q = quadro.filter((c) => c.empresa === nomeReal);
    const qme = quadroMedio(q, atual);
    return { nivel: "Empresa", nome: e.nome, qtd: e.qtd, qm: qme, p: pct(e.qtd, qme) };
  });
  const unidadesLista = contar(
    regs.filter((r) => r.unidade),
    (r) => r.unidade
  ).map((u) => {
    const q = quadro.filter((c) => c.unidade === u.nome);
    const qmu = quadroMedio(q, atual);
    return { nivel: "Unidade", nome: u.nome, qtd: u.qtd, qm: qmu, p: pct(u.qtd, qmu) };
  });

  // tempo de casa × iniciativa
  const matriz = FAIXAS_PERMANENCIA.map((f) => ({
    rotulo: f.rotulo,
    porIniciativa: INICIATIVAS.map((i) =>
      regs.filter((r) => r.iniciativa === i.valor && faixaDePermanencia(tempoDeCasaDias(r)) === f.chave).length
    ),
  }));

  // alertas (limites configuráveis). Eles mostram associações nos dados, não causas.
  const alertas: Alerta[] = [];
  if (total > 0 && pct90 !== null) {
    alertas.push({
      chave: "90",
      nivel: pct90 > cfg.limite_90_dias ? "atencao" : "ok",
      titulo:
        pct90 > cfg.limite_90_dias
          ? `Saídas com até 90 dias de casa acima do limite (${fmtPct(pct90)} · limite ${fmtPct(cfg.limite_90_dias)})`
          : `Saídas com até 90 dias de casa dentro do limite (${fmtPct(pct90)} · limite ${fmtPct(cfg.limite_90_dias)})`,
      texto:
        pct90 > cfg.limite_90_dias
          ? "Pode indicar pontos a revisar na seleção ou na integração. A informação sozinha não aponta a causa."
          : "",
    });
  }
  for (const x of [...empresasLista, ...unidadesLista]) {
    if (x.nome === "Não informado") continue;
    if (x.qm < cfg.minimo_quadro || x.p === null) continue; // amostra pequena: sem alerta de %
    if (x.p > cfg.limite_quadro_unidade) {
      alertas.push({
        chave: `${x.nivel}-${x.nome}`,
        nivel: "atencao",
        titulo: `${x.nivel} ${x.nome}: ${fmtPct(x.p)} do quadro saiu no período (limite ${fmtPct(cfg.limite_quadro_unidade)})`,
        texto: `Foram ${x.qtd} saída(s) para um quadro médio de ${x.qm.toFixed(1).replace(".", ",")}. Vale olhar o contexto antes de qualquer conclusão.`,
      });
    }
  }
  if (pctEntrevistas !== null) {
    alertas.push({
      chave: "ent",
      nivel: pctEntrevistas < cfg.meta_entrevistas ? "atencao" : "ok",
      titulo:
        pctEntrevistas < cfg.meta_entrevistas
          ? `Entrevistas de desligamento abaixo da meta (${fmtPct(pctEntrevistas)} · meta ${fmtPct(cfg.meta_entrevistas)})`
          : `Entrevistas de desligamento dentro da meta (${fmtPct(pctEntrevistas)} · meta ${fmtPct(cfg.meta_entrevistas)})`,
      texto: pctEntrevistas < cfg.meta_entrevistas ? "Sem a entrevista, o motivo registrado fica com menos informação." : "",
    });
  }

  return (
    <div className="space-y-5">
      <CabecalhoModulo
        titulo="Análise estratégica"
        subtitulo="Leituras do período para apoiar decisões, sem apontar culpados."
        acoes={acoes}
      />
      <FiltrosGlobais acao="/desligamentos/analise" filtros={filtros} base={base} intervalo={atual} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Voluntárias x involuntárias">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="font-display text-3xl font-semibold">{vol}</div><div className="text-xs text-stone-600">Voluntárias · {fmtPct(pct(vol, total))}</div></div>
            <div><div className="font-display text-3xl font-semibold">{invol}</div><div className="text-xs text-stone-600">Involuntárias · {fmtPct(pct(invol, total))}</div></div>
            <div><div className="font-display text-3xl font-semibold">{acordo}</div><div className="text-xs text-stone-600">Acordo · {fmtPct(pct(acordo, total))}</div></div>
            <div><div className="font-display text-3xl font-semibold">{outros}</div><div className="text-xs text-stone-600">Outros · {fmtPct(pct(outros, total))}</div></div>
          </div>
          {total > 0 ? (
            <div className="mt-4 flex h-3 overflow-hidden rounded-full">
              {[vol, invol, acordo, outros].map((q, i) => (
                <div key={i} style={{ width: `${(q / total) * 100}%`, background: COR_INICIATIVA[INICIATIVAS[i].valor] }} />
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-stone-500">Total: {total} desligamento(s).</p>
        </Secao>

        <Secao titulo="Comparação entre períodos">
          <div className="space-y-3">
            <BarraHorizontal nome="Período analisado" qtd={total} total={0} maximo={Math.max(total, regsAnt.length)} cor="#e8743b" />
            <BarraHorizontal nome="Período anterior" qtd={regsAnt.length} total={0} maximo={Math.max(total, regsAnt.length)} cor="#c3c2b7" />
          </div>
          <p className="mt-3 text-xs text-stone-600">{textoVariacao(total, regsAnt.length)}</p>
          <p className="mt-1 text-xs text-stone-600">
            Turnover geral: {fmtPct(tgAtual)} (antes: {fmtPct(tgAnt)}). Voluntário: {fmtPct(tvAtual)} (antes: {fmtPct(tvAnt)}).
          </p>
        </Secao>

        <Secao titulo="Entrevistas e custos">
          <div className="font-display text-3xl font-semibold">{feitas} de {aplicaveis.length}</div>
          <div className="text-xs text-stone-600">Entrevistas realizadas · {fmtPct(pctEntrevistas)}</div>
          <div className="mt-4 font-display text-3xl font-semibold">{fmtReais(custoTotal)}</div>
          <div className="text-xs text-stone-600">
            Custo rescisório informado ({comCusto.length} de {total} registros)
          </div>
        </Secao>
      </div>

      <Secao
        titulo="Saídas em relação ao quadro, por empresa e unidade"
        nota="Compare sempre com o tamanho da equipe: número absoluto sozinho não indica problema."
      >
        <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {[...empresasLista, ...unidadesLista].length === 0 ? <p className="text-sm text-stone-500">Sem dados no período.</p> : null}
          {[...empresasLista, ...unidadesLista].map((x) => (
            <BarraHorizontal
              key={`${x.nivel}-${x.nome}`}
              nome={`${x.nivel === "Empresa" ? "" : "Unidade "}${x.nome}`}
              qtd={x.qtd}
              total={0}
              maximo={Math.max(...[...empresasLista, ...unidadesLista].map((y) => y.qtd))}
              extra={x.qm > 0 ? `${fmtPct(x.p)} de ${x.qm.toFixed(1).replace(".", ",")}` : "sem quadro"}
              cor={x.nivel === "Empresa" ? "#2b2118" : "#e8743b"}
            />
          ))}
        </div>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Tempo de empresa x iniciativa">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-xs text-stone-600">
                  <th className="py-2 pr-3">Faixa</th>
                  {INICIATIVAS.map((i) => (
                    <th key={i.valor} className="px-2 py-2">{i.rotulo.replace("Iniciativa do ", "").replace("Iniciativa da ", "").replace("Acordo entre as partes", "Acordo").replace("Término de contrato / outros", "Outros")}</th>
                  ))}
                  <th className="px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((l) => (
                  <tr key={l.rotulo} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{l.rotulo}</td>
                    {l.porIniciativa.map((q, i) => (
                      <td key={i} className="px-2 py-2">{q}</td>
                    ))}
                    <td className="px-2 py-2 font-semibold">{l.porIniciativa.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao titulo="Fórmulas usadas">
          <ul className="space-y-3 text-sm">
            <li><b>Turnover geral</b><div className="text-xs text-stone-600">[(admissões + desligamentos) ÷ 2] ÷ quadro médio × 100</div></li>
            <li><b>Turnover voluntário</b><div className="text-xs text-stone-600">desligamentos por iniciativa do colaborador ÷ quadro médio × 100</div></li>
            <li><b>Saídas antes de 90 dias</b><div className="text-xs text-stone-600">saídas com até 90 dias de casa ÷ total de saídas × 100</div></li>
            <li><b>% por motivo</b><div className="text-xs text-stone-600">desligamentos com o motivo ÷ total de desligamentos × 100</div></li>
            <li><b>Quadro médio</b><div className="text-xs text-stone-600">(quadro no início do período + quadro no fim) ÷ 2, pelas datas de admissão e desligamento do cadastro</div></li>
          </ul>
        </Secao>
      </div>

      <Secao titulo="Alertas para análise">
        <div className="space-y-3">
          {alertas.length === 0 ? <p className="text-sm text-stone-500">Sem dados suficientes para alertas neste período.</p> : null}
          {alertas.map((a) => (
            <div key={a.chave} className="rounded-xl border border-stone-200 bg-[#faf7f3] p-4 text-sm">
              <span className={`badge ${a.nivel === "atencao" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                {a.nivel === "atencao" ? "! Atenção" : "✓ Dentro do esperado"}
              </span>
              <b className="ml-2">{a.titulo}</b>
              {a.texto ? <div className="mt-1 text-xs text-stone-600">{a.texto}</div> : null}
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-3 text-xs text-stone-600">
          Os alertas mostram associações nos dados, não causas. Eles não servem para responsabilizar gestores nem para classificar uma unidade como crítica apenas pelo número absoluto de saídas. Em equipes com quadro médio abaixo de {cfg.minimo_quadro}, o alerta de percentual não é gerado.
        </p>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-stone-700">Configurar limites dos alertas</summary>
          <form action={salvarConfigDesligamentos} className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="label">Saídas até 90 dias (%)</label>
              <input name="limite_90_dias" defaultValue={String(cfg.limite_90_dias).replace(".", ",")} className="input" data-sem-maiuscula inputMode="decimal" />
            </div>
            <div>
              <label className="label">% do quadro por empresa/unidade</label>
              <input name="limite_quadro_unidade" defaultValue={String(cfg.limite_quadro_unidade).replace(".", ",")} className="input" data-sem-maiuscula inputMode="decimal" />
            </div>
            <div>
              <label className="label">Meta de entrevistas (%)</label>
              <input name="meta_entrevistas" defaultValue={String(cfg.meta_entrevistas).replace(".", ",")} className="input" data-sem-maiuscula inputMode="decimal" />
            </div>
            <div>
              <label className="label">Quadro mínimo para alerta de %</label>
              <input name="minimo_quadro" defaultValue={String(cfg.minimo_quadro)} className="input" data-sem-maiuscula inputMode="numeric" />
            </div>
            <div className="md:col-span-4">
              <button type="submit" className="btn-primary !px-4 !py-2 text-sm">Salvar limites</button>
            </div>
          </form>
        </details>
      </Secao>
    </div>
  );
}
