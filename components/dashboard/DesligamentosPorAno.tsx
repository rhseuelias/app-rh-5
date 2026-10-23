import Link from "next/link";
import { Cartao7, Titulo7, Ponto, P7, MANROPE, FS, ROTULO_COLUNA, LINK7, LINK7_STYLE } from "./tema7";

/**
 * Desligamentos no Dashboard (Modelo A): saldo de admissões e desligamentos por ano,
 * evolução por semestre, iniciativa por ano, tipo de rescisão por ano e saídas por empresa/unidade.
 */

export interface RegistroDeslDash {
  empresa: string | null;
  unidade: string | null;
  data_desligamento: string;
  iniciativa: string;
  tipo_rescisao: string;
}

type Ini = "colaborador" | "empresa" | "acordo" | "outro";
const INICIATIVAS: { chave: Ini; nome: string; cor: string }[] = [
  { chave: "colaborador", nome: "Colaborador", cor: "#0f766e" },
  { chave: "empresa", nome: "Empresa", cor: "#2b2118" },
  { chave: "acordo", nome: "Acordo", cor: "#e8743b" },
  { chave: "outro", nome: "Término / outros", cor: "#8a8780" },
];
const COR_ADM = P7.verde;
const COR_DESL = P7.laranja;
const COR_BOM = "#0b7a0b";
const COR_RUIM = "#a52828";

const TIPOS = [
  "Pedido de demissão",
  "Dispensa sem justa causa",
  "Término antecipado (empregado)",
  "Término antecipado (empregador)",
  "Término de experiência",
  "Acordo",
  "Transferência no grupo",
];

/** Junta os textos de rescisão que vêm das planilhas e do cadastro no mesmo nome. */
function tipoPadrao(t: string): string {
  const s = (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (s.includes("pedido de demiss")) return TIPOS[0];
  if (s.includes("antecipado") && s.includes("empregador")) return TIPOS[3];
  if (s.includes("antecipado")) return TIPOS[2];
  if (s.includes("experiencia")) return TIPOS[4];
  if (s.includes("justa causa") && !s.includes("sem")) return "Dispensa por justa causa";
  if (s.includes("sem justa") || s.includes("dispensa")) return TIPOS[1];
  if (s.includes("acordo")) return TIPOS[5];
  if (s.includes("transfer")) return TIPOS[6];
  return t || "Não informado";
}

const anoDe = (d: string) => Number(d.slice(0, 4));
const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));
const corSaldo = (n: number) => (n > 0 ? COR_BOM : n < 0 ? COR_RUIM : P7.sec);

function iniDe(r: RegistroDeslDash): Ini {
  return (["colaborador", "empresa", "acordo"].includes(r.iniciativa) ? r.iniciativa : "outro") as Ini;
}

