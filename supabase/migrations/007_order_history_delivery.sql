-- Apply after 006_guest_checkout.sql. No orders or customer data are deleted.
-- Guests see their latest three orders and can continue tracking older active
-- orders. Members retain all orders, with five records per history page.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=6) then
  raise exception 'Apply 006_guest_checkout.sql before this migration.';
 end if;
end $guard$;

create table if not exists public.delivery_assignments(
 order_id uuid primary key references public.orders(id),
 status text not null default 'unassigned' check(status in ('unassigned','assigned','out_for_delivery','delivered','failed','cancelled')),
 rider_name text not null default '' check(char_length(rider_name)<=80),
 rider_phone text not null default '' check(char_length(rider_phone)<=24),
 notes text not null default '' check(char_length(notes)<=300),
 assigned_at timestamptz,dispatched_at timestamptz,delivered_at timestamptz,updated_at timestamptz not null default now()
);
create table if not exists public.delivery_events(
 id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),
 status text not null,actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index if not exists delivery_events_order_idx on public.delivery_events(order_id,id);
insert into public.delivery_assignments(order_id,status)
 select id,case when status='cancelled' then 'cancelled' else 'unassigned' end from public.orders where fulfilment='delivery'
 on conflict do nothing;

create or replace function bitesbro_private.order_is_active(o public.orders) returns boolean
language sql stable security definer set search_path='' as $fn$
 select o.status<>'cancelled' and (case when o.fulfilment='pickup' then o.status<>'collected'
 else not exists(select 1 from public.delivery_assignments d where d.order_id=o.id and d.status='delivered') end)
$fn$;
create or replace function public.can_read_order(p_order uuid) returns boolean
language plpgsql stable security definer set search_path='' as $fn$
declare r text:=public.my_role();o public.orders;guest boolean;
begin
 if r='admin' then return true;end if;
 if r is distinct from 'customer' then return false;end if;
 select * into o from public.orders where id=p_order and user_id=auth.uid();
 if not found then return false;end if;
 select is_anonymous into guest from auth.users where id=auth.uid();
 return not coalesce(guest,false) or bitesbro_private.order_is_active(o) or o.id in
  (select id from public.orders where user_id=auth.uid() order by created_at desc,id desc limit 3);
end $fn$;

do $archive$begin
 if to_regprocedure('bitesbro_private.order_json_before_history(public.orders,boolean)') is null then
  alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_before_history;
 end if;
 if to_regprocedure('bitesbro_private.get_operations_before_history()') is null then
  alter function public.get_operations() set schema bitesbro_private;
  alter function bitesbro_private.get_operations() rename to get_operations_before_history;
 end if;
 if to_regprocedure('bitesbro_private.transition_order_before_history(text,text)') is null then
  alter function public.transition_order(text,text) set schema bitesbro_private;
  alter function bitesbro_private.transition_order(text,text) rename to transition_order_before_history;
 end if;
 if to_regprocedure('bitesbro_private.place_order_before_history(jsonb)') is null then
  alter function public.place_order(jsonb) set schema bitesbro_private;
  alter function bitesbro_private.place_order(jsonb) rename to place_order_before_history;
 end if;
end $archive$;
create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_json_before_history(o,include_private)||jsonb_build_object('delivery',
 case when o.fulfilment='delivery' then coalesce((select jsonb_build_object('status',d.status,
 'riderName',case when include_private then d.rider_name else '' end,'riderPhone',case when include_private then d.rider_phone else '' end,
 'timeline',(select coalesce(jsonb_agg(jsonb_build_object('status',e.status,'at',e.created_at) order by e.id),'[]') from public.delivery_events e where e.order_id=o.id))
 from public.delivery_assignments d where d.order_id=o.id),jsonb_build_object('status',case when o.status='cancelled' then 'cancelled' else 'unassigned' end,'timeline','[]'::jsonb)) else null end)
$fn$;

