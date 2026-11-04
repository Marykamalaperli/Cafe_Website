-- Apply after 003 and 004. YouPI MANUAL_UPI claims never mark a payment paid.
begin;
create table if not exists public.youpi_sessions(
 order_id uuid primary key references public.orders(id),attempt uuid not null,
 payment_id text unique check(char_length(payment_id) between 1 and 100),
 checkout_url text check(checkout_url like 'https://%'),
 gateway_status text not null default 'INITIATED',claimed_utr text,
 updated_at timestamptz not null default now()
);
create table if not exists public.youpi_webhook_events(
 delivery_id uuid primary key,order_id uuid not null references public.orders(id),
 payment_id text not null,gateway_status text not null,
 received_at timestamptz not null default now()
);
create or replace function public.service_youpi_begin(p_reference text,p_user uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;s public.youpi_sessions;
begin
 select * into o from public.orders where reference=p_reference and user_id=p_user for update;
 perform bitesbro_private.ensure(found and o.status='received','This order cannot open a payment checkout.');
 select * into p from public.order_payments where order_id=o.id;
 perform bitesbro_private.ensure(p.method='upi' and p.status in ('pending','submitted'),'This order does not need a UPI payment.');
 select * into s from public.youpi_sessions where order_id=o.id;
 if s.payment_id is not null then
  return jsonb_build_object('reference',o.reference,'amount',p.amount,'paymentId',s.payment_id,'checkoutUrl',s.checkout_url,'status',s.gateway_status);
 end if;
 perform bitesbro_private.ensure(not found or s.updated_at<now()-interval '2 minutes','Checkout is being prepared. Check My orders before retrying.');
 insert into public.youpi_sessions(order_id,attempt) values(o.id,p_attempt)
 on conflict(order_id) do update set attempt=excluded.attempt,updated_at=now();
 return jsonb_build_object('reference',o.reference,'amount',p.amount,'currency','INR');
end $fn$;
create or replace function public.service_youpi_created(p_reference text,p_attempt uuid,p_payment text,p_checkout text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 update public.youpi_sessions set payment_id=p_payment,checkout_url=p_checkout,updated_at=now()
 where order_id=(select id from public.orders where reference=p_reference) and attempt=p_attempt and payment_id is null;
 perform bitesbro_private.ensure(found,'Checkout setup changed. Contact the restaurant before retrying.');
end $fn$;
create or replace function public.service_youpi_context(p_reference text,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 select jsonb_build_object('reference',o.reference,'amount',p.amount,'paymentId',s.payment_id,'checkoutUrl',s.checkout_url,'status',s.gateway_status)
 into result from public.orders o join public.order_payments p on p.order_id=o.id join public.youpi_sessions s on s.order_id=o.id
 where o.reference=p_reference and o.user_id=p_user and s.payment_id is not null;
 perform bitesbro_private.ensure(result is not null,'This checkout is not available to this account.');
 return result;
end $fn$;
create or replace function public.service_youpi_claim(p_delivery uuid,p_reference text,p_payment text,p_amount integer,p_currency text,p_status text,p_utr text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;s public.youpi_sessions;
begin
 perform bitesbro_private.ensure(p_status in ('MANUAL_REVIEW','OBSERVED_SUCCESS','RECONCILED','SUCCESS','FAILED','EXPIRED','CANCELLED'),'Unsupported YouPI outcome.');
 select * into o from public.orders where reference=p_reference for update;
 perform bitesbro_private.ensure(found,'Unknown YouPI order.');
 select * into p from public.order_payments where order_id=o.id for update;
 select * into s from public.youpi_sessions where order_id=o.id for update;
 perform bitesbro_private.ensure(s.payment_id=p_payment and p.method='upi' and p.amount=p_amount and p_currency='INR','The YouPI event does not match the saved checkout.');
 insert into public.youpi_webhook_events(delivery_id,order_id,payment_id,gateway_status) values(p_delivery,o.id,p_payment,p_status) on conflict do nothing;
 if not found then return;end if;
 update public.youpi_sessions set gateway_status=p_status,claimed_utr=case when p_utr ~ '^[0-9]{12}$' then p_utr else claimed_utr end,updated_at=now() where order_id=o.id;
 -- All gateway statuses, including RECONCILED, remain claims in this manual
 -- integration. Only confirm_upi_receipt (authenticated administrator) pays it.
 if p_utr ~ '^[0-9]{12}$' and p_status in ('MANUAL_REVIEW','OBSERVED_SUCCESS','RECONCILED') and o.status='received' and p.status in ('pending','submitted') and (p.bank_reference is null or p.bank_reference=p_utr) then
  update public.order_payments set status='submitted',bank_reference=p_utr,updated_at=now() where order_id=o.id;
 end if;
end $fn$;
do $archive$begin
 if to_regprocedure('bitesbro_private.order_json_v4(public.orders,boolean)') is null then alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_v4;end if;
end $archive$;
create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_json_v4(o,include_private)||case when include_private then jsonb_build_object('youpi',(select jsonb_build_object('paymentId',payment_id,'status',gateway_status,'claimedReference',claimed_utr) from public.youpi_sessions where order_id=o.id)) else '{}'::jsonb end
$fn$;
alter table public.youpi_sessions enable row level security;alter table public.youpi_webhook_events enable row level security;
revoke all on public.youpi_sessions,public.youpi_webhook_events from public,anon,authenticated;
revoke all on function public.service_youpi_begin(text,uuid,uuid),public.service_youpi_created(text,uuid,text,text),public.service_youpi_context(text,uuid),public.service_youpi_claim(uuid,text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.service_youpi_begin(text,uuid,uuid),public.service_youpi_created(text,uuid,text,text),public.service_youpi_context(text,uuid),public.service_youpi_claim(uuid,text,text,integer,text,text,text) to service_role;
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(5) on conflict do nothing;
notify pgrst,'reload schema';commit;
