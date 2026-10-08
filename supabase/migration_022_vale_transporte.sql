-- ============================================================
-- MIGRATION 022 — Vale Transporte (Departamento Pessoal)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- ============================================================
--
-- Um registro = 1 cartão de 1 colaborador em 1 mês.
--   operadora : BHBUS, SEMPARAR, OTIMO ou CAJU
--   diaria    : passagens por dia (ida e volta)
--   valor_unit: valor de cada passagem
--   dias_uteis: dias de trabalho do mês
--   saldo     : saldo que ainda está no cartão
-- O app calcula: Total = diária × valor × dias úteis
--                Carga = Total − Saldo (nunca menor que zero)

create table if not exists vt_lancamentos (
  id uuid primary key default gen_random_uuid(),
  competencia text not null,                       -- 'AAAA-MM', ex.: '2026-10'
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  operadora text not null check (operadora in ('BHBUS', 'SEMPARAR', 'OTIMO', 'CAJU')),
  cartao text,
  diaria numeric(6,2) not null default 0,
  valor_unit numeric(8,2) not null default 0,
  dias_uteis integer not null default 0,
  saldo numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vt_lancamentos_competencia on vt_lancamentos(competencia);
create index if not exists idx_vt_lancamentos_colaborador on vt_lancamentos(colaborador_id);

alter table vt_lancamentos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'vt_lancamentos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on vt_lancamentos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
