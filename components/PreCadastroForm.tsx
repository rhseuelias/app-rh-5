"use client";

import { useState, useTransition } from "react";
import type { Candidato } from "@/types/db";
import { submeterPreCadastro } from "@/lib/actions-candidatos";

const TIPOS_DOCUMENTO = [
  { valor: "rg", label: "RG" },
  { valor: "ctps", label: "Carteira de trabalho (CTPS)" },
  { valor: "comprovante_residencia", label: "Comprovante de residência" },
  { valor: "foto_3x4", label: "Foto 3x4" },
  { valor: "outro", label: "Outro documento" },
];

export default function PreCadastroForm({ token, candidato }: { token: string; candidato: Candidato }) {
  const [linhasDocumento, setLinhasDocumento] = useState([0, 1, 2, 3]);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function enviar(formData: FormData) {
    setErro(null);
    startTransition(async () => {
      try {
        await submeterPreCadastro(formData);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível enviar. Tente novamente.");
      }
    });
  }

  return (
    <form action={enviar} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      <section className="card space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Dados pessoais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nome completo</label>
            <input name="nome" required className="input" defaultValue={candidato.nome ?? ""} />
          </div>
          <div>
            <label className="label">CPF</label>
            <input name="cpf" required className="input" defaultValue={candidato.cpf ?? ""} />
          </div>
          <div>
            <label className="label">RG</label>
            <input name="rg" className="input" defaultValue={candidato.rg ?? ""} />
          </div>
          <div>
            <label className="label">Estado civil</label>
            <select name="estado_civil" className="input" defaultValue={candidato.estado_civil ?? ""}>
              <option value="">—</option>
              <option value="solteiro">Solteiro(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viuvo">Viúvo(a)</option>
              <option value="uniao_estavel">União estável</option>
            </select>
          </div>
          <div>
            <label className="label">Data de nascimento</label>
            <input
              type="date"
              name="data_nascimento"
              required
              className="input"
              defaultValue={candidato.data_nascimento ?? ""}
            />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input name="telefone" required className="input" defaultValue={candidato.telefone ?? ""} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input type="email" name="email" required className="input" defaultValue={candidato.email ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Endereço completo</label>
            <input name="endereco" className="input" defaultValue={candidato.endereco ?? ""} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Contato de emergência</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nome</label>
            <input
              name="nome_contato_emergencia"
              className="input"
              defaultValue={candidato.nome_contato_emergencia ?? ""}
            />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input
              name="telefone_contato_emergencia"
              className="input"
              defaultValue={candidato.telefone_contato_emergencia ?? ""}
            />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Dados bancários</h2>
        <p className="text-xs text-slate-400">Usados futuramente para o pagamento do salário.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Banco</label>
            <input name="banco" className="input" defaultValue={candidato.banco ?? ""} />
          </div>
          <div>
            <label className="label">Agência</label>
            <input name="agencia" className="input" defaultValue={candidato.agencia ?? ""} />
          </div>
          <div>
            <label className="label">Conta</label>
            <input name="conta" className="input" defaultValue={candidato.conta ?? ""} />
          </div>
          <div>
            <label className="label">Chave Pix</label>
            <input name="pix" className="input" defaultValue={candidato.pix ?? ""} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Documentos</h2>
        <p className="text-xs text-slate-400">
          Anexe os documentos que tiver disponíveis agora — pode complementar depois se precisar.
        </p>
        <div className="space-y-3">
          {linhasDocumento.map((linha, i) => (
            <div key={linha} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select name="documentos_tipo" className="input" defaultValue={TIPOS_DOCUMENTO[i]?.valor ?? "outro"}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input type="file" name="documentos" className="input" />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLinhasDocumento((l) => [...l, l.length])}
          className="text-sm text-brand-600"
        >
          + Adicionar outro documento
        </button>
      </section>

      <section className="card space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Observações</h2>
        <textarea name="observacoes" rows={3} className="input" defaultValue={candidato.observacoes ?? ""} />
      </section>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button type="submit" disabled={isPending} className="btn-cta w-full">
        {isPending ? "Enviando..." : "Enviar pré-cadastro"}
      </button>
    </form>
  );
}
