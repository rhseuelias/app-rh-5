-- ============================================================
-- MIGRATION 024 — Vale Transporte: dias úteis do mês salvos
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- ============================================================

create table if not exists vt_config_mes (
  competencia text primary key,            -- 'AAAA-MM'
  dias_uteis integer not null default 26,
  updated_at timestamptz not null default now()
);

alter table vt_config_mes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'vt_config_mes' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on vt_config_mes
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
