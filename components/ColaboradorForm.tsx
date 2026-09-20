"use client";

import { useState, useTransition } from "react";
import type { Colaborador, DependenteColaborador, Empresa, HorarioDia, HorarioTrabalho, Unidade } from "@/types/db";
import { salvarColaborador } from "@/lib/actions";
import {
  ESTADO_CIVIL_LABEL,
  GRAU_INSTRUCAO_LABEL,
  CONTRATO_EXPERIENCIA_LABEL,
  DIAS_SEMANA,
  minutosCargaDia,
  formatarHorasMinutos,
  formatarHorasMinutosSegundos,
} from "@/lib/calculos";
import CampoMoeda from "@/components/campos/CampoMoeda";
import CampoDocumento from "@/components/campos/CampoDocumento";

type Dependente = {
  nome: string;
  data_nascimento: string;
  parentesco: string;
  cpf: string;
  dependente_ir: boolean;
};

function dependentesIniciais(lista?: DependenteColaborador[]): Dependente[] {
  if (!lista || lista.length === 0) return [];
  return lista.map((d) => ({
    nome: d.nome,
    data_nascimento: d.data_nascimento ?? "",
    parentesco: d.parentesco ?? "",
    cpf: d.cpf,
    dependente_ir: d.dependente_ir,
  }));
}

