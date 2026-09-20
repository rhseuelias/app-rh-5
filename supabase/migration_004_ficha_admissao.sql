-- ============================================================
-- MIGRATION 004 — Ficha de Admissão, Unidades/Filiais, Excluir e
-- Desligar colaborador com detalhes, Dependentes
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- Pré-requisito: já ter rodado schema.sql, migration_002 e migration_003.
-- ============================================================

-- ------------------------------------------------------------
-- UNIDADES / FILIAIS (dentro de uma Empresa)
-- ------------------------------------------------------------
create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  cnpj text,
  adiantamento_pct integer check (adiantamento_pct in (20, 30, 40)),
  created_at timestamptz default now()
);

create index if not exists idx_unidades_empresa on unidades(empresa_id);

-- ------------------------------------------------------------
-- DEPENDENTES do colaborador
-- ------------------------------------------------------------
create table if not exists dependentes_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete cascade,
  nome text not null,
  data_nascimento date,
  parentesco text,
  cpf text not null,
  dependente_ir boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_dependentes_colaborador on dependentes_colaborador(colaborador_id);

-- ------------------------------------------------------------
-- COLABORADORES — novos campos (Ficha de Admissão)
-- ------------------------------------------------------------
alter table colaboradores add column if not exists unidade_id uuid references unidades(id) on delete set null;

-- dados pessoais extras
alter table colaboradores add column if not exists rg text;
alter table colaboradores add column if not exists endereco text;
alter table colaboradores add column if not exists estado_civil text
  check (estado_civil is null or estado_civil in ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel'));
alter table colaboradores add column if not exists raca_cor text;
alter table colaboradores add column if not exists grau_instrucao text
  check (grau_instrucao is null or grau_instrucao in (
    'fundamental_incompleto', 'fundamental_completo',
    'medio_incompleto', 'medio_completo',
    'superior_incompleto', 'superior_completo',
    'pos_graduacao', 'mestrado', 'doutorado_pos_doutorado'
  ));

-- dados funcionais extras
alter table colaboradores add column if not exists contrato_experiencia text
  check (contrato_experiencia is null or contrato_experiencia in (
    '90_dias_45_45', '90_dias_15_75', '45_dias_45'
  ));
alter table colaboradores add column if not exists adiantamento_salario boolean default false;
alter table colaboradores add column if not exists primeiro_emprego boolean default false;
alter table colaboradores add column if not exists insalubridade boolean default false;
alter table colaboradores add column if not exists periculosidade boolean default false;
alter table colaboradores add column if not exists quebra_caixa boolean default false;
alter table colaboradores add column if not exists gratificacao_funcao boolean default false;

-- dados bancários
alter table colaboradores add column if not exists banco text;
alter table colaboradores add column if not exists agencia text;
alter table colaboradores add column if not exists conta text;
alter table colaboradores add column if not exists conta_digito text;

-- horário de trabalho semanal (jsonb — um objeto por dia da semana com os
-- horários de entrada/saída de manhã e tarde, ex.:
-- {"segunda": {"manha_entrada":"08:00","manha_saida":"12:00","tarde_entrada":"13:00","tarde_saida":"18:00"}, ...})
alter table colaboradores add column if not exists horario_trabalho jsonb;

-- benefícios
alter table colaboradores add column if not exists vale_transporte boolean default false;
alter table colaboradores add column if not exists vale_transporte_desconto boolean default false;
alter table colaboradores add column if not exists vale_alimentacao boolean default false;
alter table colaboradores add column if not exists vale_alimentacao_valor_desconto numeric(12,2);

-- desligamento
alter table colaboradores add column if not exists tipo_rescisao text;
alter table colaboradores add column if not exists motivo_desligamento text;

create index if not exists idx_colaboradores_unidade on colaboradores(unidade_id);

-- ============================================================
-- ROW LEVEL SECURITY — mesmas regras das demais tabelas
-- ============================================================
alter table unidades enable row level security;
alter table dependentes_colaborador enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['unidades', 'dependentes_colaborador'])
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
