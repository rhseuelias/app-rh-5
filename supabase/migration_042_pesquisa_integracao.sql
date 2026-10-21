-- Migration 042 — Pesquisa de Integração (link para o colaborador) e validade do link do supervisor do painel
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.

-- 1) Respostas da Pesquisa de Integração. Um registro por colaborador.
create table if not exists public.pesquisas_integracao (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  token text not null unique,
  criado_em timestamptz not null default now(),
  criado_por text,
  expira_em timestamptz not null,
  respondida_em timestamptz,
  nao_participou boolean not null default false,
  respostas jsonb not null default '[]'::jsonb,
  observacoes text
);

create unique index if not exists idx_pesquisas_integracao_colaborador on public.pesquisas_integracao(colaborador_id);

-- Trava total para o navegador: só o servidor do app (chave de serviço) lê e grava nesta tabela.
alter table public.pesquisas_integracao enable row level security;

-- 2) Validade do link do supervisor do Painel de Integração (24 horas).
alter table public.links_painel_integracao add column if not exists expira_em timestamptz;

-- Links que já estão ativos passam a valer 24 horas a partir de agora.
update public.links_painel_integracao
set expira_em = now() + interval '24 hours'
where ativo = true and expira_em is null;
