-- Forward migration after 003. Existing menu, users, orders and photographs remain.
begin;
alter table public.orders add column if not exists delivery_lat double precision check(delivery_lat between 12.5 and 13.5);
alter table public.orders add column if not exists delivery_lng double precision check(delivery_lng between 77.0 and 78.2);
create table if not exists public.courier_quotes(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 provider text not null check(provider='porter'),amount integer not null check(amount between 1 and 500000),
 currency text not null check(currency='INR'),vehicle text not null,
 delivery_lat double precision not null,delivery_lng double precision not null,
 expires_at timestamptz not null default now()+interval '5 minutes',created_at timestamptz not null default now()
);
create table if not exists public.courier_bookings(
 order_id uuid primary key references public.orders(id),quote_id uuid not null references public.courier_quotes(id),
 request_id uuid not null unique,provider text not null check(provider='porter'),provider_id text unique,
 status text not null check(status in ('booking','booked','out_for_delivery','delivered','cancelled','needs_review')),
 updated_at timestamptz not null default now()
);
create or replace function public.set_delivery_location(p_reference text,p_lat double precision,p_lng double precision) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_lat between 12.5 and 13.5 and p_lng between 77.0 and 78.2,'Enter a Bangalore delivery pin.');
 perform bitesbro_private.ensure(not exists(select 1 from public.courier_bookings b join public.orders o on o.id=b.order_id where o.reference=p_reference),'The courier booking already holds the delivery location.');
 update public.orders set delivery_lat=p_lat,delivery_lng=p_lng where reference=p_reference and fulfilment='delivery' and status not in ('cancelled','collected');
 perform bitesbro_private.ensure(found,'This delivery location can no longer be changed.');
 update public.courier_quotes set expires_at=now() where order_id=(select id from public.orders where reference=p_reference);
end $fn$;
create or replace function public.service_delivery_context(p_reference text) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare o public.orders; b public.courier_bookings;
begin
 select * into o from public.orders where reference=p_reference and fulfilment='delivery';
 perform bitesbro_private.ensure(found and o.status<>'cancelled','Choose an active delivery.');
 select * into b from public.courier_bookings where order_id=o.id;
 return jsonb_build_object('reference',o.reference,'name',o.name,'phone',o.phone,'address',o.address,'postcode',o.postcode,'lat',o.delivery_lat,'lng',o.delivery_lng,
 'date',o.pickup_date,'time',to_char(o.pickup_time,'HH24:MI'),'providerId',b.provider_id);
end $fn$;
create or replace function public.service_delivery_quote(p_reference text,p_amount integer,p_currency text,p_vehicle text,p_lat double precision,p_lng double precision) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare q public.courier_quotes;
begin
 insert into public.courier_quotes(order_id,provider,amount,currency,vehicle,delivery_lat,delivery_lng)
 select id,'porter',p_amount,p_currency,p_vehicle,p_lat,p_lng from public.orders where reference=p_reference and fulfilment='delivery' and status<>'cancelled' and delivery_lat=p_lat and delivery_lng=p_lng returning * into q;
 perform bitesbro_private.ensure(found,'This delivery is not available.');
 return jsonb_build_object('quoteId',q.id,'amount',q.amount,'currency',q.currency,'expiresAt',q.expires_at);
