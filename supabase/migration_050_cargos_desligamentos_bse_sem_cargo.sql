-- ============================================================
-- MIGRATION 050 — Cargo dos 31 desligamentos da BSE que estavam "Sem cargo"
-- (2024 a abril de 2026). Só preenche quem está sem cargo; não mexe em quem já tem.
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

update desligamentos_registro d set
  cargo = v.cargo
from (
  values
    ('Priscila Melriane Vieira dos Santos Lopes', date '2024-10-01', 'Recepcionista'),
    ('Juliana Aparecida Ferreira da Silva', date '2024-10-17', 'Auxiliar de Limpeza'),
    ('Jaiza Pereira Cardoso', date '2025-01-23', 'Balconista'),
    ('Nathalia da Silva Verissimo', date '2025-10-18', 'Recepcionista'),
    ('Ana Gabriela Souza Santos', date '2025-11-07', 'Recepcionista'),
    ('Maria Alice Lopes de Souza e Silva', date '2025-12-16', 'Recepcionista'),
    ('Maria Eduarda Horta Passos', date '2026-01-01', 'Recepcionista'),
    ('Hadassa Ester Lin Barbosa de Oliveira', date '2026-02-02', 'Recepcionista'),
    ('Carina de Sousa Garcia', date '2026-04-01', 'Balconista'),
    ('Gisele Melissa Souza do Carmo', date '2026-04-07', 'Recepcionista'),
    ('Aline Gonçalves de Jesus', date '2024-02-10', 'Recepcionista'),
    ('Maria Estephane Souza Alencar Fonseca', date '2024-11-08', 'Recepcionista'),
    ('Natalia Viviane dos Santos da Silva', date '2025-01-17', 'Auxiliar de Limpeza'),
    ('Samara Luciana Amorim Coutinho', date '2026-01-30', 'Recepcionista'),
    ('Liliane Valeria Gomes Lopes', date '2024-09-24', 'Recepcionista'),
    ('Raiane Lourenço de Oliveira', date '2025-01-01', 'Recepcionista'),
    ('Lidia Valente da Silva', date '2025-05-02', 'Recepcionista'),
    ('Bruna Vieira da Silva', date '2025-05-26', 'Recepcionista'),
    ('Tania Amaral de Carvalho', date '2024-11-01', 'Recepcionista'),
    ('Aline Silva Azevedo Diniz Neves', date '2024-12-10', 'Recepcionista'),
    ('Guilherme Soares Lima', date '2025-11-01', 'Barbeiro'),
    ('Luiza Santana Gomes Pereira', date '2026-01-07', 'Recepcionista'),
    ('Nayara Pinheiro da Costa Santos', date '2025-06-06', 'Recepcionista'),
    ('Jaciara Vieira Conceição', date '2025-06-07', 'Recepcionista'),
    ('Maria Clara Laslzo Hungria dos Santos', date '2025-08-13', 'Recepcionista'),
    ('Camila Narcisio de Farias', date '2025-11-04', 'Recepcionista'),
    ('Bianca Larissa Gomes Duarte de Oliveira', date '2026-01-11', 'Recepcionista'),
    ('Luis Fernando de Souza Leitao', date '2026-03-19', 'Manobrista'),
    ('Suzana Oliveira Fernandes', date '2024-05-04', 'Recepcionista'),
    ('Emanuella Silva Soares', date '2025-07-12', 'Recepcionista'),
    ('Karla Sthefany Vieira Rodrigues', date '2025-10-26', 'Recepcionista')
) as v(nome, data, cargo)
where upper(trim(d.nome)) = upper(v.nome)
  and d.data_desligamento = v.data
  and (d.cargo is null or trim(d.cargo) = '' or d.cargo ilike 'não informado' or d.cargo ilike 'nao informado');

-- Conferência: deve mostrar 31 linhas com o cargo novo. Se aparecer menos, me avise.
select nome, unidade, data_desligamento, cargo
from desligamentos_registro
where status = 'ativo' and empresa ilike '%BSE%'
  and (nome, data_desligamento) in (select nome, data from (values
    ('Priscila Melriane Vieira dos Santos Lopes', date '2024-10-01', 'Recepcionista'),
    ('Juliana Aparecida Ferreira da Silva', date '2024-10-17', 'Auxiliar de Limpeza'),
    ('Jaiza Pereira Cardoso', date '2025-01-23', 'Balconista'),
    ('Nathalia da Silva Verissimo', date '2025-10-18', 'Recepcionista'),
    ('Ana Gabriela Souza Santos', date '2025-11-07', 'Recepcionista'),
    ('Maria Alice Lopes de Souza e Silva', date '2025-12-16', 'Recepcionista'),
    ('Maria Eduarda Horta Passos', date '2026-01-01', 'Recepcionista'),
    ('Hadassa Ester Lin Barbosa de Oliveira', date '2026-02-02', 'Recepcionista'),
    ('Carina de Sousa Garcia', date '2026-04-01', 'Balconista'),
    ('Gisele Melissa Souza do Carmo', date '2026-04-07', 'Recepcionista'),
    ('Aline Gonçalves de Jesus', date '2024-02-10', 'Recepcionista'),
    ('Maria Estephane Souza Alencar Fonseca', date '2024-11-08', 'Recepcionista'),
    ('Natalia Viviane dos Santos da Silva', date '2025-01-17', 'Auxiliar de Limpeza'),
    ('Samara Luciana Amorim Coutinho', date '2026-01-30', 'Recepcionista'),
    ('Liliane Valeria Gomes Lopes', date '2024-09-24', 'Recepcionista'),
    ('Raiane Lourenço de Oliveira', date '2025-01-01', 'Recepcionista'),
    ('Lidia Valente da Silva', date '2025-05-02', 'Recepcionista'),
    ('Bruna Vieira da Silva', date '2025-05-26', 'Recepcionista'),
    ('Tania Amaral de Carvalho', date '2024-11-01', 'Recepcionista'),
    ('Aline Silva Azevedo Diniz Neves', date '2024-12-10', 'Recepcionista'),
    ('Guilherme Soares Lima', date '2025-11-01', 'Barbeiro'),
    ('Luiza Santana Gomes Pereira', date '2026-01-07', 'Recepcionista'),
    ('Nayara Pinheiro da Costa Santos', date '2025-06-06', 'Recepcionista'),
    ('Jaciara Vieira Conceição', date '2025-06-07', 'Recepcionista'),
    ('Maria Clara Laslzo Hungria dos Santos', date '2025-08-13', 'Recepcionista'),
    ('Camila Narcisio de Farias', date '2025-11-04', 'Recepcionista'),
    ('Bianca Larissa Gomes Duarte de Oliveira', date '2026-01-11', 'Recepcionista'),
    ('Luis Fernando de Souza Leitao', date '2026-03-19', 'Manobrista'),
    ('Suzana Oliveira Fernandes', date '2024-05-04', 'Recepcionista'),
    ('Emanuella Silva Soares', date '2025-07-12', 'Recepcionista'),
    ('Karla Sthefany Vieira Rodrigues', date '2025-10-26', 'Recepcionista')
  ) as x(nome, data, cargo))
order by unidade, data_desligamento;
