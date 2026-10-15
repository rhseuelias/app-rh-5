import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import {
  PRAZO_PAGAMENTO_DIAS,
  brCurto,
  hojeBrasilia,
  situacaoPagamento,
  type Desligamento,
  type TipoAviso,
  type Tom as TomDeslig,
} from "@/lib/desligamento";
import {
  Cartao7,
  Icone,
  Ponto,
  Titulo7,
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

const COLS_RESCISAO = "minmax(140px,1.6fr) 100px 56px minmax(140px,1.3fr)";

/**
 * Quadro "Rescisões do mês" (pagamento das verbas). Usa a tabela `desligamentos`.
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
    <Cartao7 className="flex flex-col">
      <Titulo7
        sub={`Prazo: até ${PRAZO_PAGAMENTO_DIAS} dias corridos depois do último dia de trabalho`}
        direita={
          <>
            <b>{aPagar}</b> a pagar · <b>{pagas}</b> {pagas === 1 ? "paga" : "pagas"}
          </>
        }
      >
        Rescisões do mês
      </Titulo7>
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-[460px]">
          <div className={`mb-1 grid gap-x-3 ${ROTULO_COLUNA}`} style={{ gridTemplateColumns: COLS_RESCISAO, ...COR_ROTULO }}>
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
          {rescisoes.slice(0, 7).map(({ d, sit }) => {
            const k = K_DO_TOM[sit.tom];
            return (
              <Link
                key={d.colaborador_id}
                href={`/colaboradores/${d.colaborador_id}#desligamento`}
                className="grid h-[34px] items-center gap-x-3 border-t hover:bg-[#f4f8f7]"
                style={{ gridTemplateColumns: COLS_RESCISAO, borderColor: P7.grid, fontFamily: MANROPE }}
              >
                <span className="truncate text-[12.5px] font-semibold" style={{ color: P7.ink }}>
                  <Ponto cor={corDe(d)} redondo />
                  {nome(d)}
                </span>
                <span className="truncate text-[11.5px]" style={{ color: P7.sec }}>{TIPO_CURTO[d.tipo_aviso]}</span>
                <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: P7.ink }}>{brCurto(d.prazo_pagamento)}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px]" style={{ color: P7.ink }}>
                  {k && <Icone k={k} />}
                  {sit.rotulo}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </Cartao7>
  );
}