function BarrasSemestre({ registros, anos, anoAtual }: { registros: RegistroDeslDash[]; anos: number[]; anoAtual: number }) {
  const itens: { rotulo: string; por: Record<Ini, number>; total: number }[] = [];
  for (const y of anos) {
    for (const sm of [1, 2]) {
      const rs = registros.filter((r) => anoDe(r.data_desligamento) === y && (Number(r.data_desligamento.slice(5, 7)) <= 6 ? 1 : 2) === sm);
      const por = { colaborador: 0, empresa: 0, acordo: 0, outro: 0 } as Record<Ini, number>;
      for (const r of rs) por[iniDe(r)]++;
      itens.push({ rotulo: `${sm}º sem/${String(y).slice(2)}`, por, total: rs.length });
    }
  }
  // não mostra semestres vazios no começo nem o semestre futuro do ano atual
  while (itens.length > 0 && itens[0].total === 0) itens.shift();
  if (anos.includes(anoAtual) && itens.length > 0 && itens[itens.length - 1].rotulo.startsWith("2º") && itens[itens.length - 1].total === 0) itens.pop();
  const lista = itens.slice(-8);
  if (lista.length === 0) return <p className="text-[12.5px]" style={{ color: P7.sec }}>Sem desligamentos para mostrar.</p>;
  const W = 480;
  const H = 210;
  const base = H - 28;
  const topo = 26;
  const max = Math.max(1, ...lista.map((i) => i.total));
  const un = (base - topo) / max;
  const passo = (W - 20) / lista.length;
  const bw = Math.min(44, passo * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Desligamentos por semestre: ${lista.map((i) => `${i.rotulo} ${i.total}`).join(", ")}`}>
      <line x1="10" y1={base} x2={W} y2={base} stroke={P7.bd} />
      {lista.map((it, idx) => {
        const x = 10 + passo * idx + (passo - bw) / 2;
        let y = base;
        return (
          <g key={it.rotulo}>
            {INICIATIVAS.map((ini) => {
              const h = it.por[ini.chave] * un;
              if (h <= 0) return null;
              y -= h;
              return (
                <rect key={ini.chave} x={x} y={y} width={bw} height={h} fill={ini.cor}>
                  <title>{`${ini.nome}: ${it.por[ini.chave]}`}</title>
                </rect>
              );
            })}
            <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="800" fill={P7.ink}>{it.total}</text>
            <text x={x + bw / 2} y={base + 16} textAnchor="middle" fontSize="10.5" fill={P7.lab}>{it.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DesligamentosPorAno({
  registros,
  admissoes,
  anoAtual,
  agrupar,
  nomeEscopo,
}: {
  registros: RegistroDeslDash[];
  /** datas de admissão (AAAA-MM-DD) de quem está no filtro, incluindo quem já saiu */
  admissoes: string[];
  anoAtual: number;
  /** "empresa" quando o filtro é Todas; "unidade" quando uma empresa foi escolhida */
  agrupar: "empresa" | "unidade";
  nomeEscopo: string;
}) {
  if (registros.length === 0) {
    return (
      <Cartao7>
        <Titulo7 sub={nomeEscopo}>Desligamentos por ano</Titulo7>
        <p className="text-[12.5px]" style={{ color: P7.sec }}>
          Ainda não há desligamentos registrados neste filtro. Importe o histórico ou registre pelo botão Desligar na ficha do colaborador.
        </p>
      </Cartao7>
    );
  }
  const primeiro = Math.max(Math.min(...registros.map((r) => anoDe(r.data_desligamento))), anoAtual - 5);
  const anos: number[] = [];
  for (let y = primeiro; y <= anoAtual; y++) anos.push(y);

  const deslAno = (y: number) => registros.filter((r) => anoDe(r.data_desligamento) === y);
  const admAno = (y: number) => admissoes.filter((d) => anoDe(d) === y).length;
  const rotuloAno = (y: number) => (y === anoAtual ? `${y} (até hoje)` : String(y));
  const maxBarra = Math.max(1, ...anos.map((y) => Math.max(admAno(y), deslAno(y).length)));
  const saldoTotal = anos.reduce((a, y) => a + admAno(y) - deslAno(y).length, 0);

  // por empresa (ou por unidade)
  const chaveGrupo = (r: RegistroDeslDash) => (agrupar === "empresa" ? r.empresa : r.unidade) || (agrupar === "empresa" ? "Sem empresa" : "Sem unidade");
  const grupos = Array.from(new Set(registros.map(chaveGrupo))).sort(
    (a, b) => registros.filter((r) => chaveGrupo(r) === b).length - registros.filter((r) => chaveGrupo(r) === a).length
  );
  const maxGrupo = Math.max(1, ...grupos.map((g) => registros.filter((r) => chaveGrupo(r) === g).length));
  const COR_ANO = ["#d8d4cc", "#eb6834", "#2b2118", "#0f766e", "#2a78d6", "#8a8780"];
  const corAno = (y: number) => COR_ANO[anos.indexOf(y) % COR_ANO.length];

  // tipo de rescisão por ano
  const tiposUsados = Array.from(new Set(registros.map((r) => tipoPadrao(r.tipo_rescisao))));
  const tiposOrdenados = [...TIPOS.filter((t) => tiposUsados.includes(t)), ...tiposUsados.filter((t) => !TIPOS.includes(t))];
  const nTipo = (t: string, y: number) => deslAno(y).filter((r) => tipoPadrao(r.tipo_rescisao) === t).length;
  const maxTipo = Math.max(1, ...tiposOrdenados.flatMap((t) => anos.map((y) => nTipo(t, y))));

  return (
    <div className="space-y-4">
      <Cartao7>
        <Titulo7
          sub={`${nomeEscopo} · quem entrou menos quem saiu, em cada ano`}
          direita={
            <span>
              Saldo no período: <b style={{ color: corSaldo(saldoTotal) }}>{sinal(saldoTotal)}</b>
            </span>
          }
        >
          Admissões menos desligamentos, por ano
        </Titulo7>
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: `repeat(${anos.length}, minmax(0, 1fr))` }}>
          {anos.map((y) => {
            const a = admAno(y);
            const d = deslAno(y).length;
            const s = a - d;
            return (
              <div key={y} className="rounded-[12px] px-3 pb-3 pt-3" style={{ background: "#f4f8f7", fontFamily: MANROPE }}>
                <div className="text-[12.5px] font-bold" style={{ color: P7.lab }}>{rotuloAno(y)}</div>
                <div className="text-[28px] font-extrabold leading-[1.15] tabular-nums" style={{ color: corSaldo(s) }}>{sinal(s)}</div>
                <div className="mt-2 flex h-[84px] items-end gap-3">
                  <div className="flex flex-1 flex-col items-center justify-end">
                    <span className="mb-1 text-[12px] font-bold tabular-nums">{a}</span>
                    <span className="block w-full rounded-[4px]" style={{ height: `${Math.max(2, (a / maxBarra) * 62)}px`, background: COR_ADM }} />
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-end">
                    <span className="mb-1 text-[12px] font-bold tabular-nums">{d}</span>
                    <span className="block w-full rounded-[4px]" style={{ height: `${Math.max(2, (d / maxBarra) * 62)}px`, background: COR_DESL }} />
                  </div>
                </div>
                <div className="mt-1 flex justify-around text-[11px]" style={{ color: P7.sec }}>
                  <span>Admissões</span>
                  <span>Saídas</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-[9px] text-[12.5px]" style={{ borderColor: P7.grid }}>
          <span><Ponto cor={COR_ADM} />Admissões</span>
          <span><Ponto cor={COR_DESL} />Desligamentos</span>
          <span style={{ color: P7.sec }}>
            O número grande é o saldo do ano. As admissões vêm do cadastro de Colaboradores, inclusive de quem já saiu.
          </span>
        </div>
      </Cartao7>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao7>
          <Titulo7 sub="Por semestre, empilhado por iniciativa" direita={<Link href="/desligamentos" className={LINK7} style={LINK7_STYLE}>Abrir módulo</Link>}>
            Evolução dos desligamentos
          </Titulo7>
          <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
            {INICIATIVAS.map((i) => (<span key={i.chave}><Ponto cor={i.cor} />{i.nome}</span>))}
          </div>
          <BarrasSemestre registros={registros} anos={anos} anoAtual={anoAtual} />
        </Cartao7>

        <Cartao7>
          <Titulo7 sub="Cada barra soma 100% do ano; os números são quantidades">Iniciativa, por ano</Titulo7>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
            {INICIATIVAS.map((i) => (<span key={i.chave}><Ponto cor={i.cor} />{i.nome}</span>))}
          </div>
          <div className="flex flex-col gap-4">
            {anos.map((y) => {
              const rs = deslAno(y);
              const tot = rs.length;
              return (
                <div key={y}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <span>{rotuloAno(y)}</span>
                    <span style={{ color: P7.sec }}><b style={{ color: P7.ink }}>{tot}</b> saídas</span>
                  </div>
                  <div className="flex h-[22px] overflow-hidden rounded-[6px]" style={{ background: P7.track }}>
                    {tot > 0 && INICIATIVAS.map((i) => {
                      const n = rs.filter((r) => iniDe(r) === i.chave).length;
                      return n > 0 ? (
                        <div key={i.chave} className="flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(n / tot) * 100}%`, background: i.cor }} title={`${i.nome}: ${n}`}>
                          {n}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Cartao7>

        <Cartao7>
          <Titulo7 sub="Quantidade em cada ano; quanto mais forte a cor, mais saídas">Tipo de rescisão, por ano</Titulo7>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={`${ROTULO_COLUNA} py-2 pr-2 text-left`} style={{ color: P7.lab, borderBottom: `1px solid ${P7.bd}` }}>Tipo</th>
                  {anos.map((y) => (<th key={y} className={`${ROTULO_COLUNA} px-2 py-2 text-right`} style={{ color: P7.lab, borderBottom: `1px solid ${P7.bd}` }}>{y}</th>))}
                  <th className={`${ROTULO_COLUNA} px-2 py-2 text-right`} style={{ color: P7.lab, borderBottom: `1px solid ${P7.bd}` }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {tiposOrdenados.map((t) => (
                  <tr key={t}>
                    <td className="py-[7px] pr-2" style={{ borderBottom: `1px solid ${P7.grid}` }}>{t}</td>
                    {anos.map((y) => {
                      const n = nTipo(t, y);
                      return (
                        <td key={y} className="px-2 py-[7px] text-right font-bold tabular-nums" style={{ borderBottom: `1px solid ${P7.grid}`, background: n === 0 ? undefined : `rgba(235,104,52,${(0.12 + 0.5 * (n / maxTipo)).toFixed(2)})` }}>
                          {n}
                        </td>
                      );
                    })}
                    <td className="px-2 py-[7px] text-right font-extrabold tabular-nums" style={{ borderBottom: `1px solid ${P7.grid}` }}>
                      {anos.reduce((a, y) => a + nTipo(t, y), 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao7>

        <Cartao7>
          <Titulo7 sub={agrupar === "empresa" ? "Saídas de cada empresa, separadas por ano" : "Saídas de cada unidade, separadas por ano"}>
            {agrupar === "empresa" ? "Desligamentos por empresa" : "Desligamentos por unidade"}
          </Titulo7>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
            {anos.map((y) => (<span key={y}><Ponto cor={corAno(y)} />{y}</span>))}
          </div>
          <div className="flex flex-col gap-4">
            {grupos.map((g) => {
              const rs = registros.filter((r) => chaveGrupo(r) === g);
              return (
                <div key={g}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <b>{g}</b>
                    <span style={{ color: P7.sec }}><b style={{ color: P7.ink }}>{rs.length}</b> saídas</span>
                  </div>
                  <div className="flex h-[22px] overflow-hidden rounded-[6px]">
                    {anos.map((y) => {
                      const n = rs.filter((r) => anoDe(r.data_desligamento) === y).length;
                      return n > 0 ? (
                        <div key={y} className="flex items-center justify-center text-[11px] font-bold" style={{ width: `${(n / maxGrupo) * 100}%`, background: corAno(y), color: y === anos[0] ? P7.ink : "#fff" }} title={`${y}: ${n}`}>
                          {n}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Cartao7>
      </div>
      <p className="text-[11px]" style={{ color: P7.lab, fontSize: FS.rotulo + 0.5 }}>
        Desligamentos vêm do módulo Desligamentos (registros ativos). Registros cancelados não entram.
      </p>
    </div>
  );
}
