-- ============================================================
-- MIGRATION 054 — Novo colaborador PJ na BDU
-- ANTONIO HENRIQUE LEÃO XAVIER — admissão 22/10/2026
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem duplicar (confere pelo CNPJ).
-- ============================================================

insert into colaboradores (
  empresa_id, unidade_id, tipo, nome, cpf_cnpj, email,
  data_nascimento, data_admissao, contrato_inicio, status, rg, sexo, observacoes
)
select
  e.id,
  (select u.id from unidades u where u.empresa_id = e.id and u.nome ilike 'BDU' limit 1),
  'PJ',
  'ANTONIO HENRIQUE LEÃO XAVIER',
  '66.280.597/0001-83',
  'antoniohlxavier@gmail.com',
  date '1987-11-25',
  date '2026-10-22',
  date '2026-10-22',
  'ativo',
  '40.486.130-1',
  'Masculino',
  'CPF 350.165.868-02. Naturalidade: Osasco-SP.'
from empresas e
where e.nome ilike '%BDU%'
  and not exists (select 1 from colaboradores c where c.cpf_cnpj = '66.280.597/0001-83')
limit 1;

-- conferência: deve mostrar 1 linha com empresa e unidade BDU
select c.nome, c.tipo, c.status, c.cpf_cnpj, c.data_admissao, e.nome as empresa, u.nome as unidade
from colaboradores c
left join empresas e on e.id = c.empresa_id
left join unidades u on u.id = c.unidade_id
where c.cpf_cnpj = '66.280.597/0001-83';
