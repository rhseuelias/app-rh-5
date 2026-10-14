"use client";

import { useEffect, useRef, useState } from "react";
import RoteiroEntrevista from "@/components/entrevistas/RoteiroEntrevista";
import { enviarRoteiroSupervisor, salvarRascunhoSupervisor } from "@/lib/actions-roteiro";
import { RECOMENDACOES } from "@/lib/entrevistas";
import type { RespRoteiro, Roteiro } from "@/lib/roteiro";

export default function SupervisorTela({
  token,
  candidato,
  cargo,
  empresa,
  quando,
  roteiro,
  respInicial,
  recomendacaoInicial,
  rh,
}: {
  token: string;
  candidato: string;
  cargo: string;
  empresa: string;
  quando: string;
  roteiro: Roteiro;
  respInicial: RespRoteiro;
  recomendacaoInicial: string | null;
  rh: { resumo: string | null; aprofundar: string | null; recomendacao: string | null; nota: string | null } | null;
}) {
  const [resp, setResp] = useState(respInicial);
  const [rec, setRec] = useState<string | null>(recomendacaoInicial);
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [salvo, setSalvo] = useState<string | null>(null);
  const primeiro = useRef(true);

  // Guarda um rascunho de tempos em tempos, para não perder nada se a página fechar.
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    setSalvo(null);
    const t = setTimeout(async () => {
      const r = await salvarRascunhoSupervisor(token, resp);
      if (r.ok) setSalvo("Rascunho salvo");
    }, 1500);
    return () => clearTimeout(t);
  }, [resp, token]);

  async function enviar() {
    setMsg(null);
    if (!nome.trim()) return setMsg("Escreva o seu nome para enviar.");
    setEnviando(true);
    const r = await enviarRoteiroSupervisor(token, nome, resp, rec);
    setEnviando(false);
    if (!r.ok) return setMsg(r.mensagem);
    setEnviado(true);
    window.scrollTo(0, 0);
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-[#faf7f3] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-3xl uppercase">Entrevista enviada</h1>
          <p className="text-ink-600">Obrigado, {nome.split(" ")[0]}! O RH já recebeu as notas e o parecer sobre {candidato}. Você pode fechar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f3]">
      <main className="p-4 md:p-8 max-w-3xl mx-auto w-full space-y-4">
        <header>
          <p className="text-sm uppercase tracking-widest text-ink-500">Grupo Seu Elias · Entrevista técnica</p>
          <h1 className="text-4xl uppercase leading-tight">{candidato}</h1>
          <p className="text-ink-600">
            {cargo} · {empresa} · {quando}
          </p>
        </header>

        <section className="card space-y-2">
          <h2 className="text-xl uppercase">Passagem do RH</h2>
          {rh ? (
            <>
              <p className="text-sm text-ink-500">
                {rh.nota && <>Média da 1ª etapa: <b className="text-ink-900">{rh.nota}</b> · </>}
                {rh.recomendacao && <>Parecer do RH: <b className="text-ink-900">{rh.recomendacao}</b></>}
              </p>
              {rh.resumo && (
                <p className="text-sm">
                  <b>Resumo da conversa:</b> {rh.resumo}
                </p>
              )}
              {rh.aprofundar && (
                <p className="text-sm rounded-lg bg-brand-50 px-3 py-2">
                  <b>Pontos para você aprofundar:</b> {rh.aprofundar}
                </p>
              )}
              {!rh.resumo && !rh.aprofundar && <p className="text-sm text-ink-500">O RH ainda não registrou observações da 1ª etapa.</p>}
            </>
          ) : (
            <p className="text-sm text-ink-500">Não há registro da 1ª etapa.</p>
          )}
        </section>

        <RoteiroEntrevista
          roteiro={roteiro}
          resp={resp}
          aoMudar={setResp}
          supervisor
          rodape={
            <div className="card space-y-3">
              <h2 className="text-xl uppercase">Enviar ao RH</h2>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">Sua recomendação</span>
                <div className="flex flex-wrap gap-2">
                  {RECOMENDACOES.map((r) => {
                    const sel = rec === r;
                    const cor = r === "Avançar" ? "bg-green-700 border-green-700" : r === "Manter em avaliação" ? "bg-amber-600 border-amber-600" : "bg-red-700 border-red-700";
                    return (
                      <button key={r} type="button" aria-pressed={sel} onClick={() => setRec(sel ? null : r)} className={`flex-1 rounded-lg border px-3 py-2 font-semibold ${sel ? `${cor} text-white` : "bg-white border-brand-200"}`}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Seu nome</span>
                <input name="nome_supervisor" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
              {msg && <p className="text-sm text-red-700">{msg}</p>}
              <button type="button" className="btn-cta w-full" disabled={enviando} onClick={enviar}>
                {enviando ? "Enviando…" : "Salvar e enviar ao RH"}
              </button>
              <p className="text-xs text-ink-500">{salvo ? `${salvo}. ` : ""}Depois de enviar, este link deixa de funcionar.</p>
            </div>
          }
        />
      </main>
    </div>
  );
}
