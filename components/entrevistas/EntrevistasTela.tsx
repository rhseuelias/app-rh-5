"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { corDaEmpresa } from "@/lib/empresa-cores";
import RoteiroFicha from "@/components/entrevistas/RoteiroFicha";
import AnaliseCurriculo from "@/components/entrevistas/AnaliseCurriculo";
import { cargoParecido } from "@/lib/cargo-parecido";
import type { CargoDesc } from "@/lib/cargos";
import { createClient } from "@/lib/supabase-browser";
import { atualizarRegistro, criarRegistro, excluirRegistro, salvarAvaliacao, type RespostaEnt } from "@/lib/actions-entrevistas";
import {
  CRITERIOS,
  EMPRESAS_SEL,
  ENCERRADOS,
  ETAPAS,
  ESTILO_ETAPA,
  ETAPAS_ENTREVISTA,
  FONTES,
  RECOMENDACOES,
  STATUS_ENTREVISTA,
  STATUS_VAGA,
  TIPOS_ENTREVISTA,
  UNIDADES_BSE,
  diaMes,
  diasEntre,
  diaSemana,
  encerrado,
  fmtCurta,
  hojeSP,
  mediaNotas,
  mesCurto,
  rotuloEmpresa,
  rotuloEtapaEntrevista,
  sugerirEtapaEntrevista,
  somaDias,
  type AvaliacaoSel,
  type CandidatoSel,
  type EmpresaSel,
  type EntrevistaSel,
  type Vaga,
} from "@/lib/entrevistas";

type Visao = "vagas" | "agenda" | "funil" | "candidatos";
type AbaFicha = "entrevista" | "avaliacao" | "candidato" | "analise";
type Modal = null | { tipo: "vaga" } | { tipo: "candidato"; vagaId?: string } | { tipo: "entrevista"; candidatoId?: string };

interface Props {
  vagasIniciais: Vaga[];
  candidatosIniciais: CandidatoSel[];
  entrevistasIniciais: EntrevistaSel[];
  avaliacoesIniciais: AvaliacaoSel[];
  cargos: CargoDesc[];
}

/* ------------------------------------------------------------------ */
/* Currículo anexado (arquivo guardado no Supabase Storage)            */
/* ------------------------------------------------------------------ */

const PASTA_CURRICULOS = "curriculos";
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS_ACEITOS = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

function nomeSeguro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
}

