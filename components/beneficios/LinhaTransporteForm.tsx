"use client";

import { useState, useTransition } from "react";
import type { BeneficioTransporte } from "@/types/db";
import { salvarTransporte, removerTransporte } from "@/lib/actions-beneficios";
import { centavosParaReais, formatarReais, reaisParaDigitos } from "@/lib/formatadores";
import InputMoeda from "./InputMoeda";

/** Uma linha editável de lançamento de transporte de 1 colaborador — usada
 * tanto dentro do bloco do CAJU quanto nos blocos dos outros tipos
 * (SEMPARAR, BHBUS, OTIMO, ou qualquer tipo cadastrado). Sempre existe como
 * uma <tr>: quem chama já está dentro de uma <table><tbody>. */
export default function LinhaTransporteForm({
  competencia,
  colaboradorId,
  tipo,
  comCartao,
  mesFechado,
  lancamento,
  mostrarNome,
  nomeColaborador,
}: {
  competencia: string;
  colaboradorId: string;
  tipo: string;
  comCartao: boolean;
  mesFechado: boolean;
  lancamento: BeneficioTransporte;
  /** true nos blocos que não são o CAJU, onde cada linha já mostra o nome do colaborador */
  mostrarNome?: boolean;
  nomeColaborador?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [modo, setModo] = useState<"km" | "viagens">(lancamento.modo);
  const [km, setKm] = useState(lancamento.km ? String(lancamento.km) : "");
  const [valorKmDigitos, setValorKmDigitos] = useState(reaisParaDigitos(lancamento.valor_km));
  const [viagensDia, setViagensDia] = useState(lancamento.viagens_dia ? String(lancamento.viagens_dia) : "");
  const [valorViagemDigitos, setValorViagemDigitos] = useState(reaisParaDigitos(lancamento.valor_viagem));
  const [diasUteis, setDiasUteis] = useState(lancamento.dias_uteis ? String(lancamento.dias_uteis) : "");
  const [numeroCartao, setNumeroCartao] = useState(lancamento.numero_cartao ?? "");

  const total =
    modo === "km"
      ? Number(km || 0) * centavosParaReais(valorKmDigitos)
      : Number(viagensDia || 0) * centavosParaReais(valorViagemDigitos) * Number(diasUteis || 0);

  function salvar() {
    const formData = new FormData();
    formData.set("id", lancamento.id);
    formData.set("competencia", competencia);
    formData.set("colaborador_id", colaboradorId);
    formData.set("tipo", tipo);
    formData.set("modo", modo);
    formData.set("km", km || "0");
    formData.set("valor_km", String(centavosParaReais(valorKmDigitos)));
    formData.set("viagens_dia", viagensDia || "0");
    formData.set("valor_viagem", String(centavosParaReais(valorViagemDigitos)));
    formData.set("dias_uteis", diasUteis || "0");
    formData.set("numero_cartao", numeroCartao);
    startTransition(async () => {
      await salvarTransporte(formData);
    });
  }

  function remover() {
    startTransition(() => {
      removerTransporte(lancamento.id, competencia);
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 align-top">
      {mostrarNome && <td className="py-2 pr-3 font-medium text-slate-800 whitespace-nowrap">{nomeColaborador}</td>}
      <td className="py-2 pr-3">
        <select
          value={modo}
          disabled={mesFechado}
          onChange={(e) => setModo(e.target.value === "viagens" ? "viagens" : "km")}
          className="input !w-auto !py-1.5 !px-2 !text-sm"
        >
          <option value="km">Km rodado</option>
          <option value="viagens">Viagens/dia</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        {modo === "km" ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">Km</span>
            <input
              type="number"
              min={0}
              step={1}
              disabled={mesFechado}
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="input !w-16 !py-1.5 !px-2 !text-sm text-right"
            />
            <span className="text-[11px] text-slate-400">×</span>
            <InputMoeda digitos={valorKmDigitos} onChange={setValorKmDigitos} disabled={mesFechado} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">Viag/dia</span>
            <input
              type="number"
              min={0}
              step={1}
              disabled={mesFechado}
              value={viagensDia}
              onChange={(e) => setViagensDia(e.target.value)}
              className="input !w-14 !py-1.5 !px-2 !text-sm text-right"
            />
            <span className="text-[11px] text-slate-400">×</span>
            <InputMoeda digitos={valorViagemDigitos} onChange={setValorViagemDigitos} disabled={mesFechado} />
            <span className="text-[11px] text-slate-400">×dias</span>
            <input
              type="number"
              min={0}
              step={1}
              disabled={mesFechado}
              value={diasUteis}
              onChange={(e) => setDiasUteis(e.target.value)}
              className="input !w-14 !py-1.5 !px-2 !text-sm text-right"
            />
          </div>
        )}
      </td>
      {comCartao && (
        <td className="py-2 pr-3">
          <input
            type="text"
            disabled={mesFechado}
            value={numeroCartao}
            onChange={(e) => setNumeroCartao(e.target.value)}
            placeholder="N° do cartão"
            className="input !w-32 !py-1.5 !px-2 !text-sm"
          />
        </td>
      )}
      <td className="py-2 pr-3 font-semibold text-slate-800 whitespace-nowrap">{formatarReais(total)}</td>
      <td className="py-2 pr-1 whitespace-nowrap">
        {!mesFechado && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={salvar}
              className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full px-2.5 py-1 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={remover}
              className="text-slate-400 hover:text-red-500 text-sm disabled:opacity-50"
              title="Remover"
            >
              🗑️
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
