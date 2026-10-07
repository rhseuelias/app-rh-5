"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import {
  desativarLinkPainel,
  gerarLinkPainel,
  obterLinkPainel,
  salvarSelecaoLinkPainel,
  type RespostaLinkPainel,
} from "@/lib/actions-link-painel";

const botao: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #e7ddd2",
  background: "#fff",
  color: "#262626",
  cursor: "pointer",
};
const botaoEscuro: CSSProperties = { ...botao, background: "#262626", color: "#fff", borderColor: "#262626" };

export default function CompartilharPainel({
  colaboradores,
}: {
  colaboradores: { id: string; nome: string; detalhe: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [modo, setModo] = useState<"todos" | "escolher">("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");
  const [pendente, iniciar] = useTransition();

  function aplicar(r: RespostaLinkPainel) {
    setToken(r.token);
    if (r.token) {
      setModo(r.selecionados ? "escolher" : "todos");
      setSel(new Set(r.selecionados ?? []));
    }
    setMsg(r.mensagem);
  }

  useEffect(() => {
    if (!aberto) return;
    iniciar(async () => {
      aplicar(await obterLinkPainel());
    });
  }, [aberto]);

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/painel-integracao/${token}` : "";
  const idsAtuais = modo === "escolher" ? Array.from(sel) : null;
  const semNinguem = modo === "escolher" && sel.size === 0;

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? colaboradores.filter((c) => c.nome.toLowerCase().includes(t)) : colaboradores;
  }, [colaboradores, busca]);

  function alternar(id: string) {
    setSel((antigo) => {
      const novo = new Set(antigo);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function agir(fn: () => Promise<RespostaLinkPainel>) {
    iniciar(async () => {
      aplicar(await fn());
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copiado! Cole no WhatsApp ou no e-mail.");
    } catch {
      setMsg("Não deu para copiar sozinho. Selecione o link e copie.");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" style={botao} onClick={() => setAberto((v) => !v)}>
        🔗 Link para o supervisor
      </button>
      {aberto && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 400,
            maxWidth: "92vw",
            zIndex: 30,
            background: "#fff",
            border: "1px solid #e7ddd2",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,.12)",
          }}
        >
          <p style={{ fontSize: 13, color: "#262626", marginBottom: 12 }}>
            Quem receber o link vê o painel <b>só para acompanhar</b>. Não muda nada nem entra no resto do sistema.
          </p>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#93440c", marginBottom: 6, textTransform: "uppercase" }}>
            Quem o supervisor vai ver
          </div>
          <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 4 }}>
            <input type="radio" checked={modo === "todos"} onChange={() => setModo("todos")} />
            Todos os colaboradores em integração
          </label>
          <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input type="radio" checked={modo === "escolher"} onChange={() => setModo("escolher")} />
            Só os que eu escolher
          </label>

          {modo === "escolher" && (
            <div style={{ border: "1px solid #e7ddd2", borderRadius: 8, marginBottom: 12 }}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome..."
                style={{ width: "100%", fontSize: 13, padding: 8, border: "none", borderBottom: "1px solid #e7ddd2", borderRadius: "8px 8px 0 0" }}
              />
              <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 8px" }}>
                {visiveis.length === 0 && <p style={{ fontSize: 12, color: "#737373", padding: 8 }}>Ninguém encontrado.</p>}
                {visiveis.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", fontSize: 13 }}>
                    <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} style={{ marginTop: 3 }} />
                    <span>
                      {c.nome}
                      {c.detalhe && <span style={{ display: "block", fontSize: 11, color: "#737373" }}>{c.detalhe}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderTop: "1px solid #e7ddd2", fontSize: 12, color: "#5c5c5c" }}>
                <span>{sel.size} escolhido{sel.size !== 1 ? "s" : ""}</span>
                <span>
                  <button type="button" style={{ color: "#b85c12" }} onClick={() => setSel(new Set(colaboradores.map((c) => c.id)))}>
                    Marcar todos
                  </button>
                  {" · "}
                  <button type="button" style={{ color: "#b85c12" }} onClick={() => setSel(new Set())}>
                    Limpar
                  </button>
                </span>
              </div>
            </div>
          )}

          {token ? (
            <>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                style={{ width: "100%", fontSize: 12, padding: 8, border: "1px solid #e7ddd2", borderRadius: 8, marginBottom: 10 }}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" style={botaoEscuro} onClick={copiar}>
                  Copiar link
                </button>
                <button
                  type="button"
                  style={{ ...botao, opacity: semNinguem ? 0.5 : 1 }}
                  disabled={pendente || semNinguem}
                  onClick={() => agir(() => salvarSelecaoLinkPainel(idsAtuais))}
                >
                  Salvar seleção
                </button>
                <button type="button" style={botao} disabled={pendente} onClick={() => agir(() => gerarLinkPainel(idsAtuais))}>
                  Gerar link novo
                </button>
                <button type="button" style={{ ...botao, color: "#b42318" }} disabled={pendente} onClick={() => agir(desativarLinkPainel)}>
                  Desativar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              style={{ ...botaoEscuro, opacity: semNinguem ? 0.5 : 1 }}
              disabled={pendente || semNinguem}
              onClick={() => agir(() => gerarLinkPainel(idsAtuais))}
            >
              {pendente ? "Aguarde..." : "Criar link"}
            </button>
          )}
          {semNinguem && <p style={{ fontSize: 12, marginTop: 8, color: "#b42318" }}>Marque pelo menos um colaborador.</p>}
          {msg && (
            <p role="status" style={{ fontSize: 12, marginTop: 10, color: "#5c5c5c" }}>
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
