-- ============================================================
-- MIGRATION 016 — HISTÓRICO AUTOMÁTICO DO MÓDULO DE FÉRIAS
-- Rode no SQL Editor do Supabase (New query > colar > Run).
--
-- Depois de rodar, TUDO que for gerado, editado, cancelado ou
-- excluído em férias e em períodos aquisitivos (por qualquer tela
-- do app) fica registrado sozinho no "Histórico de férias" do
-- colaborador, com data/hora e e-mail de quem fez.
-- Usa a tabela que já existe: historico_colaborador.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================

create or replace function public.rotulo_status_ferias(s text) returns text
language sql immutable as $$
  select case s
    when 'planejada' then 'Planejada'
    when 'solicitado' then 'Solicitada'
    when 'aprovado' then 'Aprovada'
    when 'concluido' then 'Concluída (baixa)'
    when 'cancelado' then 'Cancelada'
    else coalesce(s, '—') end
$$;

create or replace function public.registrar_historico_ferias() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_col uuid;
  v_tipo text;
  v_msg text;
  v_ant text;
  v_novo text;
  v_quem text;
  v_old text;
  v_new text;
begin
  begin
    v_quem := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  exception when others then
    v_quem := null;
  end;

  if tg_op = 'INSERT' then
    if new.simulacao then return new; end if;
    v_col := new.colaborador_id;
    v_new := to_char(new.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(new.data_fim, 'DD/MM/YYYY');
    v_tipo := 'ferias_lancada';
    v_msg := 'Férias lançadas: ' || v_new || ' (' || new.dias || ' dia' || case when new.dias <> 1 then 's' else '' end
             || ') — ' || rotulo_status_ferias(new.status);
    v_novo := v_new;

  elsif tg_op = 'UPDATE' then
    if new.simulacao and old.simulacao then return new; end if;
    if new.simulacao and not old.simulacao then return new; end if;
    v_col := new.colaborador_id;
    v_old := to_char(old.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(old.data_fim, 'DD/MM/YYYY');
    v_new := to_char(new.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(new.data_fim, 'DD/MM/YYYY');
    if old.simulacao and not new.simulacao then
      v_tipo := 'ferias_lancada';
      v_msg := 'Férias geradas (cenário aplicado): ' || v_new || ' (' || new.dias || ' dias) — ' || rotulo_status_ferias(new.status);
      v_novo := v_new;
    elsif new.status = 'cancelado' and old.status <> 'cancelado' then
      v_tipo := 'ferias_cancelada';
      v_msg := 'Férias canceladas: ' || v_new;
      v_ant := v_old;
    elsif new.data_inicio <> old.data_inicio or new.data_fim <> old.data_fim or new.dias <> old.dias then
      v_tipo := 'ferias_editada';
      v_msg := 'Férias editadas: ' || v_old || ' → ' || v_new || ' (' || new.dias || ' dia' || case when new.dias <> 1 then 's' else '' end || ')';
      v_ant := v_old;
      v_novo := v_new;
    elsif new.status <> old.status then
      v_tipo := 'ferias_editada';
      if new.status = 'concluido' then
        v_msg := 'Baixa dada nas férias de ' || v_new || ' (concluídas)';
      else
        v_msg := 'Status das férias de ' || v_new || ': ' || rotulo_status_ferias(old.status) || ' → ' || rotulo_status_ferias(new.status);
      end if;
      v_ant := rotulo_status_ferias(old.status);
      v_novo := rotulo_status_ferias(new.status);
    elsif coalesce(new.vendeu_abono, false) <> coalesce(old.vendeu_abono, false) then
      v_tipo := 'ferias_editada';
      v_msg := case when new.vendeu_abono then 'Abono pecuniário marcado nas férias de ' else 'Abono pecuniário removido das férias de ' end || v_new;
    else
      return new;
    end if;

  else -- DELETE
    if old.simulacao then return old; end if;
    v_col := old.colaborador_id;
    v_old := to_char(old.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(old.data_fim, 'DD/MM/YYYY');
    v_tipo := 'ferias_excluida';
    v_msg := 'Férias excluídas: ' || v_old || ' (' || old.dias || ' dia' || case when old.dias <> 1 then 's' else '' end
             || ') — ' || rotulo_status_ferias(old.status);
    v_ant := v_old;
  end if;

  if v_quem is not null then v_msg := v_msg || ' · por ' || v_quem; end if;

  -- se o colaborador está sendo apagado junto, não registra nada
  if exists (select 1 from colaboradores where id = v_col) then
    insert into historico_colaborador (colaborador_id, tipo, descricao, valor_anterior, valor_novo, data_evento)
    values (v_col, v_tipo, v_msg, v_ant, v_novo, (now() at time zone 'America/Sao_Paulo')::date);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  -- o histórico nunca pode atrapalhar o que a pessoa está fazendo
  raise warning 'historico de ferias: %', sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.registrar_historico_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_col uuid;
  v_tipo text;
  v_msg text;
  v_ant text;
  v_novo text;
  v_quem text;
  v_old text;
  v_new text;
begin
  begin
    v_quem := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  exception when others then
    v_quem := null;
  end;

  if tg_op = 'INSERT' then
    v_col := new.colaborador_id;
    v_new := to_char(new.inicio, 'DD/MM/YYYY') || ' a ' || to_char(new.fim, 'DD/MM/YYYY');
    v_tipo := 'periodo_gerado';
    v_msg := 'Período aquisitivo gerado: ' || v_new || ' (limite para gozo: ' || to_char(new.limite_concessao, 'DD/MM/YYYY') || ')';
    v_novo := v_new;
  elsif tg_op = 'UPDATE' then
    v_col := new.colaborador_id;
    v_old := to_char(old.inicio, 'DD/MM/YYYY') || ' a ' || to_char(old.fim, 'DD/MM/YYYY');
    v_new := to_char(new.inicio, 'DD/MM/YYYY') || ' a ' || to_char(new.fim, 'DD/MM/YYYY');
    if new.inicio <> old.inicio or new.fim <> old.fim or new.limite_concessao <> old.limite_concessao then
      v_tipo := 'periodo_editado';
      v_msg := 'Período aquisitivo editado: ' || v_old || ' → ' || v_new || ' (limite: ' || to_char(new.limite_concessao, 'DD/MM/YYYY') || ')';
      v_ant := v_old;
      v_novo := v_new;
    elsif new.status <> old.status then
      v_tipo := 'periodo_editado';
      v_msg := 'Período aquisitivo ' || v_new || ': ' ||
        case new.status when 'gozado' then 'quitado (férias completas)' when 'vencido' then 'marcado como vencido' else 'marcado como aberto' end;
      v_ant := old.status;
      v_novo := new.status;
    else
      return new;
    end if;
  else
    v_col := old.colaborador_id;
    v_old := to_char(old.inicio, 'DD/MM/YYYY') || ' a ' || to_char(old.fim, 'DD/MM/YYYY');
    v_tipo := 'periodo_excluido';
    v_msg := 'Período aquisitivo excluído: ' || v_old;
    v_ant := v_old;
  end if;

  if v_quem is not null then v_msg := v_msg || ' · por ' || v_quem; end if;

  if exists (select 1 from colaboradores where id = v_col) then
    insert into historico_colaborador (colaborador_id, tipo, descricao, valor_anterior, valor_novo, data_evento)
    values (v_col, v_tipo, v_msg, v_ant, v_novo, (now() at time zone 'America/Sao_Paulo')::date);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
exception when others then
  raise warning 'historico de periodo: %', sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_historico_ferias on ferias;
create trigger trg_historico_ferias
  after insert or update or delete on ferias
  for each row execute function public.registrar_historico_ferias();

drop trigger if exists trg_historico_periodo on periodos_aquisitivos;
create trigger trg_historico_periodo
  after insert or update or delete on periodos_aquisitivos
  for each row execute function public.registrar_historico_periodo();

create index if not exists idx_historico_colaborador_col on historico_colaborador(colaborador_id, created_at desc);
