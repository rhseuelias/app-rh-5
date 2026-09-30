"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { FolhaTipo } from "@/types/db";
import { cadastrarTipoFolha, salvarColunasAtivas, salvarGruposTipo } from "@/lib/actions-folha";
import { contarUsoTipoFolha, excluirTipoFolha, type UsoTipoFolha } from "@/lib/actions-folha-excluir";

const ROTULO_FORMATO: Record<string, string> = {
  moeda: "R$",
  texto: "texto",
  sim_nao: "Sim/Não",
};

/** Mostra (e deixa editar) pra quais unidades/empresas uma coluna vale.
 * Sem restrição = vale pra todo mundo, que é o padrão de toda coluna. */
function AbrangenciaTipo({
  tipoId,
  todosGrupos,
  gruposAtuais,
}: {
  tipoId: string;
  todosGrupos: string[];
  gruposAtuais: string[];
}) {
  const valeParaTodos = gruposAtuais.length === 0;
  const [editando, setEditando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>(gruposAtuais);
  const [isPending, startTransition] = useTransition();

  function alternar(grupo: string) {
    setSelecionados((prev) => (prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo]));
  }

  function salvar() {
    startTransition(async () => {
      await salvarGruposTipo(tipoId, selecionados);
      setEditando(false);
    });
  }

  function voltarParaTodos() {
    startTransition(async () => {
      await salvarGruposTipo(tipoId, []);
      setSelecionados([]);
      setEditando(false);
    });
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setSelecionados(gruposAtuais);
          setEditando(true);
        }}
        className="text-xs text-slate-400 hover:text-brand-600 underline decoration-dotted text-left"
        title="Escolher quais unidades/empresas usam essa coluna"
      >
        {valeParaTodos ? "vale pra todas as unidades" : `vale só pra: ${gruposAtuais.join(", ")}`}
      </button>
    );
  }

  return (
    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 mt-1 space-y-2">
      <p className="text-xs text-slate-500">Marque quais unidades/empresas usam essa coluna:</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {todosGrupos.map((g) => (
          <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={selecionados.includes(g)} onChange={() => alternar(g)} disabled={isPending} />
            {g}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={salvar}
          disabled={isPending || selecionados.length === 0}
          className="btn-secondary !text-xs !py-1 !px-2.5"
          title={selecionados.length === 0 ? 'Marque pelo menos 1 unidade, ou use "voltar a valer pra todas"' : undefined}
        >
          {isPending ? "Salvando..." : "Salvar seleção"}
        </button>
        <button type="button" onClick={voltarParaTodos} disabled={isPending} className="text-xs text-slate-500 hover:text-slate-700">
          voltar a valer pra todas
        </button>
        <button type="button" onClick={() => setEditando(false)} disabled={isPending} className="text-xs text-slate-500 hover:text-slate-700">
          cancelar
        </button>
      </div>
    </div>
  );
}

/** Interruptor liga/desliga. */
function Interruptor({
  ligado,
  onChange,
  rotulo,
}: {
  ligado: boolean;
  onChange: (novo: boolean) => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onChange(!ligado)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${ligado ? "bg-brand-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          ligado ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function CartaoCategoria({
  titulo,
  cor,
  tipos,
  onEditar,
}: {
  titulo: string;
  cor: "provento" | "desconto";
  tipos: FolhaTipo[];
  onEditar: () => void;
}) {
  const chip = cor === "provento" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-emerald-50 text-emerald-700 border-emerald-100";
  const ponto = cor === "provento" ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${ponto}`} />
          {titulo} ({tipos.length})
        </h3>
        <button type="button" onClick={onEditar} className="btn-secondary !text-xs !py-1 !px-3">
          ✏️ Editar
        </button>
      </div>
      {tipos.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma coluna ativa.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tipos.map((t) => (
            <li key={t.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${chip}`}>
              <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${ponto}`} />
              {t.nome}
              {t.calculo_automatico && <span title="Calculado automaticamente pelo sistema">🧮</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "Colunas cadastradas": dois cartões (Proventos e Descontos) com as colunas
 * ativas da grade da Folha e um painel lateral "Editar colunas" pra ligar/
 * desligar colunas, escolher em quais unidades cada uma vale e cadastrar uma
 * nova. `tipos` traz TODAS as colunas (inclusive as desligadas), pra dar pra
 * religar; as ativas são as que aparecem nos cartões e na grade.
 */
export default function TiposFolhaCadastro({
  tipos,
  todosGrupos,
  gruposPorTipo,
}: {
  tipos: FolhaTipo[];
  todosGrupos: string[];
  gruposPorTipo: Record<string, string[]>;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativos, setAtivos] = useState<Record<string, boolean>>({});
  const [restringirNova, setRestringirNova] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [usoExclusao, setUsoExclusao] = useState<UsoTipoFolha | null>(null);
  const [carregandoUso, setCarregandoUso] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formNovaRef = useRef<HTMLFormElement | null>(null);

  const proventos = tipos.filter((t) => t.categoria === "provento");
  const descontos = tipos.filter((t) => t.categoria === "desconto");
  const proventosAtivos = proventos.filter((t) => t.ativo);
  const descontosAtivos = descontos.filter((t) => t.ativo);

  function abrirPainel() {
    setAtivos(Object.fromEntries(tipos.map((t) => [t.id, t.ativo])));
    setBusca("");
    setRestringirNova(false);
    setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return;
    function aoApertarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", aoApertarTecla);
    return () => window.removeEventListener("keydown", aoApertarTecla);
  }, [aberto]);

  const termo = busca.trim().toLowerCase();
  function filtrar(lista: FolhaTipo[]) {
    return termo ? lista.filter((t) => t.nome.toLowerCase().includes(termo)) : lista;
  }

  const paraAtivar = tipos.filter((t) => ativos[t.id] === true && !t.ativo).map((t) => t.id);
  const paraDesativar = tipos.filter((t) => ativos[t.id] === false && t.ativo).map((t) => t.id);
  const semMudancas = paraAtivar.length === 0 && paraDesativar.length === 0;

  function salvar() {
    startTransition(async () => {
      await salvarColunasAtivas(paraAtivar, paraDesativar);
      setAberto(false);
    });
  }

  // ----- excluir coluna (pede confirmação e mostra quanto será apagado) -----
  function cancelarExclusao() {
    setExcluindoId(null);
    setUsoExclusao(null);
    setErroExclusao(null);
  }

  function pedirExclusao(id: string) {
    setErroExclusao(null);
    setUsoExclusao(null);
    setExcluindoId(id);
    setCarregandoUso(true);
    contarUsoTipoFolha(id)
      .then((uso) => setUsoExclusao(uso))
      .catch(() => setErroExclusao("Não consegui verificar os valores lançados. Tente de novo."))
      .finally(() => setCarregandoUso(false));
  }

  function confirmarExclusao(id: string) {
    startTransition(async () => {
      const r = await excluirTipoFolha(id);
      if (!r.ok) {
        setErroExclusao(r.erro ?? "Não foi possível excluir.");
        return;
      }
      cancelarExclusao();
    });
  }

  // (função comum, não componente: assim o estado de "editar unidades" de cada
  // linha não é perdido quando um interruptor muda)
  function linhasCategoria(titulo: string, lista: FolhaTipo[]) {
    const visiveis = filtrar(lista);
    const ligadas = lista.filter((t) => ativos[t.id]).length;
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          {titulo} ({ligadas})
        </p>
        {visiveis.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">Nenhuma coluna{termo ? " com esse nome" : ""}.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visiveis.map((t) => (
              <li key={t.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 break-words">
                      {t.nome}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        {ROTULO_FORMATO[t.formato] ?? t.formato}
                        {t.calculo_automatico ? " · 🧮 auto" : ""}
                      </span>
                    </p>
                  </div>
                  <Interruptor
                    ligado={ativos[t.id] ?? t.ativo}
                    rotulo={`Usar a coluna ${t.nome}`}
                    onChange={(novo) => setAtivos((prev) => ({ ...prev, [t.id]: novo }))}
                  />
                </div>
                {todosGrupos.length > 1 && (
                  <div className="mt-1">
                    <AbrangenciaTipo tipoId={t.id} todosGrupos={todosGrupos} gruposAtuais={gruposPorTipo[t.id] ?? []} />
                  </div>
                )}
                {t.calculo_automatico ? (
                  <p className="mt-1 text-xs text-slate-400">coluna automática: só dá para desligar</p>
                ) : excluindoId === t.id ? (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                    <p className="text-sm text-red-800">
                      Excluir a coluna <strong>{t.nome}</strong>?
                    </p>
                    {carregandoUso && <p className="text-xs text-red-700">Verificando valores lançados...</p>}
                    {usoExclusao && (
                      <p className="text-xs text-red-700">
                        {usoExclusao.lancamentos === 0
                          ? "Esta coluna não tem valores lançados. "
                          : `Isso também apaga ${usoExclusao.lancamentos} valor${usoExclusao.lancamentos !== 1 ? "es" : ""} lançado${usoExclusao.lancamentos !== 1 ? "s" : ""} em ${usoExclusao.meses} mês${usoExclusao.meses !== 1 ? "es" : ""}, inclusive de meses já fechados. `}
                        Não dá para desfazer. Se só quiser esconder a coluna, use o interruptor.
                      </p>
                    )}
                    {erroExclusao && <p className="text-xs font-medium text-red-800">{erroExclusao}</p>}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => confirmarExclusao(t.id)}
                        disabled={isPending || carregandoUso || !usoExclusao}
                        className="rounded-md bg-red-700 text-white text-xs font-medium px-3 py-1.5 hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending ? "Excluindo..." : "Excluir definitivamente"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelarExclusao}
                        disabled={isPending}
                        className="text-xs text-slate-600 hover:text-slate-800"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pedirExclusao(t.id)}
                    className="mt-1 text-xs text-red-700 hover:underline"
                  >
                    Excluir coluna
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section className="card">
      <div className="flex items-center gap-3 mb-4">
        <span aria-hidden className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-lg">
          🗂️
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Colunas cadastradas</h2>
          <p className="text-xs text-slate-500">
            Configure as colunas que serão lançadas na folha. Elas valem para todas as unidades (ou só as que você escolher).
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CartaoCategoria titulo="Proventos" cor="provento" tipos={proventosAtivos} onEditar={abrirPainel} />
        <CartaoCategoria titulo="Descontos" cor="desconto" tipos={descontosAtivos} onEditar={abrirPainel} />
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Fechar painel"
            onClick={() => setAberto(false)}
            className="absolute inset-0 bg-slate-900/40 cursor-default"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Editar colunas"
            className="relative w-full sm:w-[26rem] max-w-full h-full bg-white shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">Editar colunas</h3>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar coluna..."
                className="input"
              />

              {linhasCategoria("Provento", proventos)}
              {linhasCategoria("Desconto", descontos)}

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">＋ Nova coluna</p>
                <form
                  ref={formNovaRef}
                  action={async (formData: FormData) => {
                    await cadastrarTipoFolha(formData);
                    formNovaRef.current?.reset();
                    setRestringirNova(false);
                  }}
                  className="space-y-2"
                >
                  <input name="nome" required className="input" placeholder="Nome (ex.: Auxílio Creche)" />
                  <div className="grid grid-cols-2 gap-2">
                    <select name="categoria" required defaultValue="provento" className="input">
                      <option value="provento">Provento</option>
                      <option value="desconto">Desconto</option>
                    </select>
                    <select name="formato" defaultValue="moeda" className="input">
                      <option value="moeda">Valor em R$</option>
                      <option value="texto">Texto livre</option>
                      <option value="sim_nao">Sim/Não</option>
                    </select>
                  </div>
                  <input name="codigo" className="input" placeholder="Código (opcional)" />

                  {todosGrupos.length > 1 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setRestringirNova((v) => !v)}
                        className="text-xs text-slate-500 hover:text-brand-600 underline decoration-dotted text-left"
                      >
                        {restringirNova
                          ? "essa coluna nova vai valer só pras unidades marcadas abaixo ↓"
                          : "essa coluna nova vale pra todas as unidades — clique aqui se for só de algumas"}
                      </button>
                      {restringirNova && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                          {todosGrupos.map((g) => (
                            <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700">
                              <input type="checkbox" name="grupos" value={g} />
                              {g}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button type="submit" className="btn-secondary !text-sm !py-1.5 w-full">
                    ＋ Cadastrar coluna
                  </button>
                  <p className="text-xs text-slate-400">
                    Ao cadastrar, a coluna nova já entra ligada e a página é atualizada.
                  </p>
                </form>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={salvar}
                disabled={isPending || semMudancas}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Salvando..." : "Salvar alterações"}
              </button>
              {semMudancas && (
                <p className="text-xs text-slate-400 text-center mt-2">Ligue ou desligue uma coluna para poder salvar.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