async function enviarCurriculo(arquivo: File): Promise<{ ok: true; path: string; nome: string } | { ok: false; erro: string }> {
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: "O arquivo é grande demais. O limite é 10 MB." };
  const path = `${crypto.randomUUID()}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
  const { error } = await createClient().storage.from(PASTA_CURRICULOS).upload(path, arquivo, { contentType: arquivo.type || undefined });
  if (error) {
    const falta = /bucket not found|not found/i.test(error.message);
    return { ok: false, erro: falta ? "Falta criar a pasta de currículos no banco. Rode o arquivo migration_028_curriculos.sql no Supabase (SQL Editor)." : `Não foi possível enviar o currículo: ${error.message}` };
  }
  return { ok: true, path, nome: arquivo.name };
}

async function apagarCurriculo(path: string): Promise<void> {
  await createClient().storage.from(PASTA_CURRICULOS).remove([path]);
}

/** Abre o currículo em outra aba (link temporário de 5 minutos). */
async function abrirCurriculo(path: string): Promise<string | null> {
  const aba = window.open("", "_blank");
  const { data, error } = await createClient().storage.from(PASTA_CURRICULOS).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    aba?.close();
    return "Não foi possível abrir o currículo.";
  }
  if (aba) aba.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return null;
}

/* ------------------------------------------------------------------ */
/* Pequenos componentes de apoio                                       */
/* ------------------------------------------------------------------ */

function Ponto({ empresa }: { empresa: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDaEmpresa(empresa, 0).cor }} />;
}

function Etiqueta({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "ok" | "aviso" | "ruim" }) {
  const cores = {
    neutro: "bg-brand-50 text-ink-800 border border-brand-200",
    ok: "bg-green-100 text-green-800",
    aviso: "bg-amber-100 text-amber-800",
    ruim: "bg-red-100 text-red-800",
  }[tom];
  return <span className={`badge ${cores}`}>{children}</span>;
}

function tomStatus(s: string): "ok" | "aviso" | "ruim" {
  return s === "Realizada" ? "ok" : s === "Agendada" ? "aviso" : "ruim";
}
function tomRec(r: string | null): "ok" | "aviso" | "ruim" | "neutro" {
  return r === "Avançar" ? "ok" : r === "Manter em avaliação" ? "aviso" : r === "Não avançar" ? "ruim" : "neutro";
}

function Nota({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-xs text-ink-500">Sem nota</span>;
  return <span className="font-display text-sm font-semibold bg-ink-900 text-white rounded-md px-2 py-0.5 tabular-nums">{valor.toFixed(1)}</span>;
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">{rotulo}</span>
      {children}
    </label>
  );
}

/** Campo de texto que salva ao sair dele (sem salvar a cada letra). */
function TextoSalvo({
  valor,
  aoSalvar,
  longo,
  nome,
  tipo = "text",
  placeholder,
}: {
  valor: string | null | undefined;
  aoSalvar: (v: string) => void;
  longo?: boolean;
  nome: string;
  tipo?: string;
  placeholder?: string;
}) {
  const atual = valor ?? "";
  if (longo) {
    return (
      <textarea
        name={nome}
        className="input min-h-[96px]"
        defaultValue={atual}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== atual && aoSalvar(e.target.value)}
      />
    );
  }
  return (
    <input
      name={nome}
      type={tipo}
      data-sem-maiuscula={tipo !== "text" || undefined}
      className="input"
      defaultValue={atual}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== atual && aoSalvar(e.target.value)}
    />
  );
}

function Radar({ notas }: { notas: Record<string, number | null> }) {
  const cx = 200;
  const cy = 140;
  const R = 88;
  const n = CRITERIOS.length;
  const ponto = (i: number, r: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const media = mediaNotas(notas);
  return (
    <div className="flex flex-col items-center rounded-2xl border border-brand-200 bg-white p-3">
      <svg viewBox="0 0 400 280" width="100%" style={{ maxWidth: 420 }} role="img" aria-label="Gráfico de notas por critério">
        {[1, 2, 3, 4, 5].map((l) => (
          <polygon key={l} points={CRITERIOS.map((_, i) => ponto(i, (R * l) / 5).join(",")).join(" ")} fill="none" stroke="#f0d0ac" strokeWidth={1} />
        ))}
        {CRITERIOS.map((c, i) => {
          const [x, y] = ponto(i, R);
          const [lx, ly] = ponto(i, R + 16);
          const cos = Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n);
          return (
            <g key={c.chave}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#f0d0ac" />
              <text x={lx} y={ly + 4} fontSize={12.5} fontWeight={600} fill="#2b2118" textAnchor={Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end"}>
                {c.curto}
              </text>
            </g>
          );
        })}
        <polygon
          points={CRITERIOS.map((c, i) => ponto(i, (R * (notas[c.chave] || 0)) / 5).join(",")).join(" ")}
          fill="#c9763a"
          fillOpacity={0.35}
          stroke="#a85822"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {CRITERIOS.map((c, i) => {
          const v = notas[c.chave];
          if (!v) return null;
          const [x, y] = ponto(i, (R * v) / 5);
          return <circle key={c.chave} cx={x} cy={y} r={4} fill="#a85822" />;
        })}
      </svg>
      <div className="font-display text-4xl font-semibold leading-none">
        {media ? media.toFixed(2) : "—"}
        <span className="ml-2 text-sm font-sans font-normal text-ink-500">nota média de 1 a 5</span>
      </div>
    </div>
  );
}

function JanelaModal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="bg-[#faf6f0] rounded-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto p-6 space-y-4">
        <h2 className="text-2xl">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

type Exec = (p: Promise<RespostaEnt>) => Promise<RespostaEnt>;

function ModalVaga({ hoje, executar, aoFechar, aoCriar }: { hoje: string; executar: Exec; aoFechar: () => void; aoCriar: (v: Vaga) => void }) {
  const [cargo, setCargo] = useState("");
  const [emp, setEmp] = useState<EmpresaSel>("BSE");
  const [uni, setUni] = useState<string>(UNIDADES_BSE[0]);
  const [gestor, setGestor] = useState("");
  const [abertura, setAbertura] = useState(hoje);
  const [posicoes, setPosicoes] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!cargo.trim()) return setMsg("Informe o cargo.");
    setSalvando(true);
    const campos = { cargo: cargo.trim(), empresa: emp, unidade: emp === "BSE" ? uni : null, gestor: gestor.trim() || null, status: "Aberta", data_abertura: abertura, observacoes: null, posicoes };
    const r = await executar(criarRegistro("vagas", campos));
    setSalvando(false);
    if (!r.ok) return setMsg(r.erro);
    aoCriar({ id: r.id as string, ...campos } as Vaga);
  }
  return (
    <JanelaModal titulo="Nova vaga" aoFechar={() => aoFechar()}>
      <Campo rotulo="Cargo">
        <input name="cargo" className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Empresa">
          <select className="input" value={emp} onChange={(e) => setEmp(e.target.value as EmpresaSel)}>
            {EMPRESAS_SEL.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        {emp === "BSE" && (
          <Campo rotulo="Unidade">
            <select className="input" value={uni} onChange={(e) => setUni(e.target.value)}>
              {UNIDADES_BSE.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Gestor solicitante">
          <input name="gestor" className="input" value={gestor} onChange={(e) => setGestor(e.target.value)} />
        </Campo>
        <Campo rotulo="Data de abertura">
          <input type="date" className="input" value={abertura} onChange={(e) => setAbertura(e.target.value)} />
        </Campo>
        <Campo rotulo="Quantas vagas (posições)">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Menos uma posição" className="btn-secondary !px-3 !py-1.5" onClick={() => setPosicoes((n) => Math.max(1, n - 1))}>−</button>
            <b className="font-display text-xl w-8 text-center tabular-nums">{posicoes}</b>
            <button type="button" aria-label="Mais uma posição" className="btn-secondary !px-3 !py-1.5" onClick={() => setPosicoes((n) => Math.min(50, n + 1))}>+</button>
          </div>
        </Campo>
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => aoFechar()}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Cadastrar vaga"}
        </button>
      </div>
    </JanelaModal>
  );
}

function ModalCandidato({ vagas, vagaIdInicial, hoje, executar, aoFechar, aoCriar }: { vagas: Vaga[]; vagaIdInicial?: string; hoje: string; executar: Exec; aoFechar: () => void; aoCriar: (c: CandidatoSel, e?: EntrevistaSel) => void }) {
  const abertas = vagas.filter((v) => v.status !== "Fechada" && v.status !== "Cancelada");
  const [vagaId, setVagaId] = useState(vagaIdInicial ?? abertas[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [fonte, setFonte] = useState<string>(FONTES[0]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [destino, setDestino] = useState<"rh" | "banco" | "so">("rh");
  const [dataRH, setDataRH] = useState(somaDias(hoje, 1));
  const [horaRH, setHoraRH] = useState("10:00");
  const [tipoRH, setTipoRH] = useState<string>("Vídeo");
  const [quemRH, setQuemRH] = useState("");
  const [linkRH, setLinkRH] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (destino === "rh" && !dataRH) return setMsg("Escolha a data da entrevista.");
    if (!vagaId) return setMsg("Cadastre uma vaga antes.");
    if (!nome.trim()) return setMsg("Informe o nome.");
    setSalvando(true);
    setMsg(null);
    let curriculo: { path: string; nome: string } | null = null;
    if (arquivo) {
      const up = await enviarCurriculo(arquivo);
      if (!up.ok) {
        setSalvando(false);
        return setMsg(up.erro);
      }
      curriculo = { path: up.path, nome: up.nome };
    }
    const campos = { vaga_id: vagaId, nome: nome.trim(), email: email.trim() || null, telefone: telefone.trim() || null, fonte, etapa: destino === "rh" ? "Entrevista RH" : destino === "banco" ? "Banco de talentos" : "Inscrito", responsavel: null, consentimento: false, curriculo_path: curriculo?.path ?? null, curriculo_nome: curriculo?.nome ?? null };
    const r = await executar(criarRegistro("candidatos", campos));
    setSalvando(false);
    if (!r.ok) {
      if (curriculo) await apagarCurriculo(curriculo.path);
      return setMsg(r.erro);
    }
    const novo = { id: r.id as string, pretensao: null, disponibilidade: null, link_curriculo: null, pontos_fortes: null, pontos_atencao: null, proxima_acao: null, proxima_data: null, ...campos } as CandidatoSel;
    if (destino !== "rh") return aoCriar(novo);
    const camposEnt = { candidato_id: novo.id, etapa: "Entrevista RH", data: dataRH, hora: horaRH || "10:00", tipo: tipoRH, entrevistador: quemRH.trim() || null, status: "Agendada", link_local: linkRH.trim() || null, resumo: null, aprofundar: null, recomendacao: null, proxima_acao: null, proxima_data: null };
    const re = await executar(criarRegistro("entrevistas", camposEnt));
    if (!re.ok) {
      aoCriar(novo);
      return;
    }
    aoCriar(novo, { id: re.id as string, ...camposEnt } as EntrevistaSel);
  }
  return (
    <JanelaModal titulo="Novo candidato" aoFechar={() => aoFechar()}>
      <Campo rotulo="Vaga">
        <select className="input" value={vagaId} onChange={(e) => setVagaId(e.target.value)}>
          {abertas.length === 0 && <option value="">Nenhuma vaga aberta</option>}
          {abertas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.cargo} · {rotuloEmpresa(v)}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Nome completo">
        <input name="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="E-mail">
          <input name="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Telefone">
          <input name="telefone" className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Fonte">
        <select className="input" value={fonte} onChange={(e) => setFonte(e.target.value)}>
          {FONTES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Currículo (opcional)">
        <input
          type="file"
          name="curriculo_arquivo"
          accept={TIPOS_ACEITOS}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-brand-300 file:bg-white file:px-4 file:py-2 file:font-medium"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <span className="block text-xs text-ink-500 mt-1">PDF, Word ou foto. Até 10 MB.</span>
      </Campo>
      <fieldset className="space-y-2 rounded-xl border border-brand-200 bg-white p-3">
        <legend className="px-1 text-sm font-semibold">O que fazer com este candidato?</legend>
        {([
          ["rh", "Agendar 1ª etapa · RH"],
          ["banco", "Colocar no banco de talentos"],
          ["so", "Só cadastrar por enquanto"],
        ] as const).map(([k, rotulo]) => (
          <label key={k} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="destino_candidato" checked={destino === k} onChange={() => setDestino(k)} />
            <span>{rotulo}</span>
          </label>
        ))}
        {destino === "rh" && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Campo rotulo="Data">
              <input type="date" className="input" value={dataRH} onChange={(e) => setDataRH(e.target.value)} />
            </Campo>
            <Campo rotulo="Horário">
              <input type="time" className="input" value={horaRH} onChange={(e) => setHoraRH(e.target.value)} />
            </Campo>
            <Campo rotulo="Tipo">
              <select className="input" value={tipoRH} onChange={(e) => setTipoRH(e.target.value)}>
                {TIPOS_ENTREVISTA.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Entrevistador">
              <input name="entrevistador" className="input" value={quemRH} onChange={(e) => setQuemRH(e.target.value)} />
            </Campo>
            <div className="col-span-2">
              <Campo rotulo="Link ou local">
                <input name="link_local" className="input" value={linkRH} onChange={(e) => setLinkRH(e.target.value)} placeholder="Link da videochamada ou endereço" />
              </Campo>
            </div>
          </div>
        )}
      </fieldset>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => aoFechar()}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : destino === "rh" ? "Cadastrar e agendar" : destino === "banco" ? "Cadastrar no banco de talentos" : "Cadastrar candidato"}
        </button>
      </div>
    </JanelaModal>
  );
}

function ModalEntrevista({ cands, ents, vagaPor, candidatoIdInicial, hoje, executar, aoFechar, aoCriar }: { cands: CandidatoSel[]; ents: EntrevistaSel[]; vagaPor: Map<string, Vaga>; candidatoIdInicial?: string; hoje: string; executar: Exec; aoFechar: () => void; aoCriar: (e: EntrevistaSel) => void }) {
  const ativos = cands.filter((c) => !encerrado(c.etapa));
  const [candId, setCandId] = useState(candidatoIdInicial ?? ativos[0]?.id ?? "");
  const sugerida = (id: string) => {
    const c = cands.find((x) => x.id === id);
    return c ? sugerirEtapaEntrevista(c.etapa, ents.filter((e) => e.candidato_id === id)) : "Entrevista RH";
  };
  const [etapa, setEtapa] = useState<string>(() => sugerida(candidatoIdInicial ?? ativos[0]?.id ?? ""));
  const [tipo, setTipo] = useState<string>("Vídeo");
  const [data, setData] = useState(somaDias(hoje, 1));
  const [hora, setHora] = useState("10:00");
  const [quem, setQuem] = useState("");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!candId) return setMsg("Escolha o candidato.");
    if (!data) return setMsg("Escolha a data.");
    setSalvando(true);
    const campos = { candidato_id: candId, etapa, data, hora: hora || "10:00", tipo, entrevistador: quem.trim() || null, status: "Agendada", link_local: link.trim() || null, resumo: null, aprofundar: null, recomendacao: null, proxima_acao: null, proxima_data: null };
    const r = await executar(criarRegistro("entrevistas", campos));
    setSalvando(false);
    if (!r.ok) return setMsg(r.erro);
    aoCriar({ id: r.id as string, ...campos } as EntrevistaSel);
  }
  return (
    <JanelaModal titulo="Agendar entrevista" aoFechar={() => aoFechar()}>
      <Campo rotulo="Candidato">
        <select
          className="input"
          value={candId}
          onChange={(e) => {
            setCandId(e.target.value);
            setEtapa(sugerida(e.target.value));
          }}
        >
          {ativos.length === 0 && <option value="">Nenhum candidato ativo</option>}
          {ativos.map((c) => {
            const v = vagaPor.get(c.vaga_id);
            return (
              <option key={c.id} value={c.id}>
                {c.nome} · {v?.cargo} ({v ? rotuloEmpresa(v) : ""})
              </option>
            );
          })}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Etapa">
          <select className="input" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {ETAPAS_ENTREVISTA.map((x) => (
              <option key={x} value={x}>
                {rotuloEtapaEntrevista(x)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_ENTREVISTA.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Data">
          <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Horário">
          <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Entrevistador">
        <input name="entrevistador" className="input" value={quem} onChange={(e) => setQuem(e.target.value)} />
      </Campo>
      <Campo rotulo="Link ou local">
        <input name="link_local" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link da videochamada ou endereço" />
      </Campo>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => aoFechar()}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Agendar"}
        </button>
      </div>
    </JanelaModal>
  );
}


/* ------------------------------------------------------------------ */
/* Tela principal                                                      */
/* ------------------------------------------------------------------ */

export default function EntrevistasTela({ vagasIniciais, candidatosIniciais, entrevistasIniciais, avaliacoesIniciais, cargos }: Props) {
  const [vagas, setVagas] = useState(vagasIniciais);
  const [cands, setCands] = useState(candidatosIniciais);
  const [ents, setEnts] = useState(entrevistasIniciais);
  const [avals, setAvals] = useState<Record<string, AvaliacaoSel>>(() => Object.fromEntries(avaliacoesIniciais.map((a) => [a.candidato_id, a])));

  const [empresa, setEmpresa] = useState<"Todas" | EmpresaSel>("Todas");
  const [unidade, setUnidade] = useState("Todas");
  const [visao, setVisao] = useState<Visao>("vagas");
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("Todas");
  const [ficha, setFicha] = useState<{ candId: string; entId?: string } | null>(null);
  const [aba, setAba] = useState<AbaFicha>("entrevista");
  const [analiseAuto, setAnaliseAuto] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [confirmaVaga, setConfirmaVaga] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);

  const hoje = hojeSP();

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else setFicha(null);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [modal]);

  const vagaPor = useMemo(() => new Map(vagas.map((v) => [v.id, v])), [vagas]);
  const candPor = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);

  const passaVaga = (v: Vaga) => (empresa === "Todas" || v.empresa === empresa) && (empresa !== "BSE" || unidade === "Todas" || v.unidade === unidade);
  const vagasFiltradas = vagas.filter(passaVaga);
  const candsFiltrados = cands.filter((c) => {
    const v = vagaPor.get(c.vaga_id);
    return !!v && passaVaga(v);
  });
  const entsFiltradas = ents.filter((e) => {
    const c = candPor.get(e.candidato_id);
    const v = c ? vagaPor.get(c.vaga_id) : undefined;
    return !!v && passaVaga(v);
  });

  const proxima = (candId: string) =>
    ents
      .filter((e) => e.candidato_id === candId && e.status === "Agendada")
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))[0];

  const notaDe = (candId: string) => mediaNotas(avals[candId]?.notas);

  /* ---------- gravação ---------- */
  async function executar(p: Promise<RespostaEnt>): Promise<RespostaEnt> {
    setPendentes((n) => n + 1);
    try {
      const r = await p;
      if (!r.ok) setErro(r.erro);
      else setErro(null);
      return r;
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
      return { ok: false, erro: "falhou" };
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  function patchVaga(id: string, campos: Partial<Vaga>) {
    setVagas((p) => p.map((v) => (v.id === id ? { ...v, ...campos } : v)));
    void executar(atualizarRegistro("vagas", id, campos));
  }
  function patchCand(id: string, campos: Partial<CandidatoSel>) {
    setCands((p) => p.map((c) => (c.id === id ? { ...c, ...campos } : c)));
    void executar(atualizarRegistro("candidatos", id, campos));
  }
  function patchEnt(id: string, campos: Partial<EntrevistaSel>) {
    setEnts((p) => p.map((e) => (e.id === id ? { ...e, ...campos } : e)));
    void executar(atualizarRegistro("entrevistas", id, campos));
    if (campos.etapa) {
      const e = ents.find((x) => x.id === id);
      if (e) patchCand(e.candidato_id, { etapa: campos.etapa });
    }
  }
  function avalDe(candId: string): AvaliacaoSel {
    return avals[candId] ?? { candidato_id: candId, notas: {}, recomendacao: null, evidencias: null, risco: null };
  }
  function patchAval(candId: string, campos: Partial<AvaliacaoSel>) {
    setAvals((p) => ({ ...p, [candId]: { ...avalDe(candId), ...campos } }));
    void executar(
      salvarAvaliacao(candId, {
        ...(campos.notas ? { notas: campos.notas } : {}),
        ...("recomendacao" in campos ? { recomendacao: campos.recomendacao ?? null } : {}),
        ...("evidencias" in campos ? { evidencias: campos.evidencias ?? null } : {}),
        ...("risco" in campos ? { risco: campos.risco ?? null } : {}),
      })
    );
  }
  function darNota(candId: string, chave: string, n: number) {
    const atual = avalDe(candId).notas;
    patchAval(candId, { notas: { ...atual, [chave]: atual[chave] === n ? null : n } });
  }
  function avancar(c: CandidatoSel) {
    const i = ETAPAS.indexOf(c.etapa as (typeof ETAPAS)[number]);
    if (i < 0 || i >= ETAPAS.length - 1) return;
    patchCand(c.id, { etapa: ETAPAS[i + 1] });
    setAviso(`${c.nome.split(" ")[0]} avançou para ${ETAPAS[i + 1]}`);
  }

  async function removerVaga(id: string) {
    const r = await executar(excluirRegistro("vagas", id));
    setConfirmaVaga(null);
    if (!r.ok) return;
    const candIds = new Set(cands.filter((c) => c.vaga_id === id).map((c) => c.id));
    setVagas((p) => p.filter((v) => v.id !== id));
    setCands((p) => p.filter((c) => c.vaga_id !== id));
    setEnts((p) => p.filter((e) => !candIds.has(e.candidato_id)));
    setAviso("Vaga excluída");
  }
  async function removerCandidato(id: string) {
    const r = await executar(excluirRegistro("candidatos", id));
    if (!r.ok) return;
    setCands((p) => p.filter((c) => c.id !== id));
    setEnts((p) => p.filter((e) => e.candidato_id !== id));
    setFicha(null);
    setConfirmaExcluir(null);
    setAviso("Candidato excluído");
  }
  async function removerEntrevista(id: string, candId: string) {
    const r = await executar(excluirRegistro("entrevistas", id));
    if (!r.ok) return;
    setEnts((p) => p.filter((e) => e.id !== id));
    const resto = ents.filter((e) => e.candidato_id === candId && e.id !== id);
    setFicha({ candId, entId: resto[resto.length - 1]?.id });
    setConfirmaExcluir(null);
    setAviso("Entrevista excluída");
  }

  async function anexarNaFicha(c: CandidatoSel, arquivo: File) {
    await executar(
      (async (): Promise<RespostaEnt> => {
        const up = await enviarCurriculo(arquivo);
        if (!up.ok) return { ok: false, erro: up.erro };
        const r = await atualizarRegistro("candidatos", c.id, { curriculo_path: up.path, curriculo_nome: up.nome });
        if (!r.ok) {
          await apagarCurriculo(up.path);
          return r;
        }
        setCands((p) => p.map((x) => (x.id === c.id ? { ...x, curriculo_path: up.path, curriculo_nome: up.nome, analise_curriculo: null, analise_em: null } : x)));
        if (c.curriculo_path) await apagarCurriculo(c.curriculo_path);
        setAviso("Currículo anexado. Começando a análise…");
        // A análise do currículo começa sozinha: abre a aba e dispara.
        setAnaliseAuto(c.id);
        setAba("analise");
        return r;
      })()
    );
  }
  async function removerCurriculo(c: CandidatoSel) {
    if (!c.curriculo_path) return;
    const r = await executar(atualizarRegistro("candidatos", c.id, { curriculo_path: null, curriculo_nome: null }));
    if (!r.ok) return;
    await apagarCurriculo(c.curriculo_path);
    setCands((p) => p.map((x) => (x.id === c.id ? { ...x, curriculo_path: null, curriculo_nome: null, analise_curriculo: null, analise_em: null } : x)));
    setAviso("Currículo removido");
  }
  async function verCurriculo(c: CandidatoSel) {
    if (!c.curriculo_path) return;
    const msg = await abrirCurriculo(c.curriculo_path);
    if (msg) setErro(msg);
  }

  function abrirFicha(candId: string, entId?: string) {
    const es = ents.filter((e) => e.candidato_id === candId).sort((a, b) => a.data.localeCompare(b.data));
    setFicha({ candId, entId: entId ?? es[es.length - 1]?.id });
    setAba("entrevista");
    setConfirmaExcluir(null);
  }

  /* ---------- indicadores ---------- */
  const abertas = vagasFiltradas
    .filter((v) => ["Aberta", "Em triagem", "Em entrevistas", "Proposta"].includes(v.status))
    .reduce((soma, v) => {
      const preenchidas = cands.filter((c) => c.vaga_id === v.id && c.etapa === "Admitido").length;
      return soma + Math.max(0, (v.posicoes ?? 1) - preenchidas);
    }, 0);
  const agendadas = entsFiltradas.filter((e) => e.status === "Agendada" && e.data >= hoje).length;
  const admitidos = candsFiltrados.filter((c) => c.etapa === "Admitido").length;
  const atrasadas = candsFiltrados.filter((c) => !encerrado(c.etapa) && c.proxima_data && c.proxima_data < hoje).length;

  /* ------------------------------------------------------------------ */
  /* Cartão de entrevista (usado na Agenda e em "Hoje")                  */
  /* ------------------------------------------------------------------ */
  function CartaoEntrevista({ e }: { e: EntrevistaSel }) {
    const c = candPor.get(e.candidato_id);
    const v = c ? vagaPor.get(c.vaga_id) : undefined;
    if (!c || !v) return null;
    const atrasada = e.status === "Agendada" && e.data < hoje;
    const est = ESTILO_ETAPA[e.etapa];
    return (
      <button
        type="button"
        onClick={() => abrirFicha(c.id, e.id)}
        style={est ? { borderLeft: `6px solid ${est.cor}` } : undefined}
        className={`text-left bg-white rounded-xl border p-3.5 flex gap-3 hover:border-brand-400 transition-colors ${atrasada ? "border-red-500" : "border-brand-200"}`}
      >
        <span className="font-display text-2xl font-semibold leading-tight tabular-nums">{e.hora}</span>
        <span className="min-w-0 space-y-1">
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={est ? { background: est.bg, color: est.cor } : undefined}>
            {rotuloEtapaEntrevista(e.etapa)}
          </span>
          <strong className="block leading-tight break-words">{c.nome}</strong>
          <span className="flex items-center gap-1.5 text-sm text-ink-500">
            <Ponto empresa={v.empresa} />
            {v.cargo} · {rotuloEmpresa(v)}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Etiqueta tom={tomStatus(e.status)}>{e.status}</Etiqueta>
            {e.tipo} · {e.entrevistador || "—"}
          </span>
        </span>
      </button>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Visão: Por vaga                                                     */
  /* ------------------------------------------------------------------ */
  function VisaoVagas() {
    const deHoje = entsFiltradas.filter((e) => e.data === hoje && e.status !== "Cancelada").sort((a, b) => a.hora.localeCompare(b.hora));
    return (
      <div className="space-y-4">
        {deHoje.length > 0 && (
          <section className="rounded-2xl bg-ink-900 text-white p-4 space-y-3">
            <h3 className="text-base text-brand-300 uppercase">
              Hoje · {deHoje.length} {deHoje.length > 1 ? "entrevistas" : "entrevista"}
            </h3>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(270px,1fr))] text-ink-900">
              {deHoje.map((e) => (
                <CartaoEntrevista key={e.id} e={e} />
              ))}
            </div>
          </section>
        )}
        {vagasFiltradas.length === 0 && (
          <div className="card text-center space-y-3">
            <p className="text-ink-600">Nenhuma vaga cadastrada neste filtro.</p>
            <button type="button" className="btn-primary" onClick={() => setModal({ tipo: "vaga" })}>
              + Cadastrar vaga
            </button>
          </div>
        )}
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {vagasFiltradas.map((v) => {
            const cs = cands.filter((c) => c.vaga_id === v.id);
            const dias = diasEntre(v.data_abertura, hoje);
            const total = v.posicoes ?? 1;
            const preenchidas = cs.filter((c) => c.etapa === "Admitido").length;
            const cheia = preenchidas >= total;
            const ativos = cs.filter((c) => c.etapa !== "Admitido" && !encerrado(c.etapa));
            const candIds = new Set(cs.map((c) => c.id));
            const prox = ents
              .filter((e) => candIds.has(e.candidato_id) && e.status === "Agendada" && e.data >= hoje)
              .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))[0];
            const candProx = prox ? cs.find((c) => c.id === prox.candidato_id) : undefined;
            return (
              <section key={v.id} className="card !p-3 space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
                  <span className="flex items-center gap-1.5 min-w-0 text-base font-semibold text-ink-800">
                    <Ponto empresa={v.empresa} />
                    <span className="truncate">{rotuloEmpresa(v)}</span>
                  </span>
                  <span className={dias > 30 ? "text-red-700 font-bold" : ""}>{dias} dias</span>
                </div>
                <h3 className="text-base leading-tight uppercase break-words">{v.cargo}</h3>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={`inline-flex items-center gap-1.5 tabular-nums ${cheia ? "text-green-700" : ""}`} title={`${preenchidas} de ${total} posições preenchidas`}>
                    <span className="inline-flex gap-0.5">
                      {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
                        <i key={i} className={`inline-block w-2.5 h-2.5 rounded-full border-[1.5px] ${i < preenchidas ? (cheia ? "bg-green-600 border-green-600" : "bg-brand-500 border-brand-500") : "border-brand-500"}`} />
                      ))}
                    </span>
                    <b>{preenchidas}/{total}</b>
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink-500">
                    <button type="button" aria-label="Menos uma posição" className="w-6 h-6 rounded border border-brand-200 leading-none" onClick={() => patchVaga(v.id, { posicoes: Math.max(1, total - 1) })}>−</button>
                    <button type="button" aria-label="Mais uma posição" className="w-6 h-6 rounded border border-brand-200 leading-none" onClick={() => patchVaga(v.id, { posicoes: Math.min(50, total + 1) })}>+</button>
                  </span>
                </div>
                <div className="flex gap-0.5" aria-label="Candidatos por etapa">
                  {ETAPAS.map((et) => {
                    const n = cs.filter((c) => c.etapa === et).length;
                    return (
                      <i
                        key={et}
                        title={`${et}: ${n}`}
                        className="flex-1 h-1.5 rounded-sm"
                        style={{ background: n ? (et === "Etapa técnica" ? ESTILO_ETAPA["Etapa técnica"].cor : "#c9763a") : "#ecdccd" }}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ativos.length === 0 && <span className="text-xs text-ink-500">Sem candidatos em andamento</span>}
                  {ativos.map((c) => {
                    const est = ESTILO_ETAPA[c.etapa];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={`${c.nome} · ${rotuloEtapaEntrevista(c.etapa)}`}
                        onClick={() => abrirFicha(c.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-200 pl-0.5 pr-2 py-0.5 text-xs hover:bg-brand-50"
                      >
                        <em className="not-italic w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold" style={{ background: est?.bg ?? "#fdf0e3", color: est?.cor ?? "#a85822" }}>
                          {c.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                        </em>
                        {c.nome.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-dashed border-brand-200 pt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-ink-500">
                    {prox && candProx ? (
                      <>
                        Próxima: <b className="text-ink-800">{candProx.nome.split(" ")[0]}</b> · {rotuloEtapaEntrevista(prox.etapa)} · {prox.data === hoje ? "hoje" : fmtCurta(prox.data)} {prox.hora}
                      </>
                    ) : (
                      "Nenhuma entrevista marcada"
                    )}
                  </span>
                  <button type="button" className="font-semibold text-brand-500 hover:underline shrink-0" onClick={() => setModal({ tipo: "candidato", vagaId: v.id })}>
                    + Candidato
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
                  <select aria-label="Situação da vaga" className="input !w-auto !py-1 !text-xs" value={v.status} onChange={(e) => patchVaga(v.id, { status: e.target.value })}>
                    {STATUS_VAGA.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {v.gestor && <span className="truncate">Gestor: {v.gestor}</span>}
                </div>
                <div className="text-right">
                  <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => setConfirmaVaga(v.id)}>
                    Excluir vaga
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Visão: Agenda                                                       */
  /* ------------------------------------------------------------------ */
  function VisaoAgenda() {
    const ordenadas = [...entsFiltradas].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    const pendentesReg = ordenadas.filter((e) => e.status === "Agendada" && e.data < hoje);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Etapas</span>
          {ETAPAS_ENTREVISTA.map((x) => (
            <span key={x} className="rounded-full px-3 py-1 font-semibold" style={{ background: ESTILO_ETAPA[x].bg, color: ESTILO_ETAPA[x].cor }}>
              {rotuloEtapaEntrevista(x)}
            </span>
          ))}
        </div>
        {pendentesReg.length > 0 && (
          <section className="rounded-2xl border border-red-500 bg-red-50 p-4 space-y-3">
            <h3 className="text-base text-red-700 uppercase">
              {pendentesReg.length} {pendentesReg.length > 1 ? "entrevistas esperam" : "entrevista espera"} registro
            </h3>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
              {pendentesReg.map((e) => (
                <CartaoEntrevista key={e.id} e={e} />
              ))}
            </div>
          </section>
        )}
        {Array.from({ length: 7 }, (_, i) => {
          const ds = somaDias(hoje, i);
          const lista = ordenadas.filter((e) => e.data === ds && e.status !== "Cancelada");
          return (
            <section key={ds} className="grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[92px_minmax(0,1fr)] gap-3 sm:gap-4 items-start">
              <div className={`rounded-xl border text-center py-2 ${i === 0 ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}>
                <small className={`block text-xs uppercase tracking-widest font-bold ${i === 0 ? "text-brand-300" : "text-ink-500"}`}>{i === 0 ? "Hoje" : diaSemana(ds)}</small>
                <b className="block font-display text-3xl leading-tight font-semibold">{diaMes(ds)}</b>
                <small className={`block text-xs uppercase tracking-widest font-bold ${i === 0 ? "text-brand-300" : "text-ink-500"}`}>{mesCurto(ds)}</small>
              </div>
              {lista.length ? (
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
                  {lista.map((e) => (
                    <CartaoEntrevista key={e.id} e={e} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-brand-300 p-3.5 text-sm text-ink-500">Nenhuma entrevista neste dia.</div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Visão: Funil                                                        */
  /* ------------------------------------------------------------------ */
  function VisaoFunil() {
    return (
      <div className="space-y-3">
        <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-3 overflow-x-auto pb-3 items-start">
          {ETAPAS.map((et) => {
            const lista = candsFiltrados.filter((c) => c.etapa === et);
            const quente = et.startsWith("Entrevista") || et === "Etapa técnica";
            return (
              <section key={et} className={`rounded-2xl border p-3 space-y-2.5 min-h-[150px] ${quente ? "bg-brand-100 border-brand-300" : "bg-brand-50 border-brand-200"}`}>
                <header className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm uppercase tracking-wider">{et}</h3>
                  <span className="font-display text-xl tabular-nums">{lista.length}</span>
                </header>
                {lista.length === 0 && <div className="rounded-lg border border-dashed border-brand-300 p-2.5 text-sm text-ink-500">Vazio</div>}
                {lista.map((c) => {
                  const v = vagaPor.get(c.vaga_id);
                  const atrasada = c.proxima_data && c.proxima_data < hoje;
                  return (
                    <article key={c.id} className="bg-white rounded-xl border border-brand-200 p-3 space-y-1.5">
                      <button type="button" className="text-left font-bold leading-tight hover:underline break-words" onClick={() => abrirFicha(c.id)}>
                        {c.nome}
                      </button>
                      {v && (
                        <span className="flex items-center gap-1.5 text-sm text-ink-500">
                          <Ponto empresa={v.empresa} />
                          {v.cargo} · {rotuloEmpresa(v)}
                        </span>
                      )}
                      {c.proxima_acao && (
                        <span className={`block text-[13px] ${atrasada ? "text-red-700 font-bold" : "text-ink-500"}`}>
                          {atrasada ? "Atrasada · " : ""}
                          {c.proxima_acao} · {fmtCurta(c.proxima_data)}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <Nota valor={notaDe(c.id)} />
                        {et !== "Admitido" && (
                          <button type="button" className="btn-secondary !px-3 !py-1 text-sm" onClick={() => avancar(c)}>
                            Avançar →
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
        <p className="text-sm text-ink-500">
          Encerrados: {ENCERRADOS.map((x) => `${x} (${candsFiltrados.filter((c) => c.etapa === x).length})`).join(" · ")}. Veja na aba Candidatos.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Visão: Candidatos                                                   */
  /* ------------------------------------------------------------------ */
  function VisaoCandidatos() {
    const q = busca.trim().toLowerCase();
    const lista = candsFiltrados.filter((c) => {
      const v = vagaPor.get(c.vaga_id);
      return (filtroEtapa === "Todas" || c.etapa === filtroEtapa) && (!q || c.nome.toLowerCase().includes(q) || (v?.cargo ?? "").toLowerCase().includes(q));
    });
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            name="busca"
            className="input flex-1 min-w-[200px]"
            placeholder="Buscar por nome ou cargo"
            aria-label="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select className="input !w-auto min-w-[200px]" aria-label="Filtrar por etapa" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
            <option>Todas</option>
            {[...ETAPAS, ...ENCERRADOS].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-500 border-b border-brand-200">
                {["Candidato", "Vaga", "Empresa", "Etapa", "Nota", "Próxima ação", "Fonte", "Currículo"].map((h) => (
                  <th key={h} className="px-3.5 py-3 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3.5 py-6 text-center text-ink-500">
                    Nenhum candidato encontrado.
                  </td>
                </tr>
              )}
              {lista.map((c) => {
                const v = vagaPor.get(c.vaga_id);
                const atrasada = !encerrado(c.etapa) && c.proxima_data && c.proxima_data < hoje;
                return (
                  <tr key={c.id} className="border-b border-brand-100 last:border-0">
                    <td className="px-3.5 py-3">
                      <button type="button" className="font-bold text-left hover:underline" onClick={() => abrirFicha(c.id)}>
                        {c.nome}
                      </button>
                    </td>
                    <td className="px-3.5 py-3">{v?.cargo}</td>
                    <td className="px-3.5 py-3">
                      {v && (
                        <span className="flex items-center gap-1.5">
                          <Ponto empresa={v.empresa} />
                          {rotuloEmpresa(v)}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <Etiqueta>{c.etapa}</Etiqueta>
                    </td>
                    <td className="px-3.5 py-3">
                      <Nota valor={notaDe(c.id)} />
                    </td>
                    <td className={`px-3.5 py-3 ${atrasada ? "text-red-700 font-bold" : "text-ink-500"}`}>
                      {c.proxima_acao ? `${c.proxima_acao} · ${fmtCurta(c.proxima_data)}` : "—"}
                    </td>
                    <td className="px-3.5 py-3">{c.fonte ?? "—"}</td>
                    <td className="px-3.5 py-3">
                      {c.curriculo_path ? (
                        <button type="button" className="font-semibold text-brand-500 hover:underline" onClick={() => verCurriculo(c)}>
                          Abrir
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Ficha do candidato (gaveta lateral)                                 */
  /* ------------------------------------------------------------------ */
  function Ficha() {
    if (!ficha) return null;
    const c = candPor.get(ficha.candId);
    if (!c) return null;
    const v = vagaPor.get(c.vaga_id);
    const es = ents.filter((e) => e.candidato_id === c.id).sort((a, b) => a.data.localeCompare(b.data));
    const e = es.find((x) => x.id === ficha.entId) ?? es[es.length - 1];
    const av = avalDe(c.id);
    const abas: [AbaFicha, string][] = [
      ["entrevista", "Entrevista"],
      ["avaliacao", "Avaliação"],
      ["candidato", "Candidato"],
      ["analise", "Análise do currículo"],
    ];
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setFicha(null)} />
        <aside role="dialog" aria-modal="true" aria-label="Ficha do candidato" className="fixed top-0 right-0 bottom-0 z-40 w-[min(620px,100%)] bg-[#faf6f0] flex flex-col shadow-2xl">
          <div className="relative bg-white border-b border-brand-200 px-5 pt-5 pb-3 space-y-1.5">
            <button type="button" aria-label="Fechar" onClick={() => setFicha(null)} className="absolute top-3 right-4 w-10 h-10 rounded-lg border border-brand-200 bg-brand-50 text-xl leading-none">
              ×
            </button>
            {v && (
              <span className="flex items-center gap-1.5 text-sm text-ink-500 pr-12">
                <Ponto empresa={v.empresa} />
                {v.cargo} · {rotuloEmpresa(v)}
              </span>
            )}
            <h2 className="text-2xl leading-tight pr-12">{c.nome}</h2>
            <div className="flex items-center gap-2">
              <Etiqueta>{c.etapa}</Etiqueta>
              <Nota valor={mediaNotas(av.notas)} />
            </div>
          </div>
          <div role="tablist" className="flex gap-1 px-4 bg-white border-b border-brand-200 overflow-x-auto">
            {abas.map(([k, nome]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={aba === k}
                onClick={() => setAba(k)}
                className={`px-3 py-2.5 whitespace-nowrap font-display uppercase tracking-wide text-base font-semibold border-b-4 -mb-px ${aba === k ? "border-brand-400 text-ink-900" : "border-transparent text-ink-500"}`}
              >
                {nome}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {aba === "entrevista" && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Etapas</span>
                  {es.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={e?.id === x.id}
                      onClick={() => {
                        setFicha({ candId: c.id, entId: x.id });
                        setConfirmaExcluir(null);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${e?.id === x.id ? "border-brand-400 bg-brand-100 text-brand-600" : "border-brand-200 bg-white"}`}
                    >
                      {x.etapa.replace("Entrevista ", "")} · {fmtCurta(x.data)}
                    </button>
                  ))}
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setModal({ tipo: "entrevista", candidatoId: c.id })}>
                    + Nova
                  </button>
                </div>
                {!e ? (
                  <p className="rounded-xl border border-dashed border-brand-300 p-3.5 text-sm text-ink-500">Ainda não há entrevista para este candidato. Use “+ Nova” para agendar.</p>
                ) : (
                  <div key={e.id} className="space-y-4">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                      <Campo rotulo="Situação">
                        <select className="input" value={e.status} onChange={(ev) => patchEnt(e.id, { status: ev.target.value })}>
                          {STATUS_ENTREVISTA.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Campo>
                      <Campo rotulo="Etapa">
                        <select className="input" value={e.etapa} onChange={(ev) => patchEnt(e.id, { etapa: ev.target.value })}>
                          {ETAPAS_ENTREVISTA.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Campo>
                      <Campo rotulo="Data">
                        <input type="date" className="input" value={e.data} onChange={(ev) => ev.target.value && patchEnt(e.id, { data: ev.target.value })} />
                      </Campo>
                      <Campo rotulo="Horário">
                        <input type="time" className="input" value={e.hora} onChange={(ev) => ev.target.value && patchEnt(e.id, { hora: ev.target.value })} />
                      </Campo>
                      <Campo rotulo="Tipo">
                        <select className="input" value={e.tipo} onChange={(ev) => patchEnt(e.id, { tipo: ev.target.value })}>
                          {TIPOS_ENTREVISTA.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Campo>
                      <Campo rotulo="Entrevistador">
                        <TextoSalvo nome="entrevistador" valor={e.entrevistador} aoSalvar={(x) => patchEnt(e.id, { entrevistador: x })} />
                      </Campo>
                    </div>
                    <Campo rotulo="Link ou local">
                      <TextoSalvo nome="link_local" tipo="text" valor={e.link_local} aoSalvar={(x) => patchEnt(e.id, { link_local: x })} />
                    </Campo>
                    {(e.etapa === "Entrevista RH" || e.etapa === "Etapa técnica") && (
                      <RoteiroFicha
                        key={`${e.id}-${e.etapa}-${e.respondida_em ?? ""}`}
                        e={e}
                        candidatoNome={c.nome}
                        vaga={vagaPor.get(c.vaga_id)}
                        cargos={cargos}
                        aoSalvar={(campos) => patchEnt(e.id, campos)}
                        aoLocal={(campos) => setEnts((p) => p.map((x) => (x.id === e.id ? { ...x, ...campos } : x)))}
                      />
                    )}
                    <Campo rotulo="Resumo da conversa">
                      <TextoSalvo longo nome="resumo" valor={e.resumo} placeholder="O que o candidato contou, com exemplos concretos." aoSalvar={(x) => patchEnt(e.id, { resumo: x })} />
                    </Campo>
                    <Campo rotulo="Pontos a aprofundar">
                      <TextoSalvo longo nome="aprofundar" valor={e.aprofundar} placeholder="O que ficou em aberto para a próxima etapa." aoSalvar={(x) => patchEnt(e.id, { aprofundar: x })} />
                    </Campo>
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">Recomendação</span>
                      <div className="flex flex-wrap gap-2">
                        {RECOMENDACOES.map((r) => {
                          const sel = e.recomendacao === r;
                          const cor = r === "Avançar" ? "bg-green-700 border-green-700" : r === "Manter em avaliação" ? "bg-amber-600 border-amber-600" : "bg-red-700 border-red-700";
                          return (
                            <button key={r} type="button" aria-pressed={sel} onClick={() => patchEnt(e.id, { recomendacao: sel ? null : r })} className={`flex-1 rounded-lg border px-3 py-2 font-semibold ${sel ? `${cor} text-white` : "bg-white border-brand-200"}`}>
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                      <Campo rotulo="Próxima ação">
                        <TextoSalvo nome="proxima_acao" valor={e.proxima_acao} aoSalvar={(x) => patchEnt(e.id, { proxima_acao: x })} />
                      </Campo>
                      <Campo rotulo="Data do próximo passo">
                        <input type="date" className="input" value={e.proxima_data ?? ""} onChange={(ev) => patchEnt(e.id, { proxima_data: ev.target.value || null })} />
                      </Campo>
                    </div>
                    <div className="pt-1">
                      {confirmaExcluir === e.id ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-red-700 font-semibold">Excluir esta entrevista?</span>
                          <button type="button" className="rounded-lg bg-red-700 text-white px-3 py-1.5 text-sm font-semibold" onClick={() => removerEntrevista(e.id, c.id)}>
                            Sim, excluir
                          </button>
                          <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setConfirmaExcluir(null)}>
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="text-sm text-red-700 hover:underline" onClick={() => setConfirmaExcluir(e.id)}>
                          Excluir esta entrevista
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {aba === "avaliacao" && (
              <>
                <Radar notas={av.notas} />
                <div>
                  {CRITERIOS.map((cr) => (
                    <div key={cr.chave} className="flex items-center justify-between gap-3 py-2 border-b border-brand-100">
                      <span className="font-semibold">{cr.nome}</span>
                      <div className="flex gap-1.5" role="group" aria-label={cr.nome}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={av.notas[cr.chave] === n}
                            aria-label={`Nota ${n}`}
                            onClick={() => darNota(c.id, cr.chave, n)}
                            className={`w-9 h-9 rounded-lg border font-display text-base font-semibold ${av.notas[cr.chave] === n ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1">Recomendação final</span>
                  <div className="flex flex-wrap gap-2">
                    {RECOMENDACOES.map((r) => {
                      const sel = av.recomendacao === r;
                      const cor = r === "Avançar" ? "bg-green-700 border-green-700" : r === "Manter em avaliação" ? "bg-amber-600 border-amber-600" : "bg-red-700 border-red-700";
                      return (
                        <button key={r} type="button" aria-pressed={sel} onClick={() => patchAval(c.id, { recomendacao: sel ? null : r })} className={`flex-1 rounded-lg border px-3 py-2 font-semibold ${sel ? `${cor} text-white` : "bg-white border-brand-200"}`}>
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Campo rotulo="Evidências observáveis">
                  <TextoSalvo longo nome="evidencias" valor={av.evidencias} placeholder="Fatos e exemplos que sustentam as notas." aoSalvar={(x) => patchAval(c.id, { evidencias: x })} />
                </Campo>
                <Campo rotulo="Risco ou ponto de atenção">
                  <TextoSalvo longo nome="risco" valor={av.risco} aoSalvar={(x) => patchAval(c.id, { risco: x })} />
                </Campo>
                <p className="text-sm text-ink-500">A nota média não decide sozinha. Use junto com as evidências.</p>
              </>
            )}

            {aba === "analise" && (
              <AnaliseCurriculo
                key={c.id}
                candidatoId={c.id}
                temCurriculo={!!c.curriculo_path}
                nomeCurriculo={c.curriculo_nome}
                cargos={cargos.map((x) => ({ id: x.id, cargo: x.cargo, empresa: x.empresa }))}
                cargoAutoId={v ? cargoParecido(cargos, v.cargo, v.empresa)?.id ?? null : null}
                vagaRotulo={v ? `${v.cargo} · ${rotuloEmpresa(v)}` : "cargo"}
                textoInicial={c.analise_curriculo ?? null}
                emInicial={c.analise_em ?? null}
                autoIniciar={analiseAuto === c.id}
                aoIniciou={() => setAnaliseAuto(null)}
                aoGuardar={(texto, em) => setCands((p) => p.map((x) => (x.id === c.id ? { ...x, analise_curriculo: texto, analise_em: em } : x)))}
              />
            )}
            {aba === "candidato" && (
              <div key={c.id} className="space-y-4">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                  <Campo rotulo="Nome">
                    <TextoSalvo nome="nome" valor={c.nome} aoSalvar={(x) => x.trim() && patchCand(c.id, { nome: x })} />
                  </Campo>
                  <Campo rotulo="E-mail">
                    <TextoSalvo nome="email" tipo="email" valor={c.email} aoSalvar={(x) => patchCand(c.id, { email: x || null })} />
                  </Campo>
                  <Campo rotulo="Telefone">
                    <TextoSalvo nome="telefone" valor={c.telefone} aoSalvar={(x) => patchCand(c.id, { telefone: x || null })} />
                  </Campo>
                  <Campo rotulo="Disponibilidade">
                    <TextoSalvo nome="disponibilidade" valor={c.disponibilidade} aoSalvar={(x) => patchCand(c.id, { disponibilidade: x || null })} />
                  </Campo>
                  <Campo rotulo="Pretensão salarial (R$)">
                    <TextoSalvo nome="pretensao" tipo="number" valor={c.pretensao === null ? "" : String(c.pretensao)} aoSalvar={(x) => patchCand(c.id, { pretensao: x === "" ? null : Number(x) })} />
                  </Campo>
                  <Campo rotulo="Fonte">
                    <select className="input" value={c.fonte ?? ""} onChange={(ev) => patchCand(c.id, { fonte: ev.target.value || null })}>
                      <option value="">—</option>
                      {FONTES.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Etapa atual">
                    <select className="input" value={c.etapa} onChange={(ev) => patchCand(c.id, { etapa: ev.target.value })}>
                      {[...ETAPAS, ...ENCERRADOS].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Responsável">
                    <TextoSalvo nome="responsavel" valor={c.responsavel} aoSalvar={(x) => patchCand(c.id, { responsavel: x || null })} />
                  </Campo>
                </div>
                <div className="rounded-xl border border-brand-200 bg-white p-3.5 space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-ink-500">Currículo anexado</span>
                  {c.curriculo_path ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold break-all">{c.curriculo_nome ?? "Currículo"}</span>
                      <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => verCurriculo(c)}>
                        Abrir
                      </button>
                      <label className="btn-secondary !px-3 !py-1.5 text-sm cursor-pointer">
                        Trocar
                        <input
                          type="file"
                          name="curriculo_trocar"
                          accept={TIPOS_ACEITOS}
                          className="sr-only"
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void anexarNaFicha(c, f);
                          }}
                        />
                      </label>
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setAba("analise")}>
                        Análise do currículo
                      </button>
                      <button type="button" className="text-sm text-red-700 hover:underline" onClick={() => removerCurriculo(c)}>
                        Remover
                      </button>
                    </div>
                  ) : (
                    <label className="btn-secondary !px-3 !py-1.5 text-sm cursor-pointer inline-block">
                      Anexar currículo
                      <input
                        type="file"
                        name="curriculo_novo"
                        accept={TIPOS_ACEITOS}
                        className="sr-only"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0];
                          ev.target.value = "";
                          if (f) void anexarNaFicha(c, f);
                        }}
                      />
                    </label>
                  )}
                  <span className="block text-xs text-ink-500">PDF, Word ou foto. Até 10 MB.</span>
                </div>
                <Campo rotulo="Link do currículo ou LinkedIn">
                  <TextoSalvo nome="link_curriculo" valor={c.link_curriculo} aoSalvar={(x) => patchCand(c.id, { link_curriculo: x || null })} />
                </Campo>
                <Campo rotulo="Pontos fortes">
                  <TextoSalvo longo nome="pontos_fortes" valor={c.pontos_fortes} aoSalvar={(x) => patchCand(c.id, { pontos_fortes: x })} />
                </Campo>
                <Campo rotulo="Pontos de atenção">
                  <TextoSalvo longo nome="pontos_atencao" valor={c.pontos_atencao} aoSalvar={(x) => patchCand(c.id, { pontos_atencao: x })} />
                </Campo>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                  <Campo rotulo="Próxima ação">
                    <TextoSalvo nome="proxima_acao" valor={c.proxima_acao} aoSalvar={(x) => patchCand(c.id, { proxima_acao: x })} />
                  </Campo>
                  <Campo rotulo="Data da próxima ação">
                    <input type="date" className="input" value={c.proxima_data ?? ""} onChange={(ev) => patchCand(c.id, { proxima_data: ev.target.value || null })} />
                  </Campo>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.consentimento} onChange={(ev) => patchCand(c.id, { consentimento: ev.target.checked })} />
                  Candidato autorizou o tratamento dos dados (LGPD)
                </label>
                <div className="pt-1">
                  {confirmaExcluir === c.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-red-700 font-semibold">Excluir candidato e todas as entrevistas dele?</span>
                      <button type="button" className="rounded-lg bg-red-700 text-white px-3 py-1.5 text-sm font-semibold" onClick={() => removerCandidato(c.id)}>
                        Sim, excluir
                      </button>
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setConfirmaExcluir(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="text-sm text-red-700 hover:underline" onClick={() => setConfirmaExcluir(c.id)}>
                      Excluir candidato
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Janelas de cadastro                                                 */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* Página                                                              */
  /* ------------------------------------------------------------------ */
  const abasVisao: [Visao, string][] = [
    ["vagas", "Por vaga"],
    ["agenda", "Agenda"],
    ["funil", "Funil"],
    ["candidatos", "Candidatos"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Recrutamento e Seleção</p>
          <h1 className="text-4xl leading-tight">Entrevistas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-500" aria-live="polite">
            {pendentes > 0 ? "Salvando…" : "Tudo salvo"}
          </span>
          <button type="button" className="btn-secondary" onClick={() => setModal({ tipo: "vaga" })}>
            + Vaga
          </button>
          <button type="button" className="btn-secondary" onClick={() => setModal({ tipo: "candidato" })}>
            + Candidato
          </button>
          <button type="button" className="btn-cta" onClick={() => setModal({ tipo: "entrevista" })}>
            + Agendar entrevista
          </button>
        </div>
      </div>

      {erro && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <span>{erro}</span>
          <button type="button" className="font-semibold" onClick={() => setErro(null)}>
            Fechar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["Todas", ...EMPRESAS_SEL] as const).map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={empresa === e}
            onClick={() => {
              setEmpresa(e);
              setUnidade("Todas");
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-semibold ${empresa === e ? "bg-ink-900 text-white border-ink-900" : "bg-white border-brand-200"}`}
          >
            {e !== "Todas" && <Ponto empresa={e} />}
            {e === "Todas" ? "Todas as empresas" : e}
          </button>
        ))}
        {empresa === "BSE" && (
          <select aria-label="Unidade da BSE" className="input !w-auto min-w-[180px]" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            <option>Todas</option>
            {UNIDADES_BSE.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-2xl border border-brand-200 bg-white">
        {[
          [abertas, "Vagas abertas", false],
          [candsFiltrados.length, "Candidatos", false],
          [agendadas, "Entrevistas agendadas", false],
          [admitidos, "Admitidos", false],
          [atrasadas, "Ações atrasadas", atrasadas > 0],
        ].map(([n, rotulo, alerta]) => (
          <div key={rotulo as string} className="px-4 py-3 border-r border-brand-100 last:border-r-0 max-sm:border-r-0 max-sm:border-b">
            <b className={`block font-display text-4xl leading-tight font-semibold tabular-nums ${alerta ? "text-red-700" : ""}`}>{n as number}</b>
            <span className="text-sm text-ink-500">{rotulo as string}</span>
          </div>
        ))}
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b-2 border-brand-200">
        {abasVisao.map(([k, nome]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={visao === k}
            onClick={() => setVisao(k)}
            className={`px-4 py-2.5 font-display uppercase tracking-wide text-lg font-semibold border-b-4 -mb-0.5 ${visao === k ? "border-brand-400 text-ink-900" : "border-transparent text-ink-500"}`}
          >
            {nome}
          </button>
        ))}
      </div>

      {visao === "vagas" && VisaoVagas()}
      {visao === "agenda" && VisaoAgenda()}
      {visao === "funil" && VisaoFunil()}
      {visao === "candidatos" && VisaoCandidatos()}

      {Ficha()}
      {confirmaVaga && (() => {
        const v = vagas.find((x) => x.id === confirmaVaga);
        if (!v) return null;
        const nCands = cands.filter((c) => c.vaga_id === v.id).length;
        return (
          <JanelaModal titulo="Excluir vaga?" aoFechar={() => setConfirmaVaga(null)}>
            <p>
              Tem certeza que deseja excluir a vaga <b>{v.cargo}</b> ({rotuloEmpresa(v)})?
            </p>
            {nCands > 0 && (
              <p className="text-sm text-red-700">
                Os {nCands} {nCands > 1 ? "candidatos" : "candidato"} desta vaga e as entrevistas deles também serão excluídos.
              </p>
            )}
            <p className="text-sm text-ink-500">Isso não pode ser desfeito.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmaVaga(null)}>
                Não, voltar
              </button>
              <button type="button" className="btn-primary !bg-red-700 !border-red-700" onClick={() => removerVaga(v.id)}>
                Sim, excluir
              </button>
            </div>
          </JanelaModal>
        );
      })()}
      {modal?.tipo === "vaga" && (
        <ModalVaga
          hoje={hoje}
          executar={executar}
          aoFechar={() => setModal(null)}
          aoCriar={(v) => {
            setVagas((p) => [v, ...p]);
            setModal(null);
            setAviso("Vaga cadastrada");
          }}
        />
      )}
      {modal?.tipo === "candidato" && (
        <ModalCandidato
          vagas={vagas}
          vagaIdInicial={modal.vagaId}
          hoje={hoje}
          executar={executar}
          aoFechar={() => setModal(null)}
          aoCriar={(c, e) => {
            setCands((p) => [...p, c]);
            if (e) setEnts((p) => [...p, e]);
            setModal(null);
            setAviso(e ? "Candidato cadastrado e 1ª etapa agendada" : c.etapa === "Banco de talentos" ? "Candidato no banco de talentos" : "Candidato cadastrado");
          }}
        />
      )}
      {modal?.tipo === "entrevista" && (
        <ModalEntrevista
          cands={cands}
          ents={ents}
          vagaPor={vagaPor}
          candidatoIdInicial={modal.candidatoId}
          hoje={hoje}
          executar={executar}
          aoFechar={() => setModal(null)}
          aoCriar={(e) => {
            setEnts((p) => [...p, e]);
            patchCand(e.candidato_id, { etapa: e.etapa });
            setModal(null);
            setAviso("Entrevista agendada");
          }}
        />
      )}

      {aviso && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}
