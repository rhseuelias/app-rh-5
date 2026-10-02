"use client";

import { useRef, useState, useTransition } from "react";
import { importarPeriodosRelatorio, type ResultadoRelatorioFerias } from "@/lib/actions-ferias-relatorio";

const COR = { erro: "#b42318", atencao: "#93440c", ok: "#1f7a52" };
const FUNDO = { erro: "#fdecea", atencao: "#fff3e6", ok: "#e6f4ec" };
const ROTULO = { erro: "Não deu certo", atencao: "Atenção", ok: "Certo" };

export default function ImportarRelatorioFerias() {
  const [pendente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<ResultadoRelatorioFerias | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const form = useRef<HTMLFormElement>(null);

  function enviar(aplicar: boolean) {
    if (!form.current) return;
    const dados = new FormData(form.current);
    dados.set("aplicar", aplicar ? "1" : "0");
    if (!(dados.get("arquivo") as File | null)?.size) {
      setResultado({ ok: false, aplicado: false, erro: "Escolha o arquivo CSV primeiro.", linhas: [] });
      return;
    }
    startTransition(async () => {
      setResultado(await importarPeriodosRelatorio(dados));
    });
  }

  const podeAplicar = !!resultado && resultado.ok && !resultado.aplicado && resultado.linhas.some((l) => l.situacao !== "erro");

  return (
    <div className="space-y-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      <form
        ref={form}
        onSubmit={(e) => e.preventDefault()}
        className="bg-white border border-[#f1e4d6] rounded-[12px] px-6 py-5 space-y-4"
      >
        <div>
          <p className="text-[14px] font-semibold text-[#262626]">1. Escolha o arquivo CSV do relatório</p>
          <p className="text-[12px] text-[#737373] mt-1">
            É o relatório &quot;Previsão de Vencimento de Férias&quot; da contabilidade, já convertido em CSV.
          </p>
        </div>
        <input
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          onChange={(e) => {
            setNomeArquivo(e.target.files?.[0]?.name ?? "");
            setResultado(null);
          }}
          className="block text-[13px]"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pendente || !nomeArquivo}
            onClick={() => enviar(false)}
            className="text-[13px] font-semibold px-4 py-2.5 rounded-lg border border-[#e7ddd2] bg-white disabled:opacity-50"
          >
            {pendente ? "Lendo…" : "2. Conferir antes (não muda nada)"}
          </button>
          <button
            type="button"
            disabled={pendente || !podeAplicar}
            onClick={() => enviar(true)}
            className="text-[13px] font-semibold px-4 py-2.5 rounded-lg bg-[#262626] text-white disabled:opacity-40"
          >
            3. Atualizar de verdade
          </button>
        </div>
      </form>

      {resultado?.erro && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ background: FUNDO.erro, color: COR.erro }}>
          {resultado.erro}
        </div>
      )}

      {resultado && resultado.linhas.length > 0 && (
        <div className="bg-white border border-[#f1e4d6] rounded-[12px] px-6 py-5">
          <p className="text-[14px] font-semibold text-[#262626] mb-1">
            {resultado.aplicado ? "Pronto! Isto foi atualizado:" : "Veja o que vai mudar (ainda nada foi alterado):"}
          </p>
          <p className="text-[12px] text-[#737373] mb-3">
            {resultado.linhas.filter((l) => l.situacao === "ok").length} certo(s) ·{" "}
            {resultado.linhas.filter((l) => l.situacao === "atencao").length} com atenção ·{" "}
            {resultado.linhas.filter((l) => l.situacao === "erro").length} com problema
          </p>
          <ul className="divide-y divide-[#f4ebe1]">
            {resultado.linhas.map((l, i) => (
              <li key={i} className="py-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-[10px]"
                    style={{ background: FUNDO[l.situacao], color: COR[l.situacao] }}
                  >
                    {ROTULO[l.situacao]}
                  </span>
                  <span className="text-[13px] font-semibold text-[#262626]">{l.nome}</span>
                </div>
                {l.acoes.map((a, k) => (
                  <p key={k} className="text-[13px] text-[#3d3d3d]">
                    {a}
                  </p>
                ))}
                {l.avisos.map((a, k) => (
                  <p key={k} className="text-[13px]" style={{ color: l.situacao === "erro" ? COR.erro : COR.atencao }}>
                    {a}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
