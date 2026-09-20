-- ============================================================
-- MIGRATION 002 — PRÉ-CADASTRO DE CANDIDATO
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado o supabase/schema.sql original.
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- ------------------------------------------------------------
-- CANDIDATOS (pré-cadastro antes de virar Colaborador)
-- ------------------------------------------------------------
create table if not exists candidatos (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  nome text,
  cargo_pretendido text,
  empresa_id uuid references empresas(id) on delete set null,
  status text not null default 'link_gerado'
    check (status in ('link_gerado', 'preenchido', 'convertido')),

  -- dados pessoais preenchidos pelo próprio candidato
  cpf text,
  rg text,
  estado_civil text,
  data_nascimento date,
  telefone text,
  email text,
  endereco text,
  nome_contato_emergencia text,
  telefone_contato_emergencia text,

  -- dados bancários (para futura folha)
  banco text,
  agencia text,
  conta text,
  pix text,

  observacoes text,

  enviado_em timestamptz,
  preenchido_em timestamptz,
  convertido_colaborador_id uuid references colaboradores(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_candidatos_token on candidatos(token);
create index if not exists idx_candidatos_status on candidatos(status);

-- ------------------------------------------------------------
-- DOCUMENTOS anexados pelo candidato no pré-cadastro
-- ------------------------------------------------------------
create table if not exists documentos_candidato (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references candidatos(id) on delete cascade,
  nome_arquivo text not null,
  tipo text, -- rg, ctps, comprovante_residencia, foto_3x4, outro
  storage_path text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Só o RH autenticado lê/edita essas tabelas pelo app normal.
-- O formulário público (candidato, sem login) é atendido por
-- server actions que usam a service role key (bypassa RLS) e
-- validam o acesso pelo token secreto do link — nenhuma policy
-- de acesso anônimo é necessária aqui.
-- ------------------------------------------------------------
alter table candidatos enable row level security;
alter table documentos_candidato enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'candidatos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on candidatos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'documentos_candidato' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on documentos_candidato
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- ============================================================
-- STORAGE — bucket privado para os documentos anexados
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rh_le_documentos'
  ) then
    create policy "rh_le_documentos" on storage.objects
      for select using (bucket_id = 'documentos' and auth.role() = 'authenticated');
  end if;
end $$;

-- Observação: o upload feito pelo candidato (sem login) e a leitura
-- feita pelas telas de RH via link assinado usam a service role key
-- no servidor, que já ignora RLS — por isso não é preciso política
-- de insert/update aqui.
