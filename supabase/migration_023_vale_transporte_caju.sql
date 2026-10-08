-- ============================================================
-- MIGRATION 023 — Vale Transporte: Alimentação e Prêmio no CAJU
--                 + cópia automática do mês anterior
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- (Precisa já ter rodado a migration_022_vale_transporte.sql)
-- ============================================================

alter table vt_lancamentos add column if not exists alimentacao numeric(12,2) not null default 0;
alter table vt_lancamentos add column if not exists premio numeric(12,2) not null default 0;

-- Marca os meses que já receberam a cópia automática do mês anterior
-- (assim um cartão que você excluir não volta sozinho).
create table if not exists vt_competencias (
  competencia text primary key,            -- 'AAAA-MM'
  copiado_em timestamptz not null default now()
);

alter table vt_competencias enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'vt_competencias' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on vt_competencias
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
