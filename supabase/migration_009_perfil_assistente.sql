-- Migration 009: novo papel "assistente" (login com acesso restrito)
--
-- O que essa migração faz:
-- 1) Permite que a tabela "perfis" aceite o papel 'assistente', além dos
--    que já existiam ('rh', 'gestor', 'admin').
-- 2) Cria (ou atualiza) o registro de perfil da Francielle, vinculando ao
--    usuário de autenticação dela pelo e-mail — assim você não precisa
--    copiar nenhum ID manualmente.
--
-- IMPORTANTE: rode esta migração SOMENTE DEPOIS de criar o usuário
-- "rh.gruposeuelias@gmail.com" em Authentication → Users no Supabase
-- (veja o passo a passo enviado no chat). Se você rodar antes de criar o
-- usuário, o passo 2 não vai encontrar ninguém com esse e-mail e não vai
-- inserir nada — não tem problema, é só rodar a migração de novo depois.

-- 1) Atualiza a restrição de "papel" pra aceitar 'assistente'
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check
  check (papel in ('rh', 'gestor', 'admin', 'assistente'));

-- 2) Cria o perfil da Francielle como 'assistente', achando o ID dela
--    pelo e-mail cadastrado no Authentication
insert into perfis (id, nome, papel)
select id, 'Francielle', 'assistente'
from auth.users
where email = 'rh.gruposeuelias@gmail.com'
on conflict (id) do update set papel = 'assistente', nome = 'Francielle';
