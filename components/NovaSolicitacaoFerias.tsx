"use client";

import { useState, useTransition } from "react";
import type { Colaborador, PeriodoAquisitivo } from "@/types/db";
import { solicitarFerias } from "@/lib/actions";
import { differenceInCalendarDays } from "date-fns";

export default function NovaSolicitacaoFerias({
  colaboradores,
  periodosAquisitivos,
}: {
  colaboradores: Colaborador[];
  periodosAquisitivos: PeriodoAquisitivo[];
}) {
  const [isPending, startTransition] = useTransition();
  const [colaboradorId, setColaboradorId] = useState("");
  const [periodoAquisitivoId, setPeriodoAquisitivoId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [vendeuAbono, setVendeuAbono] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const periodosDoColaborador = periodosAquisitivos.filter(
    (p) => p.colaborador_id === colaboradorId
  );

  const dias =
    inicio && fim ? differenceInCalendarDays(new Date(fim), new Date(inicio)) + 1 : 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!colaboradorId) {
      setErro("Selecione o colaborador.");
      return;
    }
    if (!periodoAquisitivoId) {
      setErro("Selecione o período aquisitivo ao qual essas férias pertencem.");
      return;
    }
    if (dias <= 0) {
      setErro("Informe um intervalo de datas válido.");
      return;
    }

    const formData = new FormData();
    formData.set("colaborador_id", colaboradorId);
    formData.set("periodo_aquisitivo_id", periodoAquisitivoId);
    formData.set("data_inicio", inicio);
    formData.set("data_fim", fim);
    formData.set("dias", String(dias));
    if (vendeuAbono) formData.set("vendeu_abono", "on");

    startTransition(async () => {
      const r = await solicitarFerias(formData);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setColaboradorId("");
      setPeriodoAquisitivoId("");
      setInicio("");
      setFim("");
      setVendeuAbono(false);
    });
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
      <div className="md:col-span-2">
        <label className="label">Colaborador</label>
        <select
          required
          className="input"
          value={colaboradorId}
          onChange={(e) => {
            setColaboradorId(e.target.value);
            setPeriodoAquisitivoId("");
          }}
        >
          <option value="">Selecione</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Período aquisitivo</label>
        <select
          required
          className="input"
          value={periodoAquisitivoId}
          onChange={(e) => setPeriodoAquisitivoId(e.target.value)}
        >
          <option value="">Selecione</option>
          {periodosDoColaborador.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.inicio).toLocaleDateString("pt-BR")} –{" "}
              {new Date(p.fim).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Início</label>
        <input
          type="date"
          required
          className="input"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Fim</label>
        <input
          type="date"
          required
          className="input"
          value={fim}
          onChange={(e) => setFim(e.target.value)}
        />
      </div>

      <div className="md:col-span-5 flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={vendeuAbono}
            onChange={(e) => setVendeuAbono(e.target.checked)}
          />
          Vendeu 1/3 (abono pecuniário)
        </label>
        <div className="flex items-center gap-3">
          {dias > 0 && <span className="text-sm text-slate-500">{dias} dias</span>}
          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
            {isPending ? "Enviando…" : "Solicitar"}
          </button>
        </div>
      </div>

      {erro && <p className="md:col-span-5 text-xs text-red-600">{erro}</p>}
    </form>
  );
}
