"use client";

import { salvarHistoricoColaboradores } from "@/lib/actions-historico";
import { P7, MANROPE, ROTULO_COLUNA } from "./tema7";

export interface AnoEditavel {
  ano: number;
  clt: number;
  pj: number;
  est: number;
  manual: boolean;
}

const COLUNAS = "70px 1fr 1fr 1fr 150px";

/** Formulário para corrigir os números dos anos anteriores do gráfico. */
export default function EditorAnosAnteriores({
  escopo,
  anos,
  tabelaPronta,
}: {
  escopo: string;
  anos: AnoEditavel[];
  tabelaPronta: boolean;
}) {
  const campo = "w-full rounded-[8px] border bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums";
  return (
    <details className="mt-3 border-t pt-3" style={{ borderColor: P7.grid }}>
      <summary className="cursor-pointer text-[11.5px] font-bold" style={{ color: P7.deep, fontFamily: MANROPE }}>
        Editar anos anteriores
      </summary>

      {!tabelaPronta && (
        <p className="mt-3 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "#fbe4e4", color: "#a52828" }}>
          Para salvar, rode primeiro o arquivo <b>migration_037_historico_colaboradores.sql</b> no SQL Editor do Supabase.
        </p>
      )}

      <form action={salvarHistoricoColaboradores} className="mt-3" style={{ fontFamily: MANROPE }}>
        <input type="hidden" name="escopo" value={escopo} />
        <p className="mb-2 text-[11.5px]" style={{ color: P7.sec }}>
          Digite quantos colaboradores havia no fim de cada ano, incluindo as franquias (some-as no CLT e no PJ). O número que você digitar vale no lugar do automático. O app só sabe as franquias de hoje, então nos anos anteriores elas entram só se você digitar.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={`mb-1 grid gap-x-3 ${ROTULO_COLUNA}`} style={{ gridTemplateColumns: COLUNAS, color: P7.lab }}>
              <div>Ano</div>
              <div>CLT</div>
              <div>PJ</div>
              <div>Estágio</div>
              <div />
            </div>
            {anos.map((a) => (
              <div
                key={a.ano}
                className="grid items-center gap-x-3 border-t py-1.5"
                style={{ gridTemplateColumns: COLUNAS, borderColor: P7.grid }}
              >
                <input type="hidden" name="anos" value={a.ano} />
                <input type="hidden" name={`manual_${a.ano}`} value={a.manual ? "1" : "0"} />
                <input type="hidden" name={`orig_clt_${a.ano}`} value={a.clt} />
                <input type="hidden" name={`orig_pj_${a.ano}`} value={a.pj} />
                <input type="hidden" name={`orig_est_${a.ano}`} value={a.est} />
                <div className="text-[12.5px] font-bold" style={{ color: P7.ink }}>
                  {a.ano}
                </div>
                <input type="number" min={0} name={`clt_${a.ano}`} defaultValue={a.clt} className={campo} style={{ borderColor: P7.bd }} aria-label={`CLT em ${a.ano}`} />
                <input type="number" min={0} name={`pj_${a.ano}`} defaultValue={a.pj} className={campo} style={{ borderColor: P7.bd }} aria-label={`PJ em ${a.ano}`} />
                <input type="number" min={0} name={`est_${a.ano}`} defaultValue={a.est} className={campo} style={{ borderColor: P7.bd }} aria-label={`Estágio em ${a.ano}`} />
                <label className="flex items-center gap-1.5 text-[11.5px]" style={{ color: a.manual ? P7.ink : P7.lab }}>
                  {a.manual ? (
                    <>
                      <input type="checkbox" name={`auto_${a.ano}`} />
                      Voltar ao automático
                    </>
                  ) : (
                    "automático"
                  )}
                </label>
              </div>
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="mt-3 rounded-full px-4 py-[7px] text-[12px] font-bold text-white"
          style={{ background: P7.deep }}
        >
          Salvar anos
        </button>
      </form>
    </details>
  );
}
