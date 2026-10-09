"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import DateInput from "@/components/DateInput";
import { empresaConhecidaPorCnpj, type EmpresaCarta } from "@/lib/carta-dados";
import {
  marcarHomologacao,
  marcarPagamento,
  removerDesligamento,
  salvarDesligamento,
} from "@/lib/actions-desligamento";
import {
  DICA_TIPO_AVISO,
  ROTULO_TIPO_AVISO,
  br,
  calcularPrazos,
  dataValida,
  diasDeAviso,
  faixaDesligamento,
  fDias,
  progressoAviso,
  situacaoHomologacao,
  situacaoPagamento,
  type Desligamento,
  type Tom,
  type TipoAviso,
} from "@/lib/desligamento";

const TIPOS: TipoAviso[] = ["trabalhado", "indenizado", "acordo"];

const FAIXA: Record<Tom, string> = {
  ok: "bg-emerald-50 border-emerald-200 text-emerald-900",
  atencao: "bg-amber-50 border-amber-300 text-amber-900",
  atrasado: "bg-red-50 border-red-300 text-red-900",
  feito: "bg-emerald-50 border-emerald-200 text-emerald-900",
  neutro: "bg-slate-50 border-slate-200 text-slate-800",
};

const PILULA: Record<Tom, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  atencao: "bg-amber-50 text-amber-800",
  atrasado: "bg-red-50 text-red-700",
  feito: "bg-emerald-100 text-emerald-800",
  neutro: "bg-slate-100 text-slate-600",
};

const BOLINHA: Record<Tom, string> = {
  ok: "border-2 border-emerald-500 text-emerald-700 bg-white",
  atencao: "border-[3px] border-amber-500 text-amber-800 bg-white",
  atrasado: "bg-red-600 text-white",
  feito: "bg-emerald-600 text-white",
  neutro: "border-2 border-slate-300 text-slate-500 bg-white",
};

const SIMBOLO: Record<Tom, string> = { ok: "", atencao: "", atrasado: "!", feito: "✓", neutro: "" };

interface Props {
  colaboradorId: string;
  nome: string;
  dataAdmissao: string | null;
  desligamento: Desligamento | null;
  hoje: string;
  tabelaFaltando: boolean;
  /** Dados da empresa que já existem no sistema (a carta usa como padrão). */
  empresaPadrao: { razao: string; cnpj: string };
  unidadeId: string | null;
}

type DadosEmpresaCarta = EmpresaCarta;

