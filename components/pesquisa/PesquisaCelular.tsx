"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { enviarPesquisaIntegracao } from "@/lib/actions-pesquisa-integracao";
import { PERGUNTAS_PESQUISA, TOTAL_PERGUNTAS } from "@/lib/pesquisa-integracao";

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";

const cor = {
  fundo: "#faf7f3",
  tinta: "#262626",
  suave: "#6b6259",
  linha: "#eadfd3",
  pessego: "#f0913f",
  pessegoTexto: "#93440c",
  pessegoFundo: "#fff3e6",
  erro: "#b42318",
};

const botaoGrande: CSSProperties = {
  width: "100%",
  minHeight: 56,
  fontFamily: INTER,
  fontSize: 18,
  fontWeight: 600,
  borderRadius: 14,
  border: `1px solid ${cor.tinta}`,
  background: cor.tinta,
  color: "#fff",
  cursor: "pointer",
};

/**
 * Pesquisa de Integração no celular do colaborador: uma pergunta por tela, botões grandes.
 * Ao tocar numa resposta, passa para a próxima. Na 1ª pergunta, "Não" pede confirmação e encerra a pesquisa.
 */
export default function PesquisaCelular({ token, primeiroNome }: { token: string; primeiroNome: string }) {
  const N = TOTAL_PERGUNTAS;
  const [passo, setPasso] = useState(0); // 0 = abertura, 1..N = perguntas, N+1 = observações
  const [resp, setResp] = useState<(string | null)[]>(() => PERGUNTAS_PESQUISA.map(() => null));
  const [obs, setObs] = useState("");
  const [confirmarNao, setConfirmarNao] = useState(false);
  const [fim, setFim] = useState<null | "ok" | "naoParticipou">(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const topoRef = useRef<HTMLDivElement>(null);
  const avancar = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    topoRef.current?.scrollIntoView({ block: "start" });
    window.scrollTo({ top: 0 });
  }, [passo, fim]);
  useEffect(() => () => {
    if (avancar.current) clearTimeout(avancar.current);
  }, []);

  const pct = Math.round((passo / (N + 1)) * 100);

  function escolher(i: number, valor: string) {
    if (pendente) return;
    setErro("");
    const novo = resp.slice();
    novo[i] = valor;
    setResp(novo);
    if (i === 0 && valor === "Não") {
      setConfirmarNao(true);
      return;
    }
    if (avancar.current) clearTimeout(avancar.current);
    avancar.current = setTimeout(() => setPasso((p) => (p === i + 1 ? p + 1 : p)), 220);
  }

  function enviar(naoParticipou: boolean) {
    setErro("");
    iniciar(async () => {
      try {
        const r = await enviarPesquisaIntegracao(token, resp, obs, naoParticipou);
        if (r.ok) {
          setConfirmarNao(false);
          setFim(naoParticipou ? "naoParticipou" : "ok");
        } else {
          setConfirmarNao(false);
          setErro(r.mensagem);
        }
      } catch {
        setConfirmarNao(false);
        setErro("Não foi possível enviar agora. Confira a internet e tente de novo.");
      }
    });
  }

  const caixa: CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 14 };

  return (
    <div style={{ minHeight: "100vh", background: cor.fundo, color: cor.tinta, fontFamily: INTER, fontSize: 17, lineHeight: 1.5 }}>
      <div ref={topoRef} style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: cor.fundo, padding: "14px 18px 10px", borderBottom: `1px solid ${cor.linha}` }}>
          <span style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 15, letterSpacing: ".06em", textTransform: "uppercase", color: cor.pessegoTexto }}>
            Grupo Seu Elias
          </span>
          {passo > 0 && !fim && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              style={{ height: 8, borderRadius: 4, background: cor.linha, marginTop: 10, overflow: "hidden" }}
            >
              <div style={{ width: `${pct}%`, height: "100%", background: cor.pessego, borderRadius: 4, transition: "width .25s" }} />
            </div>
          )}
        </div>

        {fim ? (
          <div style={caixa}>
            <Boas titulo="Obrigado por participar do onboarding do Grupo Seu Elias!">
              <p style={{ marginTop: 10 }}>
                Nosso objetivo é que você compreenda a cultura da empresa, conheça suas responsabilidades e tenha clareza sobre as normas que orientam
                nosso trabalho.
              </p>
              <p style={{ marginTop: 10 }}>Seja bem-vindo(a) ao time!</p>
            </Boas>
            <p style={{ background: cor.pessegoFundo, color: cor.pessegoTexto, borderRadius: 10, padding: "12px 16px", fontWeight: 500 }}>
              {fim === "naoParticipou"
                ? "Resposta salva. Como você não participou do Onboarding, o RH vai entrar em contato."
                : "Respostas salvas. Você já pode fechar esta página."}
            </p>
          </div>
        ) : passo === 0 ? (
          <div style={caixa}>
            <Boas titulo="Pesquisa de Integração e Ciência das Normas Internas">
              <p style={{ marginTop: 10 }}>
                <b>{primeiroNome ? `${primeiroNome}, é` : "É"} uma alegria ter você conosco!</b>
              </p>
              <p style={{ marginTop: 10 }}>
                Você agora faz parte de um time que acredita na valorização das pessoas, no caráter, na parceria e na excelência. Queremos que sua jornada
                conosco seja marcada por aprendizado, crescimento e propósito.
              </p>
              <p style={{ marginTop: 10 }}>
                Este formulário tem como objetivo registrar sua participação no onboarding, confirmar o recebimento do seu kit de integração e verificar sua
                ciência sobre as normas, os procedimentos e os valores que orientam nosso trabalho.
              </p>
              <p style={{ marginTop: 10 }}>Conte conosco nessa jornada. Seja bem-vindo(a) à família Grupo Seu Elias!</p>
            </Boas>
            <div style={{ background: "#fff", border: `1px solid ${cor.linha}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: cor.suave, marginBottom: 8 }}>Orientações</div>
              <p>Leia atentamente as afirmações abaixo e informe se está ciente de cada uma delas.</p>
              <p style={{ marginTop: 8 }}>
                <b>Todas as perguntas são obrigatórias.</b>
              </p>
            </div>
            <button type="button" style={botaoGrande} onClick={() => setPasso(1)}>
              Começar
            </button>
          </div>
        ) : passo <= N ? (
          <div style={caixa}>
            {(() => {
              const i = passo - 1;
              const p = PERGUNTAS_PESQUISA[i];
              return (
                <>
                  <div style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 15, letterSpacing: ".04em", textTransform: "uppercase", color: cor.pessegoTexto }}>
                    Pergunta {passo} de {N}
                  </div>
                  <h1 id="pergunta" style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 700, margin: 0 }}>
                    {p.q}
                  </h1>
                  {p.nota && <p style={{ color: cor.suave, marginTop: -6 }}>Mede a clareza e a qualidade do onboarding.</p>}
                  <div role="radiogroup" aria-labelledby="pergunta" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {p.o.map((o, j) => {
                      const sel = resp[i] === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => escolher(i, o)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            width: "100%",
                            minHeight: 60,
                            padding: "12px 16px",
                            textAlign: "left",
                            fontFamily: INTER,
                            fontSize: 17,
                            fontWeight: 600,
                            lineHeight: 1.3,
                            borderRadius: 14,
                            cursor: "pointer",
                            border: `2px solid ${sel ? cor.tinta : cor.linha}`,
                            background: sel ? cor.pessegoFundo : "#fff",
                            color: sel ? cor.pessegoTexto : cor.tinta,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              flex: "none",
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              border: `2px solid ${sel ? cor.pessegoTexto : cor.suave}`,
                              background: sel ? `radial-gradient(circle, ${cor.pessegoTexto} 0 45%, #fff 50%)` : "#fff",
                            }}
                          />
                          <span>
                            {p.nota ? `${j + 1} - ` : ""}
                            {o}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Voltar aoClicar={() => setPasso(passo - 1)} />
                </>
              );
            })()}
          </div>
        ) : (
          <div style={caixa}>
            <div style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 15, letterSpacing: ".04em", textTransform: "uppercase", color: cor.pessegoTexto }}>Última etapa</div>
            <h1 style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 700, margin: 0 }}>
              <label htmlFor="obs">Observações do colaborador</label>
            </h1>
            <p style={{ color: cor.suave, marginTop: -6 }}>Se tiver alguma dúvida ou algo a registrar, escreva aqui. Pode deixar em branco.</p>
            <textarea
              id="obs"
              value={obs}
              maxLength={2000}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Escreva aqui (opcional)"
              style={{ width: "100%", minHeight: 140, fontFamily: INTER, fontSize: 16, padding: 14, border: `2px solid ${cor.linha}`, borderRadius: 14, background: "#fff", color: cor.tinta }}
            />
            {erro && (
              <p role="alert" style={{ color: cor.erro, fontWeight: 600 }}>
                {erro}
              </p>
            )}
            <button type="button" disabled={pendente} style={{ ...botaoGrande, opacity: pendente ? 0.6 : 1, cursor: pendente ? "wait" : "pointer" }} onClick={() => enviar(false)}>
              {pendente ? "Enviando..." : "Enviar respostas"}
            </button>
            <Voltar aoClicar={() => setPasso(passo - 1)} />
          </div>
        )}
      </div>

      {confirmarNao && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-confirmar"
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="titulo-confirmar" style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 21, textTransform: "uppercase", margin: 0 }}>
              Confirma que não participou do Onboarding?
            </h2>
            <p>Se confirmar, a pesquisa termina aqui e sua resposta é salva. O RH será avisado.</p>
            <button type="button" disabled={pendente} style={{ ...botaoGrande, opacity: pendente ? 0.6 : 1 }} onClick={() => enviar(true)}>
              {pendente ? "Salvando..." : "Sim, não participei"}
            </button>
            <button
              type="button"
              disabled={pendente}
              style={{ ...botaoGrande, background: "#fff", color: cor.tinta, border: `1px solid ${cor.linha}` }}
              onClick={() => {
                setConfirmarNao(false);
                setResp((r) => r.map((v, i) => (i === 0 ? null : v)));
              }}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Boas({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: cor.tinta, color: "#fff", borderRadius: 14, padding: 20 }}>
      <h1 style={{ fontFamily: OSWALD, fontWeight: 600, fontSize: 22, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: ".02em", margin: 0 }}>{titulo}</h1>
      {children}
    </div>
  );
}

function Voltar({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      style={{ alignSelf: "flex-start", background: "none", border: 0, color: cor.suave, fontFamily: INTER, fontSize: 16, fontWeight: 600, padding: "12px 4px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      ‹ Voltar
    </button>
  );
}
