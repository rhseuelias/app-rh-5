-- ============================================================
-- MIGRATION 032 — Cadastro de dados das empresas e unidades
-- Guarda razão social, CEP e endereço de cada empresa e de cada
-- unidade, para servir de fonte aos documentos (Aviso Prévio etc.).
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

alter table empresas
  add column if not exists razao_social text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text;

alter table unidades
  add column if not exists razao_social text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text;

-- ------------------------------------------------------------
-- Preenche de uma vez os endereços que o app já conhecia
-- (só onde o endereço ainda está vazio, então não sobrescreve nada).
-- ------------------------------------------------------------
update empresas set
  razao_social = 'BARBERDAY - CENTRO DE TREINAMENTO PARA BARBEIROS LTDA',
  endereco = 'Alameda Rio Negro',
  numero = '500',
  complemento = 'Andar 6, Bloco 2, Cond West Towers, Sala 601 a 608',
  bairro = 'Alphaville',
  cidade = 'Barueri',
  uf = 'SP'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '55581259000165'
  and endereco is null;

update unidades set
  razao_social = 'BARBERDAY - CENTRO DE TREINAMENTO PARA BARBEIROS LTDA',
  endereco = 'Alameda Rio Negro',
  numero = '500',
  complemento = 'Andar 6, Bloco 2, Cond West Towers, Sala 601 a 608',
  bairro = 'Alphaville',
  cidade = 'Barueri',
  uf = 'SP'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '55581259000165'
  and endereco is null;

update empresas set
  razao_social = 'SEU ELIAS BARBA, CABELO E BIGODE SP LTDA ME',
  endereco = 'Alameda Araguaia',
  numero = '750',
  complemento = 'LOJA 10 COND EDIFICIO ARAGUAIA',
  bairro = 'ALPHAVILLE INDUSTRIAL',
  cidade = 'Barueri',
  uf = 'SP'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '60274535000182'
  and endereco is null;

update unidades set
  razao_social = 'SEU ELIAS BARBA, CABELO E BIGODE SP LTDA ME',
  endereco = 'Alameda Araguaia',
  numero = '750',
  complemento = 'LOJA 10 COND EDIFICIO ARAGUAIA',
  bairro = 'ALPHAVILLE INDUSTRIAL',
  cidade = 'Barueri',
  uf = 'SP'
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = '60274535000182'
  and endereco is null;
