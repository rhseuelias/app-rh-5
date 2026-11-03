-- Relatório de adiantamentos agora também mostra quem recebe vale transporte (e o desconto de VT).
-- Guarda isso nos meses salvos. Pode rodar mais de uma vez sem problema.
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.

alter table adiantamentos_mensais add column if not exists tem_adiantamento boolean not null default true;
alter table adiantamentos_mensais add column if not exists recebe_vt boolean not null default false;
alter table adiantamentos_mensais add column if not exists desconto_vt numeric;
