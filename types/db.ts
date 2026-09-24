export type TipoColaborador = "CLT" | "PJ" | "Estagio";
export type StatusColaborador = "experiencia" | "ativo" | "afastado" | "desligado";

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  faturamento_mensal: number;
  absenteismo_pct: number | null;
  performance_pct: number | null;
  treinamento_pct: number | null;
  clima_pct: number | null;
}

export interface Unidade {
  id: string;
  empresa_id: string | null;
  nome: string;
  cnpj: string | null;
  adiantamento_pct: 20 | 30 | 40 | null;
  created_at: string;
}

export type EstadoCivil = "solteiro" | "casado" | "divorciado" | "viuvo" | "uniao_estavel";

export type GrauInstrucao =
  | "fundamental_incompleto"
  | "fundamental_completo"
  | "medio_incompleto"
  | "medio_completo"
  | "superior_incompleto"
  | "superior_completo"
  | "pos_graduacao"
  | "mestrado"
  | "doutorado_pos_doutorado";

export type ContratoExperiencia = "90_dias_45_45" | "90_dias_15_75" | "45_dias_45";

export interface HorarioDia {
  manha_entrada?: string | null;
  manha_saida?: string | null;
  tarde_entrada?: string | null;
  tarde_saida?: string | null;
}

export type DiaSemana =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";

export type HorarioTrabalho = Partial<Record<DiaSemana, HorarioDia>>;

export interface DependenteColaborador {
  id: string;
  colaborador_id: string;
  nome: string;
  data_nascimento: string | null;
  parentesco: string | null;
  cpf: string;
  dependente_ir: boolean;
}

/** Um período de contrato PJ que já foi encerrado por uma renovação —
 * guardado pra manter o histórico anual de cada colaborador PJ. */
export interface HistoricoContratoPJ {
  id: string;
  colaborador_id: string;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_nota_fiscal: number | null;
  criado_em: string;
}

/** As 3 assinaturas fixas que entram em TODO contrato PJ emitido — Salão
 * Parceiro e as 2 testemunhas. Linha única, cadastrada em Configurações. */
export interface ConfigAssinaturasPJ {
  id: string;
  assinatura_salao_path: string | null;
  assinatura_testemunha1_path: string | null;
  assinatura_testemunha2_path: string | null;
}

export interface Colaborador {
  id: string;
  empresa_id: string | null;
  unidade_id: string | null;
  tipo: TipoColaborador;
  nome: string;
  cpf_cnpj: string | null;
  cargo: string | null;
  departamento: string | null;
  lider: string | null;
  data_nascimento: string | null;
  data_admissao: string | null;
  status: StatusColaborador;
  data_fim_experiencia: string | null;
  data_desligamento: string | null;
  salario_base: number;
  comissao_media: number;
  auxilio_outros: number;
  custo_vt: number;
  custo_va_vr: number;
  custo_assist_medica: number;
  custo_assist_psicologica: number;
  telefone: string | null;
  email: string | null;
  telefone_contato_emergencia: string | null;
  nome_contato_emergencia: string | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  contrato_renovacao_automatica: boolean;
  valor_nota_fiscal: number | null;
  comissao_corte_pct: number | null;
  comissao_quimica_pct: number | null;
  /** Caminho no Storage (bucket "documentos") da assinatura do próprio
   * profissional PJ — usada no contrato emitido. Só essa muda por
   * colaborador; as outras 3 (salão + 2 testemunhas) ficam em
   * ConfigAssinaturasPJ e são as mesmas pra todo mundo. */
  assinatura_pj_path: string | null;
  /** Link de assinatura digital do contrato PJ — token do link, quando foi
   * gerado, e quando o profissional efetivamente assinou (null = pendente). */
  assinatura_pj_link_token: string | null;
  assinatura_pj_link_criado_em: string | null;
  assinatura_pj_assinado_em: string | null;
  observacoes: string | null;

  // dados pessoais extras (Ficha de Admissão)
  rg: string | null;
  endereco: string | null;
  estado_civil: EstadoCivil | null;
  raca_cor: string | null;
  grau_instrucao: GrauInstrucao | null;

