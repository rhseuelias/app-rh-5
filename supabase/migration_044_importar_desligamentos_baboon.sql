-- ============================================================
-- MIGRATION 044 — Importar histórico de desligamentos (BABOON, BDU e BSE)
-- Planilhas: Rescisões - 705 BABOON, Rescisões - 1059 BARBERDAY (BDU) e Controle de Rescisões (BSE, por unidade).
-- Rode no SQL Editor do Supabase: New query > colar tudo > Run.
-- Pode rodar mais de uma vez: não duplica registros já importados.
-- Não altera nenhum colaborador: só grava o histórico de desligamentos.
-- Quando o nome existe em Colaboradores, traz de lá a data de admissão, cargo, departamento, matrícula e vínculo.
-- Na BSE, a unidade "São Paulo" da planilha foi gravada como Alphaville.
-- ============================================================

-- registros importados podem não ter colaborador cadastrado nem motivo informado
alter table desligamentos_registro alter column colaborador_id drop not null;
alter table desligamentos_registro alter column motivo_principal set default 'Não informado';

insert into desligamentos_registro
  (colaborador_id, nome, matricula, vinculo, departamento, gestor, empresa, unidade, cargo, data_admissao,
   data_desligamento, tipo_rescisao, iniciativa, aviso_previo, motivo_principal, registrado_por)
select
  c.id,
  v.nome,
  c.matricula,
  c.tipo,
  c.departamento,
  c.lider,
  coalesce(
    (select e.nome from unidades u join empresas e on e.id = u.empresa_id
       where v.unidade_busca is not null and e.nome ilike '%' || v.empresa_busca || '%'
         and u.nome ilike '%' || v.unidade_busca || '%' limit 1),
    (select e.nome from empresas e where e.nome ilike '%' || v.empresa_busca || '%' order by length(e.nome) limit 1),
    v.empresa_busca),
  coalesce(
    (select u.nome from unidades u join empresas e on e.id = u.empresa_id
       where v.unidade_busca is not null and e.nome ilike '%' || v.empresa_busca || '%'
         and u.nome ilike '%' || v.unidade_busca || '%' limit 1),
    v.unidade_exib),
  coalesce(v.cargo, c.cargo),
  coalesce(v.admissao, c.data_admissao::date),
  v.data, v.tipo, v.iniciativa, v.aviso,
  'Não informado',
  'Importado das planilhas de rescisão'
