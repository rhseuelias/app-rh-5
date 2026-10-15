-- Histórico de colaboradores por ano (gráfico "Crescimento de colaboradores por ano" do Dashboard).
-- Serve para corrigir os anos anteriores quando o cadastro não tem todo o histórico.
-- "escopo" = 'todas' (grupo inteiro) ou o id de uma empresa.
-- Pode rodar mais de uma vez sem problema.

create table if not exists historico_colaboradores (
  id uuid primary key default gen_random_uuid(),
  escopo text not null,
  ano integer not null,
  clt integer not null default 0,
  pj integer not null default 0,
  estagio integer not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (escopo, ano)
);

alter table historico_colaboradores enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'historico_colaboradores' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on historico_colaboradores
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
