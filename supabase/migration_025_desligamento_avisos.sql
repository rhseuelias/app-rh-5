-- ============================================================
-- MIGRATION 025 — Avisos de pagamento e homologação (desligamento)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- ============================================================

create table if not exists desligamentos (
  colaborador_id uuid primary key references colaboradores(id) on delete cascade,
  tipo_aviso text not null check (tipo_aviso in ('trabalhado', 'indenizado', 'acordo')),
  data_comunicacao date not null,          -- dia em que o aviso / a dispensa / o acordo foi assinado
  dias_aviso integer,                      -- só no aviso trabalhado (30 + 3 por ano de casa, até 90)
  ultimo_dia date not null,                -- último dia do contrato
  prazo_pagamento date not null,           -- último dia para pagar as verbas (10 dias corridos)
  pago_em date,                            -- preenchido ao marcar como pago
  homologacao_necessaria boolean not null default true,
  homologacao_data date,
  homologacao_hora text,
  homologacao_local text,
  homologacao_feita_em date,               -- preenchido ao registrar como realizada
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table desligamentos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'desligamentos' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on desligamentos
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
