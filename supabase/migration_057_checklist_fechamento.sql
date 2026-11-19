-- Checklist de Fechamento (site /checklist): unidades e tarefas, logins das
-- Agentes de Operações e da supervisão, e os relatórios enviados.
-- Segurança: as três tabelas ficam com RLS ligado e SEM política de propósito.
-- Só o servidor do app (chave service role) lê e grava; o navegador nunca
-- acessa estas tabelas direto. Senhas ficam guardadas criptografadas (scrypt).
-- Pode rodar mais de uma vez sem problema.

create table if not exists checklist_config (
  id text primary key,
  units jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

create table if not exists checklist_acessos (
  id uuid primary key default gen_random_uuid(),
  login text not null unique,
  nome text,
  papel text not null check (papel in ('agente', 'supervisao')),
  unidade_id text,
  senha_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- uma Agente (login) por unidade
create unique index if not exists checklist_acessos_agente_unidade
  on checklist_acessos (unidade_id) where papel = 'agente';

create table if not exists checklist_relatorios (
  id text primary key,
  unidade_id text not null,
  data date not null,
  doc jsonb not null,
  enviado_em timestamptz not null default now()
);

create index if not exists checklist_relatorios_data on checklist_relatorios (data desc);

alter table checklist_config enable row level security;
alter table checklist_acessos enable row level security;
alter table checklist_relatorios enable row level security;
