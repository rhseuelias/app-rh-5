"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  copiarMesAnteriorVT,
  criarLinhaVT,
  excluirLinhaVT,
  salvarLinhaVT,
  salvarMatriculaVT,
  type CamposLinhaVT,
} from "@/lib/actions-vale-transporte";
import {
  COR_OPERADORA,
  OPERADORAS,
  ROTULO_OPERADORA,
  campoVT,
  cargaVT,
  lerNumeroVT,
  moedaVT,
  numeroVT,
  saldoNaRecargaVT,
  somaVT,
  totalVT,
  valorDiarioVT,
  type LinhaVT,
  type OperadoraVT,
} from "@/lib/vale-transporte";

export interface LinhaTela extends LinhaVT {
  nome: string;
  matricula: string | null;
  unidade: string;
  repetido: boolean;
}

export interface OpcaoColaborador {
  id: string;
  nome: string;
  unidade: string;
}

interface Props {
  competencia: string;
  rotuloMes: string;
  linhas: LinhaTela[];
  colaboradores: OpcaoColaborador[];
  unidades: string[];
  unidadesIniciais: string[];
  temMesAnterior: boolean;
  diasMesInicial: number;
  linkCsvBhbus: string;
  /** Mensagem "veio do mês anterior" (vazio se não houver). */
  avisoCopia: string;
}

const campo =
  "w-full min-w-0 rounded-[7px] border border-[#e4dfd8] bg-white px-2 py-1 text-right text-[15px] tabular-nums text-[#2b2623] focus:outline-none focus:ring-2 focus:ring-stone-300";

const COR_UNIDADE: Record<string, { cor: string; tom: string }> = {
  BELVEDERE: { cor: "#1d5fb8", tom: "#e3eefc" },
  PAMPULHA: { cor: "#1b8a4b", tom: "#e1f5e9" },
  SAVASSI: { cor: "#7a3fb5", tom: "#efe5fa" },
  "OURO MINAS": { cor: "#c27a00", tom: "#fdefd2" },
  "LAGOA SANTA": { cor: "#0f8a8a", tom: "#dcf4f4" },
  CONFINS: { cor: "#c2335f", tom: "#fbe3ec" },
  ALPHAVILLE: { cor: "#5b6470", tom: "#e8ebee" },
  BDU: { cor: "#8a5a1b", tom: "#f3e8d6" },
  BABOON: { cor: "#b33a1d", tom: "#fbe4de" },
};
const COR_PADRAO = { cor: "#6b625b", tom: "#eeeae4" };
function corUnidade(u: string) {
  return COR_UNIDADE[u.trim().toUpperCase()] ?? COR_PADRAO;
}
const FONTE_TITULO = { fontFamily: "Oswald, 'Arial Narrow', sans-serif" } as const;

type ColunaOrdem =
  | "matricula" | "nome" | "unidade" | "cartao" | "diaria" | "valor_unit" | "valor_diario"
  | "dias_uteis" | "alimentacao" | "premio" | "total" | "saldo" | "carga";

function valorOrdem(l: LinhaTela, c: ColunaOrdem): string | number {
  switch (c) {
    case "matricula": return l.matricula ?? "";
    case "nome": return l.nome;
    case "unidade": return l.unidade;
    case "cartao": return l.cartao ?? "";
    case "diaria": return Number(l.diaria) || 0;
    case "valor_unit": return Number(l.valor_unit) || 0;
    case "valor_diario": return valorDiarioVT(l);
    case "dias_uteis": return Number(l.dias_uteis) || 0;
    case "alimentacao": return Number(l.alimentacao) || 0;
    case "premio": return Number(l.premio) || 0;
    case "total": return totalVT(l);
    case "saldo": return saldoNaRecargaVT(l);
    case "carga": return cargaVT(l);
  }
}

