-- ============================================================
-- MIGRATION 008 — SIMULADOR AVANÇADO DE FÉRIAS
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado schema.sql e as migrations anteriores (001 a 007).
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- ------------------------------------------------------------
-- CENÁRIOS DE SIMULAÇÃO — agora com escopo (empresa/unidade/ano),
-- configuração salva (modelo de fracionamento, regras de data,
-- capacidade da equipe, estratégia de priorização) e status.
-- ------------------------------------------------------------
alter table cenarios_simulacao add column if not exists empresa_id uuid references empresas(id) on delete set null;
alter table cenarios_simulacao add column if not exists unidade_id uuid references unidades(id) on delete set null;
alter table cenarios_simulacao add column if not exists ano integer;
alter table cenarios_simulacao add column if not exists config jsonb not null default '{}'::jsonb;
alter table cenarios_simulacao add column if not exists status text not null default 'rascunho'
  check (status in ('rascunho', 'aprovado'));
alter table cenarios_simulacao add column if not exists usuario_responsavel text;
alter table cenarios_simulacao add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_cenarios_empresa on cenarios_simulacao(empresa_id);
create index if not exists idx_cenarios_ano on cenarios_simulacao(ano);

-- ------------------------------------------------------------
-- FERIAS — dentro de um cenário de simulação, distingue o que o RH
-- definiu manualmente (🟩) do que o algoritmo gerou automaticamente
-- (🟨). Só é usado quando simulacao = true.
-- ------------------------------------------------------------
alter table ferias add column if not exists origem_simulacao text
  check (origem_simulacao in ('manual', 'automatica'));

create index if not exists idx_ferias_periodo_aquisitivo on ferias(periodo_aquisitivo_id);

-- ============================================================
-- Nada de RLS novo aqui — as tabelas já têm a policy
-- "authenticated_full_access" desde a migration 007.
-- ============================================================
