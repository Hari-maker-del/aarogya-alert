-- Atomic investigation workflow mutation + audit event.
-- Run only after reviewing against the dedicated Supabase project schema.
create or replace function public.apply_investigation_change(
  p_alert_id text,
  p_action text,
  p_new_status text default null,
  p_reviewer_id uuid default null,
  p_findings text default null,
  p_outcome text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_current public.alert_investigations%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_event public.audit_events%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select role into v_role
  from public.reviewer_roles
  where user_id = v_actor;

  if v_role not in ('reviewer', 'admin') then
    raise exception 'Approved reviewer access required' using errcode = '42501';
  end if;

  if p_alert_id is null or length(trim(p_alert_id)) = 0 then
    raise exception 'Alert ID is required' using errcode = '22023';
  end if;

  if p_action not in ('status_updated', 'reviewer_assigned', 'note_added', 'investigation_created') then
    raise exception 'Unsupported investigation action' using errcode = '22023';
  end if;

  if p_action = 'reviewer_assigned' and p_reviewer_id is null then
    raise exception 'Reviewer ID is required for assignment' using errcode = '22023';
  end if;

  if p_action = 'status_updated' or p_action = 'reviewer_assigned' or p_action = 'investigation_created' then
    insert into public.alert_investigations (alert_id, status, created_by)
    values (p_alert_id, 'new', v_actor)
    on conflict (alert_id) do nothing;
  end if;

  select * into v_current
  from public.alert_investigations
  where alert_id = p_alert_id
  for update;

  if not found then
    raise exception 'Investigation does not exist' using errcode = 'P0002';
  end if;

  v_before := jsonb_build_object(
    'status', v_current.status,
    'assigned_reviewer_id', v_current.assigned_reviewer_id
  );

  if p_action = 'status_updated' or p_action = 'investigation_created' then
    if p_new_status is null then
      raise exception 'New status is required' using errcode = '22023';
    end if;
    update public.alert_investigations
    set status = p_new_status,
        assigned_reviewer_id = case
          when assigned_reviewer_id is null and p_new_status in ('assigned','investigating','escalated')
          then v_actor else assigned_reviewer_id end,
        findings = coalesce(p_findings, findings),
        outcome = coalesce(p_outcome, outcome),
        updated_at = now()
    where alert_id = p_alert_id
    returning * into v_current;
  elsif p_action = 'reviewer_assigned' then
    update public.alert_investigations
    set assigned_reviewer_id = p_reviewer_id,
        status = case when status = 'new' then 'assigned' else status end,
        updated_at = now()
    where alert_id = p_alert_id
    returning * into v_current;
  end if;

  v_after := jsonb_build_object(
    'status', v_current.status,
    'assigned_reviewer_id', v_current.assigned_reviewer_id
  );

  insert into public.audit_events (
    alert_id, actor_id, action, before_json, after_json, note
  ) values (
    p_alert_id, v_actor, p_action, v_before, v_after,
    coalesce(p_note, p_findings, p_outcome)
  )
  returning * into v_event;

  return jsonb_build_object(
    'investigation', to_jsonb(v_current),
    'audit_event', jsonb_build_object(
      'event_id', v_event.event_id,
      'alert_id', v_event.alert_id,
      'actor_id', v_event.actor_id,
      'action', v_event.action,
      'occurred_at', v_event.occurred_at,
      'before', v_event.before_json,
      'after', v_event.after_json,
      'note', v_event.note,
      'source', 'supabase'
    )
  );
end;
$$;

revoke all on function public.apply_investigation_change(text,text,text,uuid,text,text,text) from public, anon;
grant execute on function public.apply_investigation_change(text,text,text,uuid,text,text,text) to authenticated;
