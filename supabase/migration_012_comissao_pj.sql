-- Migration 012: comissão do colaborador PJ (corte e química) + ajuste no
-- cadastro (Horário de trabalho e Benefícios não aparecem mais pra PJ)
--
-- O que essa migração faz:
-- 1) Adiciona duas colunas na tabela "colaboradores":
--    - comissao_corte_pct: percentual de comissão em serviços de corte
--      (só pode ser 33, 35, 38, 40 ou 50)
--    - comissao_quimica_pct: percentual de comissão em serviço de química
--      (só pode ser 33 ou 35)
--    Essas colunas só fazem sentido pra colaboradores do tipo PJ, mas
--    ficam na mesma tabela dos outros — igual já acontece com
--    valor_nota_fiscal, contrato_inicio etc.

alter table colaboradores add column if not exists comissao_corte_pct numeric(5,2);
alter table colaboradores add column if not exists comissao_quimica_pct numeric(5,2);

alter table colaboradores drop constraint if exists colaboradores_comissao_corte_pct_check;
alter table colaboradores add constraint colaboradores_comissao_corte_pct_check
  check (comissao_corte_pct in (33, 35, 38, 40, 50));

alter table colaboradores drop constraint if exists colaboradores_comissao_quimica_pct_check;
alter table colaboradores add constraint colaboradores_comissao_quimica_pct_check
  check (comissao_quimica_pct in (33, 35));
