-- ============================================================
-- MIGRATION 028 — Currículo anexado ao candidato (Entrevistas)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Rode DEPOIS da migration_027_entrevistas.sql.
-- ============================================================
--
-- Cria a pasta privada "curriculos" (Storage) e guarda, em cada
-- candidato, o caminho e o nome original do arquivo.

alter table sel_candidatos add column if not exists curriculo_path text;
alter table sel_candidatos add column if not exists curriculo_nome text;

insert into storage.buckets (id, name, public)
values ('curriculos', 'curriculos', false)
on conflict (id) do nothing;

-- Só quem está logado no app pode ver, enviar, trocar e apagar arquivos dessa pasta.
drop policy if exists "curriculos_leitura" on storage.objects;
drop policy if exists "curriculos_envio" on storage.objects;
drop policy if exists "curriculos_troca" on storage.objects;
drop policy if exists "curriculos_exclusao" on storage.objects;

create policy "curriculos_leitura" on storage.objects
  for select using (bucket_id = 'curriculos' and auth.role() = 'authenticated');
create policy "curriculos_envio" on storage.objects
  for insert with check (bucket_id = 'curriculos' and auth.role() = 'authenticated');
create policy "curriculos_troca" on storage.objects
  for update using (bucket_id = 'curriculos' and auth.role() = 'authenticated');
create policy "curriculos_exclusao" on storage.objects
  for delete using (bucket_id = 'curriculos' and auth.role() = 'authenticated');
