import DesligamentosAbas from "./DesligamentosAbas";
import { Cartao7, Titulo7, Ponto, P7, MANROPE, FS } from "./tema7";

/**
 * Desligamentos no Dashboard (Modelo A): saldo de admissões e desligamentos por ano,
 * evolução por semestre, iniciativa por ano, tipo de rescisão por ano e saídas por empresa/unidade.
 */

export interface RegistroDeslDash {
  empresa: string | null;
  unidade: string | null;
  cargo?: string | null;
  nome?: string | null;
  data_desligamento: string;
  iniciativa: string;
  tipo_rescisao: string;
}

type Ini = "colaborador" | "empresa" | "acordo" | "outro";
const INICIATIVAS: { chave: Ini; nome: string; cor: string }[] = [
  { chave: "colaborador", nome: "Colaborador", cor: "#2a78d6" },
  { chave: "empresa", nome: "Empresa", cor: "#eb6834" },
  { chave: "acordo", nome: "Acordo", cor: "#1baf7a" },
  { chave: "outro", nome: "Término / outros", cor: "#eda100" },
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

/** Em qual iniciativa cada tipo de rescisão se encaixa (0 colaborador, 1 empresa, 2 acordo, 3 outros). */
function iniDoTipo(t: string): number {
  if (t === TIPOS[0] || t === TIPOS[2]) return 0;
  if (t === TIPOS[1] || t === TIPOS[3] || t === "Dispensa por justa causa") return 1;
  if (t === TIPOS[5]) return 2;
  return 3;
}

const anoDe = (d: string) => Number(d.slice(0, 4));
const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));
const corSaldo = (n: number) => (n > 0 ? COR_BOM : n < 0 ? COR_RUIM : P7.sec);

function iniDe(r: RegistroDeslDash): Ini {
  return (["colaborador", "empresa", "acordo"].includes(r.iniciativa) ? r.iniciativa : "outro") as Ini;
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
  const hojeISO = new Date().toISOString().slice(0, 10);
  const saldoTotal = anos.reduce((a, y) => a + admAno(y) - deslAno(y).length, 0);

  // por empresa (ou por unidade)
  const chaveGrupo = (r: RegistroDeslDash) => (agrupar === "empresa" ? r.empresa : r.unidade) || (agrupar === "empresa" ? "Sem empresa" : "Sem unidade");
  const grupos = Array.from(new Set(registros.map(chaveGrupo))).sort(
    (a, b) => registros.filter((r) => chaveGrupo(r) === b).length - registros.filter((r) => chaveGrupo(r) === a).length
  );
  const ranking = (chave: (r: RegistroDeslDash) => string) => {
    const m = new Map<string, Record<Ini, number>>();
    for (const r of registros) {
      const k = chave(r);
      const o = m.get(k) ?? ({ colaborador: 0, empresa: 0, acordo: 0, outro: 0 } as Record<Ini, number>);
      o[iniDe(r)]++;
      m.set(k, o);
    }
    return Array.from(m, ([nome, p]) => ({ nome, por: [p.colaborador, p.empresa, p.acordo, p.outro], total: p.colaborador + p.empresa + p.acordo + p.outro }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
      .slice(0, 8);
  };

  // tipo de rescisão por ano
  const tiposUsados = Array.from(new Set(registros.map((r) => tipoPadrao(r.tipo_rescisao))));
  const tiposOrdenados = [...TIPOS.filter((t) => tiposUsados.includes(t)), ...tiposUsados.filter((t) => !TIPOS.includes(t))];
  const nTipo = (t: string, y: number) => deslAno(y).filter((r) => tipoPadrao(r.tipo_rescisao) === t).length;

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
            // turnover (só saídas) = saídas / quadro médio × 100; quadro médio = média do quadro no início e no fim do ano
            const fimAno = y === anoAtual ? hojeISO : `${y}-12-31`;
            const quadroEm = (limite: string, estrito: boolean) =>
              admissoes.filter((x) => (estrito ? x < limite : x <= limite)).length -
              registros.filter((r) => (estrito ? r.data_desligamento < limite : r.data_desligamento <= limite)).length;
            const medio = (quadroEm(`${y}-01-01`, true) + quadroEm(fimAno, false)) / 2;
            const turnover = medio > 0 ? (d / medio) * 100 : null;
            const corT = turnover === null ? P7.sec : turnover <= 15 ? COR_BOM : turnover <= 50 ? "#a36b00" : COR_RUIM;
            const bgT = turnover === null ? "#edf2f1" : turnover <= 15 ? "#eef7ee" : turnover <= 50 ? "#fff6df" : "#fceeee";
            return (
              <div key={y} className="rounded-[12px] px-3 pb-3 pt-3" style={{ background: "#f4f8f7", fontFamily: MANROPE }}>
                <div className="text-[12.5px] font-bold" style={{ color: P7.lab }}>{rotuloAno(y)}</div>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[28px] font-extrabold leading-[1.15] tabular-nums" style={{ color: corSaldo(s) }}>{sinal(s)}</div>
                  <div className="rounded-[10px] px-2.5 py-1 text-right" style={{ background: bgT }} title={`Quadro médio: ${medio.toFixed(0)} pessoas`}>
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: P7.lab }}>Turnover</div>
                    <div className="text-[18px] font-extrabold leading-[1.1] tabular-nums" style={{ color: corT }}>
                      {turnover === null ? "—" : `${turnover.toFixed(1).replace(".", ",")}%`}
                    </div>
                  </div>
                </div>
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
            Número grande = saldo. Turnover = saídas ÷ quadro médio × 100 ({anoAtual} só até hoje).
          </span>
          <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
            <span title="As saídas são poucas e a equipe fica estável."><Ponto cor={COR_BOM} /><b>Ideal</b> até ~15%</span>
            <span title="Faixa comum em serviços com atendimento ao público. Barbearia e salão tendem a ficar aqui."><Ponto cor="#a36b00" /><b>Médio</b> 25% a 45%</span>
            <span title="Acima disso, o custo de reposição e treinamento pesa, e vale investigar as causas."><Ponto cor={COR_RUIM} /><b>Máximo</b> ~50%</span>
          </div>
        </div>
      </Cartao7>

      <DesligamentosAbas
        ini={anos.map((y) => {
          const por = [0, 0, 0, 0];
          for (const r of deslAno(y)) por[INICIATIVAS.findIndex((i) => i.chave === iniDe(r))]++;
          return { nome: rotuloAno(y), por };
        })}
        cargo={ranking((r) => r.cargo || "Sem cargo")}
        unidade={ranking((r) => r.unidade || "Sem unidade")}
        tipos={tiposOrdenados.map((t) => ({
          nome: t,
          ini: iniDoTipo(t),
          anos: anos.map((y) => nTipo(t, y)),
        }))}
        grupos={grupos.map((g) => ({
          nome: g,
          anos: anos.map((y) => registros.filter((r) => chaveGrupo(r) === g && anoDe(r.data_desligamento) === y).length),
        }))}
        anos={anos.map(rotuloAno)}
        nomeGrupo={agrupar}
      />
      <p className="text-[11px]" style={{ color: P7.lab, fontSize: FS.rotulo + 0.5 }}>
        Desligamentos vêm do módulo Desligamentos (registros ativos). Registros cancelados não entram.
      </p>
    </div>
  );
}
