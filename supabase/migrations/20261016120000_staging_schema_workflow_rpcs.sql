-- AAROGYA ALERT workflow RPCs for the isolated aarogya_staging schema.
-- Apply only to the dedicated staging project after adding aarogya_staging to
-- Supabase API Settings > Exposed schemas. This does not alter public tables.
create or replace function aarogya_staging.apply_investigation_change(
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
security definer
set search_path = pg_catalog, aarogya_staging
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_current aarogya_staging.alert_investigations%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_event aarogya_staging.audit_events%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select role into v_role from aarogya_staging.reviewer_roles where user_id = v_actor;
  if v_role not in ('reviewer','admin') then
    raise exception 'Approved reviewer access required' using errcode = '42501';
  end if;
  if p_alert_id is null or length(trim(p_alert_id)) = 0 then
    raise exception 'Alert ID is required' using errcode = '22023';
  end if;
  if p_action not in ('status_updated','reviewer_assigned','note_added','investigation_created') then
    raise exception 'Unsupported investigation action' using errcode = '22023';
  end if;
  if p_action = 'reviewer_assigned' and p_reviewer_id is null then
    raise exception 'Reviewer ID is required for assignment' using errcode = '22023';
  end if;
  if p_action in ('status_updated','reviewer_assigned','investigation_created') then
    insert into aarogya_staging.alert_investigations(alert_id,status,created_by)
    values(p_alert_id,'new',v_actor) on conflict(alert_id) do nothing;
  end if;
  select * into v_current from aarogya_staging.alert_investigations
    where alert_id = p_alert_id for update;
  if not found then raise exception 'Investigation does not exist' using errcode = 'P0002'; end if;
  v_before := jsonb_build_object('status',v_current.status,'assigned_reviewer_id',v_current.assigned_reviewer_id);
  if p_action in ('status_updated','investigation_created') then
    if p_new_status is null then raise exception 'New status is required' using errcode = '22023'; end if;
    update aarogya_staging.alert_investigations
      set status = p_new_status,
          assigned_reviewer_id = case when assigned_reviewer_id is null and p_new_status in ('assigned','investigating','escalated') then v_actor else assigned_reviewer_id end,
          findings = coalesce(p_findings,findings), outcome = coalesce(p_outcome,outcome), updated_at = now()
      where alert_id = p_alert_id returning * into v_current;
  elsif p_action = 'reviewer_assigned' then
    if not exists (select 1 from aarogya_staging.reviewer_roles where user_id=p_reviewer_id and role in ('reviewer','admin')) then
      raise exception 'Target user is not an approved reviewer' using errcode = '22023';
    end if;
    update aarogya_staging.alert_investigations
      set assigned_reviewer_id=p_reviewer_id,
          status=case when status='new' then 'assigned' else status end, updated_at=now()
      where alert_id=p_alert_id returning * into v_current;
  end if;
  v_after := jsonb_build_object('status',v_current.status,'assigned_reviewer_id',v_current.assigned_reviewer_id);
  insert into aarogya_staging.audit_events(alert_id,actor_id,action,before_json,after_json,note)
    values(p_alert_id,v_actor,p_action,v_before,v_after,coalesce(p_note,p_findings,p_outcome))
    returning * into v_event;
  return jsonb_build_object(
    'investigation',to_jsonb(v_current),
    'audit_event',jsonb_build_object('event_id',v_event.event_id,'alert_id',v_event.alert_id,
      'actor_id',v_event.actor_id,'action',v_event.action,'occurred_at',v_event.occurred_at,
      'before',v_event.before_json,'after',v_event.after_json,'note',v_event.note,'source','supabase'));
end;
$$;

create or replace function aarogya_staging.admin_set_reviewer_role(
  target_user_id uuid,
  requested_role text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, aarogya_staging
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select role into v_actor_role from aarogya_staging.reviewer_roles where user_id=v_actor;
  if v_actor_role <> 'admin' then raise exception 'Admin access required' using errcode = '42501'; end if;
  if target_user_id = v_actor then raise exception 'Admins cannot change their own role' using errcode = '42501'; end if;
  if requested_role not in ('pending','reviewer','admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  select jsonb_build_object('role',role) into v_before from aarogya_staging.reviewer_roles where user_id=target_user_id for update;
  if not found then raise exception 'Reviewer request not found' using errcode = 'P0002'; end if;
  update aarogya_staging.reviewer_roles
    set role=requested_role,
        approved_by=case when requested_role in ('reviewer','admin') then v_actor else null end,
        approved_at=case when requested_role in ('reviewer','admin') then now() else null end,
        updated_at=now()
    where user_id=target_user_id;
  v_after := jsonb_build_object('role',requested_role);
  insert into aarogya_staging.audit_events(alert_id,actor_id,action,before_json,after_json,note)
    values('reviewer:'||target_user_id::text,v_actor,'role_changed',v_before,v_after,'Reviewer role changed');
end;
$$;

revoke all on function aarogya_staging.apply_investigation_change(text,text,text,uuid,text,text,text) from public, anon;
revoke all on function aarogya_staging.admin_set_reviewer_role(uuid,text) from public, anon;
grant execute on function aarogya_staging.apply_investigation_change(text,text,text,uuid,text,text,text) to authenticated;
grant execute on function aarogya_staging.admin_set_reviewer_role(uuid,text) to authenticated;
