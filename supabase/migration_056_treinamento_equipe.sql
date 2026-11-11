-- Treinamento da equipe por quadrimestre (quadro de medidores do Dashboard).
-- Os valores são lançados à mão: Barbeiros, Atendimento, Limpeza e Liderança.
-- quadrimestre: 1 = jan a abr, 2 = mai a ago, 3 = set a dez.
-- Pode rodar mais de uma vez sem problema.

create table if not exists treinamento_equipe (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  quadrimestre integer not null check (quadrimestre between 1 and 3),
  equipe text not null check (equipe in ('barbeiros', 'atendimento', 'limpeza', 'lideranca')),
  pct numeric(5,1) not null check (pct >= 0 and pct <= 100),
  participaram integer,
  total integer,
  atualizado_em timestamptz not null default now(),
  unique (ano, quadrimestre, equipe)
);

alter table treinamento_equipe enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'treinamento_equipe' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on treinamento_equipe
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
