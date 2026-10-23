"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarDesligamento } from "@/lib/actions-desligamentos-modulo";
import {
  AVISOS,
  ENTREVISTAS,
  INICIATIVAS,
  MOTIVOS_POR_INICIATIVA,
  RECONTRATAVEL,
  TIPOS_RESCISAO,
  diasEntre,
  fmtData,
  textoTempoDeCasa,
  type Iniciativa,
} from "@/lib/desligamentos-modulo";

export interface ColabOpcao {
  id: string;
  nome: string;
  matricula: string;
  vinculo: string;
  empresa: string;
  unidade: string;
  departamento: string;
  cargo: string;
  gestor: string;
  admissao: string;
}

function Campo({ rotulo, obrigatorio, children }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {rotulo} {obrigatorio ? <span className="text-red-700">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function Somente({ valor }: { valor: string }) {
  return <div className="min-h-[42px] rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2.5 text-sm text-slate-800">{valor || "—"}</div>;
}

function Opcoes({
  valor,
  onChange,
  itens,
}: {
  valor: string;
  onChange: (v: string) => void;
  itens: readonly { valor: string; rotulo: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => (
        <button
          key={i.valor}
          type="button"
          onClick={() => onChange(valor === i.valor ? "" : i.valor)}
          aria-pressed={valor === i.valor}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
            valor === i.valor ? "border-[#2b2118] bg-[#2b2118] text-white" : "border-stone-300 bg-white text-stone-700"
          }`}
        >
          {i.rotulo}
        </button>
      ))}
    </div>
  );
}

export default function RegistrarDesligamentoForm({
  colaboradores,
  preSelecionado,
}: {
  colaboradores: ColabOpcao[];
  preSelecionado: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [colabId, setColabId] = useState(preSelecionado && colaboradores.some((c) => c.id === preSelecionado) ? preSelecionado : "");
  const [dataDesl, setDataDesl] = useState("");
  const [dataCom, setDataCom] = useState("");
  const [ultimoDia, setUltimoDia] = useState("");
  const [iniciativa, setIniciativa] = useState<Iniciativa | "">("");
  const [tipo, setTipo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string>("");
  const [entrevista, setEntrevista] = useState<string>("");
  const [recontratavel, setRecontratavel] = useState<string>("");
  const [custo, setCusto] = useState("");
  const [motivoCompl, setMotivoCompl] = useState("");
  const [obsRestritas, setObsRestritas] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const colab = colaboradores.find((c) => c.id === colabId) ?? null;

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return colaboradores
      .filter((c) => c.nome.toLowerCase().includes(q) || c.matricula.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busca, colaboradores]);

  const motivos = iniciativa ? MOTIVOS_POR_INICIATIVA[iniciativa] : [];
  const tempoDias = colab?.admissao && dataDesl ? diasEntre(colab.admissao, dataDesl) : null;
  const futuro = dataDesl && dataDesl > new Date().toISOString().slice(0, 10);

  function escolherIniciativa(v: Iniciativa | "") {
    setIniciativa(v);
    setMotivo(""); // os motivos dependem da iniciativa
  }

  function parseCusto(): number | null {
    const t = custo.trim();
    if (!t) return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  function confirmar() {
    setErro(null);
    if (!colab) return setErro("Escolha o colaborador.");
    if (!dataDesl) return setErro("Informe a data do desligamento.");
    if (colab.admissao && dataDesl < colab.admissao) return setErro("A data do desligamento não pode ser antes da admissão.");
    if (!iniciativa) return setErro("Escolha a iniciativa do desligamento.");
    if (!tipo) return setErro("Escolha o tipo de rescisão.");
    if (!motivo) return setErro("Escolha o motivo principal.");
    const valor = parseCusto();
    if (valor !== null && Number.isNaN(valor)) return setErro("Confira o custo rescisório.");

    iniciar(async () => {
      const r = await registrarDesligamento({
        colaboradorId: colab.id,
        dataDesligamento: dataDesl,
        dataComunicacao: dataCom || null,
        ultimoDia: ultimoDia || null,
        iniciativa,
        tipoRescisao: tipo,
        motivoPrincipal: motivo,
        avisoPrevio: aviso || null,
        entrevista: entrevista || null,
        recontratavel: recontratavel || null,
        custoRescisorio: valor,
        motivoComplementar: motivoCompl || null,
        observacoesRestritas: obsRestritas || null,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/desligamentos/historico?sel=${r.id}&msg=${encodeURIComponent("Desligamento registrado.")}`);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="card space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">1. Identificação do colaborador</h2>
          <Campo rotulo="Colaborador" obrigatorio>
            {colab ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm">
                <span>
                  <b>{colab.nome}</b>
                  {colab.matricula ? ` · Matrícula ${colab.matricula}` : ""}
                </span>
                <button type="button" className="text-xs font-semibold text-brand-600 underline" onClick={() => { setColabId(""); setBusca(""); }}>
                  Trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="input"
                  data-sem-maiuscula
                  name="busca"
                  placeholder="Digite o nome ou a matrícula"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  autoComplete="off"
                />
                {resultados.length > 0 ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-300 bg-white shadow-lg">
                    {resultados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col px-3.5 py-2 text-left text-sm hover:bg-brand-50"
                          onClick={() => { setColabId(c.id); setBusca(""); }}
                        >
                          <b>{c.nome}</b>
                          <span className="text-xs text-stone-600">
                            {[c.matricula && `Matrícula ${c.matricula}`, c.empresa, c.unidade, c.cargo].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : busca.trim() ? (
                  <p className="mt-1 text-xs text-stone-500">Nenhum colaborador ativo encontrado com esse nome ou matrícula.</p>
                ) : null}
              </div>
            )}
            <p className="mt-1 text-xs text-stone-500">A lista vem do cadastro de colaboradores. Quem já foi desligado não aparece.</p>
          </Campo>
          <div className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Vínculo"><Somente valor={colab?.vinculo ?? ""} /></Campo>
            <Campo rotulo="Empresa"><Somente valor={colab?.empresa ?? ""} /></Campo>
            <Campo rotulo="Unidade"><Somente valor={colab?.unidade ?? ""} /></Campo>
            <Campo rotulo="Departamento"><Somente valor={colab?.departamento ?? ""} /></Campo>
            <Campo rotulo="Cargo"><Somente valor={colab?.cargo ?? ""} /></Campo>
            <Campo rotulo="Gestor imediato"><Somente valor={colab?.gestor ?? ""} /></Campo>
            <Campo rotulo="Data de admissão"><Somente valor={colab?.admissao ? fmtData(colab.admissao) : ""} /></Campo>
          </div>
          <p className="text-xs text-stone-500">
            Estes campos não são digitados de novo. Ao confirmar, o app guarda uma cópia deles para os relatórios históricos.
          </p>
        </section>

        <section className="card space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">2. Informações do desligamento</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo rotulo="Data do desligamento" obrigatorio>
              <input type="date" className="input" data-sem-maiuscula value={dataDesl} onChange={(e) => setDataDesl(e.target.value)} />
            </Campo>
            <Campo rotulo="Tipo de rescisão" obrigatorio>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Escolha</option>
                {TIPOS_RESCISAO.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Iniciativa do desligamento" obrigatorio>
              <select className="input" value={iniciativa} onChange={(e) => escolherIniciativa(e.target.value as Iniciativa | "")}>
                <option value="">Escolha</option>
                {INICIATIVAS.map((i) => (
                  <option key={i.valor} value={i.valor}>{i.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Motivo principal" obrigatorio>
              <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={!iniciativa}>
                <option value="">{iniciativa ? "Escolha" : "Escolha a iniciativa primeiro"}</option>
                {motivos.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Campo>
          </div>
          <p className="text-xs text-stone-500">
            Iniciativa e tipo de rescisão são listas separadas. Os motivos mudam conforme a iniciativa, e o sistema nunca sugere um motivo.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo rotulo="Data de comunicação do desligamento">
              <input type="date" className="input" data-sem-maiuscula value={dataCom} onChange={(e) => setDataCom(e.target.value)} />
            </Campo>
            <Campo rotulo="Último dia efetivamente trabalhado">
              <input type="date" className="input" data-sem-maiuscula value={ultimoDia} onChange={(e) => setUltimoDia(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Aviso-prévio"><Opcoes valor={aviso} onChange={setAviso} itens={AVISOS} /></Campo>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo rotulo="Entrevista de desligamento"><Opcoes valor={entrevista} onChange={setEntrevista} itens={ENTREVISTAS} /></Campo>
            <Campo rotulo="Recontratável"><Opcoes valor={recontratavel} onChange={setRecontratavel} itens={RECONTRATAVEL} /></Campo>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo rotulo="Custo rescisório (opcional)">
              <input className="input" data-sem-maiuscula inputMode="decimal" placeholder="Ex.: 1.250,00" value={custo} onChange={(e) => setCusto(e.target.value)} />
            </Campo>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">3. Motivo complementar e observações</h2>
            <span className="badge bg-stone-200 text-stone-700">🔒 Acesso restrito</span>
          </div>
          <Campo rotulo="Motivo complementar">
            <textarea className="input min-h-[80px]" data-sem-maiuscula placeholder="Detalhe o motivo principal, sem dados pessoais desnecessários." value={motivoCompl} onChange={(e) => setMotivoCompl(e.target.value)} />
          </Campo>
          <Campo rotulo="Observações restritas">
            <textarea className="input min-h-[80px]" data-sem-maiuscula placeholder="Visível só para perfis autorizados. Fica fora das exportações." value={obsRestritas} onChange={(e) => setObsRestritas(e.target.value)} />
          </Campo>
        </section>

        {erro ? (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/desligamentos")} disabled={pendente}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={confirmar} disabled={pendente}>
            {pendente ? "Salvando…" : "Confirmar desligamento"}
          </button>
        </div>
      </div>

      <aside className="space-y-5">
        <section className="card">
          <h2 className="text-sm font-semibold text-stone-700">Conferência antes de salvar</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>{colab ? "✓" : "○"} Colaborador escolhido</li>
            <li>{dataDesl ? "✓" : "○"} Data do desligamento</li>
            <li>{iniciativa && tipo && motivo ? "✓" : "○"} Iniciativa, tipo e motivo</li>
            {tempoDias !== null && tempoDias >= 0 ? (
              <li className="text-stone-600">Tempo de empresa: {tempoDias} dias ({textoTempoDeCasa(tempoDias)})</li>
            ) : null}
            {futuro ? <li className="text-amber-800">! Data futura: o colaborador segue ativo até essa data.</li> : null}
          </ul>
        </section>
        <section className="card">
          <h2 className="text-sm font-semibold text-stone-700">O que acontece ao confirmar</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
            <li>O desligamento é salvo ligado ao colaborador que já existe.</li>
            <li>O colaborador passa para desligado na data efetiva, pelo status que o app já usa.</li>
            <li>Cadastro, folha, ponto e histórico continuam guardados. Nada é apagado.</li>
            <li>Dashboard e relatórios são atualizados.</li>
            <li>Fica registrado quem fez e quando.</li>
            <li>Correção ou cancelamento só com justificativa, e ficam na trilha de auditoria.</li>
          </ol>
        </section>
      </aside>
    </div>
  );
}
