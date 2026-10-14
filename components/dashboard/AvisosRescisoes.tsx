import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import {
  PRAZO_PAGAMENTO_DIAS,
  ROTULO_TIPO_AVISO,
  brCurto,
  hojeBrasilia,
  progressoAviso,
  situacaoPagamento,
  type Desligamento,
  type Tom as TomDeslig,
} from "@/lib/desligamento";
import { Cartao, TituloCartao, Pilula, Vazio, LINK_SUTIL, TONS, type Tom } from "./Blocos";

const TOM: Record<TomDeslig, Tom> = {
  atrasado: "red",
  atencao: "orange",
  ok: "green",
  feito: "green",
  neutro: "off",
};

const ICONE: Record<TomDeslig, string> = {
  atrasado: "✕",
  atencao: "▲",
  ok: "✓",
  feito: "✓",
  neutro: "•",
};

/**
 * Dois quadros lado a lado: "Avisos prévios" (quem está cumprindo aviso agora)
 * e "Rescisões do mês" (pagamento das verbas). Usa a tabela `desligamentos`.
 * Se a tabela não existir ou o perfil for de assistente, não mostra nada.
 */
export default async function AvisosRescisoes({
  mesChave,
  idsColaboradores,
}: {
  /** "2026-10" */
  mesChave: string;
  /** null = todos; senão só quem está na lista (filtro de empresa). */
  idsColaboradores: string[] | null;
}) {
  if (await souAssistente()) return null;

  const supabase = createClient();
  const { data, error } = await supabase.from("desligamentos").select("*");
  if (error || !data) return null;

  const hoje = hojeBrasilia();
  const permitidos = idsColaboradores ? new Set(idsColaboradores) : null;
  const todos = (data as Desligamento[]).filter((d) => !permitidos || permitidos.has(d.colaborador_id));

  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, nome")
    .in("id", todos.length > 0 ? todos.map((d) => d.colaborador_id) : ["00000000-0000-0000-0000-000000000000"]);
  const nomePorId = new Map(((colabs ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const nome = (d: Desligamento) => nomePorId.get(d.colaborador_id) ?? "Colaborador";

  // Avisos prévios: aviso trabalhado ainda em andamento
  const avisos = todos
    .map((d) => ({ d, prog: progressoAviso(d, hoje) }))
    .filter((x) => x.prog && !x.prog.terminou)
    .sort((a, b) => a.prog!.faltam - b.prog!.faltam);

  // Rescisões: as do mês escolhido (pelo último dia) e as que ainda estão sem pagamento
  const rescisoes = todos
    .filter((d) => d.ultimo_dia.slice(0, 7) === mesChave || !d.pago_em)
    .map((d) => ({ d, sit: situacaoPagamento(d, hoje) }))
    .sort((a, b) => Number(!!a.d.pago_em) - Number(!!b.d.pago_em) || a.d.prazo_pagamento.localeCompare(b.d.prazo_pagamento));

  const atrasadas = rescisoes.filter((r) => r.sit.tom === "atrasado").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Cartao>
        <TituloCartao direita={<Pilula tom={avisos.length > 0 ? "orange" : "off"}>{avisos.length}</Pilula>}>
          Avisos prévios
        </TituloCartao>
        {avisos.length === 0 ? (
          <Vazio>Ninguém cumprindo aviso prévio agora.</Vazio>
        ) : (
          <ul className="divide-y divide-[#f4ebe1]">
            {avisos.slice(0, 6).map(({ d, prog }) => {
              const pct = prog!.total > 0 ? Math.round((prog!.diaAtual / prog!.total) * 100) : 0;
              const urgente = prog!.faltam <= 5;
              return (
                <li key={d.colaborador_id} className="py-3">
                  <Link href={`/colaboradores/${d.colaborador_id}#desligamento`} className="block group">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#262626] truncate group-hover:underline">
                          {nome(d)}
                        </span>
                        <span className="block text-[12px] text-[#737373] truncate">
                          {ROTULO_TIPO_AVISO[d.tipo_aviso]} · último dia {brCurto(d.ultimo_dia)}
                        </span>
                      </span>
                      <Pilula tom={urgente ? "orange" : "green"}>
                        {urgente ? "▲ " : "✓ "}
                        {prog!.faltam} {prog!.faltam === 1 ? "dia" : "dias"}
                      </Pilula>
                    </div>
                    <div
                      className="mt-2 h-[6px] rounded-full"
                      style={{ background: "#f4ebe1" }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Aviso de ${nome(d)}: dia ${prog!.diaAtual} de ${prog!.total}`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: urgente ? "#f0913f" : "#3d3d3d" }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[#737373] tabular-nums">
                      dia {prog!.diaAtual} de {prog!.total}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <Cartao>
        <TituloCartao
          direita={atrasadas > 0 ? <Pilula tom="red">✕ {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}</Pilula> : undefined}
        >
          Rescisões do mês
        </TituloCartao>
        {rescisoes.length === 0 ? (
          <Vazio>Nenhuma rescisão neste mês.</Vazio>
        ) : (
          <ul className="divide-y divide-[#f4ebe1]">
            {rescisoes.slice(0, 6).map(({ d, sit }) => (
              <li key={d.colaborador_id} className="py-2.5">
                <Link
                  href={`/colaboradores/${d.colaborador_id}#desligamento`}
                  className="flex items-center justify-between gap-3 group"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-[#262626] truncate group-hover:underline">
                      {nome(d)}
                    </span>
                    <span className="block text-[12px] text-[#737373] truncate">
                      Último dia {brCurto(d.ultimo_dia)} · pagar até {brCurto(d.prazo_pagamento)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Pilula tom={TOM[sit.tom]}>
                      {ICONE[sit.tom]} {sit.rotulo}
                    </Pilula>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px]" style={{ color: TONS.off.fg }}>
          Prazo para pagar as verbas: até {PRAZO_PAGAMENTO_DIAS} dias corridos depois do último dia de trabalho.{" "}
          <Link href="/colaboradores" className={LINK_SUTIL}>
            Ver colaboradores
          </Link>
        </p>
      </Cartao>
    </div>
  );
}
