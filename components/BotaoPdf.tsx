"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

function comParam(href: string, param: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${param}`;
}

/**
 * Botão de PDF que ABRE A PRÉ-VISUALIZAÇÃO primeiro; só baixa quando
 * a pessoa clica em "Baixar PDF" dentro da janela.
 */
export default function BotaoPdf({
  href,
  children,
  className,
  style,
  titulo = "Pré-visualização do PDF",
  desabilitado = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  titulo?: string;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  return (
    <>
      <button type="button" className={className} style={style} disabled={desabilitado} onClick={() => setAberto(true)}>
        {children}
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          onClick={() => setAberto(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "min(1100px, 100%)",
              height: "min(92vh, 100%)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <strong style={{ flex: 1, fontSize: 15, color: "#2B2118" }}>{titulo}</strong>
              <a
                href={comParam(href, "download=1")}
                style={{
                  background: "#2B2118",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                ⬇️ Baixar PDF
              </a>
              <a
                href={comParam(href, "inline=1")}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: "#2B2118", textDecoration: "underline" }}
              >
                Abrir em outra aba
              </a>
              <button
                type="button"
                onClick={() => setAberto(false)}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
            <iframe title={titulo} src={comParam(href, "inline=1")} style={{ flex: 1, width: "100%", border: 0 }} />
          </div>
        </div>
      )}
    </>
  );
}
