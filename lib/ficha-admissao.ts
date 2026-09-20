import { createClient } from "@/lib/supabase-server";
import type { Colaborador, DependenteColaborador, DiaSemana, Empresa, Unidade } from "@/types/db";
import {
  ESTADO_CIVIL_LABEL,
  GRAU_INSTRUCAO_LABEL,
  CONTRATO_EXPERIENCIA_LABEL,
  DIAS_SEMANA,
  cargaHorariaDia,
  minutosCargaDia,
  formatarHorasMinutosSegundos,
} from "@/lib/calculos";
import { formatarCNPJ, formatarCPF, formatarReais } from "@/lib/formatadores";

function simNao(v: boolean): string {
  return v ? "Sim" : "Não";
}

function dataBR(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

export interface CampoFicha {
  label: string;
  valor: string;
}

export interface LinhaHorarioFicha {
  dia: string;
  manhaEntrada: string;
  manhaSaida: string;
  tardeEntrada: string;
  tardeSaida: string;
  carga: string;
}

export interface LinhaDependenteFicha {
  nome: string;
  nascimento: string;
  parentesco: string;
  cpf: string;
  depIR: string;
}

export interface FichaAdmissaoDados {
  colaboradorNome: string;
  empresaNome: string;
  filialNome: string;
  filialCnpj: string;
  pessoal: CampoFicha[];
  funcional: CampoFicha[];
  dependentes: LinhaDependenteFicha[];
  bancarios: CampoFicha[];
  horario: LinhaHorarioFicha[];
  horasSemanaisTotal: string;
  horasMensaisTotal: string;
  beneficios: CampoFicha[];
  nomeArquivoBase: string;
}

/** Busca colaborador + empresa + filial + dependentes e monta os dados prontos para o PDF/Excel. */
export async function buscarFichaAdmissao(colaboradorId: string): Promise<FichaAdmissaoDados | null> {
  const supabase = createClient();

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("*")
    .eq("id", colaboradorId)
    .single();
  if (!colaborador) return null;
  const c = colaborador as Colaborador;

  const [{ data: dependentesData }, { data: empresaData }, { data: unidadeData }] = await Promise.all([
    supabase.from("dependentes_colaborador").select("*").eq("colaborador_id", colaboradorId),
    c.empresa_id ? supabase.from("empresas").select("*").eq("id", c.empresa_id).single() : Promise.resolve({ data: null }),
    c.unidade_id ? supabase.from("unidades").select("*").eq("id", c.unidade_id).single() : Promise.resolve({ data: null }),
  ]);

  const empresa = (empresaData ?? null) as Empresa | null;
  const unidade = (unidadeData ?? null) as Unidade | null;
  const dependentes = (dependentesData ?? []) as DependenteColaborador[];

  const pessoal: CampoFicha[] = [
    { label: "Nome completo", valor: c.nome },
    { label: c.tipo === "PJ" ? "CNPJ" : "CPF", valor: c.cpf_cnpj ? (c.tipo === "PJ" ? formatarCNPJ(c.cpf_cnpj) : formatarCPF(c.cpf_cnpj)) : "—" },
    { label: "RG", valor: c.rg ?? "—" },
    { label: "Data de nascimento", valor: dataBR(c.data_nascimento) },
    { label: "Estado civil", valor: c.estado_civil ? ESTADO_CIVIL_LABEL[c.estado_civil] : "—" },
    { label: "Raça/Cor", valor: c.raca_cor ?? "—" },
    { label: "Grau de instrução", valor: c.grau_instrucao ? GRAU_INSTRUCAO_LABEL[c.grau_instrucao] : "—" },
    { label: "Endereço", valor: c.endereco ?? "—" },
    { label: "Telefone", valor: c.telefone ?? "—" },
    { label: "E-mail", valor: c.email ?? "—" },
    { label: "Contato de emergência", valor: c.nome_contato_emergencia ? `${c.nome_contato_emergencia} — ${c.telefone_contato_emergencia ?? "—"}` : "—" },
  ];

  const funcional: CampoFicha[] = [
    { label: "Tipo", valor: c.tipo },
    { label: "Cargo", valor: c.cargo ?? "—" },
    { label: "Departamento", valor: c.departamento ?? "—" },
    { label: "Líder", valor: c.lider ?? "—" },
    { label: "Data de admissão", valor: dataBR(c.data_admissao) },
    { label: "Contrato de experiência", valor: c.contrato_experiencia ? CONTRATO_EXPERIENCIA_LABEL[c.contrato_experiencia] : "—" },
    { label: "Salário base", valor: formatarReais(c.salario_base ?? 0) },
    { label: "Adiantamento de salário", valor: simNao(c.adiantamento_salario) },
    { label: "Primeiro emprego", valor: simNao(c.primeiro_emprego) },
    { label: "Insalubridade", valor: simNao(c.insalubridade) },
    { label: "Periculosidade", valor: simNao(c.periculosidade) },
    { label: "Quebra de caixa", valor: simNao(c.quebra_caixa) },
    { label: "Gratificação de função (40%)", valor: simNao(c.gratificacao_funcao) },
  ];

  const bancarios: CampoFicha[] = [
    { label: "Banco", valor: c.banco ?? "—" },
    { label: "Agência", valor: c.agencia ?? "—" },
    { label: "Conta", valor: c.conta ?? "—" },
    { label: "Dígito", valor: c.conta_digito ?? "—" },
  ];

  const horario: LinhaHorarioFicha[] = DIAS_SEMANA.map(({ chave, label }) => {
    const dia = c.horario_trabalho?.[chave as DiaSemana];
    return {
      dia: label,
      manhaEntrada: dia?.manha_entrada ?? "—",
      manhaSaida: dia?.manha_saida ?? "—",
      tardeEntrada: dia?.tarde_entrada ?? "—",
      tardeSaida: dia?.tarde_saida ?? "—",
      carga: cargaHorariaDia(dia ?? null),
    };
  });

  // Mesma conta usada no Cadastro do colaborador: soma as horas da semana e
  // multiplica por 5 (convenção do mês comercial de 220h / semana de 44h).
  const minutosSemanais = DIAS_SEMANA.reduce(
    (soma, { chave }) => soma + minutosCargaDia(c.horario_trabalho?.[chave as DiaSemana] ?? null),
    0
  );
  const minutosMensais = minutosSemanais * 5;

  const beneficios: CampoFicha[] = [
    { label: "Vale transporte", valor: simNao(c.vale_transporte) },
    { label: "Será descontado em folha", valor: c.vale_transporte ? simNao(c.vale_transporte_desconto) : "—" },
    { label: "Vale alimentação/refeição", valor: simNao(c.vale_alimentacao) },
    {
      label: "Valor descontado em folha",
      valor: c.vale_alimentacao && c.vale_alimentacao_valor_desconto ? formatarReais(c.vale_alimentacao_valor_desconto) : "—",
    },
  ];

  const dependentesFicha: LinhaDependenteFicha[] = dependentes.map((d) => ({
    nome: d.nome,
    nascimento: dataBR(d.data_nascimento),
    parentesco: d.parentesco ?? "—",
    cpf: formatarCPF(d.cpf),
    depIR: simNao(d.dependente_ir),
  }));

  return {
    colaboradorNome: c.nome,
    empresaNome: empresa?.nome ?? "—",
    filialNome: unidade?.nome ?? "—",
    filialCnpj: unidade?.cnpj ? formatarCNPJ(unidade.cnpj) : empresa?.cnpj ? formatarCNPJ(empresa.cnpj) : "—",
    pessoal,
    funcional,
    dependentes: dependentesFicha,
    bancarios,
    horario,
    horasSemanaisTotal: formatarHorasMinutosSegundos(minutosSemanais),
    horasMensaisTotal: formatarHorasMinutosSegundos(minutosMensais),
    beneficios,
    nomeArquivoBase: c.nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase()
      .replace(/(^-|-$)/g, ""),
  };
}
