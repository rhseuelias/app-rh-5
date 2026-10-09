-- migration_025: "dias até a recarga" no Vale Transporte.
-- O saldo do cartão é gasto até o dia da recarga; a carga é calculada com o saldo que sobra nesse dia.
alter table vt_lancamentos add column if not exists dias_ate_recarga int not null default 0;
