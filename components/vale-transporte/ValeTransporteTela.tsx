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
  "w-full min-w-[56px] rounded-md border border-stone-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400";

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
      <th className={`px-3 py-2 ${direita ? "text-right" : ""}`} aria-sort={ativo ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => ordenar(col)} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-brand-700" title="Clique para ordenar">
          {rotulo}
          <span className={ativo ? "text-brand-700" : "text-stone-300"}>{ativo ? (ordem.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <section className="card overflow-hidden !p-0">
      {/* Operadoras + ações */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5">
        <div role="tablist" aria-label="Operadoras" className="flex flex-wrap gap-1">
          {OPERADORAS.map((op) => {
            const doOp = linhas.filter((l) => l.operadora === op && incluidas.has(l.unidade));
            const s = somaVT(doOp);
            const sel = op === ativa;
            const c = COR_OPERADORA[op];
            return (
              <button
                key={op}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => setAtiva(op)}
                className={`flex flex-col items-start rounded-lg border-b-4 px-5 py-2.5 text-left ${
                  sel ? `${c.fundo} ${c.texto} border-current` : "border-transparent text-stone-700 hover:bg-brand-50"
                }`}
              >
                <span className="text-base font-bold">{ROTULO_OPERADORA[op]}</span>
                <span className={`text-xs ${sel ? "" : "text-stone-500"}`}>
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
      <div className="mx-6 mt-4 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3">
        <h2 className="text-sm font-bold text-brand-700">Incluir Unidades BSE</h2>
        <p className="text-xs text-stone-600">Marque as unidades deste lançamento. Os colaboradores delas aparecem na tabela.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {unidades.length === 0 && <span className="text-sm text-stone-500">Nenhuma unidade cadastrada.</span>}
          {unidades.map((u) => {
            const on = incluidas.has(u);
            const qtd = doOperadora.filter((l) => l.unidade === u).length;
            return (
              <button
                key={u}
                type="button"
                aria-pressed={on}
                onClick={() => alternarUnidade(u)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                  on ? "border-brand-700 bg-brand-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-brand-50"
                }`}
              >
                {on ? "✓ " : ""}
                {u}
                <span className={`rounded-full px-2 text-xs ${on ? "bg-white/20" : "bg-stone-100 text-stone-600"}`}>{qtd}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtro + incluir colaborador */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-4">
        <div>
          <label className="label" htmlFor="vt-filtro-unidade">
            Unidades BSE filtro
          </label>
          <select id="vt-filtro-unidade" className="input !w-64" value={filtroValido} onChange={(e) => setFiltro(e.target.value)}>
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
      <div className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
        <div className="rounded-xl border border-brand-200/70 bg-brand-50/40 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Colaboradores</div>
          <div className="text-2xl font-bold">{visiveis.length}</div>
        </div>
        <div className="rounded-xl border border-brand-200/70 bg-brand-50/40 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Total do mês</div>
          <div className="text-2xl font-bold">{moedaVT(soma.total)}</div>
        </div>
        <div className="rounded-xl border border-brand-200/70 bg-brand-50/40 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{soma.saldo !== soma.saldoAtual ? "Saldo na recarga" : "Saldo atual nos cartões"}</div>
          <div className="text-2xl font-bold">{moedaVT(soma.saldo)}</div>
          {soma.saldo !== soma.saldoAtual && <div className="text-xs text-stone-500">hoje nos cartões: {moedaVT(soma.saldoAtual)}</div>}
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Carga a recarregar</div>
          <div className="text-2xl font-bold text-red-700">{moedaVT(soma.carga)}</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="mt-4 overflow-x-auto border-t border-brand-100">
        {caju && (
          <p className="border-b border-brand-100 bg-blue-50/40 px-6 py-3 text-sm text-stone-600">
            No CAJU o Total soma transporte + alimentação + prêmio. Se você também lança alimentação e prêmio no Controle de Benefícios, não repita aqui para não contar duas vezes.
          </p>
        )}
        <table className={`w-full text-sm ${caju ? "min-w-[1280px]" : "min-w-[1180px]"}`}>
          <thead>
            <tr className="bg-brand-50/60 text-left text-[11px] text-stone-600">
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
              <th className="px-3 py-2" />
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
              <tr className={`border-t-2 border-current font-semibold ${corAtiva.fundo} ${corAtiva.texto}`}>
                <td className="px-3 py-2.5" colSpan={(caju ? 9 : 7) + (comMatricula ? 1 : 0)}>
                  TOTAL — {ROTULO_OPERADORA[ativa]} · {filtroValido || "unidades incluídas"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numeroVT(soma.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{numeroVT(soma.saldo)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{numeroVT(soma.carga)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-6 py-3 text-xs text-stone-500">
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
    <tr className="border-t border-brand-100 align-middle">
      {comMatricula && (
        <td className="px-3 py-1.5">
          <input
            aria-label={`Matrícula de ${linha.nome}`}
            placeholder="matrícula"
            className="w-28 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400"
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
      <td className="whitespace-nowrap px-3 py-1.5 font-semibold uppercase">{linha.nome}</td>
      <td className="whitespace-nowrap px-3 py-1.5">
        <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{linha.unidade}</span>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <input
            aria-label={`Cartão de ${linha.nome}`}
            className="w-44 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400"
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
      <td className="px-3 py-1.5">
        <input aria-label="Diária" className={campo} inputMode="decimal" value={diaria} onChange={(e) => digitou("diaria", e.target.value, setDiaria)} onBlur={() => aoSair("diaria", diaria)} />
      </td>
      <td className="px-3 py-1.5">
        <input aria-label="Valor unitário" className={campo} inputMode="decimal" value={valor} onChange={(e) => digitou("valor_unit", e.target.value, setValor)} onBlur={() => aoSair("valor_unit", valor)} />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{numeroVT(valorDiarioVT(vivo))}</td>
      <td className="px-3 py-1.5">
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
        <td className="px-3 py-1.5">
          <input aria-label="Alimentação" className={campo} inputMode="decimal" value={alim} onChange={(e) => digitou("alimentacao", e.target.value, setAlim)} onBlur={() => aoSair("alimentacao", alim)} />
        </td>
      )}
      {caju && (
        <td className="px-3 py-1.5">
          <input aria-label="Prêmio" className={campo} inputMode="decimal" value={premio} onChange={(e) => digitou("premio", e.target.value, setPremio)} onBlur={() => aoSair("premio", premio)} />
        </td>
      )}
      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{numeroVT(ok ? totalVT(vivo) : 0)}</td>
      <td className="px-3 py-1.5">
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
      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-red-700">{numeroVT(ok ? cargaVT(vivo) : 0)}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs">
        {estado === "salvando" && <span className="text-stone-500">salvando…</span>}
        {estado === "salvo" && !pendente && <span className="text-emerald-700">salvo ✓</span>}
        {estado === "erro" && <span className="text-red-700">{erro}</span>}
        <button type="button" onClick={excluir} disabled={pendente} className="ml-2 text-stone-400 hover:text-red-700" aria-label={`Tirar ${linha.nome} do lançamento`} title="Tirar do lançamento">
          ✕
        </button>
      </td>
    </tr>
  );
}

