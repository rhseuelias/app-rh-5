-- Cria a unidade "BDU" na empresa BDU e coloca nela os colaboradores
-- da BDU que estavam "sem unidade". Pode rodar mais de uma vez sem problema.

insert into unidades (empresa_id, nome)
select e.id, 'BDU'
from empresas e
where e.nome ilike '%BDU%'
  and not exists (
    select 1 from unidades u where u.empresa_id = e.id and u.nome ilike 'BDU'
  );

update colaboradores c
set unidade_id = u.id
from unidades u
join empresas e on e.id = u.empresa_id
where e.nome ilike '%BDU%'
  and u.nome ilike 'BDU'
  and c.empresa_id = e.id
  and c.unidade_id is null;
