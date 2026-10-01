import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import type { Colaborador, Empresa, EtapaProcesso, ProcessoIntegracao } from "@/types/db";
import { etapaAtrasada } from "@/lib/calculos";

// Versão resumida do Painel de Integração para o Dashboard.
// Usa o mesmo agrupamento das 11 etapas em 6 colunas do painel completo.
const GRUPOS = ["Cadastro", "Exame", "Documentação", "Treinamento", "Integração", "Efetivação"];

type Estado = "done" | "progress" | "late" | "attention" | "pending" | "na";
type Status = "atrasado" | "atencao" | "andamento" | "dentro" | "naoiniciado";

const STATUS_INFO: Record<Status, { label: string; classe: string; barra: string; prioridade: number }> = {
  atrasado: { label: "Atrasado", classe: "bg-red-100 text-red-800", barra: "bg-red-600", prioridade: 0 },
  atencao: { label: "Atenção", classe: "bg-amber-100 text-amber-800", barra: "bg-amber-500", prioridade: 1 },
  andamento: { label: "Em andamento", classe: "bg-blue-100 text-blue-800", barra: "bg-blue-600", prioridade: 2 },
  dentro: { label: "Dentro do prazo", classe: "bg-emerald-100 text-emerald-800", barra: "bg-emerald-600", prioridade: 3 },
  naoiniciado: { label: "Não iniciado", classe: "bg-stone-200 text-stone-700", barra: "bg-stone-400", prioridade: 4 },
};

const NO_CLASSE: Record<Estado, string> = {
  done: "bg-emerald-600 border-emerald-600 text-white",
  progress: "bg-white border-blue-600",
  late: "bg-red-600 border-red-600 text-white",
  attention: "bg-amber-500 border-amber-500 text-white",
  pending: "bg-white border-brand-200",
  na: "bg-white border-dashed border-stone-300 text-stone-400",
};

