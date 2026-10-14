-- Indicadores de cada unidade (aparecem no Dashboard): absenteísmo, performance,
-- treinamento e clima organizacional, em %. Em branco = ainda não informado.
-- Pode rodar mais de uma vez sem problema.

alter table unidades add column if not exists absenteismo_pct numeric;
alter table unidades add column if not exists performance_pct numeric;
alter table unidades add column if not exists treinamento_pct numeric;
alter table unidades add column if not exists clima_pct numeric;
