"use client";

import { useState, useTransition } from "react";
import { gerarAutomaticoParaRestantes, regenerarAutomaticos } from "@/lib/actions";

interface Resumo {
  criados: number;
  semPeriodoAquisitivo: string[];
  saldoInsuficiente: string[];
  incompletos: string[];
}

export default function GerarAutomaticoBotao({ cenarioId, modo }: { cenarioId: string; modo: "gerar" | "regenerar" }) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<Resumo | null>(null);

  function executar() {
    setResultado(null);
    startTransition(async () => {
      const r = modo === "gerar" ? await gerarAutomaticoParaRestantes(cenarioId) : await regenerarAutomaticos(cenarioId);
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button onClick={executar} disabled={isPending} className={modo === "gerar" ? "btn-primary !text-xs" : "btn-secondary !text-xs"}>
        {isPending
          ? "Gerando…"
          : modo === "gerar"
          ? "🎲 Gerar automaticamente (quem falta)"
          : "🎲 Nova simulação (regerar automáticos)"}
      </button>
      {resultado && (
        <div className="text-[11px] max-w-md space-y-0.5">
          {resultado.criados > 0 && <p className="text-emerald-600">{resultado.criados} colaborador{resultado.criados !== 1 ? "es" : ""} programado{resultado.criados !== 1 ? "s" : ""} ✓</p>}
          {resultado.semPeriodoAquisitivo.length > 0 && (
            <p className="text-slate-400">Sem período aquisitivo aberto: {resultado.semPeriodoAquisitivo.join(", ")}</p>
          )}
          {resultado.saldoInsuficiente.length > 0 && (
            <p className="text-amber-600">Saldo insuficiente pro modelo escolhido: {resultado.saldoInsuficiente.join(", ")}</p>
          )}
          {resultado.incompletos.length > 0 && (
            <p className="text-amber-600">Não achei data válida pra todos os períodos de: {resultado.incompletos.join(", ")} — ajuste manualmente.</p>
          )}
          {resultado.criados === 0 &&
            resultado.semPeriodoAquisitivo.length === 0 &&
            resultado.saldoInsuficiente.length === 0 &&
            resultado.incompletos.length === 0 && <p className="text-slate-400">Nada pra gerar — todo mundo já tem definição.</p>}
        </div>
      )}
    </div>
  );
}
