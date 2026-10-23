-- ============================================================
-- MIGRATION 047 — Cargo dos desligamentos da BSE (maio a setembro de 2026)
-- Preenche o cargo de 12 registros que estavam como "Não informado" no
-- módulo Desligamentos e no gráfico "Cargos com mais saídas".
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

update desligamentos_registro d set
  cargo = v.cargo
from (
  values
    ('Carolaine Batista dos Santos', date '2026-05-08', 'Recepcionista'),
    ('Caique Roberto Pereira Faustino', date '2026-05-15', 'Manobrista'),
    ('Elisane Maria dos Santos Fernandes', date '2026-05-22', 'Supervisora de Loja'),
    ('Cristina Ferreira dos Santos', date '2026-06-26', 'Auxiliar de Limpeza'),
    ('Patricia Abisague de Castro', date '2026-07-07', 'Supervisora de Loja'),
    ('Adrielle Moreira Batista', date '2026-07-13', 'Recepcionista'),
    ('Sirlei Rodrigues de Paula', date '2026-08-11', 'Balconista'),
    ('Lamarques Marques de Sales', date '2026-09-01', 'Manobrista'),
    ('Gabriela Carey Silva Verissimo', date '2026-09-02', 'Recepcionista'),
    ('Antonio de Magalhaes', date '2026-09-09', 'Manobrista'),
    ('Lorrani Rodrigues de Oliveira Martins', date '2026-09-18', 'Auxiliar de Compras'),
    ('Dario Fernando de Novaes', date '2026-09-30', 'Manobrista')
) as v(nome, data, cargo)
where upper(trim(d.nome)) = upper(v.nome)
  and d.data_desligamento = v.data;

-- Conferência: deve mostrar os 12 com o cargo novo.
select nome, unidade, data_desligamento, cargo
from desligamentos_registro
where data_desligamento between date '2026-05-08' and date '2026-09-30'
  and empresa ilike '%BSE%'
order by data_desligamento;
