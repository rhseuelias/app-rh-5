-- migration_026: coluna "Multi" no Vale Transporte (categoria CAJU).
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
alter table vt_lancamentos add column if not exists multi numeric(12,2) not null default 0;
