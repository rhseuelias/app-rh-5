-- ============================================================
-- MIGRATION 006 — CALENDÁRIO GERAL (agendamento completo)
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado schema.sql e as migrations anteriores.
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- cor escolhida na paleta ao criar o evento (se vazio, usa a cor padrão
-- da categoria, como já era antes)
alter table eventos_calendario add column if not exists cor text;

-- repetição do evento
alter table eventos_calendario add column if not exists repete text not null default 'nenhuma'
  check (repete in ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual'));

-- agrupa as ocorrências geradas de um mesmo evento repetido (nulo = evento avulso)
alter table eventos_calendario add column if not exists serie_id uuid;

-- até 2 e-mails de alerta por evento
alter table eventos_calendario add column if not exists alerta_email_1 text;
alter table eventos_calendario add column if not exists alerta_email_2 text;

create index if not exists idx_eventos_serie on eventos_calendario(serie_id);

-- ------------------------------------------------------------
-- CONFIGURAÇÃO DE NOTIFICAÇÕES DO CALENDÁRIO (linha única, id 'default')
-- Relatório diário das obrigações por WhatsApp — o envio de verdade
-- depende de conectar um serviço de WhatsApp (ver README).
-- ------------------------------------------------------------
create table if not exists config_calendario (
  id text primary key default 'default',
  whatsapp_numero_1 text,
  whatsapp_numero_2 text,
  relatorio_diario_ativo boolean not null default false,
  updated_at timestamptz default now()
);
insert into config_calendario (id) values ('default') on conflict (id) do nothing;

alter table config_calendario enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['config_calendario'])
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'authenticated_full_access'
    ) then
      execute format(
        'create policy "authenticated_full_access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
        t
      );
    end if;
  end loop;
end $$;
