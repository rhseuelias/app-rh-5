"use client";

import { useState, useTransition } from "react";
import type { EtapaProcesso, HistoricoEtapa } from "@/types/db";
import {
  STATUS_ETAPA_COR,
  STATUS_ETAPA_LABEL,
  RESPONSAVEL_LABEL,
  calcularExperiencia,
  etapaAtrasada,
} from "@/lib/calculos";
import { atualizarStatusEtapa, registrarAvaliacao90Dias } from "@/lib/actions-integracao";

export default function LinhaDoTempoIntegracao({
  processoId,
  colaboradorId,
  etapas,
  historicoPorEtapa,
  dataAdmissao,
  prazoExperienciaDias,
}: {
  processoId: string;
  colaboradorId: string;
  etapas: EtapaProcesso[];
  historicoPorEtapa: Record<string, HistoricoEtapa[]>;
  dataAdmissao: string | null;
  prazoExperienciaDias: number;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <div className="relative pl-9">
      <div className="absolute left-[15px] top-1.5 bottom-1.5 w-0.5 bg-slate-200" />
      <div className="space-y-3">
        {etapas.map((etapa) => (
          <EtapaItem
            key={etapa.id}
            etapa={etapa}
            aberta={aberta === etapa.id}
            onToggle={() => setAberta(aberta === etapa.id ? null : etapa.id)}
            historico={historicoPorEtapa[etapa.id] ?? []}
            processoId={processoId}
            colaboradorId={colaboradorId}
            dataAdmissao={dataAdmissao}
            prazoExperienciaDias={prazoExperienciaDias}
          />
        ))}
      </div>
    </div>
  );
}

function EtapaItem({
  etapa,
  aberta,
  onToggle,
  historico,
  processoId,
  colaboradorId,
  dataAdmissao,
  prazoExperienciaDias,
}: {
  etapa: EtapaProcesso;
  aberta: boolean;
  onToggle: () => void;
  historico: HistoricoEtapa[];
  processoId: string;
  colaboradorId: string;
  dataAdmissao: string | null;
  prazoExperienciaDias: number;
}) {
  const cor = STATUS_ETAPA_COR[etapa.status] ?? STATUS_ETAPA_COR.nao_iniciado;
  const atrasada = etapaAtrasada(etapa.prazo, etapa.status);
  const concluidaOuExperiencia = etapa.status === "realizado" || etapa.status === "em_experiencia";

  return (
    <div className="relative">
      <div
        className={`absolute -left-9 top-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-4 border-white ${cor.dot} ${
          etapa.bloqueada ? "opacity-40" : ""
        }`}
      >
        {concluidaOuExperiencia ? "✓" : etapa.ordem}
      </div>

      <button
        type="button"
        onClick={() => !etapa.bloqueada && onToggle()}
        disabled={etapa.bloqueada}
        className={`w-full flex items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl px-4 py-3 text-left transition-colors ${
          etapa.bloqueada ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">{etapa.nome}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {RESPONSAVEL_LABEL[etapa.responsavel] ?? etapa.responsavel}
            {etapa.prazo && !concluidaOuExperiencia && (
              <> · prazo {new Date(etapa.prazo).toLocaleDateString("pt-BR")}{atrasada ? " — atrasada" : ""}</>
            )}
            {etapa.data_conclusao && (
              <> · concluída em {new Date(etapa.data_conclusao).toLocaleDateString("pt-BR")}</>
            )}
            {etapa.bloqueada && <> · bloqueada até concluir a etapa anterior</>}
          </p>
        </div>
        <span className={`badge shrink-0 ${cor.badge}`}>
          {atrasada ? "Atrasada" : STATUS_ETAPA_LABEL[etapa.status]}
        </span>
      </button>

      {aberta && etapa.chave === "experiencia" && (
        <PainelExperiencia dataAdmissao={dataAdmissao} prazoDias={prazoExperienciaDias} />
      )}
      {aberta && etapa.chave === "avaliacao_90_dias" && (
        <PainelAvaliacao etapa={etapa} processoId={processoId} colaboradorId={colaboradorId} />
      )}
      {aberta && etapa.chave !== "experiencia" && etapa.chave !== "avaliacao_90_dias" && (
        <PainelEtapa etapa={etapa} colaboradorId={colaboradorId} historico={historico} />
      )}
    </div>
  );
}

function PainelExperiencia({ dataAdmissao, prazoDias }: { dataAdmissao: string | null; prazoDias: number }) {
  if (!dataAdmissao) {
    return (
      <div className="mt-2 ml-1 card !p-4 text-sm text-slate-500">
        A contagem dos {prazoDias} dias começa assim que a data de admissão for registrada (na etapa
        &quot;Admissão&quot;).
      </div>
    );
  }

  const { fim, diasDecorridos, diasRestantes, percentual } = calcularExperiencia(dataAdmissao, prazoDias);

  return (
    <div className="mt-2 ml-1 card !p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Progresso da experiência</span>
        <span className="font-display font-bold text-blue-600">{percentual}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${percentual}%` }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-slate-400">Admissão</p>
          <p className="font-medium text-slate-700">{new Date(dataAdmissao).toLocaleDateString("pt-BR")}</p>
        </div>
        <div>
          <p className="text-slate-400">Dias decorridos</p>
          <p className="font-medium text-slate-700">{diasDecorridos}</p>
        </div>
        <div>
          <p className="text-slate-400">Dias restantes</p>
          <p className="font-medium text-slate-700">{Math.max(0, diasRestantes)}</p>
        </div>
        <div>
          <p className="text-slate-400">Fim previsto</p>
          <p className="font-medium text-slate-700">{fim.toLocaleDateString("pt-BR")}</p>
        </div>
      </div>
    </div>
  );
}

