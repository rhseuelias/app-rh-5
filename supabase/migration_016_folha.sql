-- ============================================================
-- MIGRATION 016 — Controle de Folha (Departamento Pessoal)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- Pré-requisito: já ter rodado schema.sql e as migrations anteriores
-- (inclusive a migration_015_beneficios.sql).
-- ============================================================
--
-- Fase 1 do Controle de Folha: a grade digital da planilha "RESUMO DA
-- FOLHA DE PAGAMENTO" que você já usa — Proventos, Descontos e
-- Espelhamento, lançados à mão (a leitura automática de documentos, por
-- IA, é uma 2ª etapa, depois que essa parte estiver testada).
--
-- O que essa migração cria:
--
-- 1) folha_tipos — as colunas da grade (Salário Família, Comissão,
--    Unimed Titular, Vale Transporte Recarga...). Cadastro global (vale
--    pra todas as empresas), já vem com as 14 colunas da sua planilha
--    atual pré-cadastradas — e dá pra cadastrar mais, direto na tela.
--
-- 2) folha_competencias — os meses do Controle de Folha (igual ao
--    Controle de Benefícios: fica "aberto" até você fechar o mês, que
--    vira histórico).
--
-- 3) folha_lancamentos — o valor de 1 colaborador em 1 coluna em 1 mês.
--
-- 4) folha_notas — a anotação livre de 1 colaborador em 1 mês (a coluna
--    "PONTO" da sua planilha).
--
-- Importante: diferente do Controle de Benefícios, aqui entram TODOS os
-- colaboradores ativos ou em experiência — CLT, PJ e Estágio — porque a
-- folha inclui comissão de PJ e outras colunas que passam por todo mundo.

-- ------------------------------------------------------------
-- COLUNAS DA GRADE (cadastro global) — não muda por mês nem por empresa.
-- ------------------------------------------------------------
create table if not exists folha_tipos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('provento', 'desconto', 'espelhamento')),
  nome text not null unique,
  codigo text,
  formato text not null default 'moeda' check (formato in ('moeda', 'texto')),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- COMPETÊNCIAS (meses) do Controle de Folha — histórico mensal.
-- ------------------------------------------------------------
create table if not exists folha_competencias (
  id uuid primary key default gen_random_uuid(),
  competencia text not null unique, -- formato 'AAAA-MM', ex.: '2026-09'
  fechado boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LANÇAMENTOS — o valor de 1 colaborador em 1 coluna em 1 mês.
-- ------------------------------------------------------------
create table if not exists folha_lancamentos (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references folha_competencias(id) on delete cascade,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  tipo_id uuid not null references folha_tipos(id) on delete restrict,
  valor numeric(12,2) not null default 0,
  valor_texto text, -- usado nas colunas de formato "texto" (ex.: "SIM", "4%")
  updated_at timestamptz not null default now(),
  unique (competencia_id, colaborador_id, tipo_id)
);

create index if not exists idx_folha_lancamentos_competencia
  on folha_lancamentos(competencia_id);
create index if not exists idx_folha_lancamentos_colaborador
  on folha_lancamentos(colaborador_id);

-- ------------------------------------------------------------
-- ANOTAÇÕES — a coluna "PONTO" da planilha: 1 texto livre por
-- colaborador por mês.
-- ------------------------------------------------------------
create table if not exists folha_notas (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references folha_competencias(id) on delete cascade,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  nota text,
  updated_at timestamptz not null default now(),
  unique (competencia_id, colaborador_id)
);

-- ============================================================
-- ROW LEVEL SECURITY — mesmo padrão do resto do app: só usuário
-- autenticado (RH) acessa.
-- ============================================================
alter table folha_tipos enable row level security;
alter table folha_competencias enable row level security;
alter table folha_lancamentos enable row level security;
alter table folha_notas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'folha_tipos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_tipos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'folha_competencias' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_competencias
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'folha_lancamentos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_lancamentos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'folha_notas' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_notas
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- ============================================================
-- SEED — as 14 colunas da sua planilha atual, já na ordem certa.
-- Roda só uma vez (por causa do "unique (nome)" acima, rodar de novo
-- não duplica nada).
-- ============================================================
insert into folha_tipos (categoria, nome, codigo, formato, ordem) values
  ('provento', 'Salário Família', '995', 'moeda', 1),
  ('provento', 'Quebra de Caixa 10%', '8907', 'moeda', 2),
  ('provento', 'Comissão', '42', 'moeda', 3),
  ('provento', 'Bolsa Auxílio', '8797', 'moeda', 4),
  ('desconto', 'Adiantamento', '981', 'texto', 5),
  ('desconto', 'Desc. Transporte', '201', 'texto', 6),
  ('desconto', 'Unimed Titular', '8111', 'moeda', 7),
  ('desconto', 'Unimed Dependente', '205', 'moeda', 8),
  ('desconto', 'Unimed Serviços Titular', '206', 'moeda', 9),
  ('desconto', 'Unimed Serviços Dependente', '206', 'moeda', 10),
  ('desconto', 'Drogaria Araújo', '107', 'moeda', 11),
  ('desconto', 'Desconto Vale', null, 'moeda', 12),
  ('espelhamento', 'Vale Transporte Recarga', '183', 'moeda', 13),
  ('espelhamento', 'Unimed Total Empresa', '170', 'moeda', 14)
on conflict (nome) do nothing;