end $fn$;
create or replace function public.service_delivery_begin(p_quote uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare q public.courier_quotes;o public.orders;b public.courier_bookings;
begin
 select * into q from public.courier_quotes where id=p_quote;
 perform bitesbro_private.ensure(found and q.expires_at>now(),'The courier quote expired. Request a fresh quote.');
 select * into o from public.orders where id=q.order_id for update;
 perform bitesbro_private.ensure(o.status='ready','Wait until the kitchen marks this order ready.');
 perform bitesbro_private.ensure(o.delivery_lat=q.delivery_lat and o.delivery_lng=q.delivery_lng,'The delivery pin changed. Request a fresh quote.');
 perform bitesbro_private.ensure(not exists(select 1 from public.order_payments where order_id=o.id and method<>'cod' and status<>'paid'),'Verify payment before courier booking.');
 select * into b from public.courier_bookings where order_id=o.id;
 if found then
  perform bitesbro_private.ensure(b.status in ('booked','out_for_delivery','delivered'),'This booking requires review before another request can be made.');
  return jsonb_build_object('existing',true,'providerId',b.provider_id);
 end if;
 perform bitesbro_private.ensure(not exists(select 1 from public.delivery_assignments where order_id=o.id and status not in ('unassigned','failed')),'A rider is already assigned. Resolve that assignment before booking a courier.');
 insert into public.courier_bookings(order_id,quote_id,request_id,provider,status) values(o.id,p_quote,p_request,'porter','booking');
 return public.service_delivery_context(o.reference)||jsonb_build_object('requestId',p_request,'amount',q.amount);
end $fn$;
do $dispatch_archive$begin
 if to_regprocedure('bitesbro_private.dispatch_delivery_v3(text,text,text,text,text)') is null then
  alter function public.dispatch_delivery(text,text,text,text,text) set schema bitesbro_private;
  alter function bitesbro_private.dispatch_delivery(text,text,text,text,text) rename to dispatch_delivery_v3;
 end if;
end $dispatch_archive$;
create or replace function public.dispatch_delivery(p_reference text,p_status text,p_rider_name text default '',p_rider_phone text default '',p_notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform 1 from public.orders where reference=p_reference for update;
 perform bitesbro_private.ensure(not exists(select 1 from public.courier_bookings b join public.orders o on o.id=b.order_id where o.reference=p_reference),'Use the confirmed courier booking to update this delivery.');
 return bitesbro_private.dispatch_delivery_v3(p_reference,p_status,p_rider_name,p_rider_phone,p_notes);
end $fn$;
create or replace function public.service_delivery_plan(p_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare q public.courier_quotes;o public.orders;
begin
 select * into q from public.courier_quotes where id=p_quote;
 perform bitesbro_private.ensure(found and q.expires_at>now(),'The courier quote expired. Request a fresh quote.');
 select * into o from public.orders where id=q.order_id;
 perform bitesbro_private.ensure(o.delivery_lat=q.delivery_lat and o.delivery_lng=q.delivery_lng,'The delivery pin changed. Request a fresh quote.');
 return public.service_delivery_context(o.reference)||jsonb_build_object('amount',q.amount);
end $fn$;
create or replace function public.service_delivery_booked(p_request uuid,p_provider text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 update public.courier_bookings set provider_id=p_provider,updated_at=now() where request_id=p_request and status='booking';
 perform bitesbro_private.ensure(found,'Courier booking state changed.');
end $fn$;
create or replace function public.service_delivery_failed(p_request uuid) returns void
language sql security definer set search_path='' as $fn$
 update public.courier_bookings set status='needs_review',updated_at=now() where request_id=p_request and status='booking'
$fn$;
create or replace function public.service_delivery_status(p_reference text,p_status text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;b public.courier_bookings;d_status text;
begin
 perform bitesbro_private.ensure(p_status in ('booked','out_for_delivery','delivered','cancelled'),'Unsupported courier status.');
 select * into o from public.orders where reference=p_reference for update;
 select * into b from public.courier_bookings where order_id=o.id for update;
 perform bitesbro_private.ensure(found and b.provider_id is not null,'No confirmed courier booking.');
 if b.status in ('delivered','cancelled') or b.status=p_status then return;end if;
 if p_status='booked' and b.status='out_for_delivery' then return;end if;
 update public.courier_bookings set status=p_status,updated_at=now() where order_id=o.id;
 d_status:=case when p_status='booked' then 'assigned' else p_status end;
 update public.delivery_assignments set status=d_status,updated_at=now(),dispatched_at=case when p_status='out_for_delivery' then now() else dispatched_at end,delivered_at=case when p_status='delivered' then now() else delivered_at end where order_id=o.id;
 if p_status in ('out_for_delivery','delivered') and o.status='ready' then update public.orders set status='collected' where id=o.id;insert into public.order_events(order_id,status) values(o.id,'collected');end if;
 insert into public.delivery_events(order_id,status) values(o.id,d_status);
 if p_status in ('out_for_delivery','delivered') then insert into public.order_notifications(order_id,kind) values(o.id,case when p_status='delivered' then 'delivered' else 'dispatched' end) on conflict do nothing;end if;
end $fn$;
do $archive$begin
 if to_regprocedure('bitesbro_private.order_json_v3(public.orders,boolean)') is null then alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_v3;end if;
end $archive$;
create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_json_v3(o,include_private)||jsonb_build_object('deliveryLocation',case when include_private then jsonb_build_object('lat',o.delivery_lat,'lng',o.delivery_lng) else null end,
 'courier',(select jsonb_build_object('provider',b.provider,'status',b.status,'providerId',case when include_private then b.provider_id else null end,'amount',q.amount) from public.courier_bookings b join public.courier_quotes q on q.id=b.quote_id where b.order_id=o.id))
$fn$;
alter table public.courier_quotes enable row level security;alter table public.courier_bookings enable row level security;
revoke all on public.courier_quotes,public.courier_bookings from public,anon,authenticated;
grant select on public.courier_quotes,public.courier_bookings to authenticated;
drop policy if exists bitesbro_courier_quotes_read on public.courier_quotes;
create policy bitesbro_courier_quotes_read on public.courier_quotes for select to authenticated using((select public.my_role())='admin');
drop policy if exists bitesbro_courier_bookings_read on public.courier_bookings;
create policy bitesbro_courier_bookings_read on public.courier_bookings for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
revoke all on function public.service_delivery_context(text),public.service_delivery_quote(text,integer,text,text,double precision,double precision),public.service_delivery_begin(uuid,uuid),public.service_delivery_plan(uuid),public.service_delivery_booked(uuid,text),public.service_delivery_status(text,text),public.service_delivery_failed(uuid) from public,anon,authenticated;
grant execute on function public.service_delivery_context(text),public.service_delivery_quote(text,integer,text,text,double precision,double precision),public.service_delivery_begin(uuid,uuid),public.service_delivery_plan(uuid),public.service_delivery_booked(uuid,text),public.service_delivery_status(text,text),public.service_delivery_failed(uuid) to service_role;
revoke all on function public.set_delivery_location(text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.set_delivery_location(text,double precision,double precision) to authenticated;
revoke all on function public.dispatch_delivery(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dispatch_delivery(text,text,text,text,text) to authenticated;
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(4) on conflict do nothing;
notify pgrst,'reload schema';commit;
