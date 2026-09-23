-- ============================================================
-- MIGRATION 018 — Colunas específicas por empresa/unidade
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- Pré-requisito: já ter rodado a migration_017_folha_ajustes.sql.
-- ============================================================
--
-- O que essa migração muda:
--
-- Cria a tabela folha_tipos_grupos, que guarda, pra cada coluna
-- (tipo) da grade de Folha, quais unidades/empresas usam ela.
--
-- Por padrão, se uma coluna não tiver nenhuma linha nessa tabela,
-- ela continua valendo pra TODAS as unidades — nada muda sozinho
-- pras colunas que já existem hoje (Comissão, Adiantamento,
-- Quebra de Caixa etc. continuam aparecendo pra todo mundo).
--
-- Quando você quiser que uma coluna valha só pra algumas unidades
-- (ex.: um provento que só a unidade Savassi paga), marca na tela
-- de cadastro quais unidades usam ela. A partir daí, só essas
-- unidades veem a coluna na hora de lançar e no Relatório de
-- Conferência; o resto nem vê ela.
-- ============================================================

create table if not exists folha_tipos_grupos (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references folha_tipos(id) on delete cascade,
  grupo text not null, -- nome da unidade/empresa (ou "ESTÁGIO")
  unique (tipo_id, grupo)
);

create index if not exists idx_folha_tipos_grupos_tipo
  on folha_tipos_grupos(tipo_id);

alter table folha_tipos_grupos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'folha_tipos_grupos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on folha_tipos_grupos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
