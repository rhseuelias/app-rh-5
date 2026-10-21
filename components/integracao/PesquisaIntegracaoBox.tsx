"use client";

import { useEffect, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import {
  desativarLinkPesquisa,
  gerarLinkPesquisa,
  obterPesquisa,
  type EstadoPesquisa,
  type RespostaPesquisaRH,
} from "@/lib/actions-pesquisa-integracao";
import { PERGUNTAS_PESQUISA, TOTAL_PERGUNTAS, resumirPesquisa, tipoResposta } from "@/lib/pesquisa-integracao";

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";

const botao: CSSProperties = {
  fontFamily: INTER,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #e7ddd2",
  background: "#fff",
  color: "#262626",
  cursor: "pointer",
};
const botaoEscuro: CSSProperties = { ...botao, background: "#262626", borderColor: "#262626", color: "#fff" };
const botaoPessego: CSSProperties = { ...botao, background: "#f0913f", borderColor: "#f0913f", color: "#2b1704" };

const PILULA = {
  ok: { fundo: "#e6f4ec", texto: "#1f7a52" },
  espera: { fundo: "#fff3e6", texto: "#93440c" },
  ruim: { fundo: "#fdecea", texto: "#b42318" },
} as const;

function dataBR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dataHoraBR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Quadro "Pesquisa de integração" dentro da área aberta do colaborador no Painel de Integração. */
export default function PesquisaIntegracaoBox({ colaboradorId, nome }: { colaboradorId: string; nome: string }) {
  const [estado, setEstado] = useState<EstadoPesquisa | null>(null);
  const [msg, setMsg] = useState("");
  const [resumo, setResumo] = useState(false);
  const [confirmarRefazer, setConfirmarRefazer] = useState(false);
  const [pendente, iniciar] = useTransition();

  function aplicar(r: RespostaPesquisaRH) {
    if (r.estado) setEstado(r.estado);
    setMsg(r.mensagem);
  }

  useEffect(() => {
    iniciar(async () => {
      aplicar(await obterPesquisa(colaboradorId));
    });
  }, [colaboradorId]);

  const token = estado?.token ?? null;
  const ativo = estado?.status === "aguardando";
  const endereco = token && typeof window !== "undefined" ? `${window.location.host}/p/${token}` : "";
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/p/${token}` : "";
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  const primeiroBonito = primeiro ? primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR") : "";

  async function copiar(texto: string, ok: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setMsg(ok);
    } catch {
      setMsg("Não deu para copiar sozinho. Selecione o endereço e copie.");
    }
  }

  const r = estado && estado.status === "respondida" ? resumirPesquisa(estado.respostas) : null;
  const pill =
    estado?.status === "respondida"
      ? estado.nao_participou
        ? { t: "Respondida · não participou do onboarding", c: PILULA.ruim }
        : r && r.conversar.length > 0
        ? { t: `Respondida · ${r.conversar.length} ponto${r.conversar.length > 1 ? "s" : ""} para conferir`, c: PILULA.ruim }
        : { t: "Respondida · tudo ciente", c: PILULA.ok }
      : estado?.status === "aguardando"
      ? { t: "Aguardando resposta", c: PILULA.espera }
      : estado?.status === "expirada"
      ? { t: "Link expirado", c: PILULA.ruim }
      : null;

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        border: "2px solid #f0913f",
        borderRadius: 12,
        background: "#fff",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
      className="lg:col-span-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#737373" }}>Pesquisa de integração</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Confirma se o colaborador entendeu as normas e recebeu o kit</div>
        </div>
        {pill && (
          <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 12, background: pill.c.fundo, color: pill.c.texto, whiteSpace: "nowrap" }}>{pill.t}</span>
        )}
      </div>

      {!estado && <p style={{ fontSize: 12, color: "#737373" }}>{pendente ? "Carregando..." : msg}</p>}

      {estado && estado.status === "sem_link" && (
        <div>
          <button type="button" style={botaoEscuro} disabled={pendente} onClick={() => iniciar(async () => aplicar(await gerarLinkPesquisa(colaboradorId)))}>
            {pendente ? "Aguarde..." : "Criar link da pesquisa"}
          </button>
        </div>
      )}

      {estado && token && estado.status !== "respondida" && (
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{ border: "1px solid #e7ddd2", borderRadius: 10, background: "#faf7f3", padding: "10px 14px", opacity: ativo ? 1 : 0.6 }}
        >
          <div style={{ minWidth: 0 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontSize: 16, color: "#93440c", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Pesquisa de satisfação
            </a>
            <div style={{ fontSize: 12, color: "#737373", overflowWrap: "anywhere" }}>{endereco}</div>
            <div style={{ fontSize: 12, color: "#737373" }}>
              {ativo ? `Vale por 24 horas (até ${dataHoraBR(estado.expira_em)}) · serve para uma resposta só` : "Este link não funciona mais. Gere um novo."}
            </div>
          </div>
          {ativo && (
            <button type="button" style={botaoEscuro} onClick={() => copiar(url, "Link copiado! Cole no WhatsApp.")}>
              Copiar link
            </button>
          )}
        </div>
      )}

      {estado && token && estado.status !== "respondida" && (
        <div className="flex flex-wrap gap-2">
          {ativo && (
            <button
              type="button"
              style={botao}
              onClick={() =>
                copiar(
                  `Olá${primeiroBonito ? `, ${primeiroBonito}` : ""}! Bem-vindo ao Grupo Seu Elias. Responda a nossa Pesquisa de satisfação: ${url}`,
                  "Mensagem copiada! Cole no WhatsApp."
                )
              }
            >
              Copiar mensagem p/ WhatsApp
            </button>
          )}
          <button type="button" style={botao} disabled={pendente} onClick={() => iniciar(async () => aplicar(await gerarLinkPesquisa(colaboradorId)))}>
            Gerar link novo
          </button>
          {ativo && (
            <button
              type="button"
              style={{ ...botao, color: "#b42318", borderColor: "#f1c4bf" }}
              disabled={pendente}
              onClick={() => iniciar(async () => aplicar(await desativarLinkPesquisa(colaboradorId)))}
            >
              Desativar link
            </button>
          )}
        </div>
      )}

      {estado && estado.status === "respondida" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" style={botaoPessego} onClick={() => setResumo((v) => !v)}>
            {resumo ? "Esconder resumo" : "Ver resumo das respostas"}
          </button>
          {!confirmarRefazer ? (
            <button type="button" style={botao} onClick={() => setConfirmarRefazer(true)}>
              Refazer pesquisa
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2" style={{ fontSize: 12 }}>
              Apaga as respostas atuais e cria um link novo.
              <button
                type="button"
                style={{ ...botao, color: "#b42318", borderColor: "#f1c4bf" }}
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    aplicar(await gerarLinkPesquisa(colaboradorId, true));
                    setConfirmarRefazer(false);
                    setResumo(false);
                  })
                }
              >
                Sim, refazer
              </button>
              <button type="button" style={botao} onClick={() => setConfirmarRefazer(false)}>
                Cancelar
              </button>
            </span>
          )}
        </div>
      )}

      {estado && estado.status === "respondida" && resumo && <Resumo estado={estado} />}

      {msg && estado && (
        <p role="status" style={{ fontSize: 12, fontWeight: 600, color: "#5c5c5c" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

function Resumo({ estado }: { estado: EstadoPesquisa }) {
  if (estado.nao_participou) {
    return (
      <div style={{ background: "#fdecea", color: "#b42318", borderRadius: 10, padding: "12px 16px", fontSize: 13 }}>
        <b>O colaborador informou que NÃO participou do Onboarding.</b>
        <br />
        Ele confirmou a resposta e a pesquisa foi encerrada. As demais perguntas não foram respondidas.
        <div style={{ fontSize: 12, marginTop: 6 }}>Respondida em {dataBR(estado.respondida_em)}</div>
      </div>
    );
  }
  const r = resumirPesquisa(estado.respostas);
  const tClareza = tipoResposta(TOTAL_PERGUNTAS - 1, r.clareza);
  const corClareza = tClareza === "ok" ? "#1f7a52" : tClareza === "esc" ? "#93440c" : "#b42318";
  const kpi = (rotulo: string, valor: string, c = "#262626", pequeno = false) => (
    <div style={{ border: "1px solid #f1e4d6", borderRadius: 10, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#737373" }}>{rotulo}</div>
      <div style={{ fontFamily: pequeno ? INTER : OSWALD, fontWeight: pequeno ? 700 : 600, fontSize: pequeno ? 14 : 26, lineHeight: 1.2, marginTop: 4, color: c }}>{valor}</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3" style={{ borderTop: "1px solid #f1e4d6", paddingTop: 12 }}>
      <div style={{ fontSize: 12, color: "#737373" }}>Respondida em {dataBR(estado.respondida_em)}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpi("Em ordem", `${r.emOrdem} de ${TOTAL_PERGUNTAS - 1}`, "#1f7a52")}
        {kpi("Não recebeu / não ciente", String(r.naoCiente), r.naoCiente ? "#b42318" : "#262626")}
        {kpi("Esclarecimentos", String(r.esclarecimentos), r.esclarecimentos ? "#93440c" : "#262626")}
        {kpi("Clareza da apresentação", r.clareza ?? "—", corClareza, true)}
        {kpi("Situação", r.conversar.length ? "Chamar para conversa" : "Tudo certo", r.conversar.length ? "#b42318" : "#1f7a52", true)}
      </div>
      {r.conversar.length > 0 && (
        <div style={{ background: "#fdecea", color: "#b42318", borderRadius: 10, padding: "12px 16px", fontSize: 13 }}>
          <b>Para conversar com o colaborador:</b>
          {r.conversar.map((i) => (
            <div key={i}>
              {i + 1}. {PERGUNTAS_PESQUISA[i].q} → {estado.respostas[i] ?? "sem resposta"}
            </div>
          ))}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {PERGUNTAS_PESQUISA.map((p, i) => {
              const t = tipoResposta(i, estado.respostas[i] ?? null);
              const c = t === "ok" ? PILULA.ok : t === "esc" ? PILULA.espera : PILULA.ruim;
              return (
                <tr key={i} style={{ borderTop: "1px solid #f4ebe1" }}>
                  <td style={{ padding: "8px 6px", color: "#737373", width: 28 }}>{i + 1}</td>
                  <td style={{ padding: "8px 6px" }}>{p.q}</td>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: c.fundo, color: c.texto }}>{estado.respostas[i] ?? "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#737373", marginBottom: 6 }}>Observações do colaborador</div>
        <div style={{ background: "#fbf6f0", border: "1px solid #f1e4d6", borderRadius: 10, padding: "10px 14px", fontSize: 13, whiteSpace: "pre-wrap" }}>
          {estado.observacoes ?? "Nenhuma observação."}
        </div>
      </div>
    </div>
  );
}
