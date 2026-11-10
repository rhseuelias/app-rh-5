-- ============================================================
-- MIGRATION 055 — Vale Transporte: desconto de cargas não realizadas
-- e taxa administrativa (BHBUS, ÓTIMO e SEMPARAR), por empresa e mês.
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- ============================================================

create table if not exists vt_ajustes_operadora (
  competencia text not null,                 -- 'AAAA-MM'
  empresa text not null,                     -- 'BSE MG', 'BSE SP', 'BABOON', 'BDU'
  operadora text not null,                   -- 'BHBUS', 'OTIMO', 'SEMPARAR'
  desconto numeric(12,2) not null default 0, -- desconto de cargas não realizadas (R$)
  taxa numeric(12,2) not null default 0,     -- taxa administrativa (R$)
  updated_at timestamptz not null default now(),
  primary key (competencia, empresa, operadora)
);

alter table vt_ajustes_operadora enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'vt_ajustes_operadora' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on vt_ajustes_operadora
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
