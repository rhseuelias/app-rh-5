"use client";

import { useState, useTransition } from "react";
import {
  aplicarDiasUteisVT,
  copiarMesAnteriorVT,
  criarLinhaVT,
  excluirLinhaVT,
  salvarLinhaVT,
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
  somaVT,
  totalVT,
  valorDiarioVT,
  type LinhaVT,
  type OperadoraVT,
} from "@/lib/vale-transporte";

export interface LinhaTela extends LinhaVT {
  nome: string;
  repetido: boolean;
}

export interface OpcaoColaborador {
  id: string;
  nome: string;
}

interface Props {
  competencia: string;
  grupo: string;
  linhas: LinhaTela[];
  colaboradores: OpcaoColaborador[];
  temMesAnterior: boolean;
  linkExcel: string;
}

const campo =
  "w-full min-w-[56px] rounded-md border border-stone-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400";

export default function ValeTransporteUnidade({ competencia, grupo, linhas, colaboradores, temMesAnterior, linkExcel }: Props) {
  const primeira = OPERADORAS.find((o) => linhas.some((l) => l.operadora === o)) ?? "BHBUS";
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ [primeira]: true });
  const [diasMes, setDiasMes] = useState("26");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  function avisar(ok: boolean, texto: string) {
    setMsg({ ok, texto });
  }

  function aplicarDias() {
    const n = lerNumeroVT(diasMes);
    if (n === null || n <= 0 || n > 31) return avisar(false, "Digite os dias úteis do mês (de 1 a 31).");
    iniciar(async () => {
      const r = await aplicarDiasUteisVT(
        linhas.map((l) => l.id),
        n
      );
      avisar(r.ok, r.ok ? `Dias úteis ${n} aplicados a ${linhas.length} cartão(ões).` : r.erro);
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

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end justify-between gap-4 !p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="dias-mes">
              Dias úteis do mês
            </label>
            <input
              id="dias-mes"
              className="input !w-24 text-right"
              inputMode="numeric"
              value={diasMes}
              onChange={(e) => setDiasMes(e.target.value)}
            />
          </div>
          <button type="button" className="btn-secondary" disabled={pendente || linhas.length === 0} onClick={aplicarDias}>
            Aplicar a todos os cartões
          </button>
          {temMesAnterior && (
            <button type="button" className="btn-secondary" disabled={pendente} onClick={copiarAnterior}>
              Copiar cartões do mês anterior
            </button>
          )}
        </div>
        <a href={linkExcel} className="btn-secondary no-underline">
          Exportar Excel
        </a>
        {msg && (
          <p role="status" className={`basis-full text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
            {msg.texto}
          </p>
        )}
      </div>

      {OPERADORAS.map((op) => (
        <SecaoOperadora
          key={op}
          operadora={op}
          competencia={competencia}
          grupo={grupo}
          linhas={linhas.filter((l) => l.operadora === op)}
          colaboradores={colaboradores}
          aberta={!!abertas[op]}
          alternar={() => setAbertas((a) => ({ ...a, [op]: !a[op] }))}
          diasPadrao={diasMes}
        />
      ))}
    </div>
  );
}

function SecaoOperadora({
  operadora,
  competencia,
  grupo,
  linhas,
  colaboradores,
  aberta,
  alternar,
  diasPadrao,
}: {
  operadora: OperadoraVT;
  competencia: string;
  grupo: string;
  linhas: LinhaTela[];
  colaboradores: OpcaoColaborador[];
  aberta: boolean;
  alternar: () => void;
  diasPadrao: string;
}) {
  const cor = COR_OPERADORA[operadora];
  const soma = somaVT(linhas);
  const [adicionando, setAdicionando] = useState(false);

  return (
    <section className={`overflow-hidden rounded-2xl border border-brand-200/70 bg-white shadow-card`}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        className={`flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-left ${cor.fundo}`}
      >
        <span className="flex items-center gap-3">
          <span className={`text-base font-bold ${cor.texto}`}>
            {aberta ? "▾" : "▸"} {ROTULO_OPERADORA[operadora]}
          </span>
          <span className="text-xs text-stone-600">
            {linhas.length} cartão{linhas.length !== 1 ? "ões" : ""}
          </span>
        </span>
        <span className={`text-sm font-semibold ${cor.texto}`}>
          Total {moedaVT(soma.total)} · Saldo {moedaVT(soma.saldo)} · Carga {moedaVT(soma.carga)}
        </span>
      </button>

      {aberta && (
        <div>
          {operadora === "CAJU" && (
            <p className="border-b border-brand-100 bg-blue-50/40 px-5 py-2 text-xs text-stone-600">
              Aqui entra só o transporte pago pelo cartão CAJU. Alimentação, prêmio e outros ficam no Controle de Benefícios.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="bg-brand-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Cartão</th>
                  <th className="px-3 py-2 text-right">Diária</th>
                  <th className="px-3 py-2 text-right">Valor unit.</th>
                  <th className="px-3 py-2 text-right">Valor diário</th>
                  <th className="px-3 py-2 text-right">Dias úteis</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Saldo atual</th>
                  <th className="px-3 py-2 text-right">Carga</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-6 text-center text-sm text-stone-500">
                      Nenhum cartão {ROTULO_OPERADORA[operadora]} lançado em {grupo} neste mês.
                    </td>
                  </tr>
                )}
                {linhas.map((l) => (
                  <LinhaEditavel key={l.id} linha={l} />
                ))}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr className="bg-brand-50/60 font-semibold">
                    <td className="px-3 py-2.5" colSpan={6}>
                      TOTAL — {ROTULO_OPERADORA[operadora]} · {grupo}
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

          <div className="border-t border-brand-100 px-5 py-3">
            {adicionando ? (
              <FormNovoCartao
                operadora={operadora}
                competencia={competencia}
                colaboradores={colaboradores}
                diasPadrao={diasPadrao}
                fechar={() => setAdicionando(false)}
              />
            ) : (
              <button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setAdicionando(true)}>
                + Adicionar cartão {ROTULO_OPERADORA[operadora]}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LinhaEditavel({ linha }: { linha: LinhaTela }) {
  const [cartao, setCartao] = useState(linha.cartao ?? "");
  const [diaria, setDiaria] = useState(campoVT(linha.diaria));
  const [valor, setValor] = useState(campoVT(linha.valor_unit));
  const [dias, setDias] = useState(campoVT(linha.dias_uteis));
  const [saldo, setSaldo] = useState(campoVT(linha.saldo));
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  const nDiaria = lerNumeroVT(diaria);
  const nValor = lerNumeroVT(valor);
  const nDias = lerNumeroVT(dias);
  const nSaldo = lerNumeroVT(saldo);
  const ok = nDiaria !== null && nValor !== null && nDias !== null && nSaldo !== null;

  const vivo = {
    diaria: nDiaria ?? 0,
    valor_unit: nValor ?? 0,
    dias_uteis: nDias ?? 0,
    saldo: nSaldo ?? 0,
  };

  function guardar(campos: CamposLinhaVT) {
    setEstado("salvando");
    setErro("");
    iniciar(async () => {
      const r = await salvarLinhaVT(linha.id, campos);
      if (r.ok) setEstado("salvo");
      else {
        setEstado("erro");
        setErro(r.erro);
      }
    });
  }

  function aoSair(nome: keyof CamposLinhaVT, texto: string, original: number | string | null) {
    if (nome === "cartao") {
      if (texto.trim() !== (original ?? "")) guardar({ cartao: texto });
      return;
    }
    const n = lerNumeroVT(texto);
    if (n === null) {
      setEstado("erro");
      setErro("Número inválido.");
      return;
    }
    if (n !== original) guardar({ [nome]: n } as CamposLinhaVT);
  }

  function excluir() {
    if (!window.confirm(`Excluir o cartão de ${linha.nome} (${linha.cartao ?? "sem número"})?`)) return;
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
      <td className="whitespace-nowrap px-3 py-1.5 font-semibold uppercase">{linha.nome}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <input
            aria-label={`Cartão de ${linha.nome}`}
            className="w-44 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            onBlur={() => aoSair("cartao", cartao, linha.cartao)}
          />
          {linha.repetido && (
            <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" title="Este número de cartão aparece em mais de um colaborador">
              repetido
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <input aria-label="Diária" className={campo} inputMode="decimal" value={diaria} onChange={(e) => setDiaria(e.target.value)} onBlur={() => aoSair("diaria", diaria, linha.diaria)} />
      </td>
      <td className="px-3 py-1.5">
        <input aria-label="Valor unitário" className={campo} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => aoSair("valor_unit", valor, linha.valor_unit)} />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{numeroVT(valorDiarioVT(vivo))}</td>
      <td className="px-3 py-1.5">
        <input
          aria-label="Dias úteis"
          className={`${campo} ${semDias ? "border-red-300 bg-red-50" : ""}`}
          inputMode="numeric"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          onBlur={() => aoSair("dias_uteis", dias, linha.dias_uteis)}
        />
      </td>
      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{numeroVT(ok ? totalVT(vivo) : 0)}</td>
      <td className="px-3 py-1.5">
        <input aria-label="Saldo atual" className={campo} inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} onBlur={() => aoSair("saldo", saldo, linha.saldo)} />
      </td>
      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-red-700">{numeroVT(ok ? cargaVT(vivo) : 0)}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs">
        {estado === "salvando" && <span className="text-stone-500">salvando…</span>}
        {estado === "salvo" && !pendente && <span className="text-emerald-700">salvo ✓</span>}
        {estado === "erro" && <span className="text-red-700">{erro}</span>}
        <button type="button" onClick={excluir} disabled={pendente} className="ml-2 text-stone-400 hover:text-red-700" aria-label={`Excluir cartão de ${linha.nome}`}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function FormNovoCartao({
  operadora,
  competencia,
  colaboradores,
  diasPadrao,
  fechar,
}: {
  operadora: OperadoraVT;
  competencia: string;
  colaboradores: OpcaoColaborador[];
  diasPadrao: string;
  fechar: () => void;
}) {
  const [colab, setColab] = useState("");
  const [cartao, setCartao] = useState("");
  const [diaria, setDiaria] = useState("2");
  const [valor, setValor] = useState("");
  const [dias, setDias] = useState(diasPadrao);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function adicionar() {
    const nDiaria = lerNumeroVT(diaria);
    const nValor = lerNumeroVT(valor);
    const nDias = lerNumeroVT(dias);
    if (!colab) return setErro("Escolha o colaborador.");
    if (nDiaria === null || nValor === null || nDias === null) return setErro("Confira os números.");
    setErro("");
    iniciar(async () => {
      const r = await criarLinhaVT({
        competencia,
        colaboradorId: colab,
        operadora,
        cartao,
        diaria: nDiaria,
        valorUnit: nValor,
        diasUteis: nDias,
      });
      if (r.ok) fechar();
      else setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px] flex-1">
        <label className="label" htmlFor={`nc-colab-${operadora}`}>
          Colaborador
        </label>
        <select id={`nc-colab-${operadora}`} className="input" value={colab} onChange={(e) => setColab(e.target.value)}>
          <option value="">Escolha…</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[170px]">
        <label className="label" htmlFor={`nc-cartao-${operadora}`}>
          Nº do cartão
        </label>
        <input id={`nc-cartao-${operadora}`} className="input" value={cartao} onChange={(e) => setCartao(e.target.value)} />
      </div>
      <div className="w-20">
        <label className="label" htmlFor={`nc-diaria-${operadora}`}>
          Diária
        </label>
        <input id={`nc-diaria-${operadora}`} className="input text-right" inputMode="decimal" value={diaria} onChange={(e) => setDiaria(e.target.value)} />
      </div>
      <div className="w-24">
        <label className="label" htmlFor={`nc-valor-${operadora}`}>
          Valor unit.
        </label>
        <input id={`nc-valor-${operadora}`} className="input text-right" inputMode="decimal" placeholder="6,25" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div className="w-20">
        <label className="label" htmlFor={`nc-dias-${operadora}`}>
          Dias úteis
        </label>
        <input id={`nc-dias-${operadora}`} className="input text-right" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
      </div>
      <button type="button" className="btn-primary" disabled={pendente} onClick={adicionar}>
        {pendente ? "Salvando…" : "Adicionar"}
      </button>
      <button type="button" className="btn-secondary" onClick={fechar}>
        Cancelar
      </button>
      {erro && <p className="basis-full text-sm font-medium text-red-700">{erro}</p>}
    </div>
  );
}
