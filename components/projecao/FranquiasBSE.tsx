import { salvarFranquia, removerFranquia } from "@/lib/actions-franquias";

export type Franquia = { id: string; nome: string; qtd_clt: number; qtd_pj: number };

const FONTE = "'Oswald', 'Arial Narrow', sans-serif";

// Cadastro simples das franquias da BSE: nome + quantidade de CLT e de PJ.
// Esses números alimentam o cartão "BSE Franquias" do Painel de RH.
export default function FranquiasBSE({
  franquias,
  tabelaFaltando,
}: {
  franquias: Franquia[];
  tabelaFaltando: boolean;
}) {
  const totalClt = franquias.reduce((a, f) => a + (f.qtd_clt || 0), 0);
  const totalPj = franquias.reduce((a, f) => a + (f.qtd_pj || 0), 0);

  return (
    <div id="franquias" className="card space-y-5 scroll-mt-6">
      <div>
        <h2 style={{ fontFamily: FONTE }} className="font-semibold text-ink-900 text-xl">
          Franquias BSE
        </h2>
        <p className="text-ink-600 text-sm mt-1">
          Cadastre cada franquia com a quantidade de colaboradores CLT e PJ. Esses números alimentam o cartão
          &quot;BSE Franquias&quot; do Painel de RH.
        </p>
      </div>

      {tabelaFaltando && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          A tabela de franquias ainda não foi criada no Supabase. Rode o arquivo de criação da tabela (passo do SQL) e
          depois recarregue esta página.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Resumo rotulo="Franquias" valor={franquias.length} />
        <Resumo rotulo="Colaboradores CLT" valor={totalClt} />
        <Resumo rotulo="Colaboradores PJ" valor={totalPj} />
        <Resumo rotulo="Total em franquias" valor={totalClt + totalPj} destaque />
      </div>

      <form
        action={salvarFranquia}
        className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_auto] gap-3 items-end rounded-xl bg-brand-50 border border-brand-200/70 p-4"
      >
        <div>
          <label htmlFor="novo-nome" className="label">
            Nova franquia — nome
          </label>
          <input id="novo-nome" name="nome" required className="input" placeholder="Ex.: Franquia Contagem" />
        </div>
        <div>
          <label htmlFor="novo-clt" className="label">
            Qtd. CLT
          </label>
          <input id="novo-clt" name="qtd_clt" type="number" min={0} defaultValue={0} className="input" />
        </div>
        <div>
          <label htmlFor="novo-pj" className="label">
            Qtd. PJ
          </label>
          <input id="novo-pj" name="qtd_pj" type="number" min={0} defaultValue={0} className="input" />
        </div>
        <button type="submit" className="btn-cta">
          Adicionar
        </button>
      </form>

      {franquias.length === 0 ? (
        <p className="text-sm text-ink-600">Nenhuma franquia cadastrada ainda.</p>
      ) : (
        <ul className="divide-y divide-brand-200/70">
          {franquias.map((f) => (
            <li key={f.id} className="py-3 flex flex-wrap items-end gap-3">
              <form
                action={salvarFranquia}
                className="flex-1 min-w-[280px] grid grid-cols-1 sm:grid-cols-[1fr_110px_110px_auto] gap-3 items-end"
              >
                <input type="hidden" name="id" value={f.id} />
                <div>
                  <label htmlFor={`nome-${f.id}`} className="label">
                    Nome
                  </label>
                  <input id={`nome-${f.id}`} name="nome" required defaultValue={f.nome} className="input" />
                </div>
                <div>
                  <label htmlFor={`clt-${f.id}`} className="label">
                    CLT
                  </label>
                  <input id={`clt-${f.id}`} name="qtd_clt" type="number" min={0} defaultValue={f.qtd_clt} className="input" />
                </div>
                <div>
                  <label htmlFor={`pj-${f.id}`} className="label">
                    PJ
                  </label>
                  <input id={`pj-${f.id}`} name="qtd_pj" type="number" min={0} defaultValue={f.qtd_pj} className="input" />
                </div>
                <button type="submit" className="btn-primary">
                  Salvar
                </button>
              </form>

              <details className="pb-1">
                <summary className="text-sm text-red-700 cursor-pointer hover:underline select-none">Remover</summary>
                <form action={removerFranquia} className="mt-2">
                  <input type="hidden" name="id" value={f.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-red-700 text-white text-sm font-medium px-3 py-1.5 hover:bg-red-800 transition-colors"
                  >
                    Confirmar remoção de {f.nome}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        destaque ? "bg-brand-400 border-brand-400 text-ink-900" : "bg-white border-brand-200/70 text-ink-900"
      }`}
    >
      <p className="text-xs text-ink-800">{rotulo}</p>
      <p style={{ fontFamily: FONTE }} className="text-3xl font-semibold leading-tight">
        {valor}
      </p>
    </div>
  );
}
