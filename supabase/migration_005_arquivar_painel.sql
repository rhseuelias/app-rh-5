-- ============================================================
-- MIGRATION 005 — SAÍDA AUTOMÁTICA DO PAINEL (Efetivado / Não efetivado)
-- Rode este arquivo no SQL Editor do Supabase DEPOIS de já ter
-- rodado as migrations 001 a 004.
-- (Project > SQL Editor > New query > colar > Run)
--
-- O que faz:
--   - Guarda a data em que o colaborador virou "Efetivado(a)" ou
--     "Não efetivado(a)", pra poder contar os dias até sair do painel.
--   - Adiciona a possibilidade de "retirar do painel" manualmente
--     (arquivado = true) sem apagar nenhum registro — os dados e o
--     histórico completo continuam no banco, só não aparecem mais no
--     Kanban do Painel de Integração.
-- ============================================================

-- Prazo (em dias) configurável: depois de quantos dias um colaborador
-- Efetivado(a) ou Não efetivado(a) some automaticamente do painel.
alter table config_integracao add column if not exists prazo_saida_painel_dias integer not null default 7;

alter table processos_integracao add column if not exists status_geral_definido_em timestamptz;
alter table processos_integracao add column if not exists arquivado boolean not null default false;
alter table processos_integracao add column if not exists arquivado_em timestamptz;
alter table processos_integracao add column if not exists arquivado_por text;

-- Backfill: processos que já estão Efetivado(a)/Não efetivado(a) e ainda não
-- têm a data marcada ganham a data de agora como referência (evita que todo
-- mundo que já estava efetivado suma de uma vez só quando a migration roda).
update processos_integracao
set status_geral_definido_em = coalesce(status_geral_definido_em, updated_at, created_at, now())
where status_geral in ('efetivado', 'nao_efetivado')
  and status_geral_definido_em is null;