create or replace function public.get_order_history(p_page integer default 0,p_search text default '',p_reference text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare guest boolean;page_size integer;total integer;items jsonb;active jsonb;selected jsonb;query text:=lower(trim(coalesce(p_search,'')));
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(p_page between 0 and 1000000 and char_length(query)<=80 and coalesce(char_length(p_reference),0)<=80,'Check the history page or reference.');
 select is_anonymous into guest from auth.users where id=auth.uid();page_size:=case when guest then 3 else 5 end;
 perform bitesbro_private.ensure(not guest or p_page=0,'Guest history contains only the latest three orders.');
 select count(*) into total from public.orders o where o.user_id=auth.uid() and position(query in lower(o.reference))>0
 and (not guest or o.id in(select id from public.orders where user_id=auth.uid() order by created_at desc,id desc limit 3));
 select coalesce(jsonb_agg(bitesbro_private.order_json(o,true) order by o.created_at desc,o.id desc),'[]') into items
 from(select * from public.orders o where o.user_id=auth.uid() and position(query in lower(o.reference))>0
 and (not guest or o.id in(select id from public.orders where user_id=auth.uid() order by created_at desc,id desc limit 3))
 order by created_at desc,id desc limit page_size offset p_page*page_size)o;
 select coalesce(jsonb_agg(bitesbro_private.order_json(o,true) order by o.created_at desc,o.id desc),'[]') into active
 from public.orders o where o.user_id=auth.uid() and bitesbro_private.order_is_active(o);
 if p_reference is not null then
  select bitesbro_private.order_json(o,true) into selected from public.orders o where o.reference=p_reference and public.can_read_order(o.id);
 end if;
 return jsonb_build_object('categories',public.get_menu()->'categories','menu',public.get_menu()->'items',
 'orders',items,'activeOrders',active,'selectedOrder',selected,'historyVersion',7,
 'history',jsonb_build_object('items',items,'page',p_page,'pageSize',page_size,'total',total,'guest',guest,
 'hasOlder',not guest and (p_page+1)*page_size<total,'hasNewer',not guest and p_page>0,'staffRecordsRetained',true),
 'settings',(select jsonb_build_object('acceptingOrders',accepting_orders,'prepMinutes',prep_minutes) from public.restaurant_settings where id),'activity','[]'::jsonb);
end $fn$;
create or replace function public.get_operations() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare r text:=bitesbro_private.require_role('customer','chef','admin');
begin
 if r='customer' then return public.get_order_history();end if;
 return bitesbro_private.get_operations_before_history()||jsonb_build_object('historyVersion',7);
end $fn$;
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare existing uuid;result jsonb;
begin
 perform bitesbro_private.require_role('customer');
 select id into existing from public.orders where user_id=auth.uid() and request_id=(p->>'requestId')::uuid;
 perform bitesbro_private.ensure(existing is null or public.can_read_order(existing),'This guest order is outside the available history.');
 result:=bitesbro_private.place_order_before_history(p);
 insert into public.delivery_assignments(order_id)
  select id from public.orders where reference=result->>'reference' and user_id=auth.uid() and fulfilment='delivery' on conflict do nothing;
 return result;
end $fn$;

create or replace function public.update_order_delivery(p_reference text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;d public.delivery_assignments;blocked boolean;
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_status in('out_for_delivery','delivered'),'Choose a supported delivery update.');
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
 if p_status='out_for_delivery' then
  perform bitesbro_private.ensure(o.status in('ready','collected') and d.status in('unassigned','assigned','failed'),'Wait until the kitchen marks this order ready.');
  if o.status='ready' then update public.orders set status='collected' where id=o.id;insert into public.order_events(order_id,status,actor_id) values(o.id,'collected',auth.uid());end if;
  update public.delivery_assignments set status=p_status,dispatched_at=now(),updated_at=now() where order_id=o.id;
 else
  perform bitesbro_private.ensure(d.status='out_for_delivery','Mark the order out for delivery before confirming arrival.');
  update public.delivery_assignments set status=p_status,delivered_at=now(),updated_at=now() where order_id=o.id;
 end if;
 insert into public.delivery_events(order_id,status,actor_id) values(o.id,p_status,auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||' delivery marked '||p_status);
 if to_regclass('public.order_notifications') is not null then
  execute 'insert into public.order_notifications(order_id,kind) values($1,$2) on conflict do nothing' using o.id,case when p_status='delivered' then 'delivered' else 'dispatched' end;
 end if;
 select * into o from public.orders where id=o.id;return bitesbro_private.order_json(o,true);
end $fn$;
create or replace function public.transition_order(p_reference text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
 perform bitesbro_private.require_role('customer','chef','admin');
 if p_status='collected' and exists(select 1 from public.orders where reference=p_reference and fulfilment='delivery') then
  raise exception 'Use the administrator delivery actions to dispatch this order.' using errcode='22023';
 end if;
 result:=bitesbro_private.transition_order_before_history(p_reference,p_status);
 if p_status='cancelled' then
  update public.delivery_assignments set status='cancelled',updated_at=now() where order_id=(select id from public.orders where reference=p_reference);
 end if;
 return result;
end $fn$;

alter table public.delivery_assignments enable row level security;alter table public.delivery_events enable row level security;
revoke all on public.delivery_assignments,public.delivery_events from public,anon,authenticated;
grant select on public.delivery_assignments,public.delivery_events to authenticated;
drop policy if exists bitesbro_delivery_read on public.delivery_assignments;
create policy bitesbro_delivery_read on public.delivery_assignments for select to authenticated using(public.can_read_order(order_id));
drop policy if exists bitesbro_delivery_events_read on public.delivery_events;
create policy bitesbro_delivery_events_read on public.delivery_events for select to authenticated using(public.can_read_order(order_id));
drop policy if exists bitesbro_orders_read on public.orders;
create policy bitesbro_orders_read on public.orders for select to authenticated using(public.can_read_order(id));
revoke all on function public.can_read_order(uuid),public.get_order_history(integer,text,text),public.get_operations(),public.update_order_delivery(text,text),public.transition_order(text,text),public.place_order(jsonb) from public,anon,authenticated;
grant execute on function public.can_read_order(uuid),public.get_order_history(integer,text,text),public.get_operations(),public.update_order_delivery(text,text),public.transition_order(text,text),public.place_order(jsonb) to authenticated;
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(7) on conflict do nothing;
notify pgrst,'reload schema';commit;
