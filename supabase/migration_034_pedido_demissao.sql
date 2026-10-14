-- Libera o "Pedido de demissão" (cumprindo ou sem cumprir o aviso) no desligamento.
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run. Pode rodar mais de uma vez.

alter table desligamentos drop constraint if exists desligamentos_tipo_aviso_check;

alter table desligamentos
  add constraint desligamentos_tipo_aviso_check
  check (tipo_aviso in ('trabalhado', 'indenizado', 'acordo', 'pedido_cumprindo', 'pedido_sem_cumprir'));
