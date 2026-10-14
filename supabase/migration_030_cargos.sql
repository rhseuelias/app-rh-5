-- Migration 030 — Descrição de Cargos (BDU, BABOON e BSE)
create table if not exists cargos_desc (
  id uuid primary key default gen_random_uuid(),
  cargo text not null,
  empresa text not null check (empresa in ('BDU', 'BABOON', 'BSE')),
  departamento text,
  cbo text,
  identificador text,
  missao text,
  sumaria text,
  resp jsonb not null default '[]'::jsonb,        -- [{titulo, itens[]}]
  sucesso jsonb not null default '[]'::jsonb,     -- [texto]
  resultados jsonb not null default '[]'::jsonb,  -- [{resp, res}]
  indicadores jsonb not null default '[]'::jsonb, -- [{nome, meta, freq}]
  escolaridade text,
  experiencia text,
  habilitacao text,
  tecnicos jsonb not null default '[]'::jsonb,
  comportamentais jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cargos_desc enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'cargos_desc' and policyname = 'authenticated_full_access') then
    create policy "authenticated_full_access" on cargos_desc for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Primeiro cargo: Manobrista (BSE)
insert into cargos_desc (cargo, empresa, departamento, missao, sumaria, resp, sucesso, resultados, indicadores, escolaridade, experiencia, habilitacao, tecnicos, comportamentais)
select $t$Manobrista$t$, $t$BSE$t$, $t$Operações/Atendimento$t$, $t$Garantir uma experiência segura, cordial e eficiente ao cliente desde sua chegada à unidade, realizando a recepção, organização e manobra dos veículos com responsabilidade, agilidade e cuidado.$t$, $t$Recepcionar clientes, manobrar e estacionar veículos, garantir a segurança, atendimento.$t$,
  $j$[{"titulo": "Recepcionar clientes", "itens": ["Cumprimentar o cliente de forma cordial", "Receber o veículo", "Confirmar a necessidade do cliente", "Orientar o cliente sobre o procedimento de estacionamento", "Entregar ou controlar o recurso utilizado para identificação do veículo, quando aplicável", "Auxiliar o cliente na entrada e saída da unidade, quando necessário"]}, {"titulo": "Manobrar e estacionar veículos", "itens": ["Conduzir os veículos com atenção e responsabilidade", "Estacionar os veículos nos locais determinados", "Organizar a disposição dos veículos", "Retirar o veículo quando solicitado pelo cliente", "Conferir o veículo antes e após a movimentação, conforme procedimento definido pela empresa"]}, {"titulo": "Garantir a segurança", "itens": ["Manter a área de estacionamento organizada", "Observar condições de segurança do local", "Comunicar imediatamente acidentes, avarias ou qualquer ocorrência", "Zelar pelas chaves e demais itens sob sua responsabilidade", "Cumprir os procedimentos internos de controle dos veículos"]}, {"titulo": "Atendimento", "itens": ["Manter postura cordial e profissional", "Responder dúvidas simples dos clientes", "Encaminhar solicitações para a recepção ou liderança quando necessário", "Evitar discussões ou conflitos com clientes", "Preservar a imagem e os padrões da Barbearia Seu Elias"]}]$j$::jsonb, $j$["Recebe os clientes com cordialidade", "Realiza as manobras com segurança", "Mantém o fluxo de veículos organizado", "Cuida adequadamente dos veículos", "Não negligencia procedimentos", "Comunica imediatamente qualquer ocorrência", "Trabalha de forma integrada com a recepção", "Mantém postura profissional durante todo o expediente", "Contribui para uma experiência positiva do cliente"]$j$::jsonb, $j$[{"resp": "Atendimento", "res": "100% dos clientes recebidos com cordialidade e profissionalismo"}, {"resp": "Manobra", "res": "Veículos movimentados com segurança e atenção"}, {"resp": "Organização", "res": "Fluxo de entrada e saída organizado e eficiente"}, {"resp": "Segurança", "res": "Nenhum procedimento de segurança negligenciado"}, {"resp": "Veículos", "res": "Veículos entregues nas mesmas condições em que foram recebidos"}, {"resp": "Ocorrências", "res": "100% das ocorrências comunicadas imediatamente à liderança"}, {"resp": "Experiência", "res": "Cliente percebe organização, segurança e cuidado desde sua chegada"}, {"resp": "Postura", "res": "Atendimento alinhado aos valores e padrões da empresa"}]$j$::jsonb, $j$[{"nome": "Reclamações relacionadas ao atendimento", "meta": "0", "freq": "Mensal"}, {"nome": "Ocorrências não comunicadas", "meta": "0", "freq": "Mensal"}, {"nome": "Avarias por falha operacional", "meta": "0", "freq": "Mensal"}, {"nome": "Cumprimento dos procedimentos", "meta": "100%", "freq": "Diário"}, {"nome": "Registro correto de ocorrências", "meta": "100%", "freq": "Sempre que houver"}, {"nome": "Satisfação do cliente", "meta": "≥ 90%", "freq": "Mensal"}]$j$::jsonb,
  $t$Ensino Fundamental completo.$t$, $t$Experiência anterior como manobrista, motorista ou em atividades relacionadas à condução e atendimento ao público será considerada um diferencial.$t$, $t$CNH válida e compatível com os veículos que serão conduzidos.$t$, $j$["Condução e manobra de veículos", "Noções de segurança", "Atendimento ao cliente", "Organização e controle de veículos"]$j$::jsonb, $j$["Responsabilidade", "Atenção", "Prudência", "Cordialidade", "Agilidade", "Organização", "Comunicação", "Controle emocional", "Orientação para o cliente"]$j$::jsonb
where not exists (select 1 from cargos_desc where cargo = 'Manobrista' and empresa = 'BSE');