from (values
  ('Monica Albertina dos Santos', 'BDU', null, null, 'Auxiliar de Limpeza', null, date '2025-06-02', 'Pedido de demissão', 'colaborador', null),
  ('Mateus Henrique Santos Xavier', 'BDU', null, null, 'Auxiliar de Cobrança', null, date '2025-06-06', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Gabriel Fernando Queiroz de Sousa', 'BDU', null, null, 'Video Maker', null, date '2025-09-09', 'Término contrato experiência', 'outro', null),
  ('Maria Eduarda Polaquini Silva', 'BDU', null, null, 'Closer', null, date '2025-10-06', 'Término contrato experiência', 'outro', null),
  ('Eliane Costa Oliveira', 'BDU', null, null, 'Closer', null, date '2025-12-10', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Priscila Rodrigues Damasceno Barros', 'BDU', null, null, 'Social Midia Manager', null, date '2025-12-12', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Paulo Celso Casado Oliveira', 'BDU', null, null, 'Supervisor de vendas comercial', null, date '2026-01-07', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Vitoria Oliveira Passoni', 'BDU', null, null, 'Closer', null, date '2026-02-26', 'Pedido de demissão', 'colaborador', null),
  ('Aline Souza Silva', 'BDU', null, null, 'Closer', null, date '2026-02-27', 'Pedido de demissão', 'colaborador', null),
  ('Cinthya Oliveira Ferreira', 'BDU', null, null, 'Social Midia Manager', null, date '2026-03-06', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Maria Karolina Biro de Menezes', 'BDU', null, null, 'Closer', null, date '2026-03-09', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Robson Nascimento Alencar', 'BDU', null, null, 'Supervisor de vendas', null, date '2026-04-07', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('David Tomaz', 'BDU', null, null, 'Closer', null, date '2026-05-13', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Carolina Cristina Gondim Rios Satiro', 'BDU', null, null, 'Supervisor de vendas', null, date '2026-05-29', 'Pedido de demissão', 'colaborador', null),
  ('Rosicle dos Santos Goncalves', 'BDU', null, null, 'Auxiliar de Limpeza', null, date '2026-06-06', 'Pedido de demissão', 'colaborador', null),
  ('Thais Pinheiro Bernardes', 'BDU', null, null, 'Closer', null, date '2026-07-02', 'Término antecipado de contrato (Empregador)', 'empresa', null),
  ('Maria Eduarda Benedito Pirinelli', 'BDU', null, null, 'Closer', null, date '2026-08-26', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Caroline Batista Viana da Silva', 'BDU', null, null, 'Closer', null, date '2026-10-08', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Kleberton Luiz de Oliveira Rosa', 'BDU', null, null, 'Closer', null, date '2026-10-08', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Thaina Pereira Lucas', 'BDU', null, null, 'Social Seller', null, date '2026-10-08', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Vitoria Mendes Leal', 'BDU', null, null, 'Closer', null, date '2026-10-08', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Brenda Frida Santos Silva', 'BABOON', null, null, 'Auxiliar Financeiro', null, date '2024-05-29', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Lucas Mateus e Silva', 'BABOON', null, null, 'Assistente de Compras', null, date '2024-07-01', 'Transferência para empresa do mesmo grupo econômico', 'outro', null),
  ('Marlon Douglas da Silva', 'BABOON', null, null, 'Estoquista', null, date '2025-01-21', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Daniel Alves Ferreira', 'BABOON', null, null, 'Estoquista', null, date '2025-04-30', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Lucas Filipe Oliveira Reis', 'BABOON', null, null, 'Auxiliar de Compras I', null, date '2025-04-30', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Marcelo Teixeira Coelho', 'BABOON', null, null, 'Auxiliar de Compras', null, date '2025-08-11', 'Término antecipado de contrato (Empregador)', 'empresa', null),
  ('Rita Pinheiro Gervasio', 'BABOON', null, null, 'Faxineira', null, date '2025-12-01', 'Dispensa sem justa causa - Optante', 'empresa', null),
  ('Decio Jose da Silva', 'BABOON', null, null, 'Estoquista', null, date '2026-01-13', 'Pedido de demissão', 'colaborador', null),
  ('Cristiano Chaves de Resende', 'BABOON', null, null, 'Designer Gráfico', null, date '2026-03-18', 'Término contrato experiência', 'outro', null),
  ('Camila Dias Rodrigues', 'BABOON', null, null, 'Assistente de Compras', null, date '2026-03-19', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Lorrani Rodrigues de Oliveira', 'BABOON', null, null, 'Auxiliar de Compras I', null, date '2026-04-01', 'Transferência para empresa do mesmo grupo econômico', 'outro', null),
  ('Bruno Leone Pereira Silva', 'BABOON', null, null, 'Estoquista', null, date '2026-04-30', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Gustavo Epifanio Silva', 'BABOON', null, null, 'Designer Gráfico', null, date '2026-08-03', 'Desligamento por Acordo entre empregado e empregador', 'acordo', null),
  ('Daniel Henrique Alves Vertelo', 'BABOON', null, null, 'Estoquista', null, date '2026-08-13', 'Término antecipado de contrato (Empregado)', 'colaborador', null),
  ('Eduarda Fernandes Rocha Rodrigues', 'BABOON', null, null, 'Social Media II', null, date '2026-10-17', 'Pedido de demissão', 'colaborador', null),
  ('Aline Gonçalves de Jesus', 'BSE', 'Belvedere', 'Belvedere', null, date '2021-09-01', date '2024-02-10', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Suzana Oliveira Fernandes', 'BSE', 'Lagoa Santa', 'Lagoa Santa', null, date '2022-08-22', date '2024-05-04', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Liliane Valeria Gomes Lopes', 'BSE', 'Pampulha', 'Pampulha', null, date '2021-09-21', date '2024-09-24', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Priscila Melriane Vieira dos Santos Lopes', 'BSE', 'Savassi', 'Savassi', null, date '2024-03-01', date '2024-10-01', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Juliana Aparecida Ferreira da Silva', 'BSE', 'Savassi', 'Savassi', null, date '2023-09-21', date '2024-10-17', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Tania Amaral de Carvalho', 'BSE', 'Confins', 'Confins', null, date '2023-12-14', date '2024-11-01', 'Desligamento por Acordo entre empregado e empregador', 'acordo', 'indenizado'),
  ('Maria Estephane Souza Alencar Fonseca', 'BSE', 'Belvedere', 'Belvedere', null, date '2024-08-01', date '2024-11-08', 'Desligamento por Acordo entre empregado e empregador', 'acordo', 'indenizado'),
  ('Aline Silva Azevedo Diniz Neves', 'BSE', 'Confins', 'Confins', null, date '2023-12-14', date '2024-12-10', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Raiane Lourenço de Oliveira', 'BSE', 'Pampulha', 'Pampulha', null, date '2024-03-01', date '2025-01-01', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Natalia Viviane dos Santos da Silva', 'BSE', 'Belvedere', 'Belvedere', null, date '2022-03-11', date '2025-01-17', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Jaiza Pereira Cardoso', 'BSE', 'Savassi', 'Savassi', null, date '2022-09-13', date '2025-01-23', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Lidia Valente da Silva', 'BSE', 'Pampulha', 'Pampulha', null, date '2023-09-21', date '2025-05-02', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Bruna Vieira da Silva', 'BSE', 'Pampulha', 'Pampulha', null, date '2024-10-15', date '2025-05-26', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Nayara Pinheiro da Costa Santos', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-03-18', date '2025-06-06', 'Término antecipado de contrato de experiência (Empregado)', 'colaborador', null),
  ('Jaciara Vieira Conceição', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-03-14', date '2025-06-07', 'Término antecipado de contrato de experiência (Empregado)', 'colaborador', null),
  ('Emanuella Silva Soares', 'BSE', 'Ouro Minas', 'Ouro Minas', null, date '2023-04-03', date '2025-07-12', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Maria Clara Laslzo Hungria dos Santos', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-07-09', date '2025-08-13', 'Término antecipado de contrato de experiência (Empregado)', 'colaborador', null),
  ('Nathalia da Silva Verissimo', 'BSE', 'Savassi', 'Savassi', null, date '2024-09-02', date '2025-10-18', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Karla Sthefany Vieira Rodrigues', 'BSE', 'Ouro Minas', 'Ouro Minas', null, date '2025-07-29', date '2025-10-26', 'Término contrato experiência', 'outro', null),
  ('Guilherme Soares Lima', 'BSE', 'Confins', 'Confins', null, date '2025-07-23', date '2025-11-01', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Camila Narcisio de Farias', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-07-09', date '2025-11-04', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Ana Gabriela Souza Santos', 'BSE', 'Savassi', 'Savassi', null, date '2024-11-11', date '2025-11-07', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Maria Alice Lopes de Souza e Silva', 'BSE', 'Savassi', 'Savassi', null, date '2022-03-11', date '2025-12-16', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Maria Eduarda Horta Passos', 'BSE', 'Savassi', 'Savassi', null, date '2025-11-18', date '2026-01-01', 'Término contrato experiência', 'outro', null),
  ('Luiza Santana Gomes Pereira', 'BSE', 'Confins', 'Confins', null, date '2024-12-02', date '2026-01-07', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Bianca Larissa Gomes Duarte de Oliveira', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-11-28', date '2026-01-11', 'Término contrato experiência', 'outro', null),
  ('Samara Luciana Amorim Coutinho', 'BSE', 'Belvedere', 'Belvedere', null, date '2025-06-26', date '2026-01-30', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Hadassa Ester Lin Barbosa de Oliveira', 'BSE', 'Savassi', 'Savassi', null, date '2025-11-05', date '2026-02-02', 'Término contrato experiência', 'outro', null),
  ('Luis Fernando de Souza Leitao', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-10-17', date '2026-03-19', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Carina de Sousa Garcia', 'BSE', 'Savassi', 'Savassi', null, date '2025-04-25', date '2026-04-01', 'Desligamento por Acordo entre empregado e empregador', 'acordo', 'trabalhado'),
  ('Gisele Melissa Souza do Carmo', 'BSE', 'Savassi', 'Savassi', null, date '2026-03-25', date '2026-04-07', 'Término antecipado de contrato de experiência (Empregado)', 'colaborador', null),
  ('Carolaine Batista dos Santos', 'BSE', 'Pampulha', 'Pampulha', null, date '2025-05-28', date '2026-05-08', 'Pedido de demissão', 'colaborador', 'trabalhado'),
  ('Caique Roberto Pereira Faustino', 'BSE', 'Alphaville', 'Alphaville', null, date '2026-04-01', date '2026-05-15', 'Término contrato experiência', 'outro', null),
  ('Elisane Maria dos Santos Fernandes', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-12-05', date '2026-05-22', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Cristina Ferreira dos Santos', 'BSE', 'Belvedere', 'Belvedere', null, date '2025-03-21', date '2026-06-26', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Patricia Abisague de Castro', 'BSE', 'Lagoa Santa', 'Lagoa Santa', null, date '2022-08-22', date '2026-07-07', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Adrielle Moreira Batista', 'BSE', 'Belvedere', 'Belvedere', null, date '2026-01-08', date '2026-07-13', 'Pedido de demissão', 'colaborador', 'indenizado'),
  ('Sirlei Rodrigues de Paula', 'BSE', 'Pampulha', 'Pampulha', null, date '2024-05-07', date '2026-08-11', 'Desligamento por Acordo entre empregado e empregador', 'acordo', 'indenizado'),
  ('Lamarques Marques de Sales', 'BSE', 'Alphaville', 'Alphaville', null, date '2025-10-17', date '2026-09-01', 'Dispensa sem justa causa', 'empresa', 'indenizado'),
  ('Gabriela Carey Silva Verissimo', 'BSE', 'Savassi', 'Savassi', null, date '2024-07-15', date '2026-09-02', 'Desligamento por Acordo entre empregado e empregador', 'acordo', 'trabalhado'),
  ('Antonio de Magalhaes', 'BSE', 'Alphaville', 'Alphaville', null, date '2026-09-08', date '2026-09-09', 'Término antecipado de contrato de experiência (Empregador)', 'empresa', null),
  ('Lorrani Rodrigues de Oliveira Martins', 'BSE', 'Pampulha', 'Pampulha', null, date '2022-09-13', date '2026-09-18', 'Dispensa sem justa causa', 'empresa', 'trabalhado'),
  ('Dario Fernando de Novaes', 'BSE', 'Alphaville', 'Alphaville', null, date '2026-09-11', date '2026-09-30', 'Término antecipado de contrato de experiência (Empregado)', 'colaborador', null)
) as v(nome, empresa_busca, unidade_busca, unidade_exib, cargo, admissao, data, tipo, iniciativa, aviso)
left join lateral (
  select c0.id, c0.matricula, c0.tipo, c0.departamento, c0.lider, c0.cargo, c0.data_admissao
  from colaboradores c0 where upper(c0.nome) = upper(v.nome) limit 1
) c on true
where not exists (
  select 1 from desligamentos_registro d
  where upper(d.nome) = upper(v.nome) and d.data_desligamento = v.data
)
and not exists (
  select 1 from desligamentos_registro d2
  where d2.status = 'ativo'
    and d2.colaborador_id = c.id
);
