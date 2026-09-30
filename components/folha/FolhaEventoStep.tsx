"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { limparEventoFolha, salvarEventoFolha } from "@/lib/actions-folha";
import { calcularQuebraCaixa } from "@/lib/folha-calculos";
import type { ObservacaoUnidade } from "@/lib/actions-folha-observacoes";
import CelulaLancamento from "./CelulaLancamento";
import ObservacoesUnidade from "./ObservacoesUnidade";
import type { ColaboradorFolha, GrupoFolha, ValorCelula } from "./FolhaWizard";

const ROTULO_CATEGORIA: Record<string, string> = {
  provento: "PROVENTO",
  desconto: "DESCONTO",
};

export default function FolhaEventoStep({
  competencia,
  mesFechado,
  grupo,
  tipos,
  valores,
  valoresBase,
  concluidosDoGrupo,
  onConcluir,
  onLimpar,
  onVoltar,
  observacoes,
  onObservacoesChange,
  onFinalizar,
}: {
  competencia: string;
  mesFechado: boolean;
  grupo: GrupoFolha;
  tipos: FolhaTipo[];
  valores: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  concluidosDoGrupo: string[];
  onConcluir: (grupo: string, tipoId: string, lancamentos: Record<string, ValorCelula>) => void;
  onLimpar: (grupo: string, tipoId: string) => void;
  onVoltar: () => void;
  /** observações fixas da unidade (valem em todas as etapas e meses) */
  observacoes: ObservacaoUnidade[];
  onObservacoesChange: (lista: ObservacaoUnidade[]) => void;
  /** chamado quando o ÚLTIMO evento pendente é concluído: a unidade fica salva e volta pra lista */
  onFinalizar: (rotulo: string) => void;
}) {
  const primeiroNaoFeito = tipos.findIndex((t) => !concluidosDoGrupo.includes(t.id));
  const indiceDesbloqueado = primeiroNaoFeito === -1 ? tipos.length - 1 : primeiroNaoFeito;
  const [indice, setIndice] = useState(indiceDesbloqueado);
  // muda toda vez que um evento é limpo — força o formulário a recomeçar do
  // zero (os campos guardam o valor inicial só na hora que nascem)
  const [resetKey, setResetKey] = useState(0);

  const tipo = tipos[indice];
  const grupoCompleto = primeiroNaoFeito === -1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={onVoltar} className="text-sm text-slate-400 hover:text-slate-600">
          ← voltar pras unidades
        </button>
        <span className="text-sm font-bold text-slate-900">{grupo.rotulo}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tipos.map((t, i) => {
          const feito = concluidosDoGrupo.includes(t.id);
          const desbloqueado = i <= indiceDesbloqueado;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!desbloqueado}
              onClick={() => setIndice(i)}
              title={t.nome}
              className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center border transition-colors ${
                i === indice
                  ? "bg-ink-900 text-white border-ink-900"
                  : feito
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : desbloqueado
                  ? "bg-white text-slate-400 border-slate-200 hover:border-brand-300"
                  : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
              }`}
            >
              {feito ? "✓" : i + 1}
            </button>
          );
        })}
      </div>

      <ObservacoesUnidade grupo={grupo.rotulo} observacoes={observacoes} onChange={onObservacoesChange} />

      {grupoCompleto ? (
        <div className="card !bg-emerald-50 !border-emerald-200">
          <p className="text-sm text-emerald-700 font-medium">
            ✓ {grupo.rotulo} concluída — todos os {tipos.length} eventos lançados. Você pode revisar qualquer evento
            acima, ou voltar pras unidades.
          </p>
        </div>
      ) : null}

      {tipo && (
        <EventoForm
          key={`${tipo.id}-${resetKey}`}
          competencia={competencia}
          mesFechado={mesFechado}
          grupo={grupo}
          tipo={tipo}
          valores={valores}
          valoresBase={valoresBase}
          jaConcluido={concluidosDoGrupo.includes(tipo.id)}
          onConcluido={(lancamentos) => {
            // era o último evento que faltava? então a unidade fecha e volta pra lista
            const eraUltimoPendente =
              !concluidosDoGrupo.includes(tipo.id) &&
              tipos.every((t) => t.id === tipo.id || concluidosDoGrupo.includes(t.id));
            onConcluir(grupo.rotulo, tipo.id, lancamentos);
            if (eraUltimoPendente) {
              onFinalizar(grupo.rotulo);
              return;
            }
            if (indice === indiceDesbloqueado && indice < tipos.length - 1) {
              setIndice(indice + 1);
            }
          }}
          onLimpar={() => {
            onLimpar(grupo.rotulo, tipo.id);
            setIndice((i) => (i > 0 ? i - 1 : i));
            setResetKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function EventoForm({
  competencia,
  mesFechado,
  grupo,
  tipo,
  valores,
  valoresBase,
  jaConcluido,
  onConcluido,
  onLimpar,
}: {
  competencia: string;
  mesFechado: boolean;
  grupo: GrupoFolha;
  tipo: FolhaTipo;
  valores: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  jaConcluido: boolean;
  onConcluido: (lancamentos: Record<string, ValorCelula>) => void;
  onLimpar: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const draft = useRef(new Map<string, ValorCelula>()).current;

  const valorInicialDe = (colaborador: ColaboradorFolha): ValorCelula => {
    if (tipo.calculo_automatico) return { valor: calcularQuebraCaixa(colaborador), valor_texto: null };
    const atual = valores[colaborador.id]?.[tipo.id];
    if (atual) return atual;
    const base = valoresBase[colaborador.id]?.[tipo.id];
    if (base) return base;
    return { valor: 0, valor_texto: null };
  };

  const iniciais = useMemo(() => {
    const mapa = new Map<string, ValorCelula>();
    for (const c of grupo.colaboradores) mapa.set(c.id, valorInicialDe(c));
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo.rotulo, tipo.id]);

  // Total da coluna: soma o que está digitado agora (ou o valor inicial, se
  // a pessoa ainda não mexeu) e recalcula a cada valor digitado.
  function calcularResumo() {
    let soma = 0;
    let preenchidos = 0;
    for (const c of grupo.colaboradores) {
      const v = draft.get(c.id) ?? iniciais.get(c.id);
      const n = v?.valor ?? 0;
      soma += n;
      if (n !== 0) preenchidos += 1;
    }
    return { soma: Math.round(soma * 100) / 100, preenchidos };
  }
  const [resumo, setResumo] = useState(calcularResumo);
  const mostrarTotal = tipo.formato === "moeda";
  const ehReferencia = /refer[eê]ncia/i.test(tipo.nome); // coluna de horas, não de dinheiro
  const totalFormatado = ehReferencia
    ? resumo.soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : resumo.soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function concluir() {
    setErro(null);
    const lancamentos: Record<string, ValorCelula> = {};
    for (const c of grupo.colaboradores) {
      lancamentos[c.id] = draft.get(c.id) ?? iniciais.get(c.id) ?? { valor: 0, valor_texto: null };
    }
    startTransition(async () => {
      const payload = grupo.colaboradores.map((c) => ({
        colaborador_id: c.id,
        valor: lancamentos[c.id].valor,
        valor_texto: lancamentos[c.id].valor_texto,
      }));
      const resultado = await salvarEventoFolha(competencia, grupo.rotulo, tipo.id, payload);
      if (!resultado.ok) {
        setErro("Esse mês está fechado — reabra ali em cima pra poder editar.");
        return;
      }
      onConcluido(lancamentos);
    });
  }

  function limpar() {
    const ok = window.confirm(
      `Limpar "${tipo.nome}" de ${grupo.rotulo}? Isso apaga o que foi salvo nesse evento e volta pro evento anterior.`
    );
    if (!ok) return;
    setErro(null);
    startTransition(async () => {
      const ids = grupo.colaboradores.map((c) => c.id);
      const resultado = await limparEventoFolha(competencia, grupo.rotulo, tipo.id, ids);
      if (!resultado.ok) {
        setErro("Esse mês está fechado — reabra ali em cima pra poder editar.");
        return;
      }
      onLimpar();
    });
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {ROTULO_CATEGORIA[tipo.categoria] ?? tipo.categoria}
        </p>
        <h4 className="text-lg font-bold text-slate-900">
          {tipo.nome}
          {tipo.codigo && <span className="text-xs text-slate-300 font-normal ml-2">{tipo.codigo}</span>}
        </h4>
        {tipo.calculo_automatico && (
          <p className="text-xs text-brand-600 mt-1">
            🧮 Calculado sozinho: 10% do salário, só pra quem tem “caixa” no cargo. Não dá pra editar.
          </p>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {grupo.colaboradores.map((c) => {
          const inicial = iniciais.get(c.id) ?? { valor: 0, valor_texto: null };
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="text-sm font-medium text-slate-700">{c.nome}</span>
              <CelulaLancamento
                formato={tipo.formato}
                valorInicial={inicial.valor}
                valorTextoInicial={inicial.valor_texto}
                calculoAutomatico={tipo.calculo_automatico}
                disabled={mesFechado || isPending}
                onChange={(payload) => {
                  draft.set(c.id, payload);
                  setResumo(calcularResumo());
                }}
              />
            </div>
          );
        })}
      </div>

      {mostrarTotal && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-brand-50 border-t border-brand-200">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-slate-800">Total da coluna</p>
            <p className="text-xs text-slate-500">
              {resumo.preenchidos} de {grupo.colaboradores.length} colaborador
              {grupo.colaboradores.length === 1 ? "" : "es"} com valor
            </p>
          </div>
          <span className="text-xl font-bold text-slate-900" aria-live="polite" aria-label={`Total da coluna: ${totalFormatado}`}>
            {totalFormatado}
          </span>
        </div>
      )}

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
        {erro && <span className="text-sm text-red-500">{erro}</span>}
        {mesFechado ? (
          <span className="text-sm text-slate-400">🔒 mês fechado</span>
        ) : (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={limpar}
              title="Apaga os valores lançados nesse evento e volta pro evento anterior"
              className="btn-secondary !text-sm disabled:opacity-50"
            >
              🗑️ Limpar evento
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={concluir}
              className="btn-secondary !bg-ink-900 !text-white !border-ink-900 disabled:opacity-50"
            >
              {isPending ? "Salvando..." : jaConcluido ? "✓ Concluído — salvar de novo" : "Concluir e avançar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
