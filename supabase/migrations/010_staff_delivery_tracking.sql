-- Apply manually after 007; compatible with optional payment and history upgrades.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=7) then raise exception 'Apply 007_order_history_delivery.sql first.';end if;
end $guard$;
alter table public.delivery_assignments add column if not exists partner_name text not null default '' check(char_length(partner_name)<=80);
alter table public.delivery_assignments add column if not exists picked_up_at timestamptz;
alter table public.delivery_assignments add column if not exists estimated_minutes integer not null default 45 check(estimated_minutes between 10 and 180);
alter table public.delivery_assignments drop constraint if exists delivery_assignments_status_check;
alter table public.delivery_assignments add constraint delivery_assignments_status_check check(status in('unassigned','assigned','picked_up','out_for_delivery','delivered','failed','cancelled'));
alter table public.delivery_assignments enable row level security;
alter table public.delivery_events enable row level security;

do $archive$begin
 if to_regprocedure('bitesbro_private.order_json_before_delivery_stages(public.orders,boolean)') is null then
  alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_before_delivery_stages;
  execute $definition$create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select case when o.fulfilment='delivery' then jsonb_set(bitesbro_private.order_json_before_delivery_stages(o,include_private),'{delivery}',
 coalesce(bitesbro_private.order_json_before_delivery_stages(o,include_private)->'delivery','{}'::jsonb)||
 jsonb_build_object('version',10,'estimateDemo',true,'estimatedMinutes',coalesce((select estimated_minutes from public.delivery_assignments where order_id=o.id),45),'pickedUpAt',(select picked_up_at from public.delivery_assignments where order_id=o.id),'restaurantAddress','White Rose Layout, 2nd Cross Rd, near Narayana School, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066','partnerName',coalesce((select partner_name from public.delivery_assignments where order_id=o.id),'')))
 else bitesbro_private.order_json_before_delivery_stages(o,include_private) end
$fn$;$definition$;
 end if;
end $archive$;

create or replace function public.update_order_delivery(p_reference text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;d public.delivery_assignments;blocked boolean;
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_status in('picked_up','out_for_delivery','delivered'),'Choose a supported delivery update.');
 select * into o from public.orders where reference=p_reference and fulfilment='delivery' for update;
 perform bitesbro_private.ensure(found and o.status<>'cancelled','Choose an active delivery order.');
 if to_regclass('public.order_payments') is not null then
  execute 'select exists(select 1 from public.order_payments where order_id=$1 and method<>''cod'' and status<>''paid'')' into blocked using o.id;
  perform bitesbro_private.ensure(not blocked,'Verify payment before dispatch.');
 end if;
 if to_regclass('public.courier_bookings') is not null then
  execute 'select exists(select 1 from public.courier_bookings where order_id=$1)' into blocked using o.id;
  perform bitesbro_private.ensure(not blocked,'Use the courier integration to update this delivery.');
 end if;
 insert into public.delivery_assignments(order_id) values(o.id) on conflict do nothing;
 select * into d from public.delivery_assignments where order_id=o.id for update;
 if d.status=p_status then return bitesbro_private.order_json(o,true);end if;
 if p_status='picked_up' then
  perform bitesbro_private.ensure(o.status in('ready','collected') and d.status='assigned','Assign a delivery partner before confirming pickup.');
  if o.status='ready' then update public.orders set status='collected' where id=o.id;insert into public.order_events(order_id,status,actor_id) values(o.id,'collected',auth.uid());end if;
  update public.delivery_assignments set status='picked_up',picked_up_at=now(),updated_at=now() where order_id=o.id;
 elsif p_status='out_for_delivery' then
  perform bitesbro_private.ensure(d.status='picked_up','Confirm partner pickup before marking the order on the way.');
  update public.delivery_assignments set status=p_status,dispatched_at=now(),updated_at=now() where order_id=o.id;
 else
  perform bitesbro_private.ensure(d.status='out_for_delivery','Mark the order out for delivery before confirming arrival.');
  update public.delivery_assignments set status=p_status,delivered_at=now(),updated_at=now() where order_id=o.id;
 end if;
 insert into public.delivery_events(order_id,status,actor_id) values(o.id,p_status,auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||' delivery marked '||p_status);
 if p_status in('out_for_delivery','delivered') and to_regclass('public.order_notifications') is not null then
  execute 'insert into public.order_notifications(order_id,kind) values($1,$2) on conflict do nothing' using o.id,case when p_status='delivered' then 'delivered' else 'dispatched' end;
 end if;
 select * into o from public.orders where id=o.id;return bitesbro_private.order_json(o,true);
