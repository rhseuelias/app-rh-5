import Link from "next/link";
import type { Colaborador, Empresa } from "@/types/db";
import {
  custoMensalColaborador,
  custoDetalhado,
  percentualFolhaSobreFaturamento,
  LIMITE_SAUDAVEL_FOLHA_PCT,
} from "@/lib/calculos";
import BotaoImprimir from "@/components/dashboard/BotaoImprimir";
import { MANROPE, P7, BG7, nomeProprio } from "@/components/dashboard/tema7";

/** Relatório executivo da Projeção de Custo (Modelo C — documento). Só leitura: tudo vem dos
 * colaboradores ativos/em experiência e das empresas já cadastradas. */

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const pct0 = (v: number) => `${Math.round(v)}%`;
const num2 = (v: number) => v.toFixed(2).replace(".", ",");
const brlMi = (v: number) => (v >= 1_000_000 ? `R$ ${num2(v / 1_000_000)} mi` : brl(v));
const brlMilhoes = (v: number) => (v >= 1_000_000 ? `R$ ${num2(v / 1_000_000)} milhões` : brl(v));

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

type Selo = { k: "good" | "warn" | "bad"; texto: string };

export default function RelatorioExecutivo({
  colaboradores,
  empresas,
}: {
  colaboradores: Colaborador[];
  empresas: Empresa[];
}) {
  const hoje = new Date().toLocaleDateString("pt-BR");

  const custoTotal = colaboradores.reduce((a, c) => a + custoMensalColaborador(c), 0);
  const custoAnual = custoTotal * 12;
  const qtd = colaboradores.length;
  const custoMedio = qtd > 0 ? custoTotal / qtd : 0;

  const linhas = empresas
    .map((e) => {
      const cs = colaboradores.filter((c) => c.empresa_id === e.id);
      const custo = cs.reduce((a, c) => a + custoMensalColaborador(c), 0);
      const fat = e.faturamento_mensal ?? 0;
      const pct = percentualFolhaSobreFaturamento(custo, fat);
      return { empresa: e, pessoas: cs.length, custo, fat, pct };
    })
    .filter((l) => l.pessoas > 0 || l.fat > 0)
    .sort((a, b) => b.custo - a.custo);

  const semEmpresa = colaboradores.filter((c) => !c.empresa_id);
  const custoSem = semEmpresa.reduce((a, c) => a + custoMensalColaborador(c), 0);

  // folha ÷ faturamento do grupo: só entram as empresas que têm faturamento cadastrado
  const comFat = linhas.filter((l) => l.fat > 0);
  const fatTotal = comFat.reduce((a, l) => a + l.fat, 0);
  const custoComFat = comFat.reduce((a, l) => a + l.custo, 0);
  const pctGrupo = percentualFolhaSobreFaturamento(custoComFat, fatTotal);

  const acima = comFat.filter((l) => (l.pct ?? 0) > LIMITE_SAUDAVEL_FOLHA_PCT);
  const semFat = linhas.filter((l) => l.fat <= 0 && l.pessoas > 0);

  const comp = colaboradores.reduce(
    (a, c) => {
      const d = custoDetalhado(c);
      a.remuneracao += d.remuneracao;
      a.beneficios += d.beneficios;
      a.tributos += d.tributos;
      a.passivo += d.passivoTrabalhista;
      return a;
    },
    { remuneracao: 0, beneficios: 0, tributos: 0, passivo: 0 }
  );
  const encargos = comp.tributos + comp.passivo;
  const parte = (v: number) => (custoTotal > 0 ? (v / custoTotal) * 100 : 0);

  const tipos = (["CLT", "PJ", "Estagio"] as const).map((t) => {
    const cs = colaboradores.filter((c) => c.tipo === t);
    return {
      t,
      label: t === "Estagio" ? "Estágio" : t,
      pessoas: cs.length,
      custo: cs.reduce((a, c) => a + custoMensalColaborador(c), 0),
    };
  });

  // ----- frase do topo -----
  let frase2 = "";
  if (pctGrupo !== null) {
    const dentro = pctGrupo <= LIMITE_SAUDAVEL_FOLHA_PCT;
    frase2 = ` Somando as empresas, a folha representa ${pct1(pctGrupo)} do faturamento, ${
      dentro ? "abaixo" : "acima"
    } do limite de ${LIMITE_SAUDAVEL_FOLHA_PCT}%.`;
    if (acima.length === 1) {
      frase2 += ` ${acima[0].empresa.nome} é a exceção: está em ${pct1(acima[0].pct ?? 0)} e merece atenção.`;
    } else if (acima.length > 1) {
      frase2 += ` Passam do limite: ${lista(acima.map((l) => `${l.empresa.nome} (${pct1(l.pct ?? 0)})`))}.`;
    } else if (dentro) {
      frase2 += " Nenhuma empresa passou do limite.";
    }
  } else {
    frase2 = " Ainda não há faturamento cadastrado para calcular o peso da folha sobre o faturamento.";
  }

  // ----- pontos de atenção -----
  const pontos: string[] = [];
  acima.forEach((l) =>
    pontos.push(
      `${l.empresa.nome} acima do limite de ${LIMITE_SAUDAVEL_FOLHA_PCT}% do faturamento (${pct1(l.pct ?? 0)}).`
    )
  );
  if (encargos > 0)
    pontos.push(`Encargos somam ${brl(encargos)} por mês, ${pct0(parte(encargos))} do custo total.`);
  if (semEmpresa.length > 0)
    pontos.push(
      `${semEmpresa.length} colaborador${semEmpresa.length > 1 ? "es" : ""} sem empresa vinculada: ${brl(
        custoSem
      )} por mês fora das empresas.`
    );
  if (semFat.length > 0)
    pontos.push(
      `Sem faturamento cadastrado: ${lista(semFat.map((l) => l.empresa.nome))}. Elas ficam de fora do cálculo de folha ÷ faturamento.`
    );
  if (pontos.length === 0) pontos.push("Nenhum ponto crítico neste momento.");

  const seloDe = (l: (typeof linhas)[number]): Selo => {
    if (l.pct === null) return { k: "warn", texto: "Sem faturamento" };
    return l.pct <= LIMITE_SAUDAVEL_FOLHA_PCT
      ? { k: "good", texto: "✓ Dentro" }
      : { k: "bad", texto: "✗ Acima" };
  };

  const css = `
  .rc-wrap{font-family:${MANROPE};color:${P7.ink};font-size:13px;line-height:1.5}
  .rc-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;max-width:900px;margin:0 auto 12px}
  .rc-top a{color:${P7.deep};font-weight:600;font-size:12px}
  .rc-papel{background:#fff;max-width:900px;margin:0 auto;padding:36px 44px;border-radius:6px;box-shadow:0 1px 3px rgba(18,48,44,.12);display:flex;flex-direction:column;gap:22px}
  .rc-ov{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${P7.lab}}
  .rc-h1{font-size:26px;line-height:1.15;font-weight:800;margin-top:2px}
  .rc-cab{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:8px;border-bottom:3px solid ${P7.deep};padding-bottom:14px}
  .rc-data{font-size:12px;color:${P7.sec}}
  .rc-par{font-size:15px;line-height:1.65}
  .rc-par b{color:${P7.deep}}
  .rc-sec h2{display:flex;align-items:center;gap:8px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:${P7.deep};margin-bottom:8px}
  .rc-sec h2 i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${P7.deep};color:#fff;font-size:11px;letter-spacing:0}
  .rc-nums{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid ${P7.bd};border-radius:10px}
  .rc-nums>div{padding:12px 14px;border-left:1px solid ${P7.bd}}
  .rc-nums>div:first-child{border-left:none}
  .rc-nums .r{font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:${P7.lab};white-space:nowrap}
  .rc-nums .v{font-size:16px;font-weight:800;margin-top:4px;white-space:nowrap;font-variant-numeric:tabular-nums}
  .rc-tw{overflow-x:auto}
  .rc-t{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
  .rc-t th{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${P7.lab};text-align:left;padding:6px 8px;border-bottom:2px solid ${P7.ink};white-space:nowrap}
  .rc-t td{padding:8px;border-bottom:1px solid ${P7.grid};vertical-align:middle}
  .rc-t .n{text-align:right}
  .rc-t tr.tot td{border-top:2px solid ${P7.ink};border-bottom:none;font-weight:800}
  .rc-dois{display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .rc-pts{list-style:none;display:flex;flex-direction:column}
  .rc-pts li{display:flex;gap:8px;padding:7px 0;border-bottom:1px solid ${P7.grid};font-size:13px}
  .rc-pts li:before{content:"▸";color:${P7.deep}}
  .rc-nota{font-size:10.5px;color:${P7.lab};border-top:1px solid ${P7.bd};padding-top:10px}
  .rc-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600;white-space:nowrap;color:${P7.ink}}
  @media(max-width:760px){
    .rc-papel{padding:22px 18px}
    .rc-nums{grid-template-columns:1fr 1fr}
    .rc-nums>div{border-left:none;border-top:1px solid ${P7.bd}}
    .rc-dois{grid-template-columns:1fr}
  }
  @media print{
    @page{size:A4;margin:12mm}
    body *{visibility:hidden}
    #relatorio-custo,#relatorio-custo *{visibility:visible}
    #relatorio-custo{position:absolute;left:0;top:0;width:100%}
    .rc-semprint{display:none!important}
    .rc-papel{box-shadow:none;border-radius:0;padding:0;max-width:none}
    .rc-sec,.rc-t tr{break-inside:avoid}
  }`;

  return (
    <div className="rc-wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="rc-top rc-semprint">
        <Link href="/projecao-custo">‹ Voltar à Projeção de Custo</Link>
        <BotaoImprimir />
      </div>

      <div id="relatorio-custo" className="rc-papel">
        <div className="rc-cab">
          <div>
            <div className="rc-ov">Grupo Seu Elias · Recursos Humanos</div>
            <h1 className="rc-h1">
              Relatório executivo
              <br />
              Projeção de custo
            </h1>
          </div>
          <div className="rc-data">Emitido em {hoje}</div>
        </div>

        <p className="rc-par">
          A folha de pagamento do Grupo custa <b>{brl(custoTotal)} por mês</b> para <b>{qtd} colaboradores</b>, o que
          projeta cerca de <b>{brlMilhoes(custoAnual)} em 12 meses</b> com o quadro de hoje.
          {frase2}
        </p>

        <section className="rc-sec">
          <h2>
            <i>1</i>Números principais
          </h2>
          <div className="rc-nums">
            <div>
              <div className="r">Custo mensal</div>
              <div className="v">{brl(custoTotal)}</div>
            </div>
            <div>
              <div className="r">Custo anual est.</div>
              <div className="v">{brlMi(custoAnual)}</div>
            </div>
            <div>
              <div className="r">Colaboradores</div>
              <div className="v">{qtd}</div>
            </div>
            <div>
              <div className="r">Custo médio</div>
              <div className="v">{brl(custoMedio)}</div>
            </div>
            <div>
              <div className="r">Folha ÷ fat.</div>
              <div className="v">{pctGrupo === null ? "—" : pct1(pctGrupo)}</div>
            </div>
          </div>
        </section>

        <section className="rc-sec">
          <h2>
            <i>2</i>Custo por empresa
          </h2>
          <div className="rc-tw">
            <table className="rc-t">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th className="n">Pessoas</th>
                  <th className="n">Custo mensal</th>
                  <th className="n">% do total</th>
                  <th className="n">Faturamento</th>
                  <th className="n">Folha ÷ fat.</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const s = seloDe(l);
                  return (
                    <tr key={l.empresa.id}>
                      <td>
                        <b>{l.empresa.nome}</b>
                      </td>
                      <td className="n">{l.pessoas}</td>
                      <td className="n">{brl(l.custo)}</td>
                      <td className="n">{pct0(parte(l.custo))}</td>
                      <td className="n">{l.fat > 0 ? brl(l.fat) : "—"}</td>
                      <td className="n">{l.pct === null ? "—" : pct1(l.pct)}</td>
                      <td>
                        <span className="rc-pill" style={{ background: BG7[s.k] }}>
                          {s.texto}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {semEmpresa.length > 0 && (
                  <tr>
                    <td>Sem empresa vinculada</td>
                    <td className="n">{semEmpresa.length}</td>
                    <td className="n">{brl(custoSem)}</td>
                    <td className="n">{pct0(parte(custoSem))}</td>
                    <td className="n">—</td>
                    <td className="n">—</td>
                    <td>
                      <span className="rc-pill" style={{ background: BG7.warn }}>
                        ! Vincular
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="tot">
                  <td>Total</td>
                  <td className="n">{qtd}</td>
                  <td className="n">{brl(custoTotal)}</td>
                  <td className="n">{custoTotal > 0 ? "100%" : "—"}</td>
                  <td className="n">{fatTotal > 0 ? brl(fatTotal) : "—"}</td>
                  <td className="n">{pctGrupo === null ? "—" : pct1(pctGrupo)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          {semEmpresa.length > 0 && (
            <p style={{ fontSize: 12, color: P7.sec, marginTop: 10 }}>
              <b style={{ color: P7.ink }}>Sem empresa vinculada:</b>{" "}
              {semEmpresa
                .map((c) => `${nomeProprio(c.nome)} (${c.tipo === "Estagio" ? "Estágio" : c.tipo}, ${brl(custoMensalColaborador(c))})`)
                .join("; ")}
              . Vincule a empresa no cadastro do colaborador para o custo entrar na empresa certa.
            </p>
          )}
        </section>

        <div className="rc-dois">
          <section className="rc-sec">
            <h2>
              <i>3</i>De que é feito o custo
            </h2>
            <table className="rc-t">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="n">Mensal</th>
                  <th className="n">%</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Remuneração", comp.remuneracao],
                  ["Benefícios", comp.beneficios],
                  ["Tributos (INSS + FGTS)", comp.tributos],
                  ["Passivo trabalhista", comp.passivo],
                ].map(([nome, v]) => (
                  <tr key={nome as string}>
                    <td>{nome}</td>
                    <td className="n">{brl(v as number)}</td>
                    <td className="n">{pct0(parte(v as number))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rc-sec">
            <h2>
              <i>4</i>Por tipo de contrato
            </h2>
            <table className="rc-t">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th className="n">Pessoas</th>
                  <th className="n">Custo mensal</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.t}>
                    <td>{t.label}</td>
                    <td className="n">{t.pessoas}</td>
                    <td className="n">{brl(t.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="rc-sec">
          <h2>
            <i>5</i>Pontos de atenção
          </h2>
          <ul className="rc-pts">
            {pontos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>

        <p className="rc-nota">
          O custo inclui remuneração, benefícios, INSS patronal (20%), FGTS (8%) e a provisão mensal de 13º, férias, 1/3
          de férias e multa rescisória. PJ e estágio entram pelo valor pago. O custo anual é uma estimativa simples
          (custo mensal × 12) com o quadro de hoje. O faturamento é o cadastrado em Empresas / Unidades.
        </p>
      </div>
    </div>
  );
}
