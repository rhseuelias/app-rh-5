-- Migration 013: assinaturas do contrato PJ (Instrumento de Parceria)
--
-- O que essa migração faz:
-- 1) Cria a tabela "config_assinaturas_pj" — uma linha única, cadastrada em
--    Configurações > Contrato PJ, com as 3 assinaturas que são SEMPRE as
--    mesmas em todo contrato: Salão Parceiro, Testemunha 1 (Monallysa) e
--    Testemunha 2 (Ramon). Cadastra uma vez e elas entram automaticamente
--    em todo contrato que for emitido daqui pra frente.
-- 2) Adiciona a coluna "assinatura_pj_path" na tabela "colaboradores" — essa
--    sim muda de colaborador pra colaborador, é a assinatura do próprio
--    profissional PJ.
-- 3) Libera o bucket de Storage "documentos" (já usado por outras partes do
--    app) pra receber uploads feitos por usuário autenticado — antes só
--    existia permissão de leitura, então o upload dependia de já ter sido
--    liberado por fora. Isso corrige de vez o upload de assinaturas (e
--    também deixa mais robusto o upload de anexos de etapa do onboarding).

create table if not exists config_assinaturas_pj (
  id uuid primary key default gen_random_uuid(),
  assinatura_salao_path text,
  assinatura_testemunha1_path text,
  assinatura_testemunha2_path text,
  updated_at timestamptz not null default now()
);

alter table colaboradores add column if not exists assinatura_pj_path text;

alter table config_assinaturas_pj enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'config_assinaturas_pj'
      and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on config_assinaturas_pj
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Storage: permite que qualquer usuário autenticado (as 3 pessoas do RH)
-- suba e substitua arquivos no bucket "documentos" (já existia só leitura).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rh_envia_documentos'
  ) then
    create policy "rh_envia_documentos" on storage.objects
      for insert with check (bucket_id = 'documentos' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rh_atualiza_documentos'
  ) then
    create policy "rh_atualiza_documentos" on storage.objects
      for update using (bucket_id = 'documentos' and auth.role() = 'authenticated')
      with check (bucket_id = 'documentos' and auth.role() = 'authenticated');
  end if;
end $$;
