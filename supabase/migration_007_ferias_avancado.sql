-- ============================================================
-- MIGRATION 007 — FÉRIAS AVANÇADO (planejamento, simulação, mapa)
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado schema.sql e as migrations anteriores (001 a 006).
-- (Project > SQL Editor > New query > colar > Run)
-- ============================================================

-- ------------------------------------------------------------
-- CENÁRIOS DE SIMULAÇÃO (RH testa datas diferentes sem afetar
-- o mapa real, até decidir "usar este cenário")
-- ------------------------------------------------------------
create table if not exists cenarios_simulacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Colunas novas em FERIAS:
--  - status ganha 'planejada' (sugestão automática ainda não confirmada
--    pelo RH — some do "solicitado" tradicional, que continua existindo
--    pra pedido manual do colaborador/líder)
--  - cenario_id: se preenchido, esse registro é só uma linha de um
--    cenário de simulação (não conta nos números reais)
--  - simulacao: atalho pra filtrar sem precisar checar cenario_id
--  - valor_estimado: valor calculado (salário/30 * dias + 1/3) guardado
--    no momento da criação, pra não recalcular toda vez
--  - origem: quem gerou esse registro (manual, planejamento automático
--    ou simulação) — só informativo, pra mostrar na tela
-- ------------------------------------------------------------
alter table ferias add column if not exists cenario_id uuid references cenarios_simulacao(id) on delete cascade;
alter table ferias add column if not exists simulacao boolean not null default false;
alter table ferias add column if not exists valor_estimado numeric(12,2);
alter table ferias add column if not exists origem text not null default 'manual'
  check (origem in ('manual', 'planejamento_auto', 'simulacao'));

alter table ferias drop constraint if exists ferias_status_check;
alter table ferias add constraint ferias_status_check
  check (status in ('planejada', 'solicitado', 'aprovado', 'concluido', 'cancelado'));

create index if not exists idx_ferias_cenario on ferias(cenario_id);
create index if not exists idx_ferias_colaborador on ferias(colaborador_id);

-- ------------------------------------------------------------
-- FERIADOS — base nacional fixa + móveis (Carnaval, Sexta-feira Santa,
-- Corpus Christi), pré-calculados para 2026, 2027 e 2028. Usado pelo
-- motor de sugestão de férias pra não cair em cima de feriado.
-- Você pode completar com feriados estaduais/municipais da sua região
-- inserindo linhas na mesma tabela (abrangencia = 'estadual' ou
-- 'municipal', preenchendo uf/municipio).
-- ------------------------------------------------------------
create unique index if not exists idx_feriados_unico on feriados(data, nome);

insert into feriados (data, nome, abrangencia) values
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-02-17', 'Carnaval', 'facultativo'),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia do Trabalho', 'nacional'),
  ('2026-06-04', 'Corpus Christi', 'facultativo'),
  ('2026-09-07', 'Independência do Brasil', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-11-20', 'Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional'),

  ('2027-01-01', 'Confraternização Universal', 'nacional'),
  ('2027-02-09', 'Carnaval', 'facultativo'),
  ('2027-03-26', 'Sexta-feira Santa', 'nacional'),
  ('2027-04-21', 'Tiradentes', 'nacional'),
  ('2027-05-01', 'Dia do Trabalho', 'nacional'),
  ('2027-05-27', 'Corpus Christi', 'facultativo'),
  ('2027-09-07', 'Independência do Brasil', 'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2027-11-02', 'Finados', 'nacional'),
  ('2027-11-15', 'Proclamação da República', 'nacional'),
  ('2027-11-20', 'Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal', 'nacional'),

  ('2028-01-01', 'Confraternização Universal', 'nacional'),
  ('2028-02-29', 'Carnaval', 'facultativo'),
  ('2028-04-14', 'Sexta-feira Santa', 'nacional'),
  ('2028-04-21', 'Tiradentes', 'nacional'),
  ('2028-05-01', 'Dia do Trabalho', 'nacional'),
  ('2028-06-15', 'Corpus Christi', 'facultativo'),
  ('2028-09-07', 'Independência do Brasil', 'nacional'),
  ('2028-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2028-11-02', 'Finados', 'nacional'),
  ('2028-11-15', 'Proclamação da República', 'nacional'),
  ('2028-11-20', 'Consciência Negra', 'nacional'),
  ('2028-12-25', 'Natal', 'nacional')
on conflict (data, nome) do nothing;

alter table cenarios_simulacao enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['cenarios_simulacao'])
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
