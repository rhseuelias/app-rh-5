"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { salvarEventoFolha } from "@/lib/actions-folha";
import { calcularQuebraCaixa } from "@/lib/folha-calculos";
import CelulaLancamento from "./CelulaLancamento";
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
  onVoltar,
}: {
  competencia: string;
  mesFechado: boolean;
  grupo: GrupoFolha;
  tipos: FolhaTipo[];
  valores: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  concluidosDoGrupo: string[];
  onConcluir: (grupo: string, tipoId: string, lancamentos: Record<string, ValorCelula>) => void;
  onVoltar: () => void;
}) {
  const primeiroNaoFeito = tipos.findIndex((t) => !concluidosDoGrupo.includes(t.id));
  const indiceDesbloqueado = primeiroNaoFeito === -1 ? tipos.length - 1 : primeiroNaoFeito;
  const [indice, setIndice] = useState(indiceDesbloqueado);

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
          key={tipo.id}
          competencia={competencia}
          mesFechado={mesFechado}
          grupo={grupo}
          tipo={tipo}
          valores={valores}
          valoresBase={valoresBase}
          jaConcluido={concluidosDoGrupo.includes(tipo.id)}
          onConcluido={(lancamentos) => {
            onConcluir(grupo.rotulo, tipo.id, lancamentos);
            if (indice === indiceDesbloqueado && indice < tipos.length - 1) {
              setIndice(indice + 1);
            }
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
}: {
  competencia: string;
  mesFechado: boolean;
  grupo: GrupoFolha;
  tipo: FolhaTipo;
  valores: Record<string, Record<string, ValorCelula>>;
  valoresBase: Record<string, Record<string, ValorCelula>>;
  jaConcluido: boolean;
  onConcluido: (lancamentos: Record<string, ValorCelula>) => void;
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
                onChange={(payload) => draft.set(c.id, payload)}
              />
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
        {erro && <span className="text-sm text-red-500">{erro}</span>}
        {mesFechado ? (
          <span className="text-sm text-slate-400">🔒 mês fechado</span>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={concluir}
            className="btn-secondary !bg-ink-900 !text-white !border-ink-900 disabled:opacity-50"
          >
            {isPending ? "Salvando..." : jaConcluido ? "✓ Concluído — salvar de novo" : "Concluir e avançar"}
          </button>
        )}
      </div>
    </div>
  );
}
