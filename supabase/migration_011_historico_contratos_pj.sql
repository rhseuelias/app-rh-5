-- Migration 011: histórico de contratos PJ + renovação
--
-- O que essa migração faz:
-- 1) Cria a tabela "historico_contratos_pj", que guarda cada período de
--    contrato PJ que um colaborador já teve. Toda vez que você usar o
--    botão "Renovar contrato" na tela do colaborador, o período atual
--    (início, fim e valor da nota fiscal) é salvo aqui automaticamente
--    antes de ser substituído pelo novo período — assim nenhum contrato
--    anterior se perde, fica tudo registrado ano a ano.
-- 2) Libera o acesso a essa tabela pros usuários autenticados do RH,
--    do mesmo jeito que já funciona nas outras tabelas do sistema.

create table if not exists historico_contratos_pj (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  contrato_inicio date,
  contrato_fim date,
  valor_nota_fiscal numeric(12,2),
  criado_em timestamptz not null default now()
);

create index if not exists historico_contratos_pj_colaborador_id_idx
  on historico_contratos_pj(colaborador_id);

alter table historico_contratos_pj enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['historico_contratos_pj'])
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
