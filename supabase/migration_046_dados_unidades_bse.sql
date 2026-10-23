-- ============================================================
-- MIGRATION 046 — Razão social, CNPJ e endereço das unidades da BSE
-- Preenche os dados cadastrais de cada unidade (Projeção de Custo >
-- Empresas / Unidades), que servem de fonte para os documentos
-- (Contrato Bolsa, Aviso Prévio etc.).
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- Campos que ficam em branco aqui (ex.: endereço de Confins, CEP de
-- Lagoa Santa) não apagam o que já estiver cadastrado.
-- ============================================================

update unidades u set
  razao_social = v.razao_social,
  cnpj         = v.cnpj,
  cep          = coalesce(v.cep, u.cep),
  endereco     = coalesce(v.endereco, u.endereco),
  numero       = coalesce(v.numero, u.numero),
  complemento  = coalesce(v.complemento, u.complemento),
  bairro       = coalesce(v.bairro, u.bairro),
  cidade       = coalesce(v.cidade, u.cidade),
  uf           = coalesce(v.uf, u.uf)
from (
  values
    ('SAVASSI', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0007-15', '30140-110', 'Rua Santa Rita Durão', '1143', null::text, 'Savassi/Funcionários', 'Belo Horizonte', 'MG'),
    ('BELVEDERE', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0006-34', '30320-570', 'Avenida Luiz Paulo Franco', '701', null, 'Belvedere', 'Belo Horizonte', 'MG'),
    ('OURO MINAS', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0004-72', '31160-413', 'Avenida Cristiano Machado', '4001', 'Saguão do Hotel Ouro Minas', 'Ipiranga', 'Belo Horizonte', 'MG'),
    ('PAMPULHA', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0001-20', '31310-450', 'Rua Zilah Corrêa de Araújo', '268', null, 'Ouro Preto', 'Belo Horizonte', 'MG'),
    ('CONFINS', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0008-04', null, null, null, null, null, null, null),
    ('LAGOA SANTA', 'SEU ELIAS BARBA, CABELO E BIGODE LTDA', '18.713.580/0005-53', null, 'Avenida Acadêmico Nilo Figueiredo', '2050', null, 'Joana Darc', 'Lagoa Santa', 'MG'),
    ('ALPHAVILLE', 'SEU ELIAS BARBA, CABELO E BIGODE SP LTDA', '60.274.535/0001-82', '06455-000', 'Alameda Araguaia', '750', 'Loja 10', 'Alphaville Industrial', 'Barueri', 'SP')
) as v(nome, razao_social, cnpj, cep, endereco, numero, complemento, bairro, cidade, uf)
where upper(trim(u.nome)) = v.nome
  and u.empresa_id in (select id from empresas where upper(nome) like 'BSE%');

-- Conferência: mostra as unidades da BSE com os dados salvos.
select u.nome, u.razao_social, u.cnpj, u.endereco, u.numero, u.bairro, u.cidade, u.uf, u.cep
from unidades u
where u.empresa_id in (select id from empresas where upper(nome) like 'BSE%')
order by u.nome;
