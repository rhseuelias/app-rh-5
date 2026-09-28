-- ============================================================
-- MIGRATION 015 — Controle de Benefícios (Departamento Pessoal)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- Pré-requisito: já ter rodado schema.sql e as migrations anteriores.
-- ============================================================
--
-- O que essa migração cria (é a versão "de verdade" da simulação que já
-- foi validada em tela):
--
-- 1) beneficios_tipos_transporte — os "cartões"/tipos de transporte que
--    cada empresa cadastra (CAJU, SEMPARAR, BHBUS, OTIMO ou qualquer
--    outro nome), cada um com sua taxa administrativa (em R$). Fica vazio
--    no começo — os tipos são cadastrados na própria tela do app.
--
-- 2) beneficios_competencias — os meses do controle. Um mês pode ficar
--    "aberto" (dá pra editar) ou "fechado" (vira histórico, só consulta).
--    É criado sozinho, automaticamente, na primeira vez que alguém mexe
--    naquele mês — não precisa cadastrar antes.
--
-- 3) beneficios_transporte — os lançamentos de transporte de cada
--    colaborador no mês. Um colaborador pode ter mais de uma linha (2
--    tipos diferentes, ou o mesmo tipo 2 vezes com valores diferentes).
--
-- 4) beneficios_extras — Alimentação, Prêmio e Outros de cada colaborador
--    no mês (pagos pelo cartão CAJU — um valor só por colaborador por mês,
--    vale pra todo mundo, mesmo quem usa outro cartão só pro transporte).
--
-- Importante: só colaboradores CLT e Estagiário entram nesse controle —
-- PJ não participa. Essa regra é aplicada pelo próprio app (na tela e nas
-- ações), não existe trava disso aqui no banco.

-- ------------------------------------------------------------
-- TIPOS DE TRANSPORTE cadastrados por empresa — não muda por mês.
-- ------------------------------------------------------------
create table if not exists beneficios_tipos_transporte (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  taxa_adm numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create index if not exists idx_beneficios_tipos_transporte_empresa
  on beneficios_tipos_transporte(empresa_id);

-- ------------------------------------------------------------
-- COMPETÊNCIAS (meses) do Controle de Benefícios — histórico mensal.
-- "fechado" = true trava a edição (mês virou histórico).
-- ------------------------------------------------------------
create table if not exists beneficios_competencias (
  id uuid primary key default gen_random_uuid(),
  competencia text not null unique, -- formato 'AAAA-MM', ex.: '2026-09'
  fechado boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LANÇAMENTOS DE TRANSPORTE — cada linha é um "cartão" de um colaborador
-- naquele mês. Pode repetir colaborador (tipos diferentes ou o mesmo tipo
-- com valores diferentes).
-- ------------------------------------------------------------
create table if not exists beneficios_transporte (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references beneficios_competencias(id) on delete cascade,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo text not null, -- nome do tipo cadastrado (CAJU, SEMPARAR, BHBUS, OTIMO...)
  modo text not null default 'km' check (modo in ('km', 'viagens')),
  km numeric(10,2) not null default 0,
  valor_km numeric(10,2) not null default 0,
  viagens_dia numeric(6,2) not null default 0,
  valor_viagem numeric(10,2) not null default 0,
  dias_uteis numeric(6,2) not null default 0,
  numero_cartao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_beneficios_transporte_competencia
  on beneficios_transporte(competencia_id);
create index if not exists idx_beneficios_transporte_colaborador
  on beneficios_transporte(colaborador_id);

-- ------------------------------------------------------------
-- ALIMENTAÇÃO, PRÊMIO E OUTROS — um valor por colaborador por mês.
-- ------------------------------------------------------------
create table if not exists beneficios_extras (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references beneficios_competencias(id) on delete cascade,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  alimentacao numeric(10,2) not null default 0,
  premio numeric(10,2) not null default 0,
  outros_descricao text,
  outros_valor numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (competencia_id, colaborador_id)
);

create index if not exists idx_beneficios_extras_competencia
  on beneficios_extras(competencia_id);

-- ============================================================
-- ROW LEVEL SECURITY — mesmo padrão do resto do app: só usuário
-- autenticado (RH) acessa.
-- ============================================================
alter table beneficios_tipos_transporte enable row level security;
alter table beneficios_competencias enable row level security;
alter table beneficios_transporte enable row level security;
alter table beneficios_extras enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'beneficios_tipos_transporte' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on beneficios_tipos_transporte
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'beneficios_competencias' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on beneficios_competencias
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'beneficios_transporte' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on beneficios_transporte
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'beneficios_extras' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on beneficios_extras
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
