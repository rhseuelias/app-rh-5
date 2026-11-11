import Link from "next/link";
import { Gauge, semPorMeta } from "./Semaforo";
import { Cartao7, Titulo7, MANROPE, P7, ROTULO_COLUNA } from "./tema7";
import { salvarTreinamentoEquipe } from "@/lib/actions-treinamento-equipe";

/** Treinamento da equipe por quadrimestre (medidores). Os valores são lançados à mão. */

export const EQUIPES = [
  { slug: "barbeiros", nome: "Barbeiros" },
  { slug: "atendimento", nome: "Atendimento" },
  { slug: "limpeza", nome: "Limpeza" },
  { slug: "lideranca", nome: "Liderança" },
] as const;

export type LancamentoEquipe = { pct: number; participaram: number | null; total: number | null };

const QUADS = [
  { q: 1, nome: "1º quadrimestre", meses: "jan a abr" },
  { q: 2, nome: "2º quadrimestre", meses: "mai a ago" },
  { q: 3, nome: "3º quadrimestre", meses: "set a dez" },
];

export default function TreinamentoEquipe({
  ano,
  quad,
  meta,
  dados,
  links,
  podeEditar,
  tabelaPronta,
}: {
  ano: number;
  quad: number;
  meta: number;
  dados: Record<string, LancamentoEquipe | undefined>;
  links: { q: number; href: string }[] | null;
  podeEditar: boolean;
  tabelaPronta: boolean;
}) {
  const q = QUADS.find((x) => x.q === quad) ?? QUADS[2];
  const informados = EQUIPES.map((e) => dados[e.slug]).filter((d): d is LancamentoEquipe => !!d);
  const media = informados.length > 0 ? informados.reduce((a, d) => a + d.pct, 0) / informados.length : null;
  const naMeta = informados.filter((d) => semPorMeta(d.pct, meta) === "bom").length;
  const campo = "w-full rounded-[8px] border bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums";

  return (
    <Cartao7>
      <Titulo7
        sub={`${q.nome} de ${ano} (${q.meses}) · Meta: acima de ${meta}%`}
        direita={
          media === null
            ? "Nenhuma equipe lançada"
            : `Média ${Math.round(media)}% · ${naMeta} de ${EQUIPES.length} equipes na meta`
        }
      >
        Treinamento da equipe
      </Titulo7>

      {links && (
        <div className="mb-3 flex flex-wrap gap-2">
          {links.map((l) => {
            const ativo = l.q === quad;
            return (
              <Link
                key={l.q}
                href={l.href}
                className="rounded-full border px-3 py-[5px] text-[11.5px] font-bold"
                style={{
                  borderColor: ativo ? P7.deep : P7.bd,
                  background: ativo ? P7.deep : "#fff",
                  color: ativo ? "#fff" : P7.deep,
                  fontFamily: MANROPE,
                }}
              >
                {l.q}º quadrimestre
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
        {EQUIPES.map((e) => {
          const d = dados[e.slug];
          const nota = d && d.participaram !== null && d.total !== null ? `${d.participaram} de ${d.total} participaram` : undefined;
          return <Gauge key={e.slug} titulo={e.nome} pct={d ? d.pct : null} meta={meta} nota={nota} />;
        })}
      </div>

      {podeEditar && (
        <details className="mt-4 border-t pt-3" style={{ borderColor: P7.grid }}>
          <summary className="cursor-pointer text-[11.5px] font-bold" style={{ color: P7.deep, fontFamily: MANROPE }}>
            Lançar treinamento do {q.nome.toLowerCase()}
          </summary>

          {!tabelaPronta && (
            <p className="mt-3 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "#fbe4e4", color: "#a52828" }}>
              Para salvar, rode primeiro o arquivo <b>migration_056_treinamento_equipe.sql</b> no SQL Editor do Supabase.
            </p>
          )}

          <form action={salvarTreinamentoEquipe} className="mt-3" style={{ fontFamily: MANROPE }}>
            <input type="hidden" name="ano" value={ano} />
            <input type="hidden" name="quad" value={quad} />
            <p className="mb-2 text-[11.5px]" style={{ color: P7.sec }}>
              Digite a porcentagem de cada equipe. Se preferir, preencha quantos participaram e o total e o app calcula a porcentagem. Deixe tudo em branco para apagar o lançamento da equipe.
            </p>
            <div className="overflow-x-auto">
              <div className="min-w-[460px]">
                <div
                  className={`mb-1 grid gap-x-3 ${ROTULO_COLUNA}`}
                  style={{ gridTemplateColumns: "120px 1fr 1fr 1fr", color: P7.lab }}
                >
                  <div>Equipe</div>
                  <div>Porcentagem (%)</div>
                  <div>Participaram</div>
                  <div>Total</div>
                </div>
                {EQUIPES.map((e) => {
                  const d = dados[e.slug];
                  return (
                    <div
                      key={e.slug}
                      className="grid items-center gap-x-3 border-t py-1.5"
                      style={{ gridTemplateColumns: "120px 1fr 1fr 1fr", borderColor: P7.grid }}
                    >
                      <div className="text-[12.5px] font-bold" style={{ color: P7.ink }}>
                        {e.nome}
                      </div>
                      <input type="number" min={0} max={100} step="0.1" name={`pct_${e.slug}`} defaultValue={d ? d.pct : ""} className={campo} style={{ borderColor: P7.bd }} aria-label={`${e.nome}: porcentagem`} />
                      <input type="number" min={0} name={`part_${e.slug}`} defaultValue={d?.participaram ?? ""} className={campo} style={{ borderColor: P7.bd }} aria-label={`${e.nome}: participaram`} />
                      <input type="number" min={0} name={`total_${e.slug}`} defaultValue={d?.total ?? ""} className={campo} style={{ borderColor: P7.bd }} aria-label={`${e.nome}: total`} />
                    </div>
                  );
                })}
              </div>
            </div>
            <button type="submit" className="mt-3 rounded-full px-4 py-[7px] text-[12px] font-bold text-white" style={{ background: P7.deep }}>
              Salvar treinamento
            </button>
          </form>
        </details>
      )}
    </Cartao7>
  );
}
