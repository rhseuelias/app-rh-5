-- Migration 014: assinatura digital do contrato PJ (link para o profissional
-- assinar pelo celular/computador, sem precisar de conta nem app instalado)
--
-- O que essa migração faz — adiciona 3 colunas na tabela "colaboradores":
-- 1) assinatura_pj_link_token: o "código secreto" do link de assinatura
--    (ex.: appliqrh.com/assinar-contrato/<esse-código>). Só quem tem o link
--    consegue abrir a página — funciona parecido com o link de pré-cadastro
--    que já existe pros candidatos.
-- 2) assinatura_pj_link_criado_em: quando esse link foi gerado (pra você
--    saber, por exemplo, "mandei esse link há 3 dias e ainda não assinou").
-- 3) assinatura_pj_assinado_em: preenchido automaticamente na hora que o
--    profissional desenha a assinatura dele e confirma — fica registrado
--    a data e hora exatas.

alter table colaboradores add column if not exists assinatura_pj_link_token uuid unique;
alter table colaboradores add column if not exists assinatura_pj_link_criado_em timestamptz;
alter table colaboradores add column if not exists assinatura_pj_assinado_em timestamptz;

create index if not exists idx_colaboradores_assinatura_pj_link_token
  on colaboradores(assinatura_pj_link_token);