export default function ColaboradorForm({
  colaborador,
  empresas,
  unidades = [],
  dependentes: dependentesDoColaborador,
}: {
  colaborador?: Colaborador;
  empresas: Empresa[];
  unidades?: Unidade[];
  dependentes?: DependenteColaborador[];
}) {
  const [tipo, setTipo] = useState(colaborador?.tipo ?? "CLT");
  const [empresaId, setEmpresaId] = useState(colaborador?.empresa_id ?? "");
  const [dependentes, setDependentes] = useState<Dependente[]>(
    dependentesIniciais(dependentesDoColaborador)
  );
  const [horario, setHorario] = useState<HorarioTrabalho>(colaborador?.horario_trabalho ?? {});
  const [valeTransporte, setValeTransporte] = useState(colaborador?.vale_transporte ?? false);
  const [valeAlimentacao, setValeAlimentacao] = useState(colaborador?.vale_alimentacao ?? false);
  const [isPending, startTransition] = useTransition();

  const unidadesDaEmpresa = unidades.filter((u) => u.empresa_id === empresaId);

  function enviar(formData: FormData) {
    formData.set("dependentes_json", JSON.stringify(dependentes));
    formData.set("horario_trabalho_json", JSON.stringify(horario));
    startTransition(() => salvarColaborador(formData));
  }

  function atualizarDependente(i: number, campo: keyof Dependente, valor: string | boolean) {
    setDependentes((lista) => lista.map((d, idx) => (idx === i ? { ...d, [campo]: valor } : d)));
  }

  function atualizarHorario(dia: string, campo: string, valor: string) {
    setHorario((h) => ({ ...h, [dia]: { ...(h as any)[dia], [campo]: valor } }));
  }

  function repetirDiaAnterior(dia: string, diaAnterior: string) {
    setHorario((h) => ({ ...h, [dia]: { ...((h as any)[diaAnterior] ?? {}) } }));
  }

  const minutosSemanais = DIAS_SEMANA.reduce(
    (soma, { chave }) => soma + minutosCargaDia(horario[chave]),
    0
  );
  const minutosMensais = minutosSemanais * 5;

  return (
    <form action={enviar} className="space-y-6">
      {colaborador && <input type="hidden" name="id" value={colaborador.id} />}

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Dados básicos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo</label>
            <select
              name="tipo"
              className="input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "CLT" | "PJ")}
            >
              <option value="CLT">CLT</option>
              <option value="PJ">PJ</option>
            </select>
          </div>
          <div>
            <label className="label">Nome completo</label>
            <input name="nome" required className="input" defaultValue={colaborador?.nome} />
          </div>
          <CampoDocumento
            label={tipo === "CLT" ? "CPF" : "CNPJ"}
            name="cpf_cnpj"
            tipo={tipo === "CLT" ? "cpf" : "cnpj"}
            defaultValue={colaborador?.cpf_cnpj ?? ""}
          />
          <div>
            <label className="label">RG</label>
            <input name="rg" className="input" defaultValue={colaborador?.rg ?? ""} />
          </div>
          <div>
            <label className="label">Empresa</label>
            <select
              name="empresa_id"
              className="input"
              value={empresaId ?? ""}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">—</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Filial / Unidade</label>
            <select name="unidade_id" className="input" defaultValue={colaborador?.unidade_id ?? ""}>
              <option value="">—</option>
              {unidadesDaEmpresa.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            {empresaId && unidadesDaEmpresa.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Essa empresa ainda não tem filial cadastrada (cadastre em Projeção de Custo).
              </p>
            )}
          </div>
          <div>
            <label className="label">Cargo</label>
            <input name="cargo" className="input" defaultValue={colaborador?.cargo ?? ""} />
          </div>
          <div>
            <label className="label">Departamento</label>
            <input name="departamento" className="input" defaultValue={colaborador?.departamento ?? ""} />
          </div>
          <div>
            <label className="label">Líder</label>
            <input name="lider" className="input" defaultValue={colaborador?.lider ?? ""} placeholder="Nome do líder direto" />
          </div>
          <div>
            <label className="label">Data de nascimento</label>
            <input
              type="date"
              name="data_nascimento"
              className="input"
              defaultValue={colaborador?.data_nascimento ?? ""}
            />
          </div>
          <div>
            <label className="label">Estado civil</label>
            <select name="estado_civil" className="input" defaultValue={colaborador?.estado_civil ?? ""}>
              <option value="">—</option>
              {Object.entries(ESTADO_CIVIL_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Raça/Cor</label>
            <input name="raca_cor" className="input" defaultValue={colaborador?.raca_cor ?? ""} />
          </div>
          <div>
            <label className="label">Grau de instrução</label>
            <select name="grau_instrucao" className="input" defaultValue={colaborador?.grau_instrucao ?? ""}>
              <option value="">—</option>
              {Object.entries(GRAU_INSTRUCAO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Endereço</label>
            <input name="endereco" className="input" defaultValue={colaborador?.endereco ?? ""} />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" className="input" defaultValue={colaborador?.status ?? "experiencia"}>
              <option value="experiencia">Experiência</option>
              <option value="ativo">Ativo</option>
              <option value="afastado">Afastado</option>
              <option value="desligado">Desligado</option>
            </select>
          </div>
        </div>
      </section>

      {tipo === "CLT" ? (
        <section className="card space-y-4">
          <h2 className="font-medium text-slate-900">Contrato e remuneração (CLT)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Data de admissão</label>
              <input
                type="date"
                name="data_admissao"
                className="input"
                defaultValue={colaborador?.data_admissao ?? ""}
              />
              {!colaborador && (
                <p className="text-xs text-slate-400 mt-1">
                  Gera automaticamente onboarding, período aquisitivo e evento no calendário.
                </p>
              )}
            </div>
            <div>
              <label className="label">Contrato de experiência</label>
              <select
                name="contrato_experiencia"
                className="input"
                defaultValue={colaborador?.contrato_experiencia ?? ""}
              >
                <option value="">—</option>
                {Object.entries(CONTRATO_EXPERIENCIA_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <CampoMoeda label="Salário base" name="salario_base" defaultValue={colaborador?.salario_base} />
            <CampoMoeda label="Comissão média" name="comissao_media" defaultValue={colaborador?.comissao_media} />
            <CampoMoeda label="Outros auxílios" name="auxilio_outros" defaultValue={colaborador?.auxilio_outros} />
            <CampoMoeda label="Custo VT" name="custo_vt" defaultValue={colaborador?.custo_vt} />
            <CampoMoeda label="Custo VA/VR" name="custo_va_vr" defaultValue={colaborador?.custo_va_vr} />
            <CampoMoeda
              label="Assistência médica"
              name="custo_assist_medica"
              defaultValue={colaborador?.custo_assist_medica}
            />
            <CampoMoeda
              label="Assistência psicológica"
              name="custo_assist_psicologica"
              defaultValue={colaborador?.custo_assist_psicologica}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            <Flag label="Adiantamento de salário" name="adiantamento_salario" defaultChecked={colaborador?.adiantamento_salario} />
            <Flag label="Primeiro emprego" name="primeiro_emprego" defaultChecked={colaborador?.primeiro_emprego} />
            <Flag label="Insalubridade" name="insalubridade" defaultChecked={colaborador?.insalubridade} />
            <Flag label="Periculosidade" name="periculosidade" defaultChecked={colaborador?.periculosidade} />
            <Flag label="Quebra de caixa" name="quebra_caixa" defaultChecked={colaborador?.quebra_caixa} />
            <Flag label="Gratificação de função (40%)" name="gratificacao_funcao" defaultChecked={colaborador?.gratificacao_funcao} />
          </div>
        </section>
      ) : (
        <section className="card space-y-4">
          <h2 className="font-medium text-slate-900">Contrato (PJ)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Início do contrato</label>
              <input
                type="date"
                name="contrato_inicio"
                className="input"
                defaultValue={colaborador?.contrato_inicio ?? ""}
              />
            </div>
            <div>
              <label className="label">Fim do contrato</label>
              <input
                type="date"
                name="contrato_fim"
                className="input"
                defaultValue={colaborador?.contrato_fim ?? ""}
              />
            </div>
            <CampoMoeda
              label="Valor da nota fiscal mensal"
              name="valor_nota_fiscal"
              defaultValue={colaborador?.valor_nota_fiscal ?? undefined}
            />
            <input type="hidden" name="data_admissao" value={colaborador?.contrato_inicio ?? ""} />
          </div>
        </section>
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Dependentes</h2>
          <button
            type="button"
            onClick={() =>
              setDependentes((l) => [
                ...l,
                { nome: "", data_nascimento: "", parentesco: "", cpf: "", dependente_ir: false },
              ])
            }
            className="text-sm text-brand-600 hover:underline"
          >
            + Adicionar dependente
          </button>
        </div>
        {dependentes.length === 0 && (
          <p className="text-sm text-slate-400">Nenhum dependente cadastrado.</p>
        )}
        <div className="space-y-3">
          {dependentes.map((d, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end border-b border-slate-100 pb-3">
              <div className="md:col-span-2">
                <label className="label">Nome</label>
                <input
                  className="input"
                  value={d.nome}
                  onChange={(e) => atualizarDependente(i, "nome", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Data nasc.</label>
                <input
                  type="date"
                  className="input"
                  value={d.data_nascimento}
                  onChange={(e) => atualizarDependente(i, "data_nascimento", e.target.value)}
                />
              </div>
              <div>
                <label className="label">Parentesco</label>
                <input
                  className="input"
                  placeholder="Filho(a), cônjuge..."
                  value={d.parentesco}
                  onChange={(e) => atualizarDependente(i, "parentesco", e.target.value)}
                />
              </div>
              <div>
                <label className="label">CPF *</label>
                <input
                  className="input"
                  value={d.cpf}
                  onChange={(e) => atualizarDependente(i, "cpf", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={d.dependente_ir}
                    onChange={(e) => atualizarDependente(i, "dependente_ir", e.target.checked)}
                  />
                  Dep. IR
                </label>
                <button
                  type="button"
                  onClick={() => setDependentes((l) => l.filter((_, idx) => idx !== i))}
                  className="text-red-500 text-xs hover:underline"
                >
                  remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Dados bancários</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Banco</label>
            <input name="banco" className="input" defaultValue={colaborador?.banco ?? ""} />
          </div>
          <div>
            <label className="label">Agência</label>
            <input name="agencia" className="input" defaultValue={colaborador?.agencia ?? ""} />
          </div>
          <div>
            <label className="label">Conta</label>
            <input name="conta" className="input" defaultValue={colaborador?.conta ?? ""} />
          </div>
          <div>
            <label className="label">Dígito</label>
            <input name="conta_digito" className="input" defaultValue={colaborador?.conta_digito ?? ""} />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium text-slate-900">Horário de trabalho</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-ink-800 text-white">
                <th colSpan={7} className="py-2 text-center font-display font-bold tracking-wide">
                  Horário de trabalho
                </th>
              </tr>
              <tr className="bg-slate-200 text-slate-700 text-[11px] uppercase tracking-wide">
                <th rowSpan={2} className="py-2 px-3 text-left align-bottom">Dia</th>
                <th className="py-1.5 px-3 border-l border-slate-300">Início</th>
                <th colSpan={2} className="py-1.5 px-3 border-l border-slate-300">Intervalo</th>
                <th className="py-1.5 px-3 border-l border-slate-300">Fim</th>
                <th rowSpan={2} className="py-2 px-3 border-l border-slate-300 align-bottom">Carga diária</th>
                <th rowSpan={2} className="py-2 px-2"></th>
              </tr>
              <tr className="bg-slate-100 text-slate-500 text-[10.5px] uppercase tracking-wide">
                <th className="py-1 px-3 border-l border-slate-200">Entrada</th>
                <th className="py-1 px-3 border-l border-slate-200">Saída</th>
                <th className="py-1 px-3">Entrada</th>
                <th className="py-1 px-3 border-l border-slate-200">Saída</th>
              </tr>
            </thead>
            <tbody>
              {DIAS_SEMANA.map(({ chave, label }, index) => {
                const dia: HorarioDia = horario[chave] ?? {};
                const minutosDoDia = minutosCargaDia(dia);
                const diaAnterior = index > 0 ? DIAS_SEMANA[index - 1].chave : null;
                return (
                  <tr key={chave} className="border-t border-slate-100">
                    <td className="py-2 px-3 font-medium text-slate-700 text-xs uppercase whitespace-nowrap">
                      {label}
                    </td>
                    {(["manha_entrada", "manha_saida", "tarde_entrada", "tarde_saida"] as const).map(
                      (campo) => (
                        <td key={campo} className="py-1.5 px-2 border-l border-slate-100">
                          <input
                            type="time"
                            className="input !py-1 !text-center"
                            value={dia[campo] ?? ""}
                            onChange={(e) => atualizarHorario(chave, campo, e.target.value)}
                          />
                        </td>
                      )
                    )}
                    <td className="py-2 px-3 text-center font-semibold text-brand-700 bg-brand-50 border-l border-slate-100 whitespace-nowrap">
                      {formatarHorasMinutos(minutosDoDia)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {diaAnterior && (
                        <button
                          type="button"
                          onClick={() => repetirDiaAnterior(chave, diaAnterior)}
                          className="text-[11px] text-brand-600 hover:underline hover:text-brand-700 whitespace-nowrap"
                          title={`Repetir os horários de ${DIAS_SEMANA[index - 1].label}`}
                        >
                          🔁 Repetir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={5} className="py-2 px-3 text-right font-semibold text-slate-700">
                  Horas semanais
                </td>
                <td className="py-2 px-3 text-center font-bold text-slate-900 bg-brand-100">
                  {formatarHorasMinutosSegundos(minutosSemanais)}
                </td>
                <td></td>
              </tr>
              <tr className="bg-slate-50">
                <td colSpan={5} className="py-2 px-3 text-right font-semibold text-slate-700">
                  Horas mensais
                </td>
                <td className="py-2 px-3 text-center font-bold text-slate-900 bg-brand-100">
                  {formatarHorasMinutosSegundos(minutosMensais)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-slate-400">
          A carga diária, as horas semanais e as horas mensais são calculadas automaticamente a partir dos
          horários lançados em cada dia. Clique em "🔁 Repetir" pra copiar os horários do dia anterior.
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Benefícios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="vale_transporte"
                checked={valeTransporte}
                onChange={(e) => setValeTransporte(e.target.checked)}
              />
              Vale transporte
            </label>
            {valeTransporte && (
              <label className="flex items-center gap-2 text-sm text-slate-500 pl-6">
                <input
                  type="checkbox"
                  name="vale_transporte_desconto"
                  defaultChecked={colaborador?.vale_transporte_desconto ?? false}
                />
                Será descontado em folha
              </label>
            )}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="vale_alimentacao"
                checked={valeAlimentacao}
                onChange={(e) => setValeAlimentacao(e.target.checked)}
              />
              Vale alimentação/refeição
            </label>
            {valeAlimentacao && (
              <div className="pl-6 max-w-xs">
                <CampoMoeda
                  label="Valor a ser descontado em folha"
                  name="vale_alimentacao_valor_desconto"
                  defaultValue={colaborador?.vale_alimentacao_valor_desconto ?? undefined}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Contato</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Telefone</label>
            <input name="telefone" className="input" defaultValue={colaborador?.telefone ?? ""} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input name="email" type="email" className="input" defaultValue={colaborador?.email ?? ""} />
          </div>
          <div>
            <label className="label">Contato de emergência — nome</label>
            <input
              name="nome_contato_emergencia"
              className="input"
              defaultValue={colaborador?.nome_contato_emergencia ?? ""}
            />
          </div>
          <div>
            <label className="label">Contato de emergência — telefone</label>
            <input
              name="telefone_contato_emergencia"
              className="input"
              defaultValue={colaborador?.telefone_contato_emergencia ?? ""}
            />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Observações</h2>
        <textarea
          name="observacoes"
          rows={3}
          className="input"
          defaultValue={colaborador?.observacoes ?? ""}
        />
      </section>

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function Flag({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
