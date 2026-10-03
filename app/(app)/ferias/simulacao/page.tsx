import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { addDays } from "date-fns";
import type { Colaborador, Empresa, Unidade, Ferias, PeriodoAquisitivo, Feriado, CenarioSimulacao } from "@/types/db";
import { formatarDataBR } from "@/lib/calculos";
import { detectarConflitos, respeitaRegraInicio, paraSetDeDatas, semanasEnvolvidas } from "@/lib/ferias-calculos";
import { normalizarConfig, calcularSaldo, unidadesDoCenario, unidadeNoEscopo } from "@/lib/simulacao-ferias";
import { criarCenario } from "@/lib/actions";
import { souAssistente } from "@/lib/permissoes";
import { fDM, fDMA } from "@/lib/ferias-regras";
import ExcluirCenarioBotao from "@/components/ferias/ExcluirCenarioBotao";
import EmpresaUnidadesNovo from "@/components/ferias/EmpresaUnidadesNovo";
import SimulacaoWorkspace, {
  type PessoaSim,
  type PendenciaSim,
} from "@/components/ferias/SimulacaoWorkspace";

export const dynamic = "force-dynamic";

const INTER = "'Inter', ui-sans-serif, system-ui, sans-serif";
const OSWALD = "'Oswald', 'Arial Narrow', sans-serif";

function chaveDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dia10(s: string): string {
  return String(s).slice(0, 10);
}

/** Motivo (em português) de uma data de início ser recusada pela regra da CLT. */
function motivoInicioInvalido(iso: string, feriadosChave: Set<string>): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const dow = new Date(base).getUTCDay();
  if (dow === 5) return "cai numa sexta-feira";
  if (dow === 6) return "cai num sábado";
  for (let i = 1; i <= 2; i++) {
    const outro = new Date(base + i * 86400000).toISOString().slice(0, 10);
    if (feriadosChave.has(outro)) return `começa a menos de 2 dias de um feriado (${fDM(outro)})`;
  }
  return "não é um dia de início permitido";
}

