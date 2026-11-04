-- Run manually in SQL Editor after the existing version-2 baseline.
-- Versions 3-5 belong to the separate payment review and are not prerequisites.
-- Also enable Authentication > Sign In / Providers > Anonymous Sign-Ins.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=2) then
  raise exception 'Apply the existing BitesBro version-2 setup first.';
 end if;
end $guard$;

-- Supabase supplies the protected is_anonymous field. User-editable metadata
-- never determines whether an account is a guest or a member of staff.
create or replace function public.my_role() returns text
language sql stable security definer set search_path='' as $fn$
 select r.role from public.user_roles r join auth.users u on u.id=r.user_id
 where r.user_id=auth.uid() and (u.banned_until is null or u.banned_until<now())
 and ((coalesce(u.is_anonymous,false) and r.role='customer')
   or (not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null))
$fn$;

-- Reservations, messages and subscriptions retain their confirmed-account rule.
create or replace function bitesbro_private.customer_fields(p jsonb) returns text
language plpgsql stable security definer set search_path='' as $fn$
declare email_address text;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(jsonb_typeof(p)='object' and p->'consent'='true'::jsonb and coalesce(p->>'website','')='', 'Your privacy consent is required.');
 select email into email_address from auth.users where id=auth.uid() and not coalesce(is_anonymous,false) and email_confirmed_at is not null;
 if not found then raise exception 'Sign in with a confirmed customer account to use this form.' using errcode='42501';end if;
 return email_address;
end $fn$;

create or replace function bitesbro_private.order_customer_fields(p jsonb) returns text
language plpgsql stable security definer set search_path='' as $fn$
declare email_address text;
begin
 perform bitesbro_private.require_role('customer');
 if not exists(select 1 from auth.users where id=auth.uid() and is_anonymous) then
  return bitesbro_private.customer_fields(p);
 end if;
 perform bitesbro_private.ensure(jsonb_typeof(p)='object' and p->'consent'='true'::jsonb and coalesce(p->>'website','')='', 'Your privacy consent is required.');
 email_address:=lower(trim(p->>'email'));
 perform bitesbro_private.ensure(char_length(email_address) between 3 and 254 and email_address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$','Use a valid contact email for your order.');
 -- This is unverified contact information, not an authenticated email identity.
 -- Ownership remains the guest Auth UUID and never the submitted email.
 return email_address;
end $fn$;

-- Keep the existing authoritative price/slot/option logic intact. When the
-- optional payment review exists, adapt its archived pricing core rather than
-- replacing the outer payment checks.
do $adapt$
declare core regprocedure; definition text;
begin
 core:=coalesce(to_regprocedure('bitesbro_private.place_order_v2(jsonb)'),to_regprocedure('public.place_order(jsonb)'));
 definition:=pg_get_functiondef(core);
 if position('bitesbro_private.order_customer_fields(p)' in definition)=0 then
  if position('bitesbro_private.customer_fields(p)' in definition)=0 then
   raise exception 'The order function differs from the supported baseline. Review before enabling guest checkout.';
  end if;
  execute replace(definition,'bitesbro_private.customer_fields(p)','bitesbro_private.order_customer_fields(p)');
 end if;
end $adapt$;

-- Bound guest order creation without changing member ordering or retry safety.
create or replace function bitesbro_private.limit_guest_orders() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from auth.users where id=new.user_id and is_anonymous) then
  perform pg_advisory_xact_lock(hashtextextended('bitesbro-guest-orders:'||new.user_id::text,0));
  perform bitesbro_private.ensure((select count(*) from public.orders where user_id=new.user_id and created_at>now()-interval '1 hour')<10,'The guest order limit has been reached. Please wait before placing another order.');
 end if;
 return new;
end $fn$;
drop trigger if exists bitesbro_guest_order_limit on public.orders;
create trigger bitesbro_guest_order_limit before insert on public.orders for each row execute function bitesbro_private.limit_guest_orders();

create or replace function public.get_guest_checkout_status() returns jsonb
language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object('enabled',true,'guestOrdersPerHour',10)
$fn$;
revoke all on function public.get_guest_checkout_status() from public,anon,authenticated;
grant execute on function public.get_guest_checkout_status() to anon,authenticated;
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(6) on conflict do nothing;
notify pgrst,'reload schema';
commit;
