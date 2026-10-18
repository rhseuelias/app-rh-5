import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { hojeBrasilia, type Desligamento } from "@/lib/desligamento";
import { MANROPE, ST7 } from "./tema7";

type Tom = "bad" | "warn" | "good";

const ESTILO: Record<Tom, { bg: string; cor: string }> = {
  bad: { bg: ST7.bad, cor: "#ffffff" },
  warn: { bg: "#fab219", cor: "#3b2a00" },
  good: { bg: "#dcece9", cor: "#0a4a44" },
};

/**
 * Faixa de alertas no topo da área de prazos: quatro quadrados grandes com
 * o número e a cor do semáforo (vermelho, amarelo ou verde).
 */
export default async function AlertasTopo({
  etapasAtrasadas,
  experiencia,
  experienciaUrgente,
  feriasEPJ,
  idsColaboradores,
}: {
  etapasAtrasadas: number;
  experiencia: number;
  /** Quantas experiências terminam em menos de 7 dias. */
  experienciaUrgente: number;
  /** Férias vencendo (30 dias) + contratos PJ vencendo (60 dias). */
  feriasEPJ: number;
  /** null = todos; senão só quem está na lista (filtro de empresa). */
  idsColaboradores: string[] | null;
}) {
  const assistente = await souAssistente();

  // Rescisões sem pagamento que vencem hoje ou já venceram
  let rescisoesVencendo: number | null = null;
  let rescisoesAtrasadas = 0;
  if (!assistente) {
    const supabase = createClient();
    const { data, error } = await supabase.from("desligamentos").select("*");
    if (!error && data) {
      const hoje = hojeBrasilia();
      const permitidos = idsColaboradores ? new Set(idsColaboradores) : null;
      const abertas = (data as Desligamento[]).filter(
        (d) => !d.pago_em && (!permitidos || permitidos.has(d.colaborador_id))
      );
      const vencendo = abertas.filter((d) => d.prazo_pagamento.slice(0, 10) <= hoje);
      rescisoesVencendo = vencendo.length;
      rescisoesAtrasadas = vencendo.filter((d) => d.prazo_pagamento.slice(0, 10) < hoje).length;
    }
  }

  const tiles: { chave: string; n: number; tom: Tom; texto: string; href: string }[] = [
    {
      chave: "etapas",
      n: etapasAtrasadas,
      tom: etapasAtrasadas > 0 ? "bad" : "good",
      texto: etapasAtrasadas === 1 ? "Etapa de integração atrasada" : "Etapas de integração atrasadas",
      href: "/onboarding",
    },
  ];
  if (rescisoesVencendo !== null) {
    tiles.push({
      chave: "rescisoes",
      n: rescisoesVencendo,
      tom: rescisoesAtrasadas > 0 ? "bad" : rescisoesVencendo > 0 ? "warn" : "good",
      texto: rescisoesVencendo === 1 ? "Rescisão vence hoje ou já venceu" : "Rescisões vencem hoje ou já venceram",
      href: "/dashboard#rescisoes",
    });
  }
  tiles.push(
    {
      chave: "exp",
      n: experiencia,
      tom: experiencia === 0 ? "good" : experienciaUrgente > 0 ? "bad" : "warn",
      texto: experiencia === 1 ? "Experiência terminando (até 15 dias)" : "Experiências terminando (até 15 dias)",
      href: "/colaboradores",
    },
    {
      chave: "ferias",
      n: feriasEPJ,
      tom: feriasEPJ > 0 ? "warn" : "good",
      texto: "Férias e contratos PJ vencendo",
      href: "/ferias",
    }
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ fontFamily: MANROPE }}>
      {tiles.map((t) => (
        <Link
          key={t.chave}
          href={t.href}
          className="block rounded-[14px] px-[18px] py-4 hover:brightness-95"
          style={{ background: ESTILO[t.tom].bg, color: ESTILO[t.tom].cor }}
        >
          <div className="text-[40px] font-extrabold leading-none tracking-[-0.5px] tabular-nums">{t.n}</div>
          <div className="mt-2 text-[12.5px] font-bold leading-[1.3]">{t.texto}</div>
        </Link>
      ))}
    </div>
  );
}