  // dados funcionais extras
  contrato_experiencia: ContratoExperiencia | null;
  adiantamento_salario: boolean;
  primeiro_emprego: boolean;
  insalubridade: boolean;
  periculosidade: boolean;
  quebra_caixa: boolean;
  gratificacao_funcao: boolean;

  // dados bancários
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  conta_digito: string | null;

  // horário de trabalho
  horario_trabalho: HorarioTrabalho | null;

  // benefícios
  vale_transporte: boolean;
  vale_transporte_desconto: boolean;
  vale_alimentacao: boolean;
  vale_alimentacao_valor_desconto: number | null;

  // desligamento
  tipo_rescisao: string | null;
  motivo_desligamento: string | null;
}

export interface PeriodoAquisitivo {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  limite_concessao: string;
  status: "aberto" | "vencido" | "gozado";
}

export type OrigemFerias = "manual" | "planejamento_auto" | "simulacao";

export interface Ferias {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo_id: string | null;
  data_inicio: string;
  data_fim: string;
  dias: number;
  vendeu_abono: boolean;
  status: "planejada" | "solicitado" | "aprovado" | "concluido" | "cancelado";
  cenario_id?: string | null;
  simulacao?: boolean;
  valor_estimado?: number | null;
  origem?: OrigemFerias;
  /** Só usado quando simulacao=true: quem definiu essa data dentro do cenário. */
  origem_simulacao?: "manual" | "automatica" | null;
}

// ------------------------------------------------------------
// SIMULADOR DE FÉRIAS (cenários)
// ------------------------------------------------------------
export type ModeloDivisaoFerias = "30" | "15_15" | "20_10" | "14_16" | "14_10_6" | "personalizado";

export type EstrategiaSimulacao = "equilibrada" | "vencimento" | "operacional" | "personalizada";

export interface PesosEstrategia {
  dataLimite: number;
  cobertura: number;
  distribuicao: number;
  preferencias: number;
}

export interface ConfigSimulacao {
  modelo: ModeloDivisaoFerias;
  periodosPersonalizados: number[]; // usado só quando modelo === "personalizado"
  diasPreferenciais: DiaSemana[]; // vazio = sem preferência (qualquer dia útil permitido pela CLT)
  intervaloMinMeses: number;
  intervaloMaxMeses: number;
  capacidadeMaxUnidade: number | null; // null = sem limite
  capacidadeMaxDepartamento: number | null; // null = sem limite
  estrategia: EstrategiaSimulacao;
  pesos: PesosEstrategia;
}

export interface CenarioSimulacao {
  id: string;
  nome: string;
  descricao: string | null;
  empresa_id: string | null;
  unidade_id: string | null;
  ano: number | null;
  config: Partial<ConfigSimulacao> | null;
  status: "rascunho" | "aprovado";
  usuario_responsavel: string | null;
  created_at: string;
  updated_at: string;
}

export interface Feriado {
  id: string;
  data: string;
  nome: string;
  abrangencia: "nacional" | "estadual" | "municipal" | "facultativo";
  uf: string | null;
  municipio: string | null;
}

export type EtapaOnboarding =
  | "pre_admissao"
  | "primeiro_dia"
  | "checkin_30"
  | "avaliacao_45"
  | "avaliacao_90";

export interface OnboardingEtapa {
  id: string;
  colaborador_id: string;
  etapa: EtapaOnboarding;
  status: "pendente" | "em_andamento" | "concluido" | "atrasado";
  responsavel: string | null;
  prazo: string | null;
  observacoes: string | null;
}

export type CategoriaEvento =
  | "admissao"
  | "ferias"
  | "feriado"
  | "reuniao"
  | "acao_rh"
  | "aniversario"
  | "prazo_dp";

export type RepeticaoEvento = "nenhuma" | "diaria" | "semanal" | "mensal" | "anual";

export interface EventoCalendario {
  id: string;
  titulo: string;
  categoria: CategoriaEvento;
  data_inicio: string;
  data_fim: string | null;
  colaborador_id: string | null;
  empresa_id: string | null;
  descricao: string | null;
  cor?: string | null;
  repete?: RepeticaoEvento;
  serie_id?: string | null;
  alerta_email_1?: string | null;
  alerta_email_2?: string | null;
}

