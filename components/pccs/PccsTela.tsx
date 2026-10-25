"use client";

import { useMemo, useState, useTransition } from "react";
import type { CargoDesc } from "@/lib/cargos";
import {
  CATEGORIAS,
  FORMACAO,
  NOTA_MINIMA,
  PESOS,
  PROGRESSAO_PCT,
  PROMOCAO_MIN_PCT,
  alvoNumero,
  atingimento,
  brl,
  calcular,
  decisaoMes12,
  num1,
  tipoIndicador,
  type Categoria,
  type IndicadorValor,
} from "@/lib/pccs";
import { salvarAvaliacaoPccs, salvarCargoPccs } from "@/lib/actions-pccs";

interface PccsCargo {
  cargo_desc_id: string;
  categoria: Categoria;
  faixa_min: number | null;
  faixa_max: number | null;
}
interface Colab {
  id: string;
  nome: string;
  cargo: string | null;
  tipo: string;
  status: string;
  data_admissao: string | null;
  salario_base: number | null;
}
interface Aval {
  id: string;
  colaborador_id: string;
  momento: "mes6" | "mes12";
  nota_final: number | null;
  decisao: string | null;
  created_at: string;
}

type Aba = "painel" | "avaliar" | "cargos" | "regras";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export default function PccsTela({
  cargos,
  pccsCargos,
  colaboradores,
  avaliacoes,
}: {
  cargos: CargoDesc[];
  pccsCargos: PccsCargo[];
  colaboradores: Colab[];
  avaliacoes: Aval[];
}) {
  const [aba, setAba] = useState<Aba>("painel");
  const [colabId, setColabId] = useState<string>("");

  const catDe = (cargoDescId: string): PccsCargo =>
    pccsCargos.find((p) => p.cargo_desc_id === cargoDescId) ?? {
      cargo_desc_id: cargoDescId,
      categoria: "operacional",
      faixa_min: null,
      faixa_max: null,
    };
  const cargoDoColab = (c: Colab) => cargos.find((x) => norm(x.cargo) === norm(c.cargo)) ?? null;
  const ultima = (id: string) => avaliacoes.find((a) => a.colaborador_id === id);

  const abas: { id: Aba; nome: string }[] = [
    { id: "painel", nome: "Painel" },
    { id: "avaliar", nome: "Avaliar" },
    { id: "cargos", nome: "Cargos e faixas" },
    { id: "regras", nome: "Regras" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">PCCS — Plano de Cargos, Carreiras e Salários</h1>
        <p className="text-sm text-stone-600 mt-1">
          Avaliação por C.H.A. e evidências, a partir da descrição do cargo. Ciclo de 12 meses, com avaliação intermediária no mês 6.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={aba === a.id ? "btn-primary" : "btn-secondary"}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "painel" && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold">Colaboradores no ciclo</h2>
          {colaboradores.length === 0 && <p className="text-sm text-stone-600">Nenhum colaborador CLT ou estagiário ativo.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-600 border-b border-stone-200">
                  <th className="py-2 pr-4">Colaborador</th>
                  <th className="py-2 pr-4">Cargo</th>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-4">Última avaliação</th>
                  <th className="py-2 pr-4">Nota</th>
                  <th className="py-2 pr-4">Situação</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c) => {
                  const cd = cargoDoColab(c);
                  const u = ultima(c.id);
                  const nota = u?.nota_final ?? null;
                  return (
                    <tr key={c.id} className="border-b border-stone-100">
                      <td className="py-2 pr-4 font-medium">{c.nome}</td>
                      <td className="py-2 pr-4">
                        {c.cargo ?? "—"}
                        {!cd && <span className="badge bg-amber-100 text-amber-800 ml-2">! Sem descrição de cargo</span>}
                      </td>
                      <td className="py-2 pr-4">{cd ? CATEGORIAS[catDe(cd.id).categoria].nome : "—"}</td>
                      <td className="py-2 pr-4">{u ? `${u.momento === "mes6" ? "Mês 6" : "Mês 12"} · ${new Date(u.created_at).toLocaleDateString("pt-BR")}` : "Sem avaliação"}</td>
                      <td className="py-2 pr-4">{nota !== null ? num1(nota) : "—"}</td>
                      <td className="py-2 pr-4">
                        {nota === null ? (
                          <span className="badge bg-stone-100 text-stone-700">Aguardando</span>
                        ) : nota >= NOTA_MINIMA ? (
                          <span className="badge bg-green-100 text-green-800">✓ Dentro da meta</span>
                        ) : (
                          <span className="badge bg-red-100 text-red-800">! Fora da meta</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="btn-secondary !py-1.5 !px-3"
                          disabled={!cd}
                          onClick={() => {
                            setColabId(c.id);
                            setAba("avaliar");
                          }}
                        >
                          Avaliar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aba === "avaliar" && (
        <Avaliar
          colaboradores={colaboradores}
          colabId={colabId}
          setColabId={setColabId}
          cargoDoColab={cargoDoColab}
          catDe={catDe}
        />
      )}

      {aba === "cargos" && <CargosFaixas cargos={cargos} catDe={catDe} />}

      {aba === "regras" && (
        <section className="card space-y-4">
          <h2 className="text-xl font-semibold">Regras da simulação aprovada</h2>
          <p className="text-sm text-stone-600">
            Pesos: resultados e indicadores {PESOS.resultados}, competência técnica {PESOS.tecnica} (20 prático + até 5 de formação), comportamento e cultura {PESOS.comportamento}, preparação para o próximo nível {PESOS.preparacao}. Nota mínima de referência: {NOTA_MINIMA} de 100. Progressão dentro da faixa: +{PROGRESSAO_PCT}% por ciclo com nota {NOTA_MINIMA}+. Promoção: mínimo de {PROMOCAO_MIN_PCT}% de aumento e posição disponível. Todos os valores são a validar com a Diretoria.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-600 border-b border-stone-200">
                  <th className="py-2 pr-4">Tipo de cargo</th>
                  <th className="py-2 pr-4">Cargos</th>
                  <th className="py-2 pr-4">Mínimo exigido</th>
                  <th className="py-2 pr-4">Teto que pontua</th>
                  <th className="py-2">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(CATEGORIAS) as Categoria[]).map((k) => {
                  const c = CATEGORIAS[k];
                  return (
                    <tr key={k} className="border-b border-stone-100">
                      <td className="py-2 pr-4 font-medium">{c.nome}</td>
                      <td className="py-2 pr-4">{c.exemplos}</td>
                      <td className="py-2 pr-4">{FORMACAO[c.min].nome}</td>
                      <td className="py-2 pr-4">{FORMACAO[c.max].nome}</td>
                      <td className="py-2">{FORMACAO[c.min].pontos} a {FORMACAO[c.max].pontos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-stone-600">
            Vale a maior formação concluída na área do cargo. Abaixo do mínimo, o requisito não é atendido. Acima do teto, não soma pontos.
          </p>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CargosFaixas({ cargos, catDe }: { cargos: CargoDesc[]; catDe: (id: string) => PccsCargo }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const [edit, setEdit] = useState<Record<string, { categoria: Categoria; min: string; max: string }>>({});

  function valor(c: CargoDesc) {
    const base = catDe(c.id);
    return (
      edit[c.id] ?? {
        categoria: base.categoria,
        min: base.faixa_min !== null ? String(base.faixa_min) : "",
        max: base.faixa_max !== null ? String(base.faixa_max) : "",
      }
    );
  }
  function salvar(c: CargoDesc) {
    const v = valor(c);
    iniciar(async () => {
      const r = await salvarCargoPccs({
        cargo_desc_id: c.id,
        categoria: v.categoria,
        faixa_min: v.min ? Number(v.min) : null,
        faixa_max: v.max ? Number(v.max) : null,
      });
      setMsg(r.ok ? `✓ ${c.cargo} salvo` : `! ${r.erro}`);
    });
  }

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Categoria e faixa salarial por cargo</h2>
      <p className="text-sm text-stone-600">
        Os cargos vêm da Descrição de Cargos. A categoria define a formação exigida; a faixa define o teto da progressão.
      </p>
      {cargos.length === 0 && <p className="text-sm text-stone-600">Nenhum cargo cadastrado.</p>}
      <div className="space-y-3">
        {cargos.map((c) => {
          const v = valor(c);
          const cat = CATEGORIAS[v.categoria];
          const dif = norm(c.escolaridade).includes("fundamental") && cat.min > 0 && v.categoria === "operacional";
          return (
            <div key={c.id} className="border border-stone-200 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-semibold">{c.cargo}</p>
                  <p className="text-xs text-stone-500">{c.empresa}</p>
                </div>
                <label className="text-sm">
                  <span className="label">Categoria</span>
                  <select
                    className="input"
                    value={v.categoria}
                    onChange={(e) => setEdit({ ...edit, [c.id]: { ...v, categoria: e.target.value as Categoria } })}
                  >
                    {(Object.keys(CATEGORIAS) as Categoria[]).map((k) => (
                      <option key={k} value={k}>{CATEGORIAS[k].nome}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="label">Faixa mínima (R$)</span>
                  <input className="input" type="number" min="0" step="0.01" value={v.min} onChange={(e) => setEdit({ ...edit, [c.id]: { ...v, min: e.target.value } })} />
                </label>
                <label className="text-sm">
                  <span className="label">Faixa máxima (R$)</span>
                  <input className="input" type="number" min="0" step="0.01" value={v.max} onChange={(e) => setEdit({ ...edit, [c.id]: { ...v, max: e.target.value } })} />
                </label>
                <button className="btn-primary" disabled={pendente} onClick={() => salvar(c)}>Salvar</button>
              </div>
              <p className="text-sm text-stone-600">
                Formação exigida: mínimo {FORMACAO[cat.min].nome}, pontua até {FORMACAO[cat.max].nome}.
              </p>
              {dif && (
                <p className="text-sm text-amber-800">
                  ! A descrição cadastrada pede “{c.escolaridade}”. Atualize em Descrição de Cargos para {FORMACAO[cat.min].nome}.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Avaliar({
  colaboradores,
  colabId,
  setColabId,
  cargoDoColab,
  catDe,
}: {
  colaboradores: Colab[];
  colabId: string;
  setColabId: (id: string) => void;
  cargoDoColab: (c: Colab) => CargoDesc | null;
  catDe: (id: string) => PccsCargo;
}) {
  const colab = colaboradores.find((c) => c.id === colabId) ?? null;
  const cargo = colab ? cargoDoColab(colab) : null;

  return (
    <section className="card space-y-4">
      <h2 className="text-xl font-semibold">Avaliar colaborador</h2>
      <label className="text-sm block max-w-md">
        <span className="label">Colaborador</span>
        <select className="input" value={colabId} onChange={(e) => setColabId(e.target.value)}>
          <option value="">Escolha…</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>{c.nome} · {c.cargo ?? "sem cargo"}</option>
          ))}
        </select>
      </label>
      {colab && !cargo && (
        <p className="text-sm text-amber-800">! O cargo “{colab.cargo ?? "—"}” não tem descrição cadastrada. Cadastre em Descrição de Cargos para avaliar.</p>
      )}
      {colab && cargo && <Formulario key={colab.id} colab={colab} cargo={cargo} pcc={catDe(cargo.id)} />}
    </section>
  );
}

function Formulario({ colab, cargo, pcc }: { colab: Colab; cargo: CargoDesc; pcc: PccsCargo }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState("");
  const [momento, setMomento] = useState<"mes6" | "mes12">("mes6");
  const [inicio, setInicio] = useState(colab.data_admissao ?? new Date().toISOString().slice(0, 10));
  const [formacao, setFormacao] = useState(1);
  const [tec, setTec] = useState<Record<string, number>>(() => Object.fromEntries(cargo.tecnicos.map((t) => [t, 3])));
  const [comp, setComp] = useState<Record<string, number>>(() => Object.fromEntries(cargo.comportamentais.map((t) => [t, 3])));
  const [ind, setInd] = useState<IndicadorValor[]>(() =>
    cargo.indicadores.map((i) => ({ nome: i.nome, alvo: i.meta, tipo: tipoIndicador(i.meta), valor: tipoIndicador(i.meta) === "zero" ? 0 : alvoNumero(i.meta) }))
  );
  const [prep, setPrep] = useState(3);
  const [evid, setEvid] = useState("");
  const [flags, setFlags] = useState({ pdi_ok: false, rh_ok: false, alcada_ok: false, vaga_ok: false });

  const cat = CATEGORIAS[pcc.categoria];
  const r = useMemo(
    () => calcular({ categoria: pcc.categoria, formacao, tecnicas: tec, comportamentais: comp, indicadores: ind, preparacao: prep }),
    [pcc.categoria, formacao, tec, comp, ind, prep]
  );
  const dec = decisaoMes12({ total: r.total, atendeMinimoFormacao: r.atendeMinimoFormacao, ...flags });
  const salario = colab.salario_base ?? 0;
  const progressao = pcc.faixa_max !== null ? Math.min(pcc.faixa_max, salario * (1 + PROGRESSAO_PCT / 100)) : salario * (1 + PROGRESSAO_PCT / 100);

  function salvar() {
    iniciar(async () => {
      const res = await salvarAvaliacaoPccs({
        colaborador_id: colab.id,
        cargo_desc_id: cargo.id,
        momento,
        ciclo_inicio: inicio,
        formacao,
        tecnicas: tec,
        comportamentais: comp,
        indicadores: ind,
        preparacao: prep,
        evidencias: evid,
        ...flags,
        nota_final: Math.round(r.total * 10) / 10,
        decisao: momento === "mes12" ? dec.decisao : "Avaliação intermediária: corrigir a rota e atualizar o plano de desenvolvimento",
      });
      setMsg(res.ok ? "✓ Avaliação salva" : `! ${res.erro}`);
    });
  }

  const nota = (valor: number, onChange: (n: number) => void, rotulo: string) => (
    <select className="input !w-24" value={valor} aria-label={rotulo} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="text-sm">
          <span className="label">Momento</span>
          <select className="input" value={momento} onChange={(e) => setMomento(e.target.value as "mes6" | "mes12")}>
            <option value="mes6">Mês 6 · avaliação intermediária</option>
            <option value="mes12">Mês 12 · decisão anual</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Início do ciclo</span>
          <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <p className="text-sm text-stone-600">Cargo {cargo.cargo} · categoria {cat.nome}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-stone-200 rounded-xl p-4 space-y-3">
          <h3 className="text-lg font-semibold">Competências · o colaborador tem?</h3>
          <p className="text-xs text-stone-500">Notas de 1 a 5, das competências da descrição do cargo.</p>
          {cargo.tecnicos.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 text-sm"><span>{t}</span>{nota(tec[t] ?? 3, (n) => setTec({ ...tec, [t]: n }), t)}</div>
          ))}
          {cargo.tecnicos.length === 0 && <p className="text-sm text-stone-500">A descrição não tem competências técnicas cadastradas.</p>}
          <label className="text-sm block pt-2">
            <span className="label">Formação concluída (na área do cargo)</span>
            <select className="input" value={formacao} onChange={(e) => setFormacao(Number(e.target.value))}>
              {FORMACAO.map((f, i) => (
                <option key={f.nome} value={i}>{f.nome} ({f.pontos} pt){i > cat.max ? " · acima do teto, não soma" : ""}</option>
              ))}
            </select>
          </label>
          <p className="text-sm">
            {r.atendeMinimoFormacao ? (
              <span className="badge bg-green-100 text-green-800">✓ Atende o mínimo exigido</span>
            ) : (
              <span className="badge bg-red-100 text-red-800">! Abaixo do mínimo exigido</span>
            )}{" "}
            Mínimo {FORMACAO[cat.min].nome}, pontua até {FORMACAO[cat.max].nome}.
          </p>
        </div>

        <div className="border border-stone-200 rounded-xl p-4 space-y-3">
          <h3 className="text-lg font-semibold">Comportamento · atitude</h3>
          {cargo.comportamentais.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 text-sm"><span>{t}</span>{nota(comp[t] ?? 3, (n) => setComp({ ...comp, [t]: n }), t)}</div>
          ))}
          {cargo.comportamentais.length === 0 && <p className="text-sm text-stone-500">A descrição não tem competências comportamentais cadastradas.</p>}
          <div className="flex items-center justify-between gap-3 text-sm pt-2">
            <span>Preparação para o próximo nível</span>{nota(prep, setPrep, "Preparação")}
          </div>
        </div>
      </div>

      <div className="border border-stone-200 rounded-xl p-4 space-y-3">
        <h3 className="text-lg font-semibold">Indicadores · ele entrega?</h3>
        <p className="text-xs text-stone-500">Vêm da descrição do cargo. Informe o resultado do período.</p>
        {ind.map((i, k) => (
          <div key={i.nome} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="min-w-[220px] flex-1">{i.nome} <span className="text-stone-500">(meta {i.alvo})</span></span>
            <input
              className="input !w-28"
              type="number"
              min="0"
              step="0.1"
              aria-label={i.nome}
              value={i.valor}
              onChange={(e) => setInd(ind.map((x, j) => (j === k ? { ...x, valor: Number(e.target.value) } : x)))}
            />
            <span className="w-24 text-right">{num1(atingimento(i)).replace(".", ",")}%</span>
          </div>
        ))}
        {ind.length === 0 && <p className="text-sm text-stone-500">A descrição não tem indicadores cadastrados.</p>}
      </div>

      <label className="text-sm block">
        <span className="label">Evidências · entregas, auditorias e feedbacks registrados</span>
        <textarea className="input min-h-[90px]" value={evid} onChange={(e) => setEvid(e.target.value)} />
      </label>

      {momento === "mes12" && (
        <div className="border border-stone-200 rounded-xl p-4 space-y-2">
          <h3 className="text-lg font-semibold">Condições para promover</h3>
          {([
            ["pdi_ok", "Plano de desenvolvimento cumprido"],
            ["rh_ok", "Validação do RH"],
            ["alcada_ok", "Aprovação da alçada competente"],
            ["vaga_ok", "Posição disponível"],
          ] as const).map(([k, rot]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} /> {rot}
            </label>
          ))}
        </div>
      )}

      <div className="card-dark space-y-2">
        <p className="text-sm opacity-80">Nota do ciclo (simulação, a validar)</p>
        <p className="text-4xl font-display">{num1(r.total)} <span className="text-lg opacity-70">/ 100</span></p>
        <p className="text-sm opacity-90">
          Resultados {num1(r.resultados)} · Técnica {num1(r.tecnica)} (formação {r.formacaoPts} pt) · Comportamento {num1(r.comportamento)} · Preparação {num1(r.preparacao)}
        </p>
        <p className="font-semibold">{r.total >= NOTA_MINIMA ? "✓ Dentro da meta" : "! Fora da meta"}</p>
        {momento === "mes12" ? (
          <>
            <p className="font-semibold">{dec.decisao}</p>
            {dec.pendencias.length > 0 && <p className="text-sm opacity-90">Pendências: {dec.pendencias.join("; ")}.</p>}
            {r.total >= NOTA_MINIMA && salario > 0 && (
              <p className="text-sm opacity-90">
                Progressão na faixa: {brl(salario)} → {brl(progressao)}. Promoção: no mínimo +{PROMOCAO_MIN_PCT}%.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm opacity-90">No mês 6 a avaliação corrige a rota e atualiza o plano de desenvolvimento. Ela não decide a promoção.</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-cta" disabled={pendente} onClick={salvar}>Salvar avaliação</button>
        {msg && <span className="text-sm" role="status">{msg}</span>}
      </div>
    </div>
  );
}
