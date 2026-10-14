"use client";

import { useEffect, useRef, useState } from "react";
import RoteiroEntrevista from "@/components/entrevistas/RoteiroEntrevista";
import { atualizarEstadoEntrevista, desativarLinkSupervisor, gerarLinkSupervisor } from "@/lib/actions-roteiro";
import { fmtCurta, rotuloEmpresa, type EntrevistaSel, type Vaga } from "@/lib/entrevistas";
import { acharCargo, normalizarCargo } from "@/lib/roteiro-dados";
import { montarRoteiro, normalizarResp, resumir, type RespRoteiro } from "@/lib/roteiro";
import type { CargoDesc } from "@/lib/cargos";

function dataHora(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function RoteiroFicha({
  e,
  candidatoNome,
  vaga,
  cargos,
  aoSalvar,
  aoLocal,
}: {
  e: EntrevistaSel;
  candidatoNome: string;
  vaga: Vaga | undefined;
  cargos: CargoDesc[];
  aoSalvar: (campos: Partial<EntrevistaSel>) => void;
  aoLocal: (campos: Partial<EntrevistaSel>) => void;
}) {
  const cargo = vaga ? acharCargo(cargos.map(normalizarCargo), vaga.cargo, vaga.empresa) : null;
  const roteiro = montarRoteiro(e.etapa, cargo);
  const tec = e.etapa === "Etapa técnica";
  const [resp, setResp] = useState<RespRoteiro>(() => normalizarResp(e.roteiro));
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const primeiro = useRef(true);
  const respondida = !!e.respondida_em;

  // Salva sozinho, um instante depois da última mudança.
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    const t = setTimeout(() => {
      const media = resumir(roteiro, resp).geral;
      aoSalvar({ roteiro: resp, nota_media: media });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resp]);

  const link = e.token && typeof window !== "undefined" ? `${window.location.origin}/entrevista-supervisor/${e.token}` : null;
  const expirado = !!e.token_expira && new Date(e.token_expira).getTime() < Date.now();
  const mensagem = link
    ? `Olá! Segue o link para a entrevista técnica de ${candidatoNome}${vaga ? ` (${vaga.cargo}, ${rotuloEmpresa(vaga)})` : ""}, dia ${fmtCurta(e.data)} às ${e.hora.slice(0, 5)}. Não precisa de senha. O link vale por 7 dias: ${link}`
    : "";

  async function copiar(txt: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiado(rotulo);
    } catch {
      setCopiado("Selecione o texto e copie.");
    }
  }
  async function gerar() {
    setOcupado(true);
    setMsg(null);
    const r = await gerarLinkSupervisor(e.id);
    setOcupado(false);
    if (!r.ok) return setMsg(r.mensagem);
    aoLocal({ token: r.token, token_expira: r.expira, respondida_em: null, respondida_por: null });
    setAberto(true);
  }
  async function desativar() {
    setOcupado(true);
    const r = await desativarLinkSupervisor(e.id);
    setOcupado(false);
    if (!r.ok) return setMsg(r.mensagem);
    aoLocal({ token: null, token_expira: null });
    setAberto(false);
  }
  async function verificar() {
    setOcupado(true);
    setMsg(null);
    const r = await atualizarEstadoEntrevista(e.id);
    setOcupado(false);
    if (!r.ok || !r.dados) return setMsg(r.mensagem || "Não consegui atualizar.");
    aoLocal({ ...r.dados, nota_media: r.dados.nota_media === null ? null : Number(r.dados.nota_media) } as Partial<EntrevistaSel>);
    if (r.dados.respondida_em) setResp(normalizarResp(r.dados.roteiro));
    else setMsg("O supervisor ainda não enviou.");
  }

  return (
    <details className="rounded-xl border border-brand-300 bg-brand-50/50 p-3" open>
      <summary className="cursor-pointer font-display uppercase tracking-wide">Roteiro da entrevista · {tec ? "2ª etapa · Técnica" : "1ª etapa · RH"}</summary>
      <div className="mt-3 space-y-3">
        {tec && (
          <div className="rounded-xl border border-teal-700/40 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded-md px-2.5 py-1 text-sm font-semibold ${respondida ? "bg-green-100 text-green-800" : e.token && !expirado ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-ink-600"}`}
              >
                {respondida
                  ? `Respondida por ${e.respondida_por ?? "supervisor"} em ${dataHora(e.respondida_em)}`
                  : e.token && !expirado
                    ? `Link enviado, aguardando o supervisor (vale até ${dataHora(e.token_expira)})`
                    : e.token && expirado
                      ? "Link expirado"
                      : "Link ainda não enviado"}
              </span>
              <div className="flex flex-wrap gap-2">
                {e.token && !respondida && (
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" disabled={ocupado} onClick={verificar}>
                    Ver se o supervisor respondeu
                  </button>
                )}
                {!respondida && (
                  <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" disabled={ocupado} onClick={e.token && !expirado ? () => setAberto((v) => !v) : gerar}>
                    {e.token && !expirado ? "Ver link" : "Enviar link ao supervisor"}
                  </button>
                )}
              </div>
            </div>
            {aberto && link && !respondida && (
              <div className="space-y-2">
                <p className="break-all rounded-md border border-brand-200 bg-brand-50 p-2 font-mono text-xs">{link}</p>
                <p className="text-sm text-ink-500">O supervisor abre pelo celular ou computador, sem senha, e vê só esta entrevista. O link vale por 7 dias e deixa de funcionar depois que ele enviar.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => copiar(link, "Link copiado")}>
                    Copiar link
                  </button>
                  <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => copiar(mensagem, "Mensagem copiada")}>
                    Copiar mensagem pronta
                  </button>
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" disabled={ocupado} onClick={gerar}>
                    Gerar link novo
                  </button>
                  <button type="button" className="text-sm text-red-700 hover:underline" disabled={ocupado} onClick={desativar}>
                    Desativar link
                  </button>
                </div>
                {copiado && <span className="text-sm text-green-700">{copiado}</span>}
              </div>
            )}
            {msg && <p className="text-sm text-red-700">{msg}</p>}
            <p className="text-xs text-ink-500">Você também pode preencher este roteiro aqui mesmo, no app.</p>
          </div>
        )}
        <RoteiroEntrevista roteiro={roteiro} resp={resp} aoMudar={setResp} desligado={false} />
      </div>
    </details>
  );
}
