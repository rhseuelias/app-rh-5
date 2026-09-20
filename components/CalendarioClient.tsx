"use client";

import { useMemo, useState, useTransition } from "react";
import type { CategoriaEvento, EventoCalendario } from "@/types/db";
import {
  CATEGORIA_EVENTO_COR,
  CATEGORIA_EVENTO_LABEL,
  PALETA_CORES_EVENTO,
  REPETICAO_EVENTO_LABEL,
} from "@/lib/calculos";
import { criarEventoCalendario, excluirEventoCalendario } from "@/lib/actions";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const TODAS_CATEGORIAS = Object.keys(CATEGORIA_EVENTO_LABEL) as CategoriaEvento[];
const CATEGORIAS_SELECIONAVEIS = TODAS_CATEGORIAS.filter((c) => c !== "feriado");
const REPETICOES = Object.keys(REPETICAO_EVENTO_LABEL) as (keyof typeof REPETICAO_EVENTO_LABEL)[];

function paraDataLocal(str: string): Date {
  return new Date(str + "T00:00:00");
}

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate()
  ).padStart(2, "0")}`;
}

// Um evento aparece em todo dia entre data_inicio e data_fim (inclusive) —
// não só no dia em que começou.
function estaNoIntervalo(dia: Date, evento: EventoCalendario): boolean {
  const inicio = paraDataLocal(evento.data_inicio);
  const fim = evento.data_fim ? paraDataLocal(evento.data_fim) : inicio;
  const diaSemHora = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  return diaSemHora >= inicio && diaSemHora <= fim;
}

export default function CalendarioClient({ eventos }: { eventos: EventoCalendario[] }) {
  const [mesAtual, setMesAtual] = useState(new Date());
  const [categoriasAtivas, setCategoriasAtivas] = useState<Set<CategoriaEvento>>(
    new Set(TODAS_CATEGORIAS)
  );
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);

  function toggleCategoria(cat: CategoriaEvento) {
    setCategoriasAtivas((prev) => {
      const novo = new Set(prev);
      if (novo.has(cat)) novo.delete(cat);
      else novo.add(cat);
      return novo;
    });
  }

  const eventosFiltrados = eventos.filter((e) => categoriasAtivas.has(e.categoria));

  const dias = useMemo(() => {
    const inicioMes = startOfMonth(mesAtual);
    const fimMes = endOfMonth(mesAtual);
    const inicioGrid = startOfWeek(inicioMes, { weekStartsOn: 0 });
    const fimGrid = endOfWeek(fimMes, { weekStartsOn: 0 });

    const arr: Date[] = [];
    let d = inicioGrid;
    while (d <= fimGrid) {
      arr.push(d);
      d = new Date(d.getTime() + 86400000);
    }
    return arr;
  }, [mesAtual]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TODAS_CATEGORIAS.map((cat) => (
          <button
            key={cat}
            onClick={() => toggleCategoria(cat)}
            className="badge border transition-opacity"
            style={{
              backgroundColor: categoriasAtivas.has(cat) ? CATEGORIA_EVENTO_COR[cat] + "20" : "transparent",
              color: categoriasAtivas.has(cat) ? CATEGORIA_EVENTO_COR[cat] : "#94a3b8",
              borderColor: CATEGORIA_EVENTO_COR[cat],
              opacity: categoriasAtivas.has(cat) ? 1 : 0.4,
            }}
          >
            {CATEGORIA_EVENTO_LABEL[cat]}
          </button>
        ))}
        <button onClick={() => setDiaSelecionado(new Date())} className="btn-secondary text-sm ml-auto">
          + Novo evento
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMesAtual((m) => subMonths(m, 1))} className="btn-secondary text-sm">
            ← Anterior
          </button>
          <h2 className="font-medium text-slate-900 capitalize">
            {format(mesAtual, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <button onClick={() => setMesAtual((m) => addMonths(m, 1))} className="btn-secondary text-sm">
            Próximo →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-xs text-slate-400 mb-1">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dias.map((dia) => {
            const eventosDoDia = eventosFiltrados.filter((e) => estaNoIntervalo(dia, e));
            return (
              <button
                key={dia.toISOString()}
                type="button"
                onClick={() => setDiaSelecionado(dia)}
                className={`min-h-[80px] rounded-lg p-1.5 border text-xs text-left transition-colors ${
                  isSameMonth(dia, mesAtual)
                    ? "bg-white border-slate-100 hover:border-brand-300 hover:bg-brand-50/30"
                    : "bg-slate-50 border-transparent text-slate-300 hover:bg-slate-100"
                }`}
              >
                <div className="text-right text-slate-400">{format(dia, "d")}</div>
                <div className="space-y-1 mt-1">
                  {eventosDoDia.slice(0, 3).map((e) => {
                    const cor = e.cor || CATEGORIA_EVENTO_COR[e.categoria];
                    return (
                      <div
                        key={e.id}
                        title={e.titulo}
                        className="truncate rounded px-1 py-0.5"
                        style={{ backgroundColor: cor + "20", color: cor }}
                      >
                        {e.titulo}
                      </div>
                    );
                  })}
                  {eventosDoDia.length > 3 && (
                    <div className="text-slate-400">+{eventosDoDia.length - 3} mais</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {diaSelecionado && (
        <ModalNovoEvento
          dia={diaSelecionado}
          eventosDoDia={eventosFiltrados.filter((e) => estaNoIntervalo(diaSelecionado, e) && !e.id.startsWith("feriado-"))}
          onFechar={() => setDiaSelecionado(null)}
        />
      )}
    </div>
  );
}

function ModalNovoEvento({
  dia,
  eventosDoDia,
  onFechar,
}: {
  dia: Date;
  eventosDoDia: EventoCalendario[];
  onFechar: () => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaEvento>(CATEGORIAS_SELECIONAVEIS[0]);
  const [cor, setCor] = useState<string>(CATEGORIA_EVENTO_COR[CATEGORIAS_SELECIONAVEIS[0]]);
  const [repete, setRepete] = useState<string>("nenhuma");
  const [isPending, startTransition] = useTransition();

  function excluir(id: string) {
    if (!window.confirm("Excluir este evento?")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => {
      excluirEventoCalendario(fd);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onFechar}
    >
      <div
        className="card w-full max-w-lg mt-10 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 capitalize">
            {format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600 text-sm">
            ✕
          </button>
        </div>

        {eventosDoDia.length > 0 && (
          <div className="space-y-1.5">
            {eventosDoDia.map((e) => {
              const corEvento = e.cor || CATEGORIA_EVENTO_COR[e.categoria];
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{ backgroundColor: corEvento + "15" }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: corEvento }} />
                    <span className="truncate" style={{ color: corEvento }}>{e.titulo}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => excluir(e.id)}
                    className="text-slate-400 hover:text-red-500 shrink-0 disabled:opacity-40"
                    title="Excluir evento"
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <form
          action={criarEventoCalendario}
          onSubmit={() => onFechar()}
          className="space-y-3 border-t border-slate-100 pt-3"
        >
          <div>
            <label className="label">Título</label>
            <input name="titulo" required className="input" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <select
                name="categoria"
                required
                className="input"
                value={categoria}
                onChange={(e) => {
                  const nova = e.target.value as CategoriaEvento;
                  setCategoria(nova);
                  setCor(CATEGORIA_EVENTO_COR[nova]);
                }}
              >
                {CATEGORIAS_SELECIONAVEIS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_EVENTO_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Repete</label>
              <select name="repete" className="input" value={repete} onChange={(e) => setRepete(e.target.value)}>
                {REPETICOES.map((r) => (
                  <option key={r} value={r}>
                    {REPETICAO_EVENTO_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Cor</label>
            <input type="hidden" name="cor" value={cor} />
            <div className="flex flex-wrap gap-1.5">
              {PALETA_CORES_EVENTO.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  title={c}
                  className="w-6 h-6 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: cor === c ? "#0f172a" : "transparent",
                    transform: cor === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">De</label>
              <input type="date" name="data_inicio" required defaultValue={paraISO(dia)} className="input" />
            </div>
            <div>
              <label className="label">Até (opcional)</label>
              <input type="date" name="data_fim" className="input" />
            </div>
          </div>

          {repete !== "nenhuma" && (
            <div>
              <label className="label">Repetir até (opcional)</label>
              <input type="date" name="repete_ate" className="input" />
              <p className="text-[11px] text-slate-400 mt-1">
                Se não preencher, repete por 1 ano a partir da data de início.
              </p>
            </div>
          )}

          <div>
            <label className="label">Alerta — e-mails para avisar (opcional, até 2)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="email" name="alerta_email_1" placeholder="email1@empresa.com" className="input" />
              <input type="email" name="alerta_email_2" placeholder="email2@empresa.com" className="input" />
            </div>
          </div>

          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea name="descricao" rows={2} className="input" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onFechar} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Adicionar evento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