function PainelEtapa({
  etapa,
  colaboradorId,
  historico,
}: {
  etapa: EtapaProcesso;
  colaboradorId: string;
  historico: HistoricoEtapa[];
}) {
  const [isPending, startTransition] = useTransition();
  const [observacoes, setObservacoes] = useState(etapa.observacoes ?? "");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function salvar(status: string) {
    setErro(null);
    const fd = new FormData();
    fd.set("etapa_processo_id", etapa.id);
    fd.set("colaborador_id", colaboradorId);
    fd.set("status", status);
    fd.set("observacoes", observacoes);
    if (etapa.chave === "admissao" && dataAdmissao) fd.set("data_admissao", dataAdmissao);
    if (arquivo) fd.set("documento", arquivo);
    startTransition(async () => {
      try {
        await atualizarStatusEtapa(fd);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    });
  }

  return (
    <div className="mt-2 ml-1 card !p-4 space-y-3">
      {etapa.chave === "admissao" && (
        <div>
          <label className="label">Data de admissão</label>
          <input
            type="date"
            className="input"
            value={dataAdmissao}
            onChange={(e) => setDataAdmissao(e.target.value)}
          />
        </div>
      )}
      <div>
        <label className="label">Observações</label>
        <textarea
          className="input"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Anexar documento (opcional)</label>
        <input type="file" className="input" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() => salvar("pendente")}
          className="flex-1 text-xs font-bold rounded-full py-2 bg-red-100 text-red-700"
        >
          Não realizado
        </button>
        <button
          disabled={isPending}
          onClick={() => salvar("em_andamento")}
          className="flex-1 text-xs font-bold rounded-full py-2 bg-amber-100 text-amber-700"
        >
          Em andamento
        </button>
        <button
          disabled={isPending}
          onClick={() => salvar("realizado")}
          className="flex-1 text-xs font-bold rounded-full py-2 bg-brand-600 text-white"
        >
          Realizado
        </button>
      </div>

      {historico.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Histórico</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {historico.map((h) => (
              <li key={h.id}>
                {new Date(h.data).toLocaleString("pt-BR")} — {h.usuario ?? "—"}:{" "}
                {STATUS_ETAPA_LABEL[h.status_anterior ?? ""] ?? "—"} → {STATUS_ETAPA_LABEL[h.status_novo] ?? h.status_novo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const CAMPOS_AVALIACAO: [string, string][] = [
  ["avaliacao_tecnica", "Avaliação técnica"],
  ["comportamento", "Comportamento"],
  ["cultura", "Cultura"],
  ["assiduidade", "Assiduidade"],
  ["pontualidade", "Pontualidade"],
  ["desempenho", "Desempenho"],
];

function PainelAvaliacao({
  etapa,
  processoId,
  colaboradorId,
}: {
  etapa: EtapaProcesso;
  processoId: string;
  colaboradorId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const jaAvaliada = etapa.status === "realizado";

  function enviar(formData: FormData) {
    formData.set("processo_id", processoId);
    formData.set("etapa_processo_id", etapa.id);
    formData.set("colaborador_id", colaboradorId);
    startTransition(() => registrarAvaliacao90Dias(formData));
  }

  if (jaAvaliada) {
    return (
      <div className="mt-2 ml-1 card !p-4 text-sm text-slate-600">
        Avaliação registrada em{" "}
        {etapa.data_conclusao ? new Date(etapa.data_conclusao).toLocaleDateString("pt-BR") : "—"}.
      </div>
    );
  }

  return (
    <form action={enviar} className="mt-2 ml-1 card !p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {CAMPOS_AVALIACAO.map(([campo, label]) => (
          <div key={campo}>
            <label className="label">{label} (0–10)</label>
            <input type="number" min={0} max={10} name={campo} className="input" />
          </div>
        ))}
      </div>
      <div>
        <label className="label">Observações do líder</label>
        <textarea name="observacoes" rows={2} className="input" />
      </div>
      <div>
        <label className="label">Recomendação</label>
        <input name="recomendacao" className="input" placeholder="Ex.: recomendo a efetivação" />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          name="resultado"
          value="nao_efetivado"
          disabled={isPending}
          className="flex-1 text-xs font-bold rounded-full py-2.5 bg-red-100 text-red-700"
        >
          Não efetivado(a)
        </button>
        <button
          type="submit"
          name="resultado"
          value="efetivado"
          disabled={isPending}
          className="flex-1 text-xs font-bold rounded-full py-2.5 bg-brand-600 text-white"
        >
          Efetivado(a)
        </button>
      </div>
    </form>
  );
}