end $fn$;

create or replace function public.assign_order_delivery(p_reference text,p_partner text,p_rider text default '',p_minutes integer default 45) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;d public.delivery_assignments;blocked boolean;
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_minutes between 10 and 180,'Choose a demo journey time between 10 and 180 minutes.');
 perform bitesbro_private.ensure(trim(p_partner)='BitesBro restaurant staff' and char_length(coalesce(p_rider,''))<=80,'Use the restaurant staff delivery partner and a staff name up to 80 characters.');
 select * into o from public.orders where reference=p_reference and fulfilment='delivery' for update;
 perform bitesbro_private.ensure(found and o.status in('ready','collected'),'Wait until the kitchen marks this delivery ready.');
 if to_regclass('public.order_payments') is not null then
  execute 'select exists(select 1 from public.order_payments where order_id=$1 and method<>''cod'' and status<>''paid'')' into blocked using o.id;
  perform bitesbro_private.ensure(not blocked,'Verify payment before assigning a delivery partner.');
 end if;
 if to_regclass('public.courier_bookings') is not null then
  execute 'select exists(select 1 from public.courier_bookings where order_id=$1)' into blocked using o.id;
  perform bitesbro_private.ensure(not blocked,'Use the courier integration to assign this delivery.');
 end if;
 insert into public.delivery_assignments(order_id) values(o.id) on conflict do nothing;
 select * into d from public.delivery_assignments where order_id=o.id for update;
 perform bitesbro_private.ensure(d.status in('unassigned','assigned','failed'),'This delivery has already been picked up or completed.');
 if d.status='assigned' and d.partner_name=trim(p_partner) and d.rider_name=trim(coalesce(p_rider,'')) and d.estimated_minutes=p_minutes then return bitesbro_private.order_json(o,true);end if;
 update public.delivery_assignments set status='assigned',estimated_minutes=p_minutes,partner_name=trim(p_partner),rider_name=trim(coalesce(p_rider,'')),assigned_at=now(),updated_at=now() where order_id=o.id;
 insert into public.delivery_events(order_id,status,actor_id) values(o.id,'assigned',auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||' delivery partner assigned');
 return bitesbro_private.order_json(o,true);
end $fn$;

revoke all on function public.assign_order_delivery(text,text,text,integer),public.update_order_delivery(text,text) from public,anon,authenticated;
grant execute on function public.assign_order_delivery(text,text,text,integer),public.update_order_delivery(text,text) to authenticated;
revoke all on function bitesbro_private.order_json(public.orders,boolean) from public,anon,authenticated;

-- Publish the owner's confirmed pickup address without changing hours or prices.
do $cafe$begin
 if to_regprocedure('bitesbro_private.get_cafe_before_staff_delivery()') is null then
  alter function public.get_cafe() set schema bitesbro_private;
  alter function bitesbro_private.get_cafe() rename to get_cafe_before_staff_delivery;
 end if;
end $cafe$;
create or replace function public.get_cafe() returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.get_cafe_before_staff_delivery()||jsonb_build_object('address','White Rose Layout, 2nd Cross Rd, near Narayana School, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066')
$fn$;
revoke all on function public.get_cafe() from public,anon,authenticated;
grant execute on function public.get_cafe() to anon,authenticated;
revoke all on function bitesbro_private.get_cafe_before_staff_delivery() from public,anon,authenticated;

insert into public.bitesbro_schema_migrations(version) values(10) on conflict do nothing;
notify pgrst,'reload schema';
commit;
