"use client";

import { useRef, useState, useTransition, useEffect, type PointerEvent } from "react";
import { assinarContratoPJ } from "@/lib/actions-assinatura-pj";

/** Formulário público de assinatura digital do contrato PJ — o profissional
 * desenha a assinatura na tela (mouse ou dedo) e ela entra automaticamente
 * em todas as páginas do contrato de uma vez só. */
export default function AssinarContratoForm({
  token,
  nomeProfissional,
}: {
  token: string;
  nomeProfissional: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const desenhando = useRef(false);
  const ultimoPonto = useRef<{ x: number; y: number } | null>(null);

  const [temDesenho, setTemDesenho] = useState(false);
  const [li, setLi] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function posicao(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function iniciarTraco(e: PointerEvent<HTMLCanvasElement>) {
    desenhando.current = true;
    ultimoPonto.current = posicao(e);
  }

  function continuarTraco(e: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !ultimoPonto.current) return;
    const p = posicao(e);
    ctx.beginPath();
    ctx.moveTo(ultimoPonto.current.x, ultimoPonto.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPonto.current = p;
    setTemDesenho(true);
  }

  function pararTraco() {
    desenhando.current = false;
    ultimoPonto.current = null;
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setTemDesenho(false);
  }

  async function confirmarAssinatura() {
    setErro(null);
    if (!temDesenho) {
      setErro("Desenhe sua assinatura na área acima antes de confirmar.");
      return;
    }
    if (!li) {
      setErro("Marque que você leu o contrato antes de assinar.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setErro("Não foi possível processar a assinatura. Tente novamente.");
      return;
    }

    const file = new File([blob], "assinatura.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dataTransfer.files;

    formRef.current?.requestSubmit();
  }

  function enviar(formData: FormData) {
    startTransition(async () => {
      try {
        await assinarContratoPJ(formData);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível assinar. Tente novamente.");
      }
    });
  }

  return (
    <form ref={formRef} action={enviar} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <input ref={fileInputRef} type="file" name="assinatura" className="hidden" />

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-slate-900">1. Leia o contrato</h2>
        <p className="text-sm text-slate-500">
          Confira todos os dados e cláusulas antes de assinar. O arquivo abre no Word (ou similar) do seu
          celular ou computador.
        </p>
        <a
          href={`/api/assinatura-pj/${token}/preview`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-sm inline-block"
        >
          📄 Ler o contrato
        </a>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-slate-900">2. Desenhe sua assinatura</h2>
        <p className="text-sm text-slate-500">
          Use o dedo (celular) ou o mouse (computador) para desenhar sua assinatura no quadro abaixo. Ela vai
          entrar automaticamente em todas as páginas do contrato — não precisa assinar página por página.
        </p>
        <canvas
          ref={canvasRef}
          width={600}
          height={220}
          onPointerDown={iniciarTraco}
          onPointerMove={continuarTraco}
          onPointerUp={pararTraco}
          onPointerLeave={pararTraco}
          className="w-full h-48 border-2 border-dashed border-slate-300 rounded-xl bg-white touch-none"
        />
        <button type="button" onClick={limpar} className="text-xs text-slate-500 hover:underline">
          🔄 Limpar e desenhar de novo
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-semibold text-slate-900">3. Confirmar</h2>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={li}
            onChange={(e) => setLi(e.target.checked)}
            className="mt-0.5 w-4 h-4"
          />
          Li o contrato e concordo com os termos. Sei que essa assinatura eletrônica, feita por{" "}
          {nomeProfissional}, tem a mesma validade de uma assinatura de próprio punho, conforme previsto no
          próprio contrato.
        </label>

        {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <button
          type="button"
          onClick={confirmarAssinatura}
          disabled={isPending}
          className="btn-primary w-full sm:w-auto"
        >
          {isPending ? "Assinando..." : "✍️ Assinar todas as páginas"}
        </button>
      </section>
    </form>
  );
}