const COLUNAS = "minmax(150px,1.3fr) repeat(6,minmax(58px,1fr)) 64px 116px";

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseData(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtCurta(s?: string | null): string {
  const d = parseData(s);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "";
}

function feita(e: EtapaProcesso) {
  return e.status === "realizado" || e.status === "em_experiencia";
}

function indiceGrupo(e: EtapaProcesso, posicao: number, total: number): number {
  const t = normalizar(`${e.chave} ${e.nome}`);
  if (t.includes("exame")) return 1;
  if (t.includes("pesquisa")) return 4;
  if (t.includes("onboarding")) return 3;
  if (t.includes("avalia") || t.includes("efetiv")) return 5;
  if (t.includes("experiencia")) return 4;
  if (t.includes("cadastro")) return 0;
  if (t.includes("vale") || t.includes("transporte") || t.includes("benef") || t.includes("contrato") || t.includes("admissao")) {
    return 2;
  }
  return Math.min(5, Math.floor((posicao / Math.max(total, 1)) * 6));
}

export default function TimelineResumo({
  processos,
  etapas,
  colaboradores,
  empresas,
  maximo = 5,
  fonteDisplay,
}: {
  processos: ProcessoIntegracao[];
  etapas: EtapaProcesso[];
  colaboradores: Colaborador[];
  empresas: Empresa[];
  maximo?: number;
  fonteDisplay: string;
}) {
  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diasAte = (s?: string | null): number | null => {
    const d = parseData(s);
    return d ? differenceInCalendarDays(d, hojeLocal) : null;
  };

  const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  const etapasPorProcesso = new Map<string, EtapaProcesso[]>();
  for (const e of etapas) {
    if (!etapasPorProcesso.has(e.processo_id)) etapasPorProcesso.set(e.processo_id, []);
    etapasPorProcesso.get(e.processo_id)!.push(e);
  }

  // Efetivado(a) e Não efetivado(a) não aparecem aqui
  const ativos = processos.filter(
    (p) => !p.arquivado && (p.status_geral === "integracao" || p.status_geral === "experiencia")
  );

  const linhas = ativos.map((p) => {
    const colaborador = colaboradorPorId.get(p.colaborador_id);
    const empresa = colaborador?.empresa_id ? empresaPorId.get(colaborador.empresa_id) : undefined;
    const lista = (etapasPorProcesso.get(p.id) ?? []).slice().sort((a, b) => a.ordem - b.ordem);
    const porGrupo: EtapaProcesso[][] = GRUPOS.map(() => []);
    lista.forEach((e, i) => porGrupo[indiceGrupo(e, i, lista.length)].push(e));

    const grupos = GRUPOS.map((nome, gi) => {
      const es = porGrupo[gi];
      if (es.length === 0) return { nome, estado: "na" as Estado, sub: "" };
      const todas = es.every((e) => e.status === "realizado");
      const atrasada = es.some((e) => etapaAtrasada(e.prazo, e.status));
      const aberta = es.find((e) => !feita(e) && !e.bloqueada);
      const d = aberta ? diasAte(aberta.prazo) : null;
      const atencao =
        !atrasada &&
        aberta !== undefined &&
        (aberta.status === "em_andamento" || aberta.status === "pendente") &&
        d !== null &&
        d >= 0 &&
        d <= 2;
      const emCurso = es.some((e) => e.status === "em_andamento" || e.status === "em_experiencia");
      const parcial = es.some(feita) && es.some((e) => !feita(e));
      let estado: Estado;
      if (todas) estado = "done";
      else if (atrasada) estado = "late";
      else if (atencao) estado = "attention";
      else if (emCurso || parcial) estado = "progress";
      else estado = "pending";

      let sub = "";
      if (estado === "done") {
        const datas = es.map((e) => e.data_conclusao).filter(Boolean) as string[];
        sub = fmtCurta(datas.sort().pop());
      } else if (estado === "late" || estado === "attention" || estado === "progress") {
        const alvo = es.find((e) => !feita(e) && e.prazo) ?? aberta;
        sub = alvo?.prazo ? `até ${fmtCurta(alvo.prazo)}` : "";
      }
      return { nome, estado, sub };
    });

    const atual =
      lista.find((e) => !feita(e) && !e.bloqueada) ?? lista.find((e) => e.status === "em_experiencia") ?? null;
    const concluidas = grupos.filter((g) => g.estado === "done").length;
    const temFeito = grupos.some((g) => g.estado === "done");
    const temCurso = grupos.some((g) => g.estado === "progress");
    let status: Status;
    if (grupos.some((g) => g.estado === "late")) status = "atrasado";
    else if (grupos.some((g) => g.estado === "attention")) status = "atencao";
    else if (!temFeito && !temCurso) status = "naoiniciado";
    else {
      const d = atual ? diasAte(atual.prazo) : null;
      status = d !== null && d < 5 ? "andamento" : "dentro";
    }

    return {
      id: p.id,
      colaboradorId: p.colaborador_id,
      nome: colaborador?.nome ?? "—",
      detalhe: [colaborador?.cargo, empresa?.nome].filter(Boolean).join(" · "),
      grupos,
      concluidas,
      status,
    };
  });

  linhas.sort(
    (a, b) =>
      STATUS_INFO[a.status].prioridade - STATUS_INFO[b.status].prioridade || a.nome.localeCompare(b.nome, "pt-BR")
  );
  const visiveis = linhas.slice(0, maximo);
  const restantes = linhas.length - visiveis.length;

  return (
    <div className="card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 style={{ fontFamily: fonteDisplay }} className="font-semibold text-ink-900 text-lg">
          Painel de Integração
        </h2>
        <Link href="/onboarding" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          Ver painel completo{restantes > 0 ? ` (+${restantes})` : ""} →
        </Link>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-sm text-ink-600">Ninguém em processo de integração no momento.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className="grid items-center bg-brand-50 rounded-md text-[11px] font-medium text-ink-600 mb-0.5"
              style={{ gridTemplateColumns: COLUNAS }}
            >
              <div className="py-1.5 pl-2">Colaborador</div>
              {GRUPOS.map((g) => (
                <div key={g} className="py-1.5 text-center">
                  {g}
                </div>
              ))}
              <div className="py-1.5 text-center">Progresso</div>
              <div className="py-1.5 text-center">Status</div>
            </div>

            {visiveis.map((l) => {
              const st = STATUS_INFO[l.status];
              return (
                <div
                  key={l.id}
                  className="grid items-center border-b border-brand-200/70 last:border-b-0 hover:bg-brand-50 transition-colors"
                  style={{ gridTemplateColumns: COLUNAS }}
                >
                  <div className="min-w-0 pl-2 py-1.5">
                    <Link
                      href={`/onboarding/${l.colaboradorId}`}
                      className="block text-sm font-medium text-ink-900 truncate hover:underline"
                    >
                      {l.nome}
                    </Link>
                    <p className="text-[11px] text-ink-600 truncate">{l.detalhe}</p>
                  </div>

                  {l.grupos.map((g, i) => (
                    <div key={g.nome} className="relative flex flex-col items-center pt-2 pb-1.5" title={`${g.nome}: ${g.estado}`}>
                      {i > 0 && (
                        <span
                          className={`absolute left-0 top-[17px] h-0.5 w-1/2 ${
                            l.grupos[i - 1].estado === "done" ? "bg-emerald-600" : "bg-brand-200"
                          }`}
                        />
                      )}
                      {i < l.grupos.length - 1 && (
                        <span
                          className={`absolute right-0 top-[17px] h-0.5 w-1/2 ${
                            g.estado === "done" ? "bg-emerald-600" : "bg-brand-200"
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-[1] w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[10px] font-semibold ${NO_CLASSE[g.estado]}`}
                      >
                        {g.estado === "done" && "✓"}
                        {g.estado === "progress" && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                        {(g.estado === "late" || g.estado === "attention") && "!"}
                        {g.estado === "na" && "–"}
                      </span>
                      <span className={`text-[10px] min-h-[13px] ${g.estado === "late" ? "text-red-600 font-medium" : "text-ink-600"}`}>
                        {g.sub}
                      </span>
                    </div>
                  ))}

                  <div className="px-1.5">
                    <p className="text-[11px] text-ink-800 text-center">{l.concluidas}/6</p>
                    <span className="block h-1 rounded-full bg-stone-200 overflow-hidden mt-0.5">
                      <span className={`block h-full rounded-full ${st.barra}`} style={{ width: `${Math.round((l.concluidas / 6) * 100)}%` }} />
                    </span>
                  </div>

                  <div className="flex justify-center px-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${st.classe}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