const CAMPOS_VAZIOS: DadosEmpresaCarta = {
  razao: "",
  cnpj: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

/** Bloco "Carta de aviso": PDF e Word no modelo da empresa. Empresas do grupo
 * já saem com o endereço; as outras guardam o que for digitado neste navegador. */
function CartaDeAviso({
  colaboradorId,
  tipoRotulo,
  empresaPadrao,
  unidadeId,
}: {
  colaboradorId: string;
  tipoRotulo: string;
  empresaPadrao: { razao: string; cnpj: string };
  unidadeId: string | null;
}) {
  const chave = `carta-empresa-v2-${unidadeId ?? "geral"}`;
  const [aberto, setAberto] = useState(false);
  const [e, setE] = useState<DadosEmpresaCarta>(() => ({
    ...CAMPOS_VAZIOS,
    razao: empresaPadrao.razao,
    cnpj: empresaPadrao.cnpj,
    ...(empresaConhecidaPorCnpj(empresaPadrao.cnpj) ?? {}),
  }));

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(chave);
      if (salvo) setE((atual) => ({ ...atual, ...(JSON.parse(salvo) as Partial<DadosEmpresaCarta>) }));
    } catch {
      /* sem armazenamento do navegador: segue só com os padrões */
    }
  }, [chave]);

  function mudar(campo: keyof DadosEmpresaCarta, valor: string) {
    setE((atual) => {
      const novo = { ...atual, [campo]: valor };
      try {
        window.localStorage.setItem(chave, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  }

  function link(formato: "pdf" | "docx") {
    const qs = new URLSearchParams();
    (Object.keys(e) as (keyof DadosEmpresaCarta)[]).forEach((k) => {
      if (e[k].trim()) qs.set(k, e[k].trim());
    });
    if (formato === "docx") qs.set("formato", "docx");
    return `/api/desligamento/${colaboradorId}/carta?${qs.toString()}`;
  }

  const campo = (k: keyof DadosEmpresaCarta, rotulo: string) => (
    <div>
      <label className="label" htmlFor={`carta-${k}`}>
        {rotulo}
      </label>
      <input id={`carta-${k}`} value={e[k]} onChange={(ev) => mudar(k, ev.target.value)} className="input" />
    </div>
  );

  return (
    <div id="carta-aviso" className="card space-y-3 scroll-mt-6">
      <h2 className="font-semibold text-slate-900">Carta de aviso</h2>
      <p className="text-sm text-slate-500">
        Modelo da empresa já preenchido ({tipoRotulo.toLowerCase()}), com as datas e os dados do colaborador. O Word
        você pode editar antes de imprimir.
      </p>
      <div className="flex gap-2 flex-wrap">
        <a href={link("pdf")} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
          Carta em PDF
        </a>
        <a href={link("docx")} className="btn-primary text-sm">
          Carta em Word
        </a>
        <button type="button" onClick={() => setAberto((v) => !v)} className="btn-secondary text-sm">
          {aberto ? "Fechar dados da empresa" : "Dados da empresa na carta"}
        </button>
      </div>
      {aberto && (
        <div className="grid gap-3">
          {campo("razao", "Razão social")}
          {campo("cnpj", "CNPJ")}
          {campo("endereco", "Endereço (rua)")}
          <div className="grid grid-cols-[90px_1fr] gap-3">
            {campo("numero", "Número")}
            {campo("complemento", "Complemento")}
          </div>
          {campo("bairro", "Bairro")}
          <div className="grid grid-cols-[1fr_80px] gap-3">
            {campo("cidade", "Cidade")}
            {campo("uf", "UF")}
          </div>
          <p className="text-xs text-slate-500">Fica guardado neste navegador para as próximas cartas desta unidade.</p>
        </div>
      )}
    </div>
  );
}

function Etapa({
  numero,
  tom,
  ultima,
  titulo,
  pilula,
  children,
}: {
  numero: number;
  tom: Tom;
  ultima?: boolean;
  titulo: string;
  pilula: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${BOLINHA[tom]}`}
        >
          {SIMBOLO[tom] || numero}
        </span>
        {!ultima && <span aria-hidden className={`w-0.5 flex-1 my-1 ${tom === "feito" ? "bg-emerald-500" : "bg-slate-200"}`} />}
      </div>
      <div className={`flex-1 min-w-0 space-y-2 ${ultima ? "" : "pb-6"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-slate-900">{titulo}</h3>
          <span className={`badge ${PILULA[tom]}`}>{pilula}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AcompanhamentoDesligamento({
  colaboradorId,
  nome,
  dataAdmissao,
  desligamento: d,
  hoje,
  tabelaFaltando,
  empresaPadrao,
  unidadeId,
}: Props) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  // campos do formulário (começam com o que já está salvo)
  const [tipo, setTipo] = useState<TipoAviso>(d?.tipo_aviso ?? "trabalhado");
  const [comunicacao, setComunicacao] = useState(d?.data_comunicacao ?? hoje);
  const [diasTexto, setDiasTexto] = useState(d?.tipo_aviso === "trabalhado" && d.dias_aviso ? String(d.dias_aviso) : "");
  const [precisaHomol, setPrecisaHomol] = useState(d?.homologacao_necessaria ?? true);
  const [homolData, setHomolData] = useState(d?.homologacao_data ?? "");
  const [homolHora, setHomolHora] = useState(d?.homologacao_hora ?? "");
  const [homolLocal, setHomolLocal] = useState(d?.homologacao_local ?? "");
  const [obs, setObs] = useState(d?.observacao ?? "");

  const diasAuto = useMemo(
    () => (dataValida(comunicacao) ? diasDeAviso(dataAdmissao, comunicacao) : 30),
    [comunicacao, dataAdmissao]
  );
  const diasUsados = diasTexto.trim() === "" ? diasAuto : Number(diasTexto);
  const previa = useMemo(() => {
    if (!dataValida(comunicacao)) return null;
    if (tipo === "trabalhado" && !(Number.isInteger(diasUsados) && diasUsados >= 1 && diasUsados <= 90)) return null;
    return calcularPrazos(tipo, comunicacao, tipo === "trabalhado" ? diasUsados : null);
  }, [tipo, comunicacao, diasUsados]);

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r.ok) depois?.();
      else setErro(r.erro);
    });
  }

  function salvar() {
    executar(
      () =>
        salvarDesligamento({
          colaboradorId,
          tipoAviso: tipo,
          dataComunicacao: comunicacao,
          diasAviso: tipo === "trabalhado" ? diasUsados : null,
          homologacaoNecessaria: precisaHomol,
          homologacaoData: homolData || null,
          homologacaoHora: homolHora || null,
          homologacaoLocal: homolLocal || null,
          observacao: obs || null,
        }),
      () => setFormAberto(false)
    );
  }

  function remover() {
    if (!confirm(`Apagar o acompanhamento de pagamento e homologação de ${nome}?`)) return;
    executar(() => removerDesligamento(colaboradorId), () => setFormAberto(false));
  }

  const aviso = erro ? (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {erro}
    </p>
  ) : null;

  // ---------- formulário (novo ou edição) ----------
  const formulario = (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="label">Tipo de desligamento</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {TIPOS.map((t) => (
            <label
              key={t}
              className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer text-sm ${
                tipo === t ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"
              }`}
            >
              <input
                type="radio"
                name="tipo_aviso"
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-slate-900 block">{ROTULO_TIPO_AVISO[t]}</span>
                <span className="text-xs text-slate-500">{DICA_TIPO_AVISO[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="desl-comunicacao">
            {tipo === "acordo" ? "Data do acordo assinado" : "Data da comunicação"}
          </label>
          <DateInput id="desl-comunicacao" value={comunicacao} onChange={setComunicacao} className="input" />
        </div>
        {tipo === "trabalhado" && (
          <div>
            <label className="label" htmlFor="desl-dias">
              Dias de aviso
            </label>
            <input
              id="desl-dias"
              inputMode="numeric"
              value={diasTexto}
              onChange={(e) => setDiasTexto(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder={`${diasAuto} (automático)`}
              className="input"
            />
            <p className="text-xs text-slate-500 mt-1">30 dias + 3 por ano de casa. Deixe vazio para calcular.</p>
          </div>
        )}
      </div>

      {previa ? (
        <p className="text-sm rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
          Último dia: <strong>{br(previa.ultimoDia)}</strong> · Prazo para pagar:{" "}
          <strong>{br(previa.prazoPagamento)}</strong> (10 dias corridos depois do último dia)
        </p>
      ) : (
        <p className="text-sm text-slate-500">Preencha a data para ver os prazos.</p>
      )}

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-800 font-medium">
          <input type="checkbox" checked={precisaHomol} onChange={(e) => setPrecisaHomol(e.target.checked)} />
          Vai ter homologação / assistência do sindicato
        </label>
        {precisaHomol && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="desl-hdata">
                Data do comparecimento
              </label>
              <DateInput id="desl-hdata" value={homolData} onChange={setHomolData} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="desl-hhora">
                Horário
              </label>
              <input
                id="desl-hhora"
                value={homolHora}
                onChange={(e) => setHomolHora(e.target.value)}
                placeholder="10h"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="desl-hlocal">
                Local
              </label>
              <input
                id="desl-hlocal"
                value={homolLocal}
                onChange={(e) => setHomolLocal(e.target.value)}
                placeholder="Sindicato..."
                className="input"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="desl-obs">
          Observação
        </label>
        <textarea id="desl-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className="input" />
      </div>

      {aviso}

      <div className="flex gap-2 flex-wrap justify-end">
        {d && (
          <button type="button" onClick={remover} disabled={pendente} className="btn-secondary text-sm text-red-700 mr-auto">
            Apagar acompanhamento
          </button>
        )}
        <button type="button" onClick={() => setFormAberto(false)} className="btn-secondary text-sm">
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={pendente || !previa} className="btn-primary text-sm">
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );

  // ---------- ainda sem acompanhamento ----------
  if (!d) {
    return (
      <div id="desligamento" className="card scroll-mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-900">Desligamento: pagamento e homologação</h2>
            <p className="text-sm text-slate-500">
              Registre o aviso para o sistema calcular o prazo de pagamento e avisar quando estiver perto de vencer.
            </p>
          </div>
          {!formAberto && (
            <button type="button" onClick={() => setFormAberto(true)} disabled={tabelaFaltando} className="btn-secondary text-sm">
              Registrar aviso e prazos
            </button>
          )}
        </div>
        {tabelaFaltando && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Falta criar a tabela no banco. Rode o arquivo migration_025_desligamento_avisos.sql no Supabase.
          </p>
        )}
        {formAberto && formulario}
      </div>
    );
  }

  // ---------- acompanhamento ativo ----------
  const faixa = faixaDesligamento(d, hoje);
  const pag = situacaoPagamento(d, hoje);
  const hom = situacaoHomologacao(d, hoje);
  const prog = progressoAviso(d, hoje);
  const tipoComunicacao =
    d.tipo_aviso === "acordo" ? "Acordo assinado" : d.tipo_aviso === "indenizado" ? "Dispensa comunicada, aviso indenizado" : "Aviso prévio comunicado";
  let n = 1;

  return (
    <div id="desligamento" className="space-y-4 scroll-mt-6">
      <div className={`rounded-2xl border px-5 py-4 flex items-center gap-4 flex-wrap ${FAIXA[faixa.tom]}`} role="status">
        <div className="flex-1 min-w-[240px]">
          <p className="font-semibold text-lg leading-snug">{faixa.titulo}</p>
          <p className="text-sm mt-0.5 opacity-90">{faixa.detalhe}</p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-4xl font-semibold leading-none tabular-nums">{faixa.numero}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide mt-1">{faixa.legenda}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-5">Acompanhamento do desligamento</h2>

          <Etapa numero={n++} tom="feito" titulo={tipoComunicacao} pilula="Feito">
            <p className="text-sm text-slate-500">
              {br(d.data_comunicacao)}
              {d.tipo_aviso !== "trabalhado" && " · o contrato terminou nesta data"}
            </p>
            <a href="#carta-aviso" className="text-sm text-brand-600 hover:underline inline-block">
              Gerar a carta de aviso (PDF ou Word)
            </a>
          </Etapa>

          {prog && (
            <Etapa
              numero={n++}
              tom={prog.terminou ? "feito" : prog.faltam <= 5 ? "atencao" : "ok"}
              titulo={`Cumprimento do aviso (${fDias(prog.total)})`}
              pilula={prog.terminou ? "Concluído" : prog.faltam === 0 ? "Último dia hoje" : `Termina em ${fDias(prog.faltam)}`}
            >
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${prog.terminou ? "bg-emerald-500" : prog.faltam <= 5 ? "bg-amber-500" : "bg-brand-600"}`}
                  style={{ width: `${Math.round((prog.diaAtual / prog.total) * 100)}%` }}
                />
              </div>
              <p className="text-sm text-slate-500">
                Dia {prog.diaAtual} de {prog.total} · último dia {br(d.ultimo_dia)}
              </p>
            </Etapa>
          )}

          <Etapa numero={n++} tom={pag.tom} titulo="Pagamento das verbas rescisórias" pilula={pag.rotulo} ultima={false}>
            <p className="text-sm text-slate-500">
              Prazo: <strong className="text-slate-800">{br(d.prazo_pagamento)}</strong> (10 dias corridos depois de{" "}
              {br(d.ultimo_dia)})
            </p>
            <div className="flex gap-2 flex-wrap">
              {d.pago_em ? (
                <button type="button" disabled={pendente} onClick={() => executar(() => marcarPagamento(colaboradorId, false))} className="btn-secondary text-sm">
                  Desfazer pagamento
                </button>
              ) : (
                <button type="button" disabled={pendente} onClick={() => executar(() => marcarPagamento(colaboradorId, true))} className="btn-primary text-sm">
                  Marcar como pago
                </button>
              )}
            </div>
          </Etapa>

          <Etapa numero={n++} tom={hom.tom} titulo="Comparecimento e homologação" pilula={hom.rotulo} ultima>
            {d.homologacao_necessaria ? (
              <>
                <p className="text-sm text-slate-500">
                  {d.homologacao_data ? (
                    <>
                      Marcada para <strong className="text-slate-800">{br(d.homologacao_data)}</strong>
                      {d.homologacao_hora ? ` às ${d.homologacao_hora}` : ""}
                      {d.homologacao_local ? ` · ${d.homologacao_local}` : ""}
                    </>
                  ) : (
                    "Ainda sem data marcada."
                  )}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {d.homologacao_feita_em ? (
                    <button type="button" disabled={pendente} onClick={() => executar(() => marcarHomologacao(colaboradorId, false))} className="btn-secondary text-sm">
                      Desfazer
                    </button>
                  ) : (
                    <button type="button" disabled={pendente} onClick={() => executar(() => marcarHomologacao(colaboradorId, true))} className="btn-primary text-sm">
                      Registrar como realizada
                    </button>
                  )}
                  <button type="button" onClick={() => setFormAberto(true)} className="btn-secondary text-sm">
                    Alterar data
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Sem homologação para este desligamento.</p>
            )}
          </Etapa>

          {erro && !formAberto && <div className="mt-4">{aviso}</div>}
        </div>

        <div className="space-y-4">
          <div className="card space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Dados do desligamento</h2>
              <button type="button" onClick={() => setFormAberto((v) => !v)} className="text-xs text-brand-600 hover:underline">
                {formAberto ? "Fechar" : "Editar"}
              </button>
            </div>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Tipo</dt><dd className="font-medium text-right">{ROTULO_TIPO_AVISO[d.tipo_aviso]}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Comunicado em</dt><dd className="font-medium">{br(d.data_comunicacao)}</dd></div>
              {d.dias_aviso ? (
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Dias de aviso</dt><dd className="font-medium">{d.dias_aviso}</dd></div>
              ) : null}
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Último dia</dt><dd className="font-medium">{br(d.ultimo_dia)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Prazo do pagamento</dt><dd className="font-medium">{br(d.prazo_pagamento)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Homologação</dt><dd className="font-medium text-right">{d.homologacao_necessaria ? (d.homologacao_data ? `${br(d.homologacao_data)}${d.homologacao_hora ? ` · ${d.homologacao_hora}` : ""}` : "sem data") : "dispensada"}</dd></div>
            </dl>
            {d.observacao && <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">{d.observacao}</p>}
          </div>

          <CartaDeAviso
            colaboradorId={colaboradorId}
            tipoRotulo={ROTULO_TIPO_AVISO[d.tipo_aviso]}
            empresaPadrao={empresaPadrao}
            unidadeId={unidadeId}
          />

          <div className="card space-y-2">
            <h2 className="font-semibold text-slate-900">Quando o sistema avisa</h2>
            <ul className="text-sm text-slate-600 space-y-1.5">
              <li className="flex gap-2"><span aria-hidden className="mt-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />5 dias antes do prazo: faixa amarela aqui e no Painel</li>
              <li className="flex gap-2"><span aria-hidden className="mt-1.5 w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />Depois do prazo sem pagamento: faixa vermelha</li>
            </ul>
          </div>
        </div>
      </div>

      {formAberto && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Editar aviso e prazos</h2>
          {formulario}
        </div>
      )}
    </div>
  );
}
