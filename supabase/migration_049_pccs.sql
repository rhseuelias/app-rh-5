-- Migration 049 — PCCS (Plano de Cargos, Carreiras e Salários)
-- Categoria e faixa salarial por cargo (liga na Descrição de Cargos) + avaliações do ciclo de 12 meses.

create table if not exists pccs_cargos (
  id uuid primary key default gen_random_uuid(),
  cargo_desc_id uuid not null unique references cargos_desc(id) on delete cascade,
  categoria text not null default 'operacional' check (categoria in ('operacional', 'tatico', 'estrategico')),
  faixa_min numeric(12,2),
  faixa_max numeric(12,2),
  updated_at timestamptz not null default now()
);

create table if not exists pccs_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  cargo_desc_id uuid references cargos_desc(id) on delete set null,
  momento text not null check (momento in ('mes6', 'mes12')),
  ciclo_inicio date not null,
  formacao int not null default 0 check (formacao between 0 and 5), -- 0 fund., 1 médio, 2 técnico, 3 graduação, 4 pós, 5 MBA
  tecnicas jsonb not null default '{}'::jsonb,        -- { "competência": nota 1-5 }
  comportamentais jsonb not null default '{}'::jsonb, -- { "competência": nota 1-5 }
  indicadores jsonb not null default '[]'::jsonb,     -- [{nome, alvo, tipo, valor}]
  preparacao int not null default 3 check (preparacao between 1 and 5),
  evidencias text,
  pdi_ok boolean not null default false,
  rh_ok boolean not null default false,
  alcada_ok boolean not null default false,
  vaga_ok boolean not null default false,
  nota_final numeric(5,1),
  decisao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pccs_aval_colab on pccs_avaliacoes(colaborador_id, created_at desc);

alter table pccs_cargos enable row level security;
alter table pccs_avaliacoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pccs_cargos' and policyname = 'authenticated_full_access') then
    create policy "authenticated_full_access" on pccs_cargos for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pccs_avaliacoes' and policyname = 'authenticated_full_access') then
    create policy "authenticated_full_access" on pccs_avaliacoes for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
