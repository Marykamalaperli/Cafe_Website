-- Apply manually after 010. Existing order and delivery records are preserved.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=10) then raise exception 'Apply 010_staff_delivery_tracking.sql first.';end if;
end $guard$;
create or replace function public.assign_order_delivery_contact(p_reference text,p_rider text,p_phone text,p_minutes integer default 45) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;d public.delivery_assignments;phone text;
begin
 perform bitesbro_private.require_role('admin');
 phone:=regexp_replace(trim(p_phone),'[[:space:]()-]','','g');
 perform bitesbro_private.ensure(char_length(trim(p_rider)) between 2 and 80 and char_length(p_phone)<=24 and phone ~ '^\+?[0-9]{7,15}$','Enter the delivery staff member name and a valid phone number.');
 select * into o from public.orders where reference=p_reference and fulfilment='delivery' for update;
 perform bitesbro_private.ensure(found and o.status in('ready','collected'),'Choose a ready or active staff delivery.');
 select * into d from public.delivery_assignments where order_id=o.id for update;
 if d.status in('picked_up','out_for_delivery') then
  perform bitesbro_private.ensure(d.partner_name='BitesBro restaurant staff','Choose a restaurant staff delivery.');
  if d.rider_name=trim(p_rider) and d.rider_phone=phone then return bitesbro_private.order_json(o,true);end if;
  insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||' partner contact updated');
 else
  -- Retain 010's kitchen-readiness, payment, sequence and idempotency checks.
  perform public.assign_order_delivery(p_reference,'BitesBro restaurant staff',trim(p_rider),p_minutes);
 end if;
 update public.delivery_assignments set rider_name=trim(p_rider),rider_phone=phone,updated_at=now() where order_id=o.id;
 select * into o from public.orders where id=o.id;
 return bitesbro_private.order_json(o,true);
end $fn$;
revoke all on function public.assign_order_delivery_contact(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.assign_order_delivery_contact(text,text,text,integer) to authenticated;
-- Name/number were already included only in the owner/admin projection in 007.
-- Existing RLS and chef projections remain unchanged; no public phone endpoint.
insert into public.bitesbro_schema_migrations(version) values(11) on conflict do nothing;
notify pgrst,'reload schema';
commit;
