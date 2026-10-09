import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { Cartao, TituloCartao, Pilula, type Tom as TomPainel } from "@/components/dashboard/Blocos";
import { ROTULO_TIPO_AVISO, faixaDesligamento, hojeBrasilia, type Desligamento, type Tom } from "@/lib/desligamento";

const TOM_PAINEL: Record<Tom, TomPainel> = {
  atrasado: "red",
  atencao: "orange",
  ok: "green",
  feito: "green",
  neutro: "off",
};

/**
 * Painel de RH: lista de quem está em desligamento e ainda tem pagamento ou
 * homologação pendente, do mais urgente para o menos urgente. Se não houver
 * ninguém (ou a tabela ainda não existir), não mostra nada.
 */
export default async function AvisosDesligamentoPainel() {
  if (await souAssistente()) return null;

  const supabase = createClient();
  const { data, error } = await supabase.from("desligamentos").select("*");
  if (error || !data || data.length === 0) return null;

  const hoje = hojeBrasilia();
  const itens = (data as Desligamento[])
    .map((d) => ({ d, faixa: faixaDesligamento(d, hoje) }))
    .filter((i) => i.faixa.ordem < 9999)
    .sort((a, b) => a.faixa.ordem - b.faixa.ordem)
    .slice(0, 8);
  if (itens.length === 0) return null;

  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, nome")
    .in(
      "id",
      itens.map((i) => i.d.colaborador_id)
    );
  const nomePorId = new Map(((colabs ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  const atrasados = itens.filter((i) => i.faixa.tom === "atrasado").length;

  return (
    <Cartao>
      <TituloCartao
        direita={
          atrasados > 0 ? (
            <Pilula tom="red">
              {atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}
            </Pilula>
          ) : undefined
        }
      >
        Desligamentos: pagamento e homologação
      </TituloCartao>
      <ul className="divide-y divide-[#f4ebe1]">
        {itens.map(({ d, faixa }) => (
          <li key={d.colaborador_id} className="py-2.5">
            <Link
              href={`/colaboradores/${d.colaborador_id}#desligamento`}
              className="flex items-center justify-between gap-3 group"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#262626] truncate">
                  {nomePorId.get(d.colaborador_id) ?? "Colaborador"}{" "}
                  <span className="font-normal text-[#737373]">· {ROTULO_TIPO_AVISO[d.tipo_aviso]}</span>
                </span>
                <span className="block text-[12px] text-[#737373] truncate">{faixa.titulo}</span>
              </span>
              <Pilula tom={TOM_PAINEL[faixa.tom]}>
                {!/^\d+$/.test(faixa.numero) ? "Marcar" : faixa.tom === "atrasado" ? `${faixa.numero}d atraso` : `${faixa.numero}d`} ›
              </Pilula>
            </Link>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
