"use client";

import { useState, useTransition } from "react";
import { gerarLinkAssinaturaPJ } from "@/lib/actions-assinatura-pj";

function formatarDataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/** Gera e mostra o link de assinatura digital do contrato PJ — o profissional
 * abre esse link (sem precisar de conta) pra ler o contrato e assinar todas
 * as páginas de uma vez, desenhando a assinatura na tela. */
export default function EnviarAssinaturaDigitalPJ({
  colaboradorId,
  linkUrl,
  linkCriadoEm,
  assinadoEm,
}: {
  colaboradorId: string;
  linkUrl: string | null;
  linkCriadoEm: string | null;
  assinadoEm: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    if (
      linkUrl &&
      !confirm(
        "Gerar um novo link? O link antigo deixa de funcionar e, se o profissional já tinha assinado por ele, essa assinatura precisa ser refeita no novo link."
      )
    ) {
      return;
    }
    startTransition(() => gerarLinkAssinaturaPJ(colaboradorId));
  }

  async function copiar() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível (ex.: navegador antigo) — o campo abaixo já
      // deixa o link selecionável pra copiar manualmente
    }
  }

  return (
    <div className="space-y-2 pt-3 border-t border-slate-100 mt-3">
      <h3 className="text-sm font-medium text-slate-700">📤 Assinatura digital pelo profissional</h3>

      {assinadoEm && (
        <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
          ✅ Assinado digitalmente pelo profissional em {formatarDataHoraBR(assinadoEm)}.
        </p>
      )}

      {!assinadoEm && linkUrl && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          ⏳ Aguardando assinatura — link gerado{linkCriadoEm ? ` em ${formatarDataHoraBR(linkCriadoEm)}` : ""}.
        </p>
      )}

      {linkUrl && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            readOnly
            value={linkUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="input text-xs flex-1 min-w-[220px]"
          />
          <button type="button" onClick={copiar} className="btn-secondary text-xs shrink-0">
            {copiado ? "✓ Copiado" : "📋 Copiar link"}
          </button>
        </div>
      )}

      <button type="button" onClick={gerar} disabled={isPending} className="btn-secondary text-sm">
        {isPending ? "Gerando..." : linkUrl ? "🔄 Gerar novo link" : "📤 Gerar link de assinatura digital"}
      </button>
      <p className="text-xs text-slate-400">
        Mande esse link pro profissional (WhatsApp, e-mail etc.). Ele abre no celular ou computador dele, sem
        precisar de conta, lê o contrato e assina — a assinatura entra em todas as páginas automaticamente.
      </p>
    </div>
  );
}
