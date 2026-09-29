import { createClient } from "@/lib/supabase-server";
import type { Colaborador, Empresa, Unidade } from "@/types/db";

/** Mês (0-11) e dia extraídos direto do texto "yyyy-MM-dd" — nunca via
 * new Date(texto).getMonth()/.getDate(), que depende do fuso de quem tá
 * rodando o código e pode cair no dia/mês anterior. */
function mesDia(dataISO: string): { mes: number; dia: number } {
  const [, mes, dia] = dataISO.slice(0, 10).split("-").map(Number);
  return { mes: mes - 1, dia };
}

export const dynamic = "force-dynamic";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// cores das etiquetas de unidade (a mesma unidade sempre tem a mesma cor)
const CORES_UNIDADE = [
  "bg-blue-100 text-blue-900",
  "bg-pink-100 text-pink-900",
  "bg-green-100 text-green-900",
  "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-900",
  "bg-orange-100 text-orange-900",
  "bg-cyan-100 text-cyan-900",
  "bg-slate-200 text-slate-900",
];

function corDaUnidade(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return CORES_UNIDADE[h % CORES_UNIDADE.length];
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

const dd = (n: number) => String(n).padStart(2, "0");

interface Aniversariante {
  id: string;
  nome: string;
  dia: number;
  mes: number;
  local: string;
  marco: string | null;
}

export default async function AniversariosPage() {
  const supabase = createClient();
  const [{ data }, { data: empresas }, { data: unidades }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("*")
      .not("data_nascimento", "is", null)
      .in("status", ["ativo", "experiencia"]),
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
  ]);

  const colaboradores = (data ?? []) as Colaborador[];
  const nomeEmpresaPorId = Object.fromEntries(
    ((empresas ?? []) as Empresa[]).map((e) => [e.id, e.nome])
  );
  const nomeUnidadePorId = Object.fromEntries(
    ((unidades ?? []) as Unidade[]).map((u) => [u.id, u.nome])
  );

  // "hoje" no horário de Brasília (o servidor roda em UTC)
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  const anoHoje = partes[0];
  const mesHoje = partes[1] - 1;
  const diaHoje = partes[2];

  // tempo de casa: marcos de 1, 5, 10, 15 e 20 anos
  function marco(c: Colaborador): string | null {
    if (!c.data_admissao) return null;
    const anos = anoHoje - Number(c.data_admissao.slice(0, 4));
    if ([1, 5, 10, 15, 20].includes(anos)) return `${anos} ano${anos > 1 ? "s" : ""} de empresa`;
    return null;
  }

  const lista: Aniversariante[] = colaboradores.map((c) => {
    const { mes, dia } = mesDia(c.data_nascimento!);
    const unidade = c.unidade_id ? nomeUnidadePorId[c.unidade_id] : undefined;
    const empresa = c.empresa_id ? nomeEmpresaPorId[c.empresa_id] : undefined;
    return {
      id: c.id,
      nome: c.nome,
      dia,
      mes,
      local: unidade ?? empresa ?? "—",
      marco: marco(c),
    };
  });

  const porMes: Aniversariante[][] = MESES.map((_, i) =>
    lista
      .filter((a) => a.mes === i)
      .sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt-BR"))
  );

  const doMesAtual = porMes[mesHoje];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Aniversários</h1>
        <p className="text-slate-500 text-sm">
          Aniversariantes de cada mês, com a data e a unidade. Marcos de tempo de casa (1, 5, 10, 15, 20 anos) aparecem
          em rosa.
        </p>
      </div>

      {lista.length === 0 ? (
        <div className="card text-center text-slate-400 py-10">
          Nenhuma data de nascimento cadastrada ainda.
        </div>
      ) : (
        <>
          {/* MÊS ATUAL EM DESTAQUE */}
          <section className="rounded-2xl p-5 sm:p-6 text-white bg-gradient-to-br from-ink-900 to-ink-700 shadow-card">
            <h2 className="text-2xl font-bold">
              🎉 {MESES[mesHoje]} — {doMesAtual.length} aniversariante{doMesAtual.length === 1 ? "" : "s"}
            </h2>
            <p className="text-slate-300 text-sm mb-4">Aniversariantes do mês atual</p>

            {doMesAtual.length === 0 ? (
              <p className="text-slate-300">Ninguém faz aniversário neste mês.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {doMesAtual.map((a) => {
                  const ehHoje = a.dia === diaHoje;
                  return (
                    <div
                      key={a.id}
                      className={`bg-white text-slate-900 rounded-2xl p-3 flex items-center gap-3 ${
                        ehHoje ? "ring-4 ring-gold-400" : ""
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-brand-500 text-white font-extrabold flex items-center justify-center shrink-0">
                        {iniciais(a.nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold leading-tight">{a.nome}</p>
                        <p className="text-sm text-slate-600 font-semibold mt-0.5">
                          {ehHoje ? "🎂 Hoje! " : ""}Dia {dd(a.dia)}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${corDaUnidade(a.local)}`}>
                            {a.local}
                          </span>
                          {a.marco && (
                            <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-pink-100 text-pink-800">
                              {a.marco}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* OS OUTROS MESES */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {MESES.map((nomeMes, i) => {
              if (i === mesHoje) return null;
              const pessoas = porMes[i];
              return (
                <div key={nomeMes} className="card !p-4">
                  <h3 className="flex items-center justify-between font-bold text-slate-900 mb-2">
                    <span>{nomeMes}</span>
                    <span className="text-brand-700">{pessoas.length}</span>
                  </h3>
                  {pessoas.length === 0 ? (
                    <p className="text-sm text-slate-400 border-t border-dashed border-slate-200 pt-2">
                      Sem aniversariantes
                    </p>
                  ) : (
                    pessoas.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-2 text-sm py-1.5 border-t border-dashed border-slate-200"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 leading-tight">{a.nome}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${corDaUnidade(a.local)}`}>
                              {a.local}
                            </span>
                            {a.marco && (
                              <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-pink-100 text-pink-800">
                                {a.marco}
                              </span>
                            )}
                          </div>
                        </div>
                        <b className="text-brand-700 text-base shrink-0">{dd(a.dia)}</b>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