export default function ValeTransporteTela({
  competencia, rotuloMes, linhas, colaboradores, unidades, unidadesIniciais, temMesAnterior, diasMesInicial, linkCsvBhbus, avisoCopia,
}: Props) {
  const [ativa, setAtiva] = useState<OperadoraVT>(OPERADORAS.find((o) => linhas.some((l) => l.operadora === o)) ?? "BHBUS");
  const [incluidas, setIncluidas] = useState<Set<string>>(new Set(unidadesIniciais));
  const [filtro, setFiltro] = useState("");
  const [ordem, setOrdem] = useState<{ col: ColunaOrdem; dir: 1 | -1 }>({ col: "nome", dir: 1 });
  const [incluindo, setIncluindo] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const caju = ativa === "CAJU";
  const comMatricula = ativa === "BHBUS" || ativa === "OTIMO";
  const corAtiva = COR_OPERADORA[ativa];

  const doOperadora = linhas.filter((l) => l.operadora === ativa);
  const visiveis = useMemo(() => {
    const lista = doOperadora.filter((l) => incluidas.has(l.unidade) && (!filtro || l.unidade === filtro));
    return [...lista].sort((a, b) => {
      const x = valorOrdem(a, ordem.col);
      const y = valorOrdem(b, ordem.col);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
      return c * ordem.dir;
    });
  }, [doOperadora, incluidas, filtro, ordem]);
  const soma = somaVT(visiveis);
  const filtroValido = filtro && incluidas.has(filtro) ? filtro : "";

  const opcoesIncluir = colaboradores.filter((c) => !doOperadora.some((l) => l.colaborador_id === c.id));

  function avisar(ok: boolean, texto: string) {
    setMsg({ ok, texto });
  }

  function alternarUnidade(u: string) {
    setIncluidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(u)) novo.delete(u);
      else novo.add(u);
      return novo;
    });
    if (filtro === u) setFiltro("");
  }

  function ordenar(col: ColunaOrdem) {
    setOrdem((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: 1 }));
  }

  function incluir() {
    const c = colaboradores.find((x) => x.id === escolhido);
    if (!c) return avisar(false, "Escolha o colaborador.");
    iniciar(async () => {
      const r = await criarLinhaVT({
        competencia,
        colaboradorId: c.id,
        operadora: ativa,
        cartao: "",
        diaria: 2,
        valorUnit: 0,
        diasUteis: diasMesInicial,
      });
      if (r.ok) {
        setIncluidas((atual) => new Set(atual).add(c.unidade));
        setEscolhido("");
        setIncluindo(false);
        avisar(true, `${c.nome} incluído(a) em ${ROTULO_OPERADORA[ativa]}. Preencha o cartão e os valores.`);
      } else avisar(false, r.erro);
    });
  }

  function copiarAnterior() {
    iniciar(async () => {
      const r = await copiarMesAnteriorVT(
        competencia,
        colaboradores.map((c) => c.id)
      );
      avisar(r.ok, r.ok ? r.aviso ?? "Copiado." : r.erro);
    });
  }

  const linkExcel = `/api/vale-transporte/excel?competencia=${competencia}${filtroValido ? `&unidade=${encodeURIComponent(filtroValido)}` : ""}`;

  function Cab({ col, rotulo, direita }: { col: ColunaOrdem; rotulo: string; direita?: boolean }) {
    const ativo = ordem.col === col;
    return (
      <th className={`px-1.5 py-3 ${direita ? "text-right" : ""}`} aria-sort={ativo ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => ordenar(col)} className="inline-flex items-center gap-1 text-left font-semibold uppercase tracking-[.06em] hover:text-stone-900" title="Clique para ordenar">
          {rotulo}
          <span className={ativo ? "text-stone-800" : "text-stone-300"}>{ativo ? (ordem.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e4dfd8] bg-white !p-0 text-[#2b2623]">
      {/* Operadoras + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div role="tablist" aria-label="Operadoras" className="flex flex-wrap gap-0.5 rounded-[11px] bg-[#ece7e0] p-1">
          {OPERADORAS.map((op) => {
            const doOp = linhas.filter((l) => l.operadora === op && incluidas.has(l.unidade));
            const s = somaVT(doOp);
            const sel = op === ativa;
            return (
              <button
                key={op}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => setAtiva(op)}
                className={`rounded-lg px-4 py-1.5 text-left text-[15px] font-semibold ${sel ? "bg-white text-[#26221f] shadow-sm" : "text-[#6b625b] hover:bg-white/60"}`}
              >
                {ROTULO_OPERADORA[op]}{" "}
                <span className="text-[12.5px] font-normal">
                  {doOp.length} · {moedaVT(s.carga)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {temMesAnterior && (
            <button type="button" className="btn-secondary" disabled={pendente} onClick={copiarAnterior}>
              Copiar cartões do mês anterior
            </button>
          )}
          <a href={linkExcel} className="btn-primary no-underline">
            Exportar Excel
          </a>
          {ativa === "BHBUS" && (
            <a href={linkCsvBhbus} className="btn-secondary no-underline">
              CSV de recarga BHBUS
            </a>
          )}
        </div>
      </div>

      {avisoCopia && (
        <p className="mx-6 mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">{avisoCopia}</p>
      )}

      {/* Incluir Unidades BSE */}
      <div className="mx-5 mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#e4dfd8] bg-white px-3 py-2">
        <h2 className="mr-1.5 text-[12.5px] font-semibold uppercase tracking-[.06em] text-[#6b625b]">Incluir Unidades BSE</h2>
        {unidades.length === 0 && <span className="text-sm text-stone-500">Nenhuma unidade cadastrada.</span>}
        {unidades.map((u) => {
          const on = incluidas.has(u);
          const qtd = doOperadora.filter((l) => l.unidade === u).length;
          const c = corUnidade(u);
          return (
            <button
              key={u}
              type="button"
              aria-pressed={on}
              onClick={() => alternarUnidade(u)}
              style={on ? { background: c.tom, color: c.cor, borderColor: `${c.cor}55` } : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[12.5px] font-semibold uppercase ${on ? "" : "border-[#e4dfd8] bg-white text-[#6b625b] hover:bg-stone-50"}`}
            >
              <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: c.cor }} />
              {u}
              <span className="text-xs font-medium text-[#6b625b]">{qtd}</span>
            </button>
          );
        })}
      </div>

      {/* Filtro + incluir colaborador */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
        <div>
          <label className="mr-2 text-sm text-stone-700" htmlFor="vt-filtro-unidade">
            Unidades BSE filtro
          </label>
          <select id="vt-filtro-unidade" className="input !inline-block !w-64 !py-1.5" value={filtroValido} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas as unidades incluídas</option>
            {unidades.filter((u) => incluidas.has(u)).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {incluindo ? (
            <>
              <div>
                <label className="label" htmlFor="vt-incluir-colab">
                  Colaborador
                </label>
                <select id="vt-incluir-colab" className="input !w-72" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
                  <option value="">{opcoesIncluir.length ? "Escolha…" : "(todos já estão no lançamento)"}</option>
                  {opcoesIncluir.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} — {c.unidade}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-primary" disabled={pendente || !escolhido} onClick={incluir}>
                Incluir
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIncluindo(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setIncluindo(true)}>
              + Incluir colaborador
            </button>
          )}
        </div>
        {msg && (
          <p role="status" className={`basis-full text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
            {msg.texto}
          </p>
        )}
      </div>

      {/* Totais */}
      <div className="mx-5 mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-[#e4dfd8] md:grid-cols-4">
        <div className="border-r border-[#e4dfd8] px-4 py-2.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#6b625b]">Colaboradores</div>
          <div className="text-[28px] font-bold leading-tight" style={FONTE_TITULO}>{visiveis.length}</div>
        </div>
        <div className="border-r border-[#e4dfd8] px-4 py-2.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#6b625b]">Total do mês</div>
          <div className="text-[28px] font-bold leading-tight" style={FONTE_TITULO}>{moedaVT(soma.total)}</div>
        </div>
        <div className="border-r border-[#e4dfd8] px-4 py-2.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#6b625b]">{soma.saldo !== soma.saldoAtual ? "Saldo na recarga" : "Saldo atual nos cartões"}</div>
          <div className="text-[28px] font-bold leading-tight" style={FONTE_TITULO}>{moedaVT(soma.saldo)}</div>
          {soma.saldo !== soma.saldoAtual && <div className="text-xs text-stone-500">hoje nos cartões: {moedaVT(soma.saldoAtual)}</div>}
        </div>
        <div className="px-4 py-2.5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#b0302a]">Carga a recarregar</div>
          <div className="text-[28px] font-bold leading-tight text-[#b0302a]" style={FONTE_TITULO}>{moedaVT(soma.carga)}</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="mt-3 border-t border-[#e4dfd8]">
        {caju && (
          <p className="border-b border-brand-100 bg-blue-50/40 px-6 py-3 text-sm text-stone-600">
            No CAJU o Total soma transporte + alimentação + prêmio. Se você também lança alimentação e prêmio no Controle de Benefícios, não repita aqui para não contar duas vezes.
          </p>
        )}
        <table className="w-full table-fixed text-[15px]">
          <colgroup>
            {comMatricula && <col style={{ width: 104 }} />}
            <col />
            <col style={{ width: 128 }} />
            <col style={{ width: caju ? 140 : 176 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 62 }} />
            {caju && <col style={{ width: 90 }} />}
            {caju && <col style={{ width: 90 }} />}
            <col style={{ width: 92 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 98 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#e4dfd8] text-left text-[11.5px] font-semibold text-[#6b625b]">
              {comMatricula && <Cab col="matricula" rotulo="Matrícula" />}
              <Cab col="nome" rotulo="Nome" />
              <Cab col="unidade" rotulo="Unidade" />
              <Cab col="cartao" rotulo="Cartão" />
              <Cab col="diaria" rotulo="Diária" direita />
              <Cab col="valor_unit" rotulo="Valor unit." direita />
              <Cab col="valor_diario" rotulo="Valor diário" direita />
              <Cab col="dias_uteis" rotulo="Dias úteis" direita />
              {caju && <Cab col="alimentacao" rotulo="Alimentação" direita />}
              {caju && <Cab col="premio" rotulo="Prêmio" direita />}
              <Cab col="total" rotulo="Total" direita />
              <Cab col="saldo" rotulo="Saldo atual · dias até a recarga" direita />
              <Cab col="carga" rotulo="Carga" direita />
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={16} className="px-5 py-8 text-center text-sm text-stone-500">
                  Nenhum colaborador {ROTULO_OPERADORA[ativa]} no lançamento. Marque uma unidade em "Incluir Unidades BSE" ou use "+ Incluir colaborador".
                </td>
              </tr>
            )}
            {visiveis.map((l) => (
              <LinhaEditavel key={l.id} linha={l} caju={caju} comMatricula={comMatricula} />
            ))}
          </tbody>
          {visiveis.length > 0 && (
            <tfoot>
              <tr className={`border-t border-[#e4dfd8] bg-[#f3efe9] text-[15px] font-bold text-[#2b2623]`}>
                <td className="px-3 py-2.5" colSpan={(caju ? 9 : 7) + (comMatricula ? 1 : 0)}>
                  TOTAL — {ROTULO_OPERADORA[ativa]} · {filtroValido || "unidades incluídas"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numeroVT(soma.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numeroVT(soma.saldo)}</td>
                <td className="px-3 py-2.5 text-right text-base tabular-nums text-[#b0302a]">{numeroVT(soma.carga)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-5 py-3 text-[13px] text-stone-600">
        Total = valor diário × dias úteis · Carga = Total − Saldo atual · Tudo o que você digita é salvo sozinho e repetido no mês seguinte (menos o saldo). Clique no título de uma coluna para ordenar.
      </p>
    </section>
  );
}

function LinhaEditavel({ linha, caju, comMatricula }: { linha: LinhaTela; caju: boolean; comMatricula: boolean }) {
  const [cartao, setCartao] = useState(linha.cartao ?? "");
  const [matricula, setMatricula] = useState(linha.matricula ?? "");
  const matriculaSalva = useRef((linha.matricula ?? "").trim());
  const [diaria, setDiaria] = useState(campoVT(linha.diaria));
  const [valor, setValor] = useState(campoVT(linha.valor_unit));
  const [dias, setDias] = useState(campoVT(linha.dias_uteis));
  const [saldo, setSaldo] = useState(campoVT(linha.saldo));
  const [diasAte, setDiasAte] = useState(campoVT(linha.dias_ate_recarga ?? 0));
  const [alim, setAlim] = useState(campoVT(linha.alimentacao ?? 0));
  const [premio, setPremio] = useState(campoVT(linha.premio ?? 0));
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  const nDiaria = lerNumeroVT(diaria);
  const nValor = lerNumeroVT(valor);
  const nDias = lerNumeroVT(dias);
  const nSaldo = lerNumeroVT(saldo);
  const nDiasAte = lerNumeroVT(diasAte);
  const nAlim = lerNumeroVT(alim);
  const nPremio = lerNumeroVT(premio);
  const ok = nDiaria !== null && nValor !== null && nDias !== null && nSaldo !== null && nDiasAte !== null && nAlim !== null && nPremio !== null;

  const vivo = {
    operadora: linha.operadora,
    alimentacao: nAlim ?? 0,
    premio: nPremio ?? 0,
    diaria: nDiaria ?? 0,
    valor_unit: nValor ?? 0,
    dias_uteis: nDias ?? 0,
    saldo: nSaldo ?? 0,
    dias_ate_recarga: nDiasAte ?? 0,
  };

  // Salvamento automático: 0,8 s depois de parar de digitar (e na hora, ao sair do campo).
  const temporizadores = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const aguardando = useRef<Record<string, string>>({});
  const salvos = useRef<Record<string, string>>({
    cartao: (linha.cartao ?? "").trim(),
    diaria: campoVT(linha.diaria),
    valor_unit: campoVT(linha.valor_unit),
    dias_uteis: campoVT(linha.dias_uteis),
    saldo: campoVT(linha.saldo),
    dias_ate_recarga: campoVT(linha.dias_ate_recarga ?? 0),
    alimentacao: campoVT(linha.alimentacao ?? 0),
    premio: campoVT(linha.premio ?? 0),
  });

  function gravar(nome: keyof CamposLinhaVT, texto: string) {
    delete aguardando.current[nome];
    const comparavel = texto.trim();
    if (salvos.current[nome] === comparavel) return;
    let campos: CamposLinhaVT;
    if (nome === "cartao") {
      campos = { cartao: texto };
    } else {
      const n = lerNumeroVT(texto);
      if (n === null) {
        setEstado("erro");
        setErro("Número inválido.");
        return;
      }
      campos = { [nome]: n } as CamposLinhaVT;
    }
    const anterior = salvos.current[nome];
    salvos.current[nome] = comparavel;
    setEstado("salvando");
    setErro("");
    iniciar(async () => {
      const r = await salvarLinhaVT(linha.id, campos);
      if (r.ok) setEstado("salvo");
      else {
        salvos.current[nome] = anterior === comparavel ? "__erro__" : anterior;
        setEstado("erro");
        setErro(r.erro);
      }
    });
  }

  function digitou(nome: keyof CamposLinhaVT, texto: string, definir: (t: string) => void) {
    definir(texto);
    aguardando.current[nome] = texto;
    clearTimeout(temporizadores.current[nome]);
    temporizadores.current[nome] = setTimeout(() => gravar(nome, texto), 800);
  }

  function aoSair(nome: keyof CamposLinhaVT, texto: string) {
    clearTimeout(temporizadores.current[nome]);
    gravar(nome, texto);
  }

  // Se a linha sair da tela (troca de aba) com algo ainda não salvo, salva na hora.
  useEffect(() => {
    const tempos = temporizadores.current;
    const fila = aguardando.current;
    const id = linha.id;
    return () => {
      for (const nome of Object.keys(fila)) {
        clearTimeout(tempos[nome]);
        const texto = fila[nome];
        if (nome === "cartao") {
          void salvarLinhaVT(id, { cartao: texto });
        } else {
          const n = lerNumeroVT(texto);
          if (n !== null) void salvarLinhaVT(id, { [nome]: n } as CamposLinhaVT);
        }
      }
    };
  }, [linha.id]);

  function excluir() {
    if (!window.confirm(`Tirar ${linha.nome} deste lançamento (cartão ${linha.cartao ?? "sem número"})?`)) return;
    iniciar(async () => {
      const r = await excluirLinhaVT(linha.id);
      if (!r.ok) {
        setEstado("erro");
        setErro(r.erro);
      }
    });
  }

  const semDias = vivo.dias_uteis === 0;

  return (
    <tr className="border-t border-[#efebe5] align-middle">
      {comMatricula && (
        <td className="px-1.5 py-1.5">
          <input
            aria-label={`Matrícula de ${linha.nome}`}
            placeholder="matrícula"
            className="w-full min-w-0 rounded-[7px] border border-[#e4dfd8] bg-white px-2 py-1 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-stone-300"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            onBlur={() => {
              const nova = matricula.trim();
              if (nova === matriculaSalva.current) return;
              setEstado("salvando");
              iniciar(async () => {
                const r = await salvarMatriculaVT(linha.colaborador_id, linha.operadora, nova);
                if (r.ok) {
                  matriculaSalva.current = nova;
                  setEstado("salvo");
                } else {
                  setEstado("erro");
                  setErro(r.erro);
                }
              });
            }}
          />
        </td>
      )}
      <td className="px-1.5 py-1.5 text-[14.5px] font-semibold uppercase leading-tight">{linha.nome}</td>
      <td className="px-1.5 py-1.5">
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide" style={{ background: corUnidade(linha.unidade).tom, color: corUnidade(linha.unidade).cor }}>
          {linha.unidade}
        </span>
      </td>
      <td className="px-1.5 py-1.5">
        <div className="flex items-center gap-1">
          <input
            aria-label={`Cartão de ${linha.nome}`}
            className="w-full min-w-0 rounded-[7px] border border-[#e4dfd8] bg-white px-2 py-1 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-stone-300"
            value={cartao}
            onChange={(e) => digitou("cartao", e.target.value, setCartao)}
            onBlur={() => aoSair("cartao", cartao)}
          />
          {linha.repetido && (
            <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" title="Este número de cartão aparece em mais de um colaborador">
              repetido
            </span>
          )}
        </div>
      </td>
      <td className="px-1.5 py-1.5">
        <input aria-label="Diária" className={campo} inputMode="decimal" value={diaria} onChange={(e) => digitou("diaria", e.target.value, setDiaria)} onBlur={() => aoSair("diaria", diaria)} />
      </td>
      <td className="px-1.5 py-1.5">
        <input aria-label="Valor unitário" className={campo} inputMode="decimal" value={valor} onChange={(e) => digitou("valor_unit", e.target.value, setValor)} onBlur={() => aoSair("valor_unit", valor)} />
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-[#6b625b]">{numeroVT(valorDiarioVT(vivo))}</td>
      <td className="px-1.5 py-1.5">
        <input
          aria-label="Dias úteis"
          className={`${campo} ${semDias ? "border-red-300 bg-red-50" : ""}`}
          inputMode="numeric"
          value={dias}
          onChange={(e) => digitou("dias_uteis", e.target.value, setDias)}
          onBlur={() => aoSair("dias_uteis", dias)}
        />
      </td>
      {caju && (
        <td className="px-1.5 py-1.5">
          <input aria-label="Alimentação" className={campo} inputMode="decimal" value={alim} onChange={(e) => digitou("alimentacao", e.target.value, setAlim)} onBlur={() => aoSair("alimentacao", alim)} />
        </td>
      )}
      {caju && (
        <td className="px-1.5 py-1.5">
          <input aria-label="Prêmio" className={campo} inputMode="decimal" value={premio} onChange={(e) => digitou("premio", e.target.value, setPremio)} onBlur={() => aoSair("premio", premio)} />
        </td>
      )}
      <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{numeroVT(ok ? totalVT(vivo) : 0)}</td>
      <td className="px-1.5 py-1.5">
        <div className="flex items-center justify-end gap-1.5">
          <input aria-label="Saldo atual" title="Saldo que está no cartão hoje" className={campo} inputMode="decimal" value={saldo} onChange={(e) => digitou("saldo", e.target.value, setSaldo)} onBlur={() => aoSair("saldo", saldo)} />
          <span className="text-stone-400" aria-hidden="true">−</span>
          <input
            aria-label="Dias que faltam até a recarga"
            title="Dias que faltam até a recarga: o cartão ainda gasta esses dias antes de receber a carga"
            placeholder="dias"
            className={`${campo} !min-w-[44px] !w-14`}
            inputMode="numeric"
            value={diasAte}
            onChange={(e) => digitou("dias_ate_recarga", e.target.value, setDiasAte)}
            onBlur={() => aoSair("dias_ate_recarga", diasAte)}
          />
        </div>
        {vivo.dias_ate_recarga > 0 && (
          <div className="mt-0.5 text-right text-[11px] text-stone-500">na recarga: {numeroVT(saldoNaRecargaVT(vivo))}</div>
        )}
      </td>
      <td className="px-1.5 py-1.5 text-right text-base font-bold tabular-nums text-[#b0302a]">{numeroVT(ok ? cargaVT(vivo) : 0)}</td>
      <td className="px-1.5 py-1.5 text-center text-sm">
        {estado === "salvando" && <span className="text-stone-400" title="salvando…">…</span>}
        {estado === "salvo" && !pendente && <span className="text-emerald-700" title="salvo">✓</span>}
        {estado === "erro" && <span className="font-bold text-red-700" title={erro}>!</span>}
        {estado === "" && (
          <button type="button" onClick={excluir} disabled={pendente} className="text-stone-400 hover:text-red-700" aria-label={`Tirar ${linha.nome} do lançamento`} title="Tirar do lançamento">
            ✕
          </button>
        )}
        {estado !== "" && (
          <button type="button" onClick={excluir} disabled={pendente} className="ml-1 text-stone-400 hover:text-red-700" aria-label={`Tirar ${linha.nome} do lançamento`} title="Tirar do lançamento">
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

