"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { incluirNoProcessoIntegracao } from "@/lib/actions-integracao";

interface Opcao {
  id: string;
  nome: string;
  detalhe: string;
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Botão "+ Incluir colaborador" do topo do painel: escolhe quem ainda não tem processo e cria o processo. */
export default function IncluirColaboradorPainel({ disponiveis }: { disponiveis: Opcao[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const filtrados = useMemo(() => {
    const q = norm(busca.trim());
    return q ? disponiveis.filter((o) => norm(`${o.nome} ${o.detalhe}`).includes(q)) : disponiveis;
  }, [disponiveis, busca]);

  function fechar() {
    setAberto(false);
    setBusca("");
    setEscolhido(null);
    setErro(null);
  }

  function incluir() {
    if (!escolhido) return;
    setErro(null);
    const fd = new FormData();
    fd.set("colaborador_id", escolhido);
    startTransition(async () => {
      try {
        await incluirNoProcessoIntegracao(fd);
        fechar();
        router.refresh();
      } catch {
        setErro("Não foi possível incluir. Tente de novo.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 16px",
          borderRadius: 8,
          border: 0,
          background: "#262626",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        + Incluir colaborador
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(38,38,38,.35)" }}
          onClick={fechar}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 460,
              maxWidth: "100%",
              maxHeight: "80vh",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #f1e4d6",
              padding: 24,
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
              color: "#262626",
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Incluir colaborador no processo</div>
              <div style={{ fontSize: 12, color: "#737373", marginTop: 2 }}>
                Aparecem só colaboradores ativos que ainda não têm processo de integração.
              </div>
            </div>

            <input
              type="search"
              autoFocus
              placeholder="Buscar por nome ou cargo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ fontSize: 13, padding: "9px 12px", border: "1px solid #e7ddd2", borderRadius: 8, background: "#fff" }}
            />

            <div style={{ overflowY: "auto", border: "1px solid #f4ebe1", borderRadius: 8, minHeight: 120 }}>
              {filtrados.length === 0 ? (
                <p style={{ fontSize: 13, color: "#737373", padding: 16, textAlign: "center" }}>
                  {disponiveis.length === 0 ? "Todos os colaboradores já têm processo." : "Ninguém encontrado."}
                </p>
              ) : (
                filtrados.map((o) => {
                  const ativo = escolhido === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setEscolhido(o.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        border: 0,
                        borderBottom: "1px solid #f4ebe1",
                        background: ativo ? "#262626" : "#fff",
                        color: ativo ? "#fff" : "#262626",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{o.nome}</span>
                      {o.detalhe && (
                        <span style={{ display: "block", fontSize: 12, color: ativo ? "#d9d2ca" : "#737373" }}>{o.detalhe}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {erro && <div style={{ fontSize: 13, color: "#b42318" }}>{erro}</div>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: "1px solid #e7ddd2",
                  background: "#fff",
                  color: "#262626",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!escolhido || pendente}
                onClick={incluir}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: 0,
                  background: !escolhido || pendente ? "#f0e8df" : "#262626",
                  color: !escolhido || pendente ? "#a8a29a" : "#fff",
                  cursor: !escolhido || pendente ? "default" : "pointer",
                }}
              >
                {pendente ? "Incluindo…" : "Incluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
