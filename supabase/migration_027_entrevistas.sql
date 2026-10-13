-- ============================================================
-- MIGRATION 027 — Entrevistas (Recrutamento e Seleção)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- ============================================================
--
-- 4 tabelas (todas começam com sel_ para não misturar com o cadastro
-- de candidatos do Processo de Integração):
--   sel_vagas        : uma linha por vaga (empresa BDU/BABOON/BSE e unidade da BSE)
--   sel_candidatos   : um candidato por vaga
--   sel_entrevistas  : cada etapa de entrevista de um candidato
--   sel_avaliacoes   : avaliação estruturada (notas 1 a 5) de um candidato

create table if not exists sel_vagas (
  id uuid primary key default gen_random_uuid(),
  cargo text not null,
  empresa text not null check (empresa in ('BDU', 'BABOON', 'BSE')),
  unidade text,                                   -- só para BSE (Savassi, Belvedere...)
  gestor text,
  status text not null default 'Aberta',
  data_abertura date not null default current_date,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists sel_candidatos (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references sel_vagas(id) on delete cascade,
  nome text not null,
  email text,
  telefone text,
  fonte text,
  etapa text not null default 'Inscrito',
  pretensao numeric(12,2),
  disponibilidade text,
  link_curriculo text,
  pontos_fortes text,
  pontos_atencao text,
  proxima_acao text,
  proxima_data date,
  responsavel text,
  consentimento boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sel_entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references sel_candidatos(id) on delete cascade,
  etapa text not null default 'Entrevista RH',
  data date not null,
  hora text not null default '10:00',
  tipo text not null default 'Vídeo',
  entrevistador text,
  status text not null default 'Agendada',
  link_local text,
  resumo text,
  aprofundar text,
  recomendacao text,
  proxima_acao text,
  proxima_data date,
  created_at timestamptz not null default now()
);

create table if not exists sel_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null unique references sel_candidatos(id) on delete cascade,
  notas jsonb not null default '{}'::jsonb,       -- {"exp":4,"tec":5,...}
  recomendacao text,
  evidencias text,
  risco text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_sel_candidatos_vaga on sel_candidatos(vaga_id);
create index if not exists idx_sel_entrevistas_candidato on sel_entrevistas(candidato_id);
create index if not exists idx_sel_entrevistas_data on sel_entrevistas(data);

do $$
declare t text;
begin
  foreach t in array array['sel_vagas', 'sel_candidatos', 'sel_entrevistas', 'sel_avaliacoes']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'authenticated_full_access') then
      execute format(
        'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
        t
      );
    end if;
  end loop;
end $$;
