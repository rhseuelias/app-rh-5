-- Adiantamentos salvos por mês.
-- Cada vez que o relatório do mês é gerado, a lista fica guardada aqui (nome, cargo, empresa, unidade, %, valor),
-- e o mês anterior continua igual mesmo que o cadastro mude depois.
-- Pode rodar mais de uma vez sem problema.

create table if not exists adiantamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  competencia text not null,
  colaborador_id uuid references colaboradores(id) on delete set null,
  nome text not null,
  cargo text,
  matricula text,
  empresa text not null,
  unidade text not null,
  pct numeric,
  valor numeric,
  gerado_em timestamptz not null default now()
);

create index if not exists adiantamentos_mensais_competencia_idx on adiantamentos_mensais (competencia);

alter table adiantamentos_mensais enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'adiantamentos_mensais' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on adiantamentos_mensais
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
