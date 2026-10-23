-- ============================================================
-- MIGRATION 044 — Importar desligamentos da BABOON (planilha Rescisões - 705 BABOON)
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez: não duplica registros já importados.
-- Não altera nenhum colaborador: só grava o histórico de desligamentos.
-- ============================================================

-- registros importados podem não ter colaborador cadastrado nem motivo informado
alter table desligamentos_registro alter column colaborador_id drop not null;
alter table desligamentos_registro alter column motivo_principal set default 'Não informado';

insert into desligamentos_registro
  (colaborador_id, nome, empresa, cargo, data_desligamento, tipo_rescisao, iniciativa, motivo_principal, registrado_por)
select
  (select c.id from colaboradores c where upper(c.nome) = upper(v.nome) limit 1),
  v.nome, 'BABOON', v.cargo, v.data, v.tipo, v.iniciativa, 'Não informado',
  'Importado da planilha Rescisões - 705 BABOON'
from (values
  ('Brenda Frida Santos Silva', 'Auxiliar Financeiro', 'Dispensa sem justa causa - Optante', date '2024-05-29', 'empresa'),
  ('Lucas Mateus e Silva', 'Assistente de Compras', 'Transferência para empresa do mesmo grupo econômico', date '2024-07-01', 'outro'),
  ('Marlon Douglas da Silva', 'Estoquista', 'Dispensa sem justa causa - Optante', date '2025-01-21', 'empresa'),
  ('Daniel Alves Ferreira', 'Estoquista', 'Término antecipado de contrato (Empregado)', date '2025-04-30', 'colaborador'),
  ('Lucas Filipe Oliveira Reis', 'Auxiliar de Compras I', 'Término antecipado de contrato (Empregado)', date '2025-04-30', 'colaborador'),
  ('Marcelo Teixeira Coelho', 'Auxiliar de Compras', 'Término antecipado de contrato (Empregador)', date '2025-08-11', 'empresa'),
  ('Rita Pinheiro Gervasio', 'Faxineira', 'Dispensa sem justa causa - Optante', date '2025-12-01', 'empresa'),
  ('Decio Jose da Silva', 'Estoquista', 'Pedido de demissão', date '2026-01-13', 'colaborador'),
  ('Cristiano Chaves de Resende', 'Designer Gráfico', 'Término contrato experiência', date '2026-03-18', 'outro'),
  ('Camila Dias Rodrigues', 'Assistente de Compras', 'Término antecipado de contrato (Empregado)', date '2026-03-19', 'colaborador'),
  ('Lorrani Rodrigues de Oliveira', 'Auxiliar de Compras I', 'Transferência para empresa do mesmo grupo econômico', date '2026-04-01', 'outro'),
  ('Bruno Leone Pereira Silva', 'Estoquista', 'Término antecipado de contrato (Empregado)', date '2026-04-30', 'colaborador'),
  ('Gustavo Epifanio Silva', 'Designer Gráfico', 'Desligamento por Acordo entre empregado e empregador', date '2026-08-03', 'acordo'),
  ('Daniel Henrique Alves Vertelo', 'Estoquista', 'Término antecipado de contrato (Empregado)', date '2026-08-13', 'colaborador'),
  ('Eduarda Fernandes Rocha Rodrigues', 'Social Media II', 'Pedido de demissão', date '2026-10-17', 'colaborador')
) as v(nome, cargo, tipo, data, iniciativa)
where not exists (
  select 1 from desligamentos_registro d
  where upper(d.nome) = upper(v.nome) and d.data_desligamento = v.data and d.empresa = 'BABOON'
)
and not exists (
  select 1 from desligamentos_registro d2
  where d2.status = 'ativo'
    and d2.colaborador_id = (select c.id from colaboradores c where upper(c.nome) = upper(v.nome) limit 1)
);
