-- ============================================================
-- MIGRATION 017 — Ajustes no Controle de Folha (processo por evento)
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- Pré-requisito: já ter rodado a migration_016_folha.sql.
-- ============================================================
--
-- O que essa migração muda:
--
-- 1) Adiantamento e Desc. Transporte deixam de ser "texto livre" e
--    passam a ser "Sim/Não" (novo formato "sim_nao").
--
-- 2) Quebra de Caixa 10% passa a ser calculada automaticamente (10% do
--    salário, só pra quem tem "caixa" no cargo, ex.: Recepcionista
--    Caixa) — marca a coluna com calculo_automatico = true.
--
-- 3) A categoria Espelhamento (Vale Transporte Recarga, Unimed Total
--    Empresa) sai da grade — desativa essas 2 colunas (mesmo processo
--    de "remover coluna" que já existe: não apaga histórico, só some
--    da tela).
--
-- 4) Nova tabela folha_eventos_concluidos — controla quais eventos
--    (colunas) já foram concluídos, por unidade, em cada mês. É o que
--    libera o próximo evento e, no fim, o Relatório de Conferência.
-- ============================================================

-- ------------------------------------------------------------
-- 1) e 2): novo formato "sim_nao" e coluna de cálculo automático.
-- ------------------------------------------------------------
alter table folha_tipos add column if not exists calculo_automatico boolean not null default false;

alter table folha_tipos drop constraint if exists folha_tipos_formato_check;
alter table folha_tipos add constraint folha_tipos_formato_check
  check (formato in ('moeda', 'texto', 'sim_nao'));

update folha_tipos set formato = 'sim_nao'
  where nome in ('Adiantamento', 'Desc. Transporte');

update folha_tipos set calculo_automatico = true
  where nome = 'Quebra de Caixa 10%';

-- ------------------------------------------------------------
-- 3) Espelhamento sai da grade (desativa, não apaga histórico).
-- ------------------------------------------------------------
update folha_tipos set ativo = false where categoria = 'espelhamento';

-- ------------------------------------------------------------
-- 4) Controle de eventos concluídos (por unidade, por mês).
-- ------------------------------------------------------------
create table if not exists folha_eventos_concluidos (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references folha_competencias(id) on delete cascade,
  grupo text not null, -- nome da unidade/empresa (ou "ESTÁGIO")
  tipo_id uuid not null references folha_tipos(id) on delete cascade,
  concluido_em timestamptz not null default now(),
  unique (competencia_id, grupo, tipo_id)
);

create index if not exists idx_folha_eventos_competencia
  on folha_eventos_concluidos(competencia_id);

alter table folha_eventos_concluidos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'folha_eventos_concluidos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_eventos_concluidos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
