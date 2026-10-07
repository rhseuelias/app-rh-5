-- Link público (só leitura) do Painel de Integração, para enviar ao supervisor.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.

create table if not exists public.links_painel_integracao (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

-- Trava total para o navegador: só o servidor do app (chave de serviço) mexe nesta tabela.
alter table public.links_painel_integracao enable row level security;
