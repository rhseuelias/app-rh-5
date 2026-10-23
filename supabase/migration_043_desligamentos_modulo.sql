-- ============================================================
-- MIGRATION 043 — Módulo Desligamentos (dashboard, registro, histórico, análise)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez. NÃO mexe na tabela "desligamentos" (avisos/homologação).
-- Não apaga nenhum colaborador nem histórico.
-- ============================================================

create table if not exists desligamentos_registro (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete restrict,

  -- cópia dos dados do colaborador no dia do desligamento (relatórios históricos não mudam)
  nome text not null,
  matricula text,
  vinculo text,
  empresa text,
  unidade text,
  departamento text,
  cargo text,
  gestor text,
  data_admissao date,
  status_anterior text,            -- status do colaborador antes do desligamento (para o cancelamento)

  -- desligamento
  data_desligamento date not null,
  data_comunicacao date,
  ultimo_dia_trabalhado date,
  iniciativa text not null check (iniciativa in ('colaborador', 'empresa', 'acordo', 'outro')),
  tipo_rescisao text not null,
  motivo_principal text not null,
  aviso_previo text check (aviso_previo in ('trabalhado', 'indenizado', 'dispensado', 'nao_se_aplica')),
  entrevista text check (entrevista in ('realizada', 'nao_realizada', 'nao_se_aplica')),
  recontratavel text check (recontratavel in ('sim', 'nao', 'avaliar')),
  custo_rescisorio numeric(12,2),

  -- campos restritos (só RH/admin enxergam)
  motivo_complementar text,
  observacoes_restritas text,

  -- situação do registro
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  cancelado_em timestamptz,
  cancelado_por text,
  cancelado_justificativa text,

  registrado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- um colaborador só pode ter UM desligamento ativo (sem duplicidade)
create unique index if not exists desligamentos_registro_um_ativo
  on desligamentos_registro (colaborador_id) where status = 'ativo';
create index if not exists desligamentos_registro_data_idx on desligamentos_registro (data_desligamento);

-- trilha de auditoria
create table if not exists desligamentos_auditoria (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references desligamentos_registro(id) on delete cascade,
  acao text not null,              -- criado, corrigido, cancelado
  usuario text,
  justificativa text,
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
create index if not exists desligamentos_auditoria_registro_idx on desligamentos_auditoria (registro_id);

-- limites dos alertas da Análise estratégica (uma linha só)
create table if not exists desligamentos_config (
  id integer primary key default 1 check (id = 1),
  limite_90_dias numeric(5,2) not null default 20,        -- % de saídas com até 90 dias de casa
  limite_quadro_unidade numeric(5,2) not null default 12, -- % do quadro que saiu em uma empresa/unidade
  meta_entrevistas numeric(5,2) not null default 70,      -- % mínimo de entrevistas realizadas
  minimo_quadro integer not null default 10,              -- abaixo disso, não gera alerta de % (amostra pequena)
  updated_at timestamptz not null default now()
);
insert into desligamentos_config (id) values (1) on conflict (id) do nothing;

alter table desligamentos_registro enable row level security;
alter table desligamentos_auditoria enable row level security;
alter table desligamentos_config enable row level security;

do $$
declare t text;
begin
  foreach t in array array['desligamentos_registro', 'desligamentos_auditoria', 'desligamentos_config'] loop
    if not exists (
      select 1 from pg_policies where tablename = t and policyname = 'authenticated_full_access'
    ) then
      execute format(
        'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
        t
      );
    end if;
  end loop;
end $$;