export interface ConfigCalendario {
  id: string;
  whatsapp_numero_1: string | null;
  whatsapp_numero_2: string | null;
  relatorio_diario_ativo: boolean;
}

export type StatusCandidato = "link_gerado" | "preenchido" | "convertido";

export interface Candidato {
  id: string;
  token: string;
  nome: string | null;
  cargo_pretendido: string | null;
  empresa_id: string | null;
  status: StatusCandidato;
  cpf: string | null;
  rg: string | null;
  estado_civil: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  nome_contato_emergencia: string | null;
  telefone_contato_emergencia: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pix: string | null;
  observacoes: string | null;
  enviado_em: string | null;
  preenchido_em: string | null;
  convertido_colaborador_id: string | null;
  created_at: string;
}

export interface DocumentoCandidato {
  id: string;
  candidato_id: string;
  nome_arquivo: string;
  tipo: string | null;
  storage_path: string;
  created_at: string;
}

// ------------------------------------------------------------
// PROCESSO DE INTEGRAÇÃO
// ------------------------------------------------------------
export type ResponsavelEtapa = "RH" | "LIDER" | "FUNCIONARIO" | "SISTEMA";

export type StatusEtapaProcesso =
  | "nao_iniciado"
  | "pendente"
  | "em_andamento"
  | "realizado"
  | "em_experiencia";

export type StatusGeralProcesso = "integracao" | "experiencia" | "efetivado" | "nao_efetivado";

export interface EtapaConfig {
  id: string;
  chave: string;
  ordem: number;
  nome: string;
  responsavel: ResponsavelEtapa;
  prazo_dias: number | null;
  obrigatoria: boolean;
  ativa: boolean;
}

export interface ProcessoIntegracao {
  id: string;
  colaborador_id: string;
  candidato_id: string | null;
  status_geral: StatusGeralProcesso;
  cronometro_iniciado_em: string | null;
  prazo_integracao_dias: number;
  prazo_experiencia_dias: number;
  data_fim_experiencia: string | null;
  status_geral_definido_em: string | null;
  arquivado: boolean;
  arquivado_em: string | null;
  arquivado_por: string | null;
  created_at: string;
}

export interface EtapaProcesso {
  id: string;
  processo_id: string;
  chave: string;
  ordem: number;
  nome: string;
  responsavel: ResponsavelEtapa;
  status: StatusEtapaProcesso;
  bloqueada: boolean;
  data_inicio: string | null;
  data_conclusao: string | null;
  prazo: string | null;
  observacoes: string | null;
  concluido_por: string | null;
}

export interface HistoricoEtapa {
  id: string;
  etapa_processo_id: string;
  data: string;
  usuario: string | null;
  status_anterior: string | null;
  status_novo: string;
  observacao: string | null;
}

export interface DocumentoEtapa {
  id: string;
  etapa_processo_id: string;
  nome_arquivo: string;
  storage_path: string;
  created_at: string;
}

export interface AvaliacaoExperiencia {
  id: string;
  processo_id: string;
  avaliacao_tecnica: number | null;
  comportamento: number | null;
  cultura: number | null;
  assiduidade: number | null;
  pontualidade: number | null;
  desempenhn: number | null;
  observacoes: string | null;
  recomendacao: string | null;
  resultado: "efetivado" | "nao_efetivado";
  avaliado_por: string | null;
  avaliado_em: string;
}

export interface ConfigIntegracao {
  id: string;
  prazo_integracao_dias: number;
  prazo_experiencia_dias: number;
  antecedencia_alerta_avaliacao_dias: number;
  prazo_saida_painel_dias: number;
}

// ------------------------------------------------------------
// CONTROLE DE BENEFÍCIOS (Departamento Pessoal) — Transporte,
// Alimentação, Prêmio e Outros. Só colaboradores CLT e Estagiário
// participam.
// ------------------------------------------------------------

/** Tipo de transporte cadastrado numa empresa (CAJU, SEMPARAR, BHBUS,
 * OTIMO ou qualquer nome cadastrado por ela) — não muda por mês. */