export default async function SimulacaoFeriasPage({
  searchParams,
}: {
  searchParams: { cenario?: string; view?: string };
}) {
  const supabase = createClient();

  const [{ data: empresasData }, { data: unidadesData }, { data: cenariosData }] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("unidades").select("*"),
    supabase.from("cenarios_simulacao").select("*").order("created_at", { ascending: false }),
  ]);
  const empresas = (empresasData ?? []) as Empresa[];
  const unidades = (unidadesData ?? []) as Unidade[];
  const cenarios = (cenariosData ?? []) as CenarioSimulacao[];
  const nomeEmpresa = Object.fromEntries(empresas.map((e) => [e.id, e.nome]));
  const nomeUnidade = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));

  const rotuloUnidades = (c: CenarioSimulacao) => {
    const ids = unidadesDoCenario(c, normalizarConfig(c.config));
    return ids.length ? ids.map((id) => nomeUnidade[id] ?? "—").join(", ") : "Todas as unidades";
  };

  const cenarioId = searchParams.cenario ?? null;
  const cenarioAtual = cenarioId ? cenarios.find((c) => c.id === cenarioId) ?? null : null;

  // ------------------------------------------------------------
  // MODO GALERIA — nenhum cenário selecionado
  // ------------------------------------------------------------
  if (!cenarioAtual) {
    const anoBase = new Date().getFullYear();
    const campo = {
      fontFamily: INTER,
      fontSize: 13,
      padding: "9px 12px",
      border: "1px solid #e7ddd2",
      borderRadius: 8,
      background: "#fff",
      color: "#262626",
    } as const;
    const rotulo = {
      fontFamily: INTER,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "#737373",
    } as const;

    return (
      <div className="max-w-[1320px] mx-auto flex flex-col gap-5" style={{ fontFamily: INTER, color: "#262626" }}>
        <div className="flex flex-col gap-2">
          <Link href="/ferias" style={{ fontSize: 12, fontWeight: 500, color: "#b85c12" }} className="hover:underline">
            ← Férias
          </Link>
          <h1
            style={{
              margin: 0,
              fontFamily: OSWALD,
              fontWeight: 600,
              fontSize: 32,
              lineHeight: 1,
              textTransform: "uppercase",
              letterSpacing: ".02em",
            }}
          >
            Simulação de férias
          </h1>
          <p style={{ fontSize: 13, color: "#5c5c5c", margin: 0, maxWidth: 720 }}>
            Monte cenários de planejamento por empresa, unidade e ano. O RH escolhe algumas datas e deixa o sistema
            distribuir as demais, sem mexer no mapa oficial até aprovar.
          </p>
        </div>

        <div style={{ background: "#fff", border: "1px solid #f1e4d6", borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nova simulação</div>
          <form action={criarCenario} className="flex flex-wrap gap-4 items-end">
            <label className="flex flex-col gap-1.5">
              <span style={rotulo}>Nome</span>
              <input
                type="text"
                name="nome"
                required
                placeholder="Planejamento de Férias 2027 — Cenário A"
                style={{ ...campo, width: 280 }}
              />
            </label>
            <EmpresaUnidadesNovo
              empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))}
              unidades={unidades.map((u) => ({ id: u.id, nome: u.nome, empresa_id: u.empresa_id }))}
            />
            <label className="flex flex-col gap-1.5">
              <span style={rotulo}>Ano</span>
              <select name="ano" defaultValue={anoBase + 1} style={campo}>
                {[0, 1, 2, 3].map((i) => (
                  <option key={anoBase + i} value={anoBase + i}>
                    {anoBase + i}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <span style={rotulo}>Descrição (opcional)</span>
              <input type="text" name="descricao" style={{ ...campo, width: "100%" }} />
            </label>
            <button
              type="submit"
              style={{
                fontFamily: INTER,
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 16px",
                borderRadius: 8,
                border: 0,
                background: "#262626",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Criar cenário
            </button>
          </form>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {cenarios.map((c) => {
            const aprovado = c.status === "aprovado";
            return (
              <div
                key={c.id}
                style={{ background: "#fff", border: "1px solid #f1e4d6", borderRadius: 12, padding: "20px 24px" }}
                className="flex flex-col gap-3"
              >
                <Link href={`/ferias/simulacao?cenario=${c.id}`} className="block group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontSize: 14, fontWeight: 600 }} className="group-hover:underline">
                        {c.nome}
                      </div>
                      <div style={{ fontSize: 12, color: "#737373", marginTop: 2 }}>
                        {c.empresa_id ? nomeEmpresa[c.empresa_id] ?? "—" : "Todas as empresas"} ·{" "}
                        {rotuloUnidades(c)} · {c.ano ?? "—"}
                      </div>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 10,
                        background: aprovado ? "#e6f4ec" : "#f0e8df",
                        color: aprovado ? "#1f7a52" : "#5c5c5c",
                      }}
                    >
                      {aprovado ? "Aprovado" : "Rascunho"}
                    </span>
                  </div>
                  {c.descricao && <div style={{ fontSize: 12, color: "#737373", marginTop: 8 }}>{c.descricao}</div>}
                </Link>
                <div style={{ borderTop: "1px solid #f4ebe1", paddingTop: 10 }} className="flex items-center justify-between">
                  <Link
                    href={`/ferias/simulacao?cenario=${c.id}`}
                    style={{ fontSize: 12, fontWeight: 600, color: "#b85c12" }}
                    className="hover:underline"
                  >
                    Abrir
                  </Link>
                  <ExcluirCenarioBotao cenarioId={c.id} nome={c.nome} />
                </div>
              </div>
            );
          })}
          {cenarios.length === 0 && (
            <p style={{ fontSize: 13, color: "#737373", textAlign: "center", padding: "40px 0" }} className="md:col-span-2">
              Nenhum cenário criado ainda.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // MODO WORKSPACE — cenário selecionado
  // ------------------------------------------------------------
  const config = normalizarConfig(cenarioAtual.config);
  const ano = cenarioAtual.ano ?? new Date().getFullYear();
  const ocultarValores = await souAssistente();

  const [
    { data: colaboradoresData },
    { data: aquisitivosData },
    { data: feriasReaisData },
    { data: feriasSimuladasData },
    { data: feriadosData },
  ] = await Promise.all([
    supabase.from("colaboradores").select("*").eq("tipo", "CLT").in("status", ["ativo", "experiencia"]),
    supabase.from("periodos_aquisitivos").select("*").eq("status", "aberto"),
    supabase.from("ferias").select("*").eq("simulacao", false).neq("status", "cancelado"),
    supabase.from("ferias").select("*").eq("cenario_id", cenarioAtual.id).eq("simulacao", true),
    supabase.from("feriados").select("*"),
  ]);

  let colaboradores = (colaboradoresData ?? []) as Colaborador[];
  if (cenarioAtual.empresa_id) colaboradores = colaboradores.filter((c) => c.empresa_id === cenarioAtual.empresa_id);
  const escopoUnidades = unidadesDoCenario(cenarioAtual, config);
  colaboradores = colaboradores.filter((c) => unidadeNoEscopo(c.unidade_id, escopoUnidades));
  colaboradores = colaboradores.slice().sort((a, b) => a.nome.localeCompare(b.nome));

  const todosAquisitivos = (aquisitivosData ?? []) as PeriodoAquisitivo[];
  const todasFeriasReais = (feriasReaisData ?? []) as Ferias[];
  const feriasSimuladasTodas = (feriasSimuladasData ?? []) as Ferias[];
  const feriados = (feriadosData ?? []) as Feriado[];
  const feriadosSet = paraSetDeDatas(feriados);
  const feriadosChaveSet = new Set(feriados.map((f) => dia10(f.data)));

  const idsEscopo = new Set(colaboradores.map((c) => c.id));
  // só CLT: períodos simulados de quem não é CLT (ou está fora do escopo) não entram
  const feriasSimuladas = feriasSimuladasTodas.filter((f) => idsEscopo.has(f.colaborador_id));
  const nomePorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.nome]));
  const unidadePorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.unidade_id]));
  const departamentoPorColaborador = Object.fromEntries(colaboradores.map((c) => [c.id, c.departamento]));

  const aquisitivoAbertoPorColaborador: Record<string, PeriodoAquisitivo | undefined> = {};
  for (const p of todosAquisitivos) {
    if (!idsEscopo.has(p.colaborador_id)) continue;
    const atual = aquisitivoAbertoPorColaborador[p.colaborador_id];
    if (!atual || new Date(p.limite_concessao) < new Date(atual.limite_concessao)) {
      aquisitivoAbertoPorColaborador[p.colaborador_id] = p;
    }
  }

  const usadosPorPeriodo: Record<string, number> = {};
  for (const f of todasFeriasReais) {
    if (!f.periodo_aquisitivo_id) continue;
    usadosPorPeriodo[f.periodo_aquisitivo_id] = (usadosPorPeriodo[f.periodo_aquisitivo_id] ?? 0) + f.dias;
  }

  const simuladosPorColaborador: Record<string, Ferias[]> = {};
  for (const f of feriasSimuladas) {
    if (!simuladosPorColaborador[f.colaborador_id]) simuladosPorColaborador[f.colaborador_id] = [];
    simuladosPorColaborador[f.colaborador_id].push(f);
  }
  for (const lista of Object.values(simuladosPorColaborador)) lista.sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1));

  const feriasRealEscopo = todasFeriasReais.filter((f) => idsEscopo.has(f.colaborador_id));

  // ------------------------------------------------------------
  // CONFLITOS + DATAS INVÁLIDAS (mesma lógica de antes)
  // ------------------------------------------------------------
  const feriasParaConflito = [...feriasRealEscopo, ...feriasSimuladas].map((f) => ({
    id: f.id,
    colaborador_id: f.colaborador_id,
    unidade_id: unidadePorColaborador[f.colaborador_id] ?? null,
    data_inicio: f.data_inicio,
    data_fim: f.data_fim,
    simulacao: false, // força cruzar simulação x real na mesma checagem
    status: f.status,
  }));
  const conflitos = detectarConflitos(feriasParaConflito);
  const datasInvalidas = new Set(
    feriasSimuladas.filter((f) => !respeitaRegraInicio(new Date(f.data_inicio), feriadosSet)).map((f) => f.id)
  );

  // ------------------------------------------------------------
  // CAPACIDADE DA EQUIPE (concentração acima do configurado)
  // ------------------------------------------------------------
  const contagemUnidadeDia = new Map<string, number>(); // unidade::dia
  const contagemDeptoDia = new Map<string, number>(); // unidade::depto::dia
  for (const f of [...feriasRealEscopo, ...feriasSimuladas]) {
    const unidadeId = unidadePorColaborador[f.colaborador_id];
    const depto = departamentoPorColaborador[f.colaborador_id];
    if (!unidadeId) continue;
    let d = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    while (d <= fim) {
      const dia = chaveDia(d);
      const chaveU = `${unidadeId}::${dia}`;
      contagemUnidadeDia.set(chaveU, (contagemUnidadeDia.get(chaveU) ?? 0) + 1);
      if (depto) {
        const chaveD = `${unidadeId}::${depto}::${dia}`;
        contagemDeptoDia.set(chaveD, (contagemDeptoDia.get(chaveD) ?? 0) + 1);
      }
      d = addDays(d, 1);
    }
  }

  // ------------------------------------------------------------
  // LISTA DE PENDÊNCIAS (frases prontas)
  // ------------------------------------------------------------
  const pendencias: PendenciaSim[] = [];
  const nomeDaUnidade = (id: string | null | undefined) => (id ? nomeUnidade[id] ?? "unidade" : "unidade");
  const porInicio = (a: Ferias, b: Ferias) => (a.data_inicio < b.data_inicio ? -1 : 1);

  // conflitos: quem cai na mesma semana, na mesma unidade
  const todasParaCruzar = [...feriasRealEscopo, ...feriasSimuladas];
  for (const f of feriasSimuladas.slice().sort(porInicio)) {
    if (!conflitos.has(f.id)) continue;
    const unidadeId = unidadePorColaborador[f.colaborador_id];
    const semanas = semanasEnvolvidas({ inicio: new Date(f.data_inicio), fim: new Date(f.data_fim) });
    const outros = new Set<string>();
    for (const g of todasParaCruzar) {
      if (g.id === f.id || g.colaborador_id === f.colaborador_id) continue;
      if (unidadePorColaborador[g.colaborador_id] !== unidadeId) continue;
      const sg = semanasEnvolvidas({ inicio: new Date(g.data_inicio), fim: new Date(g.data_fim) });
      if (sg.some((s) => semanas.includes(s))) outros.add(nomePorColaborador[g.colaborador_id] ?? "colega");
    }
    const lista = Array.from(outros);
    const quem =
      lista.length === 0
        ? "outra pessoa"
        : lista.length <= 2
        ? lista.join(" e ")
        : `${lista.slice(0, 2).join(", ")} e mais ${lista.length - 2}`;
    pendencias.push({
      tipo: "Conflito",
      texto: `${nomePorColaborador[f.colaborador_id] ?? "—"}: ${fDM(dia10(f.data_inicio))} a ${fDM(dia10(f.data_fim))} cai na mesma semana de ${quem} (${nomeDaUnidade(unidadeId)}).`,
      bloqueia: true,
    });
  }

  // datas de início que a CLT não permite
  for (const f of feriasSimuladas.slice().sort(porInicio)) {
    if (!datasInvalidas.has(f.id)) continue;
    pendencias.push({
      tipo: "Data inválida",
      texto: `${nomePorColaborador[f.colaborador_id] ?? "—"}: início em ${fDM(dia10(f.data_inicio))} ${motivoInicioInvalido(dia10(f.data_inicio), feriadosChaveSet)}.`,
      bloqueia: true,
    });
  }

  // concentração acima do máximo configurado (agrupa dias seguidos)
  function trechos(dias: { dia: string; n: number }[]): { de: string; ate: string; max: number }[] {
    const ordenados = dias.slice().sort((a, b) => (a.dia < b.dia ? -1 : 1));
    const res: { de: string; ate: string; max: number }[] = [];
    for (const x of ordenados) {
      const ult = res[res.length - 1];
      const seguinte = ult ? chaveDia(addDays(new Date(ult.ate), 1)) : "";
      if (ult && seguinte === x.dia) {
        ult.ate = x.dia;
        ult.max = Math.max(ult.max, x.n);
      } else {
        res.push({ de: x.dia, ate: x.dia, max: x.n });
      }
    }
    return res;
  }
  const concentracao: PendenciaSim[] = [];
  const capU = config.capacidadeMaxUnidade;
  const capD = config.capacidadeMaxDepartamento;
  if (capU != null) {
    const porUnidade = new Map<string, { dia: string; n: number }[]>();
    for (const [chave, n] of contagemUnidadeDia) {
      if (n <= capU) continue;
      const [uid, dia] = chave.split("::");
      if (!porUnidade.has(uid)) porUnidade.set(uid, []);
      porUnidade.get(uid)!.push({ dia, n });
    }
    for (const [uid, dias] of porUnidade) {
      for (const t of trechos(dias)) {
        concentracao.push({
          tipo: "Concentração",
          texto: `${nomeDaUnidade(uid)}: ${fDM(t.de)}${t.de === t.ate ? "" : ` a ${fDM(t.ate)}`} passa de ${capU} pessoa${capU !== 1 ? "s" : ""} fora (chega a ${t.max}).`,
          bloqueia: true,
        });
      }
    }
  }
  if (capD != null) {
    const porDepto = new Map<string, { dia: string; n: number }[]>();
    for (const [chave, n] of contagemDeptoDia) {
      if (n <= capD) continue;
      const [uid, depto, dia] = chave.split("::");
      const k = `${uid}::${depto}`;
      if (!porDepto.has(k)) porDepto.set(k, []);
      porDepto.get(k)!.push({ dia, n });
    }
    for (const [k, dias] of porDepto) {
      const [uid, depto] = k.split("::");
      for (const t of trechos(dias)) {
        concentracao.push({
          tipo: "Concentração",
          texto: `${depto} (${nomeDaUnidade(uid)}): ${fDM(t.de)}${t.de === t.ate ? "" : ` a ${fDM(t.ate)}`} passa de ${capD} pessoa${capD !== 1 ? "s" : ""} fora (chega a ${t.max}).`,
          bloqueia: true,
        });
      }
    }
  }
  const LIMITE_CONCENTRACAO = 12;
  pendencias.push(...concentracao.slice(0, LIMITE_CONCENTRACAO));
  if (concentracao.length > LIMITE_CONCENTRACAO) {
    pendencias.push({
      tipo: "Concentração",
      texto: `e mais ${concentracao.length - LIMITE_CONCENTRACAO} trechos acima do máximo configurado.`,
      bloqueia: true,
    });
  }

  // avisos (não impedem aprovar): período que termina depois do limite de concessão
  for (const f of feriasSimuladas.slice().sort(porInicio)) {
    const aq = aquisitivoAbertoPorColaborador[f.colaborador_id];
    if (!aq) continue;
    const limite = dia10(aq.limite_concessao);
    if (dia10(f.data_fim) > limite) {
      pendencias.push({
        tipo: "Após o limite",
        texto: `${nomePorColaborador[f.colaborador_id] ?? "—"}: ${fDM(dia10(f.data_inicio))} a ${fDM(dia10(f.data_fim))} termina depois do limite de concessão (${fDMA(limite)}). Os dias após o limite são pagos em dobro.`,
        bloqueia: false,
      });
    }
  }

  // ------------------------------------------------------------
  // PESSOAS (uma linha por colaborador com período aquisitivo aberto)
  // ------------------------------------------------------------
  const pessoas: PessoaSim[] = colaboradores
    .filter((c) => aquisitivoAbertoPorColaborador[c.id])
    .map((c) => {
      const aq = aquisitivoAbertoPorColaborador[c.id]!;
      const usados = usadosPorPeriodo[aq.id] ?? 0;
      return {
        id: c.id,
        nome: c.nome,
        unidade: (c.unidade_id && nomeUnidade[c.unidade_id]) || "Sem unidade",
        periodoId: aq.id,
        periodoLabel: `${formatarDataBR(aq.inicio)} a ${formatarDataBR(aq.fim)}`,
        limite: dia10(aq.limite_concessao),
        saldo: calcularSaldo(usados),
        periodos: (simuladosPorColaborador[c.id] ?? []).map((f) => ({
          id: f.id,
          ini: dia10(f.data_inicio),
          fim: dia10(f.data_fim),
          dias: f.dias,
          origem: f.origem_simulacao === "manual" ? ("manual" as const) : ("automatica" as const),
          problema: conflitos.has(f.id) || datasInvalidas.has(f.id),
        })),
        reais: feriasRealEscopo
          .filter((f) => f.colaborador_id === c.id)
          .map((f) => ({ ini: dia10(f.data_inicio), fim: dia10(f.data_fim) })),
      };
    })
    .sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  const unidadesDisponiveis = unidades
    .filter((u) => !cenarioAtual.empresa_id || u.empresa_id === cenarioAtual.empresa_id)
    .map((u) => ({
      id: u.id,
      nome: !cenarioAtual.empresa_id && u.empresa_id && nomeEmpresa[u.empresa_id] ? `${u.nome} · ${nomeEmpresa[u.empresa_id]}` : u.nome,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const custoTotal = feriasSimuladas.reduce((s, f) => s + (f.valor_estimado ?? 0), 0);

  return (
    <SimulacaoWorkspace
      cenario={{
        id: cenarioAtual.id,
        nome: cenarioAtual.nome,
        status: cenarioAtual.status,
        ano,
        empresa: cenarioAtual.empresa_id ? nomeEmpresa[cenarioAtual.empresa_id] ?? "—" : "todas as empresas",
        unidade: escopoUnidades.length ? escopoUnidades.map((id) => nomeUnidade[id] ?? "—").join(", ") : null,
      }}
      unidadesDisponiveis={unidadesDisponiveis}
      unidadesSelecionadas={escopoUnidades.length ? escopoUnidades : unidadesDisponiveis.map((u) => u.id)}
      cenarios={cenarios.map((c) => ({ id: c.id, nome: c.nome, ano: c.ano }))}
      config={config}
      pessoas={pessoas}
      pendencias={pendencias}
      custo={ocultarValores ? 0 : custoTotal}
      mostrarValores={!ocultarValores}
    />
  );
}
