import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import type { Colaborador, Empresa, EtapaProcesso, ProcessoIntegracao } from "@/types/db";
import { etapaAtrasada } from "@/lib/calculos";
import { Cartao, TituloCartao, Pilula, Vazio, CABECALHO_TABELA, LINK_SUTIL, INTER, type Tom } from "./Blocos";

// Versão resumida do Painel de Integração para o Dashboard.
// Usa o mesmo agrupamento das 11 etapas em 6 colunas do painel completo.
const GRUPOS = ["Cadastro", "Exame", "Documentação", "Treinamento", "Integração", "Efetivação"];

type Estado = "done" | "progress" | "late" | "attention" | "pending" | "na";
type Status = "atrasado" | "atencao" | "andamento" | "dentro" | "naoiniciado";

const STATUS_INFO: Record<Status, { label: string; tom: Tom; prioridade: number }> = {
  atrasado: { label: "Atrasado", tom: "red", prioridade: 0 },
  atencao: { label: "Atenção", tom: "orange", prioridade: 1 },
  andamento: { label: "No prazo", tom: "green", prioridade: 2 },
  dentro: { label: "No prazo", tom: "green", prioridade: 3 },
  naoiniciado: { label: "Não iniciado", tom: "off", prioridade: 4 },
};

// bolinha de cada etapa: cores do guia de design
const NO_ESTILO: Record<Estado, { background: string; borderColor: string; borderStyle?: string }> = {
  done: { background: "#2f9e6b", borderColor: "#2f9e6b" },
  progress: { background: "#fff", borderColor: "#3d3d3d" },
  late: { background: "#d92d20", borderColor: "#d92d20" },
  attention: { background: "#f0913f", borderColor: "#f0913f" },
  pending: { background: "#fff", borderColor: "#e7ddd2" },
  na: { background: "#fff", borderColor: "#e7ddd2", borderStyle: "dashed" },
};
const COR_LINHA_FEITA = "#2f9e6b";
const COR_LINHA = "#f0e8df";

const COLUNAS = "220px repeat(6,minmax(76px,1fr)) 110px";

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
}: {
  processos: ProcessoIntegracao[];
  etapas: EtapaProcesso[];
  colaboradores: Colaborador[];
  empresas: Empresa[];
  maximo?: number;
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
    <Cartao>
      <TituloCartao
        direita={
          <Link href="/onboarding" className={LINK_SUTIL}>
            Ver painel completo{restantes > 0 ? ` (+${restantes})` : ""}
          </Link>
        }
      >
        Integração de novos colaboradores
      </TituloCartao>

      {visiveis.length === 0 ? (
        <Vazio>Ninguém em processo de integração no momento.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div
              className={`grid items-center border-b border-[#f4ebe1] pb-2 ${CABECALHO_TABELA}`}
              style={{ gridTemplateColumns: COLUNAS }}
            >
              <div>Colaborador</div>
              {GRUPOS.map((g) => (
                <div key={g} className="text-center">
                  {g}
                </div>
              ))}
              <div className="text-right">Status</div>
            </div>

            {visiveis.map((l) => {
              const st = STATUS_INFO[l.status];
              return (
                <div
                  key={l.id}
                  className="grid items-center border-b border-[#f4ebe1] last:border-b-0"
                  style={{ gridTemplateColumns: COLUNAS }}
                >
                  <div className="min-w-0 py-3 pr-3">
                    <Link
                      href={`/onboarding/${l.colaboradorId}`}
                      className="block text-[13px] font-semibold text-[#262626] truncate hover:underline"
                    >
                      {l.nome}
                    </Link>
                    <p className="text-[12px] text-[#737373] truncate">{l.detalhe}</p>
                  </div>

                  {l.grupos.map((g, i) => (
                    <div
                      key={g.nome}
                      className="relative flex flex-col items-center pt-3 pb-2"
                      title={`${g.nome}: ${g.estado}`}
                    >
                      {i > 0 && (
                        <span
                          className="absolute left-0 top-[19px] h-[2px] w-1/2"
                          style={{ background: l.grupos[i - 1].estado === "done" ? COR_LINHA_FEITA : COR_LINHA }}
                        />
                      )}
                      {i < l.grupos.length - 1 && (
                        <span
                          className="absolute right-0 top-[19px] h-[2px] w-1/2"
                          style={{ background: g.estado === "done" ? COR_LINHA_FEITA : COR_LINHA }}
                        />
                      )}
                      <span
                        className="relative z-[1] w-4 h-4 rounded-full border-2"
                        style={NO_ESTILO[g.estado]}
                      />
                      <span
                        className="mt-1 text-[12px] min-h-[16px] tabular-nums"
                        style={{
                          color: g.estado === "late" ? "#b42318" : g.estado === "progress" ? "#262626" : "#737373",
                          fontFamily: INTER,
                          fontWeight: g.estado === "late" ? 600 : 500,
                        }}
                      >
                        {g.sub || (g.estado === "progress" ? "em curso" : "")}
                      </span>
                    </div>
                  ))}

                  <div className="flex justify-end">
                    <Pilula tom={st.tom}>{st.label}</Pilula>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Cartao>
  );
}
