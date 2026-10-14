-- Migration 031 — Roteiro de entrevista (1ª etapa RH e 2ª etapa Técnica) e link do supervisor
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.

-- Cenários práticos do cargo (usados no roteiro da entrevista técnica)
alter table cargos_desc add column if not exists cenarios jsonb not null default '[]'::jsonb;

update cargos_desc
set cenarios = $j$[{"titulo": "Cliente entrega o carro e você nota um arranhão na porta antes de manobrar.", "sinais": ["Avisa o cliente na hora, com educação", "Registra a avaria antes de movimentar o veículo", "Comunica a recepção ou a liderança", "Confere o veículo antes e depois, conforme o procedimento"]}, {"titulo": "Durante a manobra, você encosta de leve em outro veículo.", "sinais": ["Para e comunica imediatamente a liderança", "Não tenta esconder nem sair do local", "Registra a ocorrência", "Mantém a calma e acolhe o cliente"]}, {"titulo": "Cliente alterado reclama da demora para receber o carro.", "sinais": ["Ouve sem discutir", "Pede desculpas e informa o prazo", "Resolve ou encaminha para a recepção ou liderança", "Preserva a imagem da Barbearia Seu Elias"]}]$j$::jsonb
where cargo = 'Manobrista' and empresa = 'BSE' and cenarios = '[]'::jsonb;

-- Respostas do roteiro e link do supervisor
alter table sel_entrevistas add column if not exists roteiro jsonb not null default '{}'::jsonb;
alter table sel_entrevistas add column if not exists nota_media numeric;
alter table sel_entrevistas add column if not exists token text;
alter table sel_entrevistas add column if not exists token_expira timestamptz;
alter table sel_entrevistas add column if not exists respondida_em timestamptz;
alter table sel_entrevistas add column if not exists respondida_por text;

create unique index if not exists idx_sel_entrevistas_token on sel_entrevistas(token) where token is not null;
