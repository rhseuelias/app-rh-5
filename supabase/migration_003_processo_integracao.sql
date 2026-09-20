-- ============================================================
-- MIGRATION 003 — PROCESSO DE INTEGRAÇÃO (fluxo completo)
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado schema.sql, migration_002_pre_cadastro.sql.
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- campo novo no colaborador, usado na ficha de integração
alter table colaboradores add column if not exists lider text;

-- ------------------------------------------------------------
-- CONFIGURAÇÃO GERAL DO PROCESSO (linha única, id fixo 'default')
-- ------------------------------------------------------------
create table if not exists config_integracao (
  id text primary key default 'default',
  prazo_integracao_dias integer not null default 5, -- exame admissional -> onboarding
  prazo_experiencia_dias integer not null default 90,
  antecedencia_alerta_avaliacao_dias integer not null default 15,
  updated_at timestamptz default now()
);
insert into config_integracao (id) values ('default') on conflict (id) do nothing;

-- ------------------------------------------------------------
-- ETAPAS CONFIGURÁVEIS (nome, ordem, responsável, prazo)
-- ------------------------------------------------------------
create table if not exists etapas_config (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  ordem integer not null,
  nome text not null,
  responsavel text not null default 'RH'
    check (responsavel in ('RH', 'LIDER', 'FUNCIONARIO', 'SISTEMA')),
  prazo_dias integer, -- dias a partir do início do cronômetro (usado pela etapa Onboarding)
  obrigatoria boolean not null default true,
  ativa boolean not null default true,
  created_at timestamptz default now()
);

insert into etapas_config (chave, ordem, nome, responsavel, prazo_dias) values
  ('pre_cadastro', 1, 'Pré-cadastro', 'RH', null),
  ('exame_admissional', 2, 'Exame admissional', 'RH', null),
  ('exame_psicologico', 3, 'Exame psicológico', 'RH', null),
  ('vale_transporte', 4, 'Vale-transporte', 'RH', null),
  ('inclusao_beneficios', 5, 'Inclusão de benefícios', 'RH', null),
  ('contrato', 6, 'Contrato', 'RH', null),
  ('admissao', 7, 'Admissão', 'RH', null),
  ('onboarding', 8, 'Onboarding', 'LIDER', 5),
  ('pesquisa_onboarding', 9, 'Pesquisa onboarding', 'FUNCIONARIO', null),
  ('experiencia', 10, 'Experiência', 'SISTEMA', null),
  ('avaliacao_90_dias', 11, 'Avaliação dos 90 dias', 'LIDER', null)
on conflict (chave) do nothing;

-- ------------------------------------------------------------
-- PROCESSO DE INTEGRAÇÃO — 1 por colaborador
-- ------------------------------------------------------------
create table if not exists processos_integracao (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  candidato_id uuid references candidatos(id) on delete set null,
  status_geral text not null default 'integracao'
    check (status_geral in ('integracao', 'experiencia', 'efetivado', 'nao_efetivado')),
  cronometro_iniciado_em timestamptz,
  prazo_integracao_dias integer not null default 5,
  prazo_experiencia_dias integer not null default 90,
  data_fim_experiencia date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_processos_colaborador_unico on processos_integracao(colaborador_id);

-- ------------------------------------------------------------
-- ETAPAS DE CADA PROCESSO (uma linha por etapa, por colaborador)
-- ------------------------------------------------------------
create table if not exists etapas_processo (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_integracao(id) on delete cascade,
  chave text not null,
  ordem integer not null,
  nome text not null,
  responsavel text not null,
  status text not null default 'nao_iniciado'
    check (status in ('nao_iniciado', 'pendente', 'em_andamento', 'realizado', 'em_experiencia')),
  bloqueada boolean not null default true,
  data_inicio timestamptz,
  data_conclusao timestamptz,
  prazo timestamptz,
  observacoes text,
  concluido_por text,
  created_at timestamptz default now()
);

create index if not exists idx_etapas_processo on etapas_processo(processo_id);

-- ------------------------------------------------------------
-- HISTÓRICO de alterações de cada etapa
-- ------------------------------------------------------------
create table if not exists historico_etapas (
  id uuid primary key default gen_random_uuid(),
  etapa_processo_id uuid not null references etapas_processo(id) on delete cascade,
  data timestamptz default now(),
  usuario text,
  status_anterior text,
  status_novo text,
  observacao text
);

create index if not exists idx_historico_etapa on historico_etapas(etapa_processo_id);

-- ------------------------------------------------------------
-- DOCUMENTOS anexados numa etapa (reaproveita o bucket 'documentos')
-- ------------------------------------------------------------
create table if not exists documentos_etapa (
  id uuid primary key default gen_random_uuid(),
  etapa_processo_id uuid not null references etapas_processo(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- AVALIAÇÃO DOS 90 DIAS
-- ------------------------------------------------------------
create table if not exists avaliacoes_experiencia (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_integracao(id) on delete cascade,
  avaliacao_tecnica integer,
  comportamento integer,
  cultura integer,
  assiduidade integer,
  pontualidade integer,
  desempenho integer,
  observacoes text,
  recomendacao text,
  resultado text not null check (resultado in ('efetivado', 'nao_efetivado')),
  avaliado_por text,
  avaliado_em timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — mesmo padrão do resto do app (só RH autenticado)
-- ============================================================
alter table config_integracao enable row level security;
alter table etapas_config enable row level security;
alter table processos_integracao enable row level security;
alter table etapas_processo enable row level security;
alter table historico_etapas enable row level security;
alter table documentos_etapa enable row level security;
alter table avaliacoes_experiencia enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'config_integracao', 'etapas_config', 'processos_integracao', 'etapas_processo',
    'historico_etapas', 'documentos_etapa', 'avaliacoes_experiencia'
  ])
  loop
    if not exists (
      select 1 from pg_policies where tablename = t and policyname = 'authenticated_full_access'
    ) then
      execute format(
        'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
        t
      );
    end if;
  end loop;
end $$;

-- Observação: quando o RH converte um candidato em colaborador (tela de
-- Pré-cadastro), o app cria automaticamente o processo de integração e
-- todas as etapas — não precisa rodar nada manual aqui além deste arquivo.
