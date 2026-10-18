-- 1) Cria o campo Sexo (Feminino / Masculino)
alter table colaboradores add column if not exists sexo text;
alter table colaboradores drop constraint if exists colaboradores_sexo_check;
alter table colaboradores add constraint colaboradores_sexo_check check (sexo is null or sexo in ('Feminino','Masculino'));

-- 2) Define o sexo de quem ainda não tem, pelo primeiro nome.
with base as (
  select id,
         lower(translate(split_part(trim(nome), ' ', 1),
           'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
           'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) as pn
  from colaboradores where sexo is null
)
update colaboradores c set sexo = case
  when b.pn in ('luca','joshua','nicolas','elias','matias','tobias','jonas','silva','gabriel','jose','davi','noah','ezequias','jeova','josue','isaias','neemias','zacarias','uzias','mica','saulo') then 'Masculino'
  when b.pn in ('ingrid','beatriz','raquel','isabel','miriam','carmen','ester','rute','ruth','sarah','lais','thais','elis','karen','jaqueline','rachel','abigail','michele','daniele','simone','nicole','alice','aline','denise','eloise','ivone','jaque','kelly','lilian','liliane','marisol','mel','rosangela','tais','suelen','judith','edith','dayane','dayanne','nayara','jessica','jennifer','priscila','priscilla') then 'Feminino'
  when b.pn like '%a' then 'Feminino'
  else 'Masculino'
end
from base b where c.id = b.id;

-- 3) CONFERÊNCIA: veja a lista (nome e sexo) para corrigir quem estiver errado
select nome, sexo from colaboradores order by sexo, nome;
