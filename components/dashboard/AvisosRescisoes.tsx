import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import {
  PRAZO_PAGAMENTO_DIAS,
  brCurto,
  hojeBrasilia,
  progressoAviso,
  situacaoPagamento,
  type Desligamento,
  type TipoAviso,
  type Tom as TomDeslig,
} from "@/lib/desligamento";
import {
  Cartao7,
  Icone,
  Ponto,
  Selo,
  MANROPE,
  P7,
  corEmpresa,
  nomeProprio,
  ROTULO_COLUNA,
  COR_ROTULO,
  type K,
} from "./tema7";

const TIPO_CURTO: Record<TipoAviso, string> = {
  trabalhado: "Trabalhado",
  indenizado: "Indenizado",
  acordo: "Acordo",
  pedido_cumprindo: "Pedido, cumprindo",
  pedido_sem_cumprir: "Pedido, sem cumprir",
};

const K_DO_TOM: Record<TomDeslig, K | null> = {
  atrasado: "bad",
  atencao: "warn",
  ok: "good",
  feito: "good",
  neutro: null,
};

const COLS_AVISO = "minmax(110px,1.5fr) 80px minmax(50px,1fr) 46px 62px";
const COLS_RESCISAO = "minmax(110px,1.4fr) 80px 46px minmax(112px,1.3fr)";