export interface BeneficioTipoTransporte {
  id: string;
  empresa_id: string;
  nome: string;
  taxa_adm: number;
  created_at: string;
}

/** Um mês do Controle de Benefícios. "fechado" = vira histórico (trava edição). */
export interface BeneficioCompetencia {
  id: string;
  competencia: string; // 'AAAA-MM', ex.: '2026-09'
  fechado: boolean;
  created_at: string;
}

export type ModoTransporteBeneficio = "km" | "viagens";

/** Um lançamento de transporte de 1 colaborador em 1 mês. Colaborador pode
 * ter várias linhas (tipos diferentes, ou o mesmo tipo com valores diferentes). */
export interface BeneficioTransporte {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  tipo: string;
  modo: ModoTransporteBeneficio;
  km: number;
  valor_km: number;
  viagens_dia: number;
  valor_viagem: number;
  dias_uteis: number;
  numero_cartao: string | null;
  created_at: string;
  updated_at: string;
}

/** Alimentação, Prêmio e Outros de 1 colaborador em 1 mês (pagos pelo CAJU) —
 * um registro só por colaborador por mês. */
export interface BeneficioExtra {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  alimentacao: number;
  premio: number;
  outros_descricao: string | null;
  outros_valor: number;
  updated_at: string;
}

// ------------------------------------------------------------
// CONTROLE DE FOLHA (Departamento Pessoal) — grade de Proventos,
// Descontos e Espelhamento, uma linha por colaborador, mês a mês.
// Fase 1: lançamento manual (a leitura automática de documentos vem
// numa 2ª etapa). Todos os colaboradores ativos/experiência entram
// aqui (CLT, PJ e Estágio — diferente do Controle de Benefícios).
// ------------------------------------------------------------

export type CategoriaFolha = "provento" | "desconto" | "espelhamento";
export type FormatoFolha = "moeda" | "texto" | "sim_nao";

/** Uma coluna da grade de Folha (ex.: "Comissão", "Unimed Titular").
 * Cadastro global — não muda por empresa. */
export interface FolhaTipo {
  id: string;
  categoria: CategoriaFolha;
  nome: string;
  codigo: string | null;
  /** "moeda" = campo em R$ com máscara; "texto" = campo livre; "sim_nao"
   * = Sim/Não (ex.: Adiantamento, Desc. Transporte). */
  formato: FormatoFolha;
  ordem: number;
  ativo: boolean;
  /** true = a coluna é calculada sozinha pelo sistema (hoje só a Quebra
   * de Caixa: 10% do salário de quem tem "caixa" no cargo) — não dá
   * pra editar na tela, o valor final é sempre recalculado ao salvar. */
  calculo_automatico: boolean;
  created_at: string;
}

/** Um mês da Folha. "fechado" = vira histórico (trava edição). */
export interface FolhaCompetencia {
  id: string;
  competencia: string; // 'AAAA-MM', ex.: '2026-09'
  fechado: boolean;
  created_at: string;
}

/** O valor de 1 colaborador em 1 coluna (tipo) em 1 mês. */
export interface FolhaLancamento {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  tipo_id: string;
  valor: number;
  valor_texto: string | null;
  updated_at: string;
}

/** Anotação livre de 1 colaborador em 1 mês (coluna "PONTO" da planilha). */
export interface FolhaNota {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  nota: string | null;
  updated_at: string;
}

/** Marca que 1 evento (coluna) foi concluído pra 1 unidade em 1 mês —
 * é o que libera o próximo evento e, quando todo mundo termina, libera
 * o Relatório de Conferência. */
export interface FolhaEventoConcluido {
  id: string;
  competencia_id: string;
  grupo: string; // nome da unidade/empresa (ou "ESTÁGIO")
  tipo_id: string;
  concluido_em: string;
}

/** Restringe 1 coluna (tipo) a um subconjunto de unidades/empresas —
 * se um tipo_id não tiver nenhuma linha aqui, ele vale pra todo mundo
 * (comportamento padrão, igual antes dessa tabela existir). */
export interface FolhaTipoGrupo {
  id: string;
  tipo_id: string;
  grupo: string;
}
