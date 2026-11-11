-- Run manually after 007 (compatible with optional 008). No orders are deleted.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=7) then
  raise exception 'Apply 007_order_history_delivery.sql first.';
 end if;
end $guard$;
create table if not exists bitesbro_private.guest_order_transfers(
 guest_id uuid primary key references auth.users(id),
 customer_id uuid not null references auth.users(id),
 claimed_at timestamptz,
 order_count integer not null default 0,
 created_at timestamptz not null default now()
);
revoke all on bitesbro_private.guest_order_transfers from public,anon,authenticated;

-- Only the guest's JWT can authorize a destination; a supplied guest UUID or
-- matching contact email can never authorize a claim by a registered account.
create or replace function public.prepare_guest_order_transfer(p_customer uuid) returns void
language plpgsql security definer set search_path='' as $fn$
declare existing bitesbro_private.guest_order_transfers;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(exists(select 1 from auth.users where id=auth.uid() and is_anonymous),'A current guest session is required.');
 perform bitesbro_private.ensure(exists(select 1 from auth.users u join public.user_roles r on r.user_id=u.id where u.id=p_customer and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now()) and r.role='customer'),'Choose a confirmed customer account.');
 perform pg_advisory_xact_lock(hashtextextended('bitesbro-guest-orders:'||auth.uid()::text,0));
 select * into existing from bitesbro_private.guest_order_transfers where guest_id=auth.uid() for update;
 perform bitesbro_private.ensure(existing.claimed_at is null or existing.customer_id=p_customer,'These guest orders already belong to another customer account.');
 insert into bitesbro_private.guest_order_transfers(guest_id,customer_id) values(auth.uid(),p_customer)
 on conflict(guest_id) do update set customer_id=excluded.customer_id,created_at=now() where guest_order_transfers.claimed_at is null;
end $fn$;

create or replace function public.claim_guest_orders(p_guest uuid) returns integer
language plpgsql security definer set search_path='' as $fn$
declare grant_row bitesbro_private.guest_order_transfers; moved integer;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(exists(select 1 from auth.users where id=auth.uid() and not coalesce(is_anonymous,false) and email_confirmed_at is not null),'Sign in with a confirmed customer account.');
 perform pg_advisory_xact_lock(hashtextextended('bitesbro-guest-orders:'||p_guest::text,0));
 select * into grant_row from bitesbro_private.guest_order_transfers where guest_id=p_guest for update;
 perform bitesbro_private.ensure(grant_row.customer_id=auth.uid(),'This guest session has not authorized your account.');
 if grant_row.claimed_at is not null then return grant_row.order_count;end if;
 perform bitesbro_private.ensure(grant_row.created_at>now()-interval '10 minutes' and exists(select 1 from auth.users where id=p_guest and is_anonymous and (banned_until is null or banned_until<now())),'The guest transfer authorization expired. Retry signing in from the guest browser.');
 update public.orders set user_id=auth.uid() where user_id=p_guest;
 get diagnostics moved=row_count;
 update bitesbro_private.guest_order_transfers set claimed_at=now(),order_count=moved where guest_id=p_guest;
 return moved;
end $fn$;

-- Serialize against order placement and stop stale guest tabs creating orders
-- under an identity whose history has already moved to a customer account.
create or replace function bitesbro_private.limit_guest_orders() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from auth.users where id=new.user_id and is_anonymous) then
  perform pg_advisory_xact_lock(hashtextextended('bitesbro-guest-orders:'||new.user_id::text,0));
  perform bitesbro_private.ensure(not exists(select 1 from bitesbro_private.guest_order_transfers where guest_id=new.user_id and claimed_at is not null),'Your guest history has moved. Sign in with your customer account to continue ordering.');
  perform bitesbro_private.ensure((select count(*) from public.orders where user_id=new.user_id and created_at>now()-interval '1 hour')<10,'The guest order limit has been reached. Please wait before placing another order.');
 end if;
 return new;
end $fn$;
revoke all on function public.prepare_guest_order_transfer(uuid),public.claim_guest_orders(uuid) from public,anon,authenticated;
grant execute on function public.prepare_guest_order_transfer(uuid),public.claim_guest_orders(uuid) to authenticated;
revoke all on function bitesbro_private.limit_guest_orders() from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(9) on conflict do nothing;
notify pgrst,'reload schema';
commit;
