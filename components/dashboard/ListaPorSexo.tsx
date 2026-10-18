import { MANROPE, P7, nomeProprio } from "./tema7";

/** Lista de todos os colaboradores ativos do filtro, separados por sexo (feminino, masculino e sem sexo informado). */

export interface PessoaSexo {
  id: string;
  nome: string;
  empresa: string;
  tipo: string;
}

const FEM = "#c2417a";
const MAS = "#0f5c55";

function Coluna({ titulo, cor, lista, extra }: { titulo: string; cor: string; lista: PessoaSexo[]; extra?: string }) {
  return (
    <div className="min-w-0">
      <div className="border-b-2 pb-2 text-[16px] font-semibold" style={{ borderColor: P7.ink }}>
        <i className="mr-1.5 inline-block h-[12px] w-[12px] rounded-[3px]" style={{ background: cor }} />
        <b className="mr-1 text-[26px] font-extrabold tabular-nums">{lista.length}</b>
        {titulo}
      </div>
      <ul className="max-h-[480px] overflow-auto">
        {lista.length === 0 && (
          <li className="py-2 text-[13.5px]" style={{ color: P7.lab }}>
            Ninguém neste filtro.
          </li>
        )}
        {lista.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-3 border-b py-2 text-[14.5px]" style={{ borderColor: P7.grid }}>
            <span className="min-w-0 font-semibold">{nomeProprio(p.nome)}</span>
            <span className="shrink-0 text-[13px]" style={{ color: P7.lab }}>
              {[p.empresa, p.tipo].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      {extra && (
        <p className="mt-2 text-[12.5px]" style={{ color: P7.sec }}>
          {extra}
        </p>
      )}
    </div>
  );
}

export default function ListaPorSexo({
  fem,
  mas,
  sem,
  franqFem,
  franqMas,
}: {
  fem: PessoaSexo[];
  mas: PessoaSexo[];
  sem: PessoaSexo[];
  franqFem: number;
  franqMas: number;
}) {
  const total = fem.length + mas.length + sem.length;
  return (
    <details open className="mt-4 border-t pt-3" style={{ borderColor: P7.grid, fontFamily: MANROPE, color: P7.ink }}>
      <summary className="cursor-pointer text-[15px] font-bold" style={{ color: P7.deep }}>
        Ver todos os colaboradores por sexo ({total})
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
        <Coluna titulo="Feminino" cor={FEM} lista={fem} extra={franqFem > 0 ? `Mais ${franqFem} em franquias (não têm nome no sistema).` : undefined} />
        <Coluna titulo="Masculino" cor={MAS} lista={mas} extra={franqMas > 0 ? `Mais ${franqMas} em franquias (não têm nome no sistema).` : undefined} />
      </div>
      {sem.length > 0 && (
        <div className="mt-4 rounded-[10px] px-3.5 py-2.5 text-[13.5px]" style={{ background: "#fff6df" }}>
          <b>Sem sexo informado ({sem.length}):</b>{" "}
          {sem.map((p) => nomeProprio(p.nome)).join(", ")}. Complete o cadastro para eles entrarem na conta.
        </div>
      )}
    </details>
  );
}
