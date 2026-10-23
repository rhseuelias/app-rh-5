"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarStatusColaborador, excluirColaborador } from "@/lib/actions";
import { registrarDesligamento } from "@/lib/actions-desligamentos-modulo";
import { TIPO_RESCISAO_OPCOES } from "@/lib/calculos";
import { ENTREVISTAS, INICIATIVAS, MOTIVOS_POR_INICIATIVA, RECONTRATAVEL, type Iniciativa } from "@/lib/desligamentos-modulo";

export default function StatusColaboradorAcoes({
  id,
  statusAtual,
}: {
  id: string;
  statusAtual: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mostrarDesligamento, setMostrarDesligamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [ultimoDia, setUltimoDia] = useState("");
  const [tipo, setTipo] = useState("");
  const [iniciativa, setIniciativa] = useState<Iniciativa | "">("");
  const [motivo, setMotivo] = useState("");
  const [entrevista, setEntrevista] = useState("");
  const [recontratavel, setRecontratavel] = useState("");
  const [complementar, setComplementar] = useState("");

  function mudar(status: string) {
    startTransition(() => atualizarStatusColaborador(id, status));
  }

  function confirmarExclusao() {
    if (!confirm("Você está Excluindo todo registro do colaborador, todos os dados serão perdidos.")) {
      return;
    }
    if (!confirm("Tem certeza? Quer EXCLUIR o colaborador?")) {
      return;
    }
    startTransition(() => excluirColaborador(id));
  }

  function enviarDesligamento() {
    setErro(null);
    if (!ultimoDia) return setErro("Informe a data do último dia.");
    if (!tipo) return setErro("Escolha o tipo de rescisão.");
    if (!iniciativa) return setErro("Escolha a iniciativa do desligamento.");
    if (!motivo) return setErro("Escolha o motivo principal.");
    startTransition(async () => {
      const r = await registrarDesligamento({
        colaboradorId: id,
        dataDesligamento: ultimoDia,
        dataComunicacao: null,
        ultimoDia,
        iniciativa,
        tipoRescisao: tipo,
        motivoPrincipal: motivo,
        avisoPrevio: null,
        entrevista: entrevista || null,
        recontratavel: recontratavel || null,
        custoRescisorio: null,
        motivoComplementar: complementar || null,
        observacoesRestritas: null,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setMostrarDesligamento(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {statusAtual === "experiencia" && (
          <button
            disabled={isPending}
            onClick={() => mudar("ativo")}
            className="btn-secondary text-sm"
          >
            Efetivar
          </button>
        )}
        {statusAtual !== "desligado" && (
          <button
            disabled={isPending}
            onClick={() => setMostrarDesligamento((v) => !v)}
            className="btn-secondary text-sm text-red-600"
          >
            Desligar
          </button>
        )}
        <button disabled={isPending} onClick={confirmarExclusao} className="btn-secondary text-sm text-red-700">
          Excluir
        </button>
      </div>

      {mostrarDesligamento && (
        <div className="card space-y-3 max-w-md">
          <h3 className="font-medium text-slate-900 text-sm">Confirmar desligamento</h3>
          <div>
            <label className="label">Data do último dia</label>
            <input
              type="date"
              data-sem-maiuscula
              className="input"
              value={ultimoDia}
              onChange={(e) => setUltimoDia(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tipo de rescisão</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">—</option>
              {TIPO_RESCISAO_OPCOES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Iniciativa do desligamento</label>
            <select
              className="input"
              value={iniciativa}
              onChange={(e) => {
                setIniciativa(e.target.value as Iniciativa | "");
                setMotivo(""); // os motivos dependem da iniciativa
              }}
            >
              <option value="">—</option>
              {INICIATIVAS.map((i) => (
                <option key={i.valor} value={i.valor}>
                  {i.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo principal</label>
            <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={!iniciativa}>
              <option value="">{iniciativa ? "—" : "Escolha a iniciativa primeiro"}</option>
              {(iniciativa ? MOTIVOS_POR_INICIATIVA[iniciativa] : []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Entrevista de desligamento</label>
              <select className="input" value={entrevista} onChange={(e) => setEntrevista(e.target.value)}>
                <option value="">—</option>
                {ENTREVISTAS.map((i) => (
                  <option key={i.valor} value={i.valor}>
                    {i.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Recontratável</label>
              <select className="input" value={recontratavel} onChange={(e) => setRecontratavel(e.target.value)}>
                <option value="">—</option>
                {RECONTRATAVEL.map((i) => (
                  <option key={i.valor} value={i.valor}>
                    {i.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Motivo do desligamento (detalhe, acesso restrito)</label>
            <textarea
              rows={2}
              data-sem-maiuscula
              className="input"
              value={complementar}
              onChange={(e) => setComplementar(e.target.value)}
            />
          </div>
          {erro ? (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {erro}
            </div>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMostrarDesligamento(false)}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
            <button type="button" onClick={enviarDesligamento} disabled={isPending} className="btn-primary text-sm">
              {isPending ? "Salvando…" : "Confirmar desligamento"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