function Cabecalho({ titulo, direita }: { titulo: string; direita: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
      <div className="text-[14px] font-bold" style={{ fontFamily: MANROPE, color: P7.ink }}>
        {titulo}
      </div>
      <div className="text-[11.5px]" style={{ color: P7.sec }}>
        {direita}
      </div>
    </div>
  );
}

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

  const [{ data: colabs }, { data: empresas }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, empresa_id")
      .in("id", todos.length > 0 ? todos.map((d) => d.colaborador_id) : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("empresas").select("id, nome"),
  ]);
  const empresaPorId = new Map(((empresas ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]));
  const colabPorId = new Map(
    ((colabs ?? []) as { id: string; nome: string; empresa_id: string | null }[]).map((c) => [c.id, c])
  );
  const nome = (d: Desligamento) => nomeProprio(colabPorId.get(d.colaborador_id)?.nome) || "Colaborador";
  const corDe = (d: Desligamento) => {
    const eid = colabPorId.get(d.colaborador_id)?.empresa_id;
    return corEmpresa(eid ? empresaPorId.get(eid) ?? "" : "");
  };

  // Avisos prévios: aviso trabalhado ainda em andamento
  const avisos = todos
    .map((d) => ({ d, prog: progressoAviso(d, hoje) }))
    .filter((x) => x.prog && !x.prog.terminou)
    .sort((a, b) => a.prog!.faltam - b.prog!.faltam);
  const avisosUrgentes = avisos.filter((a) => a.prog!.faltam <= 5).length;

  // Rescisões: as do mês escolhido (pelo último dia) e as que ainda estão sem pagamento
  const rescisoes = todos
    .filter((d) => d.ultimo_dia.slice(0, 7) === mesChave || !d.pago_em)
    .map((d) => ({ d, sit: situacaoPagamento(d, hoje) }))
    .sort(
      (a, b) =>
        Number(!!a.d.pago_em) - Number(!!b.d.pago_em) || a.d.prazo_pagamento.localeCompare(b.d.prazo_pagamento)
    );
  const aPagar = rescisoes.filter((r) => !r.d.pago_em).length;
  const pagas = rescisoes.length - aPagar;

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
      <Cartao7 className="flex flex-col">
        <Cabecalho
          titulo="Avisos prévios"
          direita={
            <>
              <b>{avisos.length}</b> em andamento · <b>{avisosUrgentes}</b> termina{avisosUrgentes === 1 ? "" : "m"} em até 5 dias
            </>
          }
        />
        <div className="flex-1">
          <div>
            <div className={`mb-1 grid gap-x-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em]`} style={{ gridTemplateColumns: COLS_AVISO, ...COR_ROTULO }}>
              <div>Colaborador</div>
              <div>Tipo</div>
              <div>Cumprido</div>
              <div>Último dia</div>
              <div>Faltam</div>
            </div>
            {avisos.length === 0 && (
              <p className="border-t py-3 text-[12.5px]" style={{ borderColor: P7.grid, color: P7.sec }}>
                Ninguém cumprindo aviso prévio agora.
              </p>
            )}
            {avisos.slice(0, 6).map(({ d, prog }) => {
              const pct = prog!.total > 0 ? Math.round((prog!.diaAtual / prog!.total) * 100) : 0;
              const urgente = prog!.faltam <= 5;
              return (
                <Link
                  key={d.colaborador_id}
                  href={`/colaboradores/${d.colaborador_id}#desligamento`}
                  className="grid h-[34px] items-center gap-x-2.5 border-t hover:bg-[#f4f8f7]"
                  style={{ gridTemplateColumns: COLS_AVISO, borderColor: P7.grid, fontFamily: MANROPE }}
                >
                  <span className="truncate text-[12.5px] font-bold" style={{ color: P7.ink }}>
                    <Ponto cor={corDe(d)} redondo />
                    {nome(d)}
                  </span>
                  <span className="truncate text-[11.5px]" style={{ color: P7.sec }}>{TIPO_CURTO[d.tipo_aviso]}</span>
                  <span
                    className="block h-2 rounded-full"
                    style={{ background: P7.futuro }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${nome(d)}: ${prog!.diaAtual} dias cumpridos, faltam ${prog!.faltam}`}
                  >
                    <span className="block h-2 rounded-full" style={{ width: `${pct}%`, background: P7.deep }} />
                  </span>
                  <span className="text-[11.5px]" style={{ color: P7.ink }}>{brCurto(d.ultimo_dia)}</span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-bold" style={{ color: P7.ink }}>
                    {urgente && <Icone k="warn" size={14} />}
                    {prog!.faltam} {prog!.faltam === 1 ? "dia" : "dias"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="mt-2 border-t pt-[9px] text-[11.5px]" style={{ borderColor: P7.grid, color: P7.sec }}>
          O aviso indenizado não tem contagem: vai direto para as rescisões.
        </div>
      </Cartao7>

      <Cartao7 className="flex flex-col">
        <Cabecalho
          titulo="Rescisões do mês"
          direita={
            <>
              <b>{aPagar}</b> a pagar · <b>{pagas}</b> {pagas === 1 ? "paga" : "pagas"}
            </>
          }
        />
        <div className="flex-1">
          <div>
            <div className="mb-1 grid gap-x-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ gridTemplateColumns: COLS_RESCISAO, ...COR_ROTULO }}>
              <div>Colaborador</div>
              <div>Tipo</div>
              <div>Pagar até</div>
              <div>Situação</div>
            </div>
            {rescisoes.length === 0 && (
              <p className="border-t py-3 text-[12.5px]" style={{ borderColor: P7.grid, color: P7.sec }}>
                Nenhuma rescisão neste mês.
              </p>
            )}
            {rescisoes.slice(0, 6).map(({ d, sit }) => {
              const k = K_DO_TOM[sit.tom];
              return (
                <Link
                  key={d.colaborador_id}
                  href={`/colaboradores/${d.colaborador_id}#desligamento`}
                  className="grid h-[34px] items-center gap-x-2.5 border-t hover:bg-[#f4f8f7]"
                  style={{ gridTemplateColumns: COLS_RESCISAO, borderColor: P7.grid, fontFamily: MANROPE }}
                >
                  <span className="truncate text-[12.5px] font-bold" style={{ color: P7.ink }}>
                    <Ponto cor={corDe(d)} redondo />
                    {nome(d)}
                  </span>
                  <span className="truncate text-[11.5px]" style={{ color: P7.sec }}>{TIPO_CURTO[d.tipo_aviso]}</span>
                  <span className="text-[11.5px] font-bold" style={{ color: P7.ink }}>{brCurto(d.prazo_pagamento)}</span>
                  <span>
                    {k ? (
                      <Selo k={k}>{sit.rotulo}</Selo>
                    ) : (
                      <span className="pl-1.5 text-[11.5px]" style={{ color: P7.sec }}>{sit.rotulo}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="mt-2 border-t pt-[9px] text-[11.5px]" style={{ borderColor: P7.grid, color: P7.sec }}>
          Prazo: até {PRAZO_PAGAMENTO_DIAS} dias corridos depois do último dia de trabalho.
        </div>
      </Cartao7>
    </div>
  );
}
