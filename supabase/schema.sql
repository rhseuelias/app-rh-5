-- ============================================================
-- APP RH — SCHEMA INICIAL (núcleo simplificado)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- EMPRESAS (multi-CNPJ / unidades)
-- ------------------------------------------------------------
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  faturamento_mensal numeric(14,2) default 0,
  absenteismo_pct numeric(5,2),
  performance_pct numeric(5,2),
  treinamento_pct numeric(5,2),
  clima_pct numeric(5,2),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- USUÁRIOS DO APP (RH) — vinculados ao auth.users do Supabase
-- ------------------------------------------------------------
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null default 'rh' check (papel in ('rh', 'gestor', 'admin')),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- COLABORADORES (CLT e PJ no mesmo cadastro, com "tipo")
-- ------------------------------------------------------------
create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete set null,
  tipo text not null default 'CLT' check (tipo in ('CLT', 'PJ')),
  nome text not null,
  cpf_cnpj text,
  cargo text,
  departamento text,
  data_nascimento date,
  data_admissao date,
  status text not null default 'experiencia'
    check (status in ('experiencia', 'ativo', 'afastado', 'desligado')),
  data_fim_experiencia date, -- calculado ou informado (admissão + 90 dias)
  data_desligamento date,

  -- contrato e remuneração
  salario_base numeric(12,2) default 0,
  comissao_media numeric(12,2) default 0,
  auxilio_outros numeric(12,2) default 0,
  custo_vt numeric(12,2) default 0,
  custo_va_vr numeric(12,2) default 0,
  custo_assist_medica numeric(12,2) default 0,
  custo_assist_psicologica numeric(12,2) default 0,

  -- contato / dados pessoais
  telefone text,
  email text,
  telefone_contato_emergencia text,
  nome_contato_emergencia text,

  -- PJ específico
  contrato_inicio date,
  contrato_fim date,
  contrato_renovacao_automatica boolean default false,
  valor_nota_fiscal numeric(12,2),

  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_colaboradores_empresa on colaboradores(empresa_id);
create index if not exists idx_colaboradores_status on colaboradores(status);

-- ------------------------------------------------------------
-- DOCUMENTOS do colaborador (referência a arquivos no Supabase Storage)
-- ------------------------------------------------------------
create table if not exists documentos_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  nome_arquivo text not null,
  tipo text, -- RG, CTPS, comprovante_residencia, contrato, outro
  storage_path text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- FÉRIAS (período aquisitivo + concessivo/gozo)
-- ------------------------------------------------------------
create table if not exists periodos_aquisitivos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  inicio date not null,
  fim date not null, -- inicio + 12 meses
  limite_concessao date not null, -- fim + 11 meses (prazo legal p/ gozar)
  status text not null default 'aberto'
    check (status in ('aberto', 'vencido', 'gozado')),
  created_at timestamptz default now()
);

create table if not exists ferias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  periodo_aquisitivo_id uuid references periodos_aquisitivos(id) on delete set null,
  data_inicio date not null,
  data_fim date not null,
  dias integer not null,
  vendeu_abono boolean default false, -- vendeu 1/3 (abono pecuniário)
  status text not null default 'solicitado'
    check (status in ('solicitado', 'aprovado', 'concluido', 'cancelado')),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ONBOARDING / PROCESSO DE INTEGRAÇÃO
-- ------------------------------------------------------------
create table if not exists onboarding_etapas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  etapa text not null
    check (etapa in ('pre_admissao', 'primeiro_dia', 'checkin_30', 'avaliacao_45', 'avaliacao_90')),
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'concluido', 'atrasado')),
  responsavel text,
  prazo date,
  observacoes text,
  concluido_em timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- CALENDÁRIO GERAL (eventos de todas as categorias)
-- ------------------------------------------------------------
create table if not exists eventos_calendario (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null
    check (categoria in ('admissao', 'ferias', 'feriado', 'reuniao', 'acao_rh', 'aniversario', 'prazo_dp')),
  data_inicio date not null,
  data_fim date,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  descricao text,
  created_at timestamptz default now()
);

create index if not exists idx_eventos_data on eventos_calendario(data_inicio);
create index if not exists idx_eventos_categoria on eventos_calendario(categoria);

-- ------------------------------------------------------------
-- FERIADOS (base nacional + municipais/estaduais)
-- ------------------------------------------------------------
create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null,
  abrangencia text not null default 'nacional'
    check (abrangencia in ('nacional', 'estadual', 'municipal', 'facultativo')),
  uf text,
  municipio text
);

-- ------------------------------------------------------------
-- HISTÓRICO (promoções, reajustes, mudanças de status)
-- ------------------------------------------------------------
create table if not exists historico_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  tipo text not null, -- promocao, reajuste, mudanca_status, observacao
  descricao text not null,
  valor_anterior text,
  valor_novo text,
  data_evento date not null default current_date,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — só usuários autenticados (RH) acessam
-- ============================================================
alter table empresas enable row level security;
alter table perfis enable row level security;
alter table colaboradores enable row level security;
alter table documentos_colaborador enable row level security;
alter table periodos_aquisitivos enable row level security;
alter table ferias enable row level security;
alter table onboarding_etapas enable row level security;
alter table eventos_calendario enable row level security;
alter table feriados enable row level security;
alter table historico_colaborador enable row level security;

-- política simples: qualquer usuário autenticado (das 3 pessoas do RH)
-- pode ler e escrever em tudo. Se no futuro quiser diferenciar por papel
-- (ex.: gestor só vê sua equipe), ajustamos essas políticas depois.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresas','perfis','colaboradores','documentos_colaborador',
    'periodos_aquisitivos','ferias','onboarding_etapas',
    'eventos_calendario','feriados','historico_colaborador'
  ])
  loop
    execute format(
      'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      t
    );
  end loop;
end $$;

-- ============================================================
-- SEED: feriados nacionais 2026 (para o Calendário funcionar de cara)
-- ============================================================
insert into feriados (data, nome, abrangencia) values
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-02-16', 'Carnaval', 'nacional'),
  ('2026-02-17', 'Carnaval', 'nacional'),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia do Trabalho', 'nacional'),
  ('2026-06-04', 'Corpus Christi', 'facultativo'),
  ('2026-09-07', 'Independência do Brasil', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-11-20', 'Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional')
on conflict do nothing;
