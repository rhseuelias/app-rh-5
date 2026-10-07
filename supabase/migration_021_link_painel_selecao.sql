-- Permite escolher quais colaboradores aparecem no link do supervisor.
-- Vazio (null) = mostra todos. Rode uma vez no Supabase (SQL Editor > Run).
alter table public.links_painel_integracao
  add column if not exists colaboradores_ids text[];
