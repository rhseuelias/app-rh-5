-- Migration 010: novo tipo de colaborador "Estagiário(a)"
--
-- O que essa migração faz:
-- 1) Permite que a coluna "tipo" da tabela "colaboradores" aceite o valor
--    'Estagio', além de 'CLT' e 'PJ' que já existiam.
--
-- Depois de rodar essa migração, no cadastro de colaborador vai aparecer
-- a opção "Estagiário(a)" no campo Tipo, com uma seção própria de contrato
-- (início do estágio, término previsto, bolsa auxílio e auxílio transporte)
-- — sem precisar de nenhuma coluna nova na tabela, elas reaproveitam campos
-- que já existiam (valor_nota_fiscal e custo_vt).

alter table colaboradores drop constraint if exists colaboradores_tipo_check;
alter table colaboradores add constraint colaboradores_tipo_check
  check (tipo in ('CLT', 'PJ', 'Estagio'));
