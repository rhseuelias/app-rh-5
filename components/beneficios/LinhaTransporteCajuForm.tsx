"use client";

import { useEffect, useState, useTransition } from "react";
import type { BeneficioTransporte } from "@/types/db";
import { removerTransporte } from "@/lib/actions-beneficios";
import { centavosParaReais, formatarReais, reaisParaDigitos } from "@/lib/formatadores";
import InputMoeda from "./InputMoeda";

/** Igual à LinhaTransporteForm, mas em formato de linha compacta (não uma
 * <tr>) — usada dentro da célula "Transporte (CAJU)" do bloco do CAJU, onde
 * cada colaborador já é 1 linha da tabela por fora, e pode ter várias
 * dessas linhas de transporte empilhadas dentro da mesma célula.
 * Não salva sozinha: a cada mudança avisa o painel (via onChange), que
 * salva tudo de uma vez quando o usuário clica no botão "Salvar" no final. */
export default function LinhaTransporteCajuForm({
  competencia,
  colaboradorId,
  tipo,
  mesFechado,
  lancamento,
  onChange,
}: {
  competencia: string;
  colaboradorId: string;
  tipo: string;
  mesFechado: boolean;
  lancamento: BeneficioTransporte;
  onChange: (id: string, campos: Record<string, string>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [modo, setModo] = useState<"km" | "viagens">(lancamento.modo);
  const [km, setKm] = useState(lancamento.km ? String(lancamento.km) : "");
  const [valorKmDigitos, setValorKmDigitos] = useState(reaisParaDigitos(lancamento.valor_km));
  const [viagensDia, setViagensDia] = useState(lancamento.viagens_dia ? String(lancamento.viagens_dia) : "");
  const [valorViagemDigitos, setValorViagemDigitos] = useState(reaisParaDigitos(lancamento.valor_viagem));
  const [diasUteis, setDiasUteis] = useState(lancamento.dias_uteis ? String(lancamento.dias_uteis) : "");

  const total =
    modo === "km"
      ? Number(km || 0) * centavosParaReais(valorKmDigitos)
      : Number(viagensDia || 0) * centavosParaReais(valorViagemDigitos) * Number(diasUteis || 0);

  useEffect(() => {
    onChange(lancamento.id, {
      id: lancamento.id,
      competencia,
      colaborador_id: colaboradorId,
      tipo,
      modo,
      km: km || "0",
      valor_km: String(centavosParaReais(valorKmDigitos)),
      viagens_dia: viagensDia || "0",
      valor_viagem: String(centavosParaReais(valorViagemDigitos)),
      dias_uteis: diasUteis || "0",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, km, valorKmDigitos, viagensDia, valorViagemDigitos, diasUteis]);

  function remover() {
    startTransition(() => {
      removerTransporte(lancamento.id, competencia);
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
      <select
        value={modo}
        disabled={mesFechado}
        onChange={(e) => setModo(e.target.value === "viagens" ? "viagens" : "km")}
        className="input !w-auto !py-1 !px-1.5 !text-xs"
      >
        <option value="km">Km rodado</option>
        <option value="viagens">Viagens/dia</option>
      </select>
      {modo === "km" ? (
        <>
          <span className="text-[11px] text-slate-400">Km</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={mesFechado}
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className="input !w-14 !py-1 !px-1.5 !text-xs text-right"
          />
          <span className="text-[11px] text-slate-400">×</span>
          <InputMoeda digitos={valorKmDigitos} onChange={setValorKmDigitos} disabled={mesFechado} className="!w-20 !py-1 !px-1.5 !text-xs" />
        </>
      ) : (
        <>
          <span className="text-[11px] text-slate-400">Viag/dia</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={mesFechado}
            value={viagensDia}
            onChange={(e) => setViagensDia(e.target.value)}
            className="input !w-12 !py-1 !px-1.5 !text-xs text-right"
          />
          <span className="text-[11px] text-slate-400">×</span>
          <InputMoeda digitos={valorViagemDigitos} onChange={setValorViagemDigitos} disabled={mesFechado} className="!w-20 !py-1 !px-1.5 !text-xs" />
          <span className="text-[11px] text-slate-400">×dias</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={mesFechado}
            value={diasUteis}
            onChange={(e) => setDiasUteis(e.target.value)}
            className="input !w-12 !py-1 !px-1.5 !text-xs text-right"
          />
        </>
      )}
      <span className="text-xs font-semibold text-slate-700">{formatarReais(total)}</span>
      {!mesFechado && (
        <button
          type="button"
          disabled={isPending}
          onClick={remover}
          className="text-slate-400 hover:text-red-500 text-xs disabled:opacity-50"
          title="Remover"
        >
          🗑️
        </button>
      )}
    </div>
  );
}
