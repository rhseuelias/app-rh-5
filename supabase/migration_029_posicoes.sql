-- Quantas posições (vagas) cada vaga tem
alter table sel_vagas add column if not exists posicoes integer not null default 1;
