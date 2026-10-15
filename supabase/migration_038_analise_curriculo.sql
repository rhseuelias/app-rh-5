-- ============================================================
-- MIGRATION 038 — Guarda a análise do currículo (Entrevistas)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

alter table sel_candidatos add column if not exists analise_curriculo text;
alter table sel_candidatos add column if not exists analise_em timestamptz;
