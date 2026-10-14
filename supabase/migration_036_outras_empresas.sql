-- Colaborador que recebe em mais de uma empresa do grupo.
-- Ele continua cadastrado em UMA empresa (a principal) e conta uma vez no total.
-- Aqui ficam as outras empresas que também pagam a ele e quanto cada uma paga
-- por mês — esse valor entra no custo da folha de cada empresa no Dashboard.
-- Pode rodar mais de uma vez sem problema.

create table if not exists colaborador_outras_empresas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  valor_mensal numeric(12,2) not null default 0,
  criado_em timestamptz not null default now(),
  unique (colaborador_id, empresa_id)
);

create index if not exists colaborador_outras_empresas_colaborador_idx
  on colaborador_outras_empresas(colaborador_id);
create index if not exists colaborador_outras_empresas_empresa_idx
  on colaborador_outras_empresas(empresa_id);

alter table colaborador_outras_empresas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'colaborador_outras_empresas' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on colaborador_outras_empresas
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
