-- Forward-only payment extension for the working guest/history schema (version 7).
-- Run manually in Supabase SQL Editor. Real payments remain disabled by default.
begin;
do $guard$begin
 if not exists(select 1 from public.bitesbro_schema_migrations where version=7) then
  raise exception 'Apply 007_order_history_delivery.sql first.';
 end if;
 if to_regclass('public.order_payments') is not null and not exists(select 1 from public.bitesbro_schema_migrations where version=8) then
  raise exception 'An earlier payment preview or unrelated payment table exists. Do not mix preview migrations 003-005 with this upgrade.';
 end if;
end $guard$;

alter table public.restaurant_settings add column if not exists online_payments_enabled boolean not null default false;
create table if not exists public.order_payments(
 order_id uuid primary key references public.orders(id),
 method text not null check(method in('cod','youpi')),
 status text not null check(status in('unrecorded','due','pending','submitted','failed','expired','paid','cancelled','refund_pending','refunded')),
 amount integer not null check(amount>0),currency text not null default 'INR' check(currency='INR'),
 bank_reference text check(bank_reference ~ '^[0-9]{12}$'),
 verified_reference text unique check(verified_reference ~ '^[0-9]{12}$'),
 reviewed_by uuid references auth.users(id),review_note text not null default '' check(char_length(review_note)<=300),
 submitted_at timestamptz,paid_at timestamptz,refunded_at timestamptz,
 refund_reference text check(char_length(refund_reference) between 2 and 80),
 updated_at timestamptz not null default now()
);
create table if not exists public.youpi_sessions(
 order_id uuid primary key references public.orders(id),attempt uuid not null,
 payment_id text unique check(payment_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
 checkout_url text check(checkout_url like 'https://%'),gateway_status text not null default 'INITIATED',
 claimed_utr text,last_event_at bigint not null default 0,updated_at timestamptz not null default now()
);
create table if not exists public.youpi_webhook_events(
 delivery_id uuid primary key,order_id uuid not null references public.orders(id),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),received_at timestamptz not null default now()
);
create table if not exists public.payment_audit(
 id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),
 action text not null,actor_id uuid references auth.users(id),created_at timestamptz not null default now()
);
insert into public.order_payments(order_id,method,status,amount)
 select id,'cod',case when status='cancelled' then 'cancelled' else 'unrecorded' end,total from public.orders on conflict do nothing;

do $archive$begin
 if to_regprocedure('bitesbro_private.order_is_active_before_payments(public.orders)') is null then
  alter function bitesbro_private.order_is_active(public.orders) rename to order_is_active_before_payments;
 end if;
 if to_regprocedure('bitesbro_private.order_json_before_payments(public.orders,boolean)') is null then
  alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_before_payments;
  alter function public.place_order(jsonb) set schema bitesbro_private;
  alter function bitesbro_private.place_order(jsonb) rename to place_order_before_payments;
  alter function public.get_operations() set schema bitesbro_private;
  alter function bitesbro_private.get_operations() rename to get_operations_before_payments;
  alter function public.transition_order(text,text) set schema bitesbro_private;
  alter function bitesbro_private.transition_order(text,text) rename to transition_order_before_payments;
 end if;
end $archive$;

create or replace function bitesbro_private.order_is_active(o public.orders) returns boolean
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_is_active_before_payments(o) or exists(select 1 from public.order_payments p where p.order_id=o.id and p.status in('submitted','refund_pending'))
$fn$;

create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_json_before_payments(o,include_private)||jsonb_build_object('payment',
 (select jsonb_build_object('method',p.method,'status',p.status,'amount',p.amount,'currency',p.currency,'paidAt',p.paid_at,
 'refundedAt',p.refunded_at)||case when include_private then jsonb_build_object('bankReference',p.bank_reference,
 'reviewNote',p.review_note,'gatewayStatus',s.gateway_status,'gatewayReference',s.claimed_utr,'refundReference',p.refund_reference) else '{}'::jsonb end
 from public.order_payments p left join public.youpi_sessions s on s.order_id=p.order_id where p.order_id=o.id))
$fn$;

create or replace function public.get_payment_settings() returns jsonb
language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object('schemaVersion',8,'onlineEnabled',online_payments_enabled,'gateway','youpi','bankVerificationRequired',true)
 from public.restaurant_settings where id
$fn$;
create or replace function public.set_online_payments(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_enabled is not null,'Choose whether to offer online payments.');
 update public.restaurant_settings set online_payments_enabled=p_enabled where id;
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin','YouPI ordering '||case when p_enabled then 'enabled' else 'paused' end);
end $fn$;

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare result jsonb;o public.orders;payment public.order_payments;method text:=coalesce(p->>'paymentMethod','cod');request uuid:=(p->>'requestId')::uuid;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(method in('cod','youpi'),'Choose a supported payment method.');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request::text,0));
 if method='youpi' and not exists(select 1 from public.orders where user_id=auth.uid() and request_id=request) then
  perform bitesbro_private.ensure((select online_payments_enabled from public.restaurant_settings where id for share),'Online payments are paused. Choose payment on pickup or delivery.');
 end if;
 result:=bitesbro_private.place_order_before_payments(p);
 select * into o from public.orders where reference=result->>'reference' and user_id=auth.uid() for update;
 insert into public.order_payments(order_id,method,status,amount) values(o.id,method,case when method='cod' then 'due' else 'pending' end,o.total) on conflict do nothing;
 select * into payment from public.order_payments where order_id=o.id;
 perform bitesbro_private.ensure(payment.method=method,'This checkout was already saved with a different payment method. Open My orders.');
 return bitesbro_private.order_json(o,true)||jsonb_build_object('message','Order saved. Follow payment and preparation in My orders.');
end $fn$;

create or replace function public.get_operations() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;r text:=bitesbro_private.require_role('customer','chef','admin');
begin
 result:=bitesbro_private.get_operations_before_payments();
 if r='chef' then
  result:=jsonb_set(result,'{orders}',coalesce((select jsonb_agg(ticket) from jsonb_array_elements(result->'orders') ticket
   where ticket->'payment'->>'method'='cod' or ticket->'payment'->>'status'='paid'),'[]'::jsonb));
 end if;
 return result||jsonb_build_object('paymentVersion',8,'paymentSettings',case when r='admin' then public.get_payment_settings() else null end);
end $fn$;
create or replace function public.transition_order(p_reference text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;result jsonb;
begin
 perform bitesbro_private.require_role('customer','chef','admin');
 select * into o from public.orders where reference=p_reference for update;
 if p_status<>'cancelled' then
  perform bitesbro_private.ensure(not exists(select 1 from public.order_payments where order_id=o.id and method<>'cod' and status<>'paid'),'Verify the bank receipt before preparing this order.');
 end if;
 result:=bitesbro_private.transition_order_before_payments(p_reference,p_status);
 if p_status='cancelled' then
  update public.order_payments set status=case when status in('paid','refund_pending') then 'refund_pending' when status='refunded' then status else 'cancelled' end,updated_at=now() where order_id=o.id;
  insert into public.payment_audit(order_id,action,actor_id) values(o.id,'Order cancelled; payment reconciled',auth.uid());
 end if;
 select * into o from public.orders where reference=p_reference;
 return bitesbro_private.order_json(o,public.my_role()<>'chef');
end $fn$;

create or replace function public.get_payment_request(p_reference text) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare o public.orders;result jsonb;
begin
 perform bitesbro_private.require_role('customer');
 select * into o from public.orders where reference=p_reference and user_id=auth.uid() and public.can_read_order(id);
 perform bitesbro_private.ensure(found,'This payment is not available in your order history.');
 select jsonb_build_object('reference',o.reference,'amount',amount,'currency',currency,'method',method,'status',status,'orderStatus',o.status) into result from public.order_payments where order_id=o.id;
 return result;
end $fn$;
create or replace function public.submit_youpi_reference(p_reference text,p_bank_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(p_bank_reference ~ '^[0-9]{12}$','Enter the 12-digit bank reference from your UPI app.');
 select * into o from public.orders where reference=p_reference and user_id=auth.uid() and public.can_read_order(id) for update;
 perform bitesbro_private.ensure(found and o.status in('received','cancelled'),'This order cannot accept a bank reference.');
 select * into p from public.order_payments where order_id=o.id for update;
 perform bitesbro_private.ensure(p.method='youpi' and p.status in('pending','submitted','failed','expired','cancelled'),'This payment does not need a bank reference.');
 update public.order_payments set status='submitted',bank_reference=p_bank_reference,submitted_at=now(),review_note='',updated_at=now() where order_id=o.id;
 insert into public.payment_audit(order_id,action,actor_id) values(o.id,'Customer submitted a bank reference',auth.uid());
end $fn$;
create or replace function public.review_youpi_receipt(p_reference text,p_bank_reference text,p_received boolean,p_note text default '') returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_received is not null and char_length(coalesce(p_note,''))<=300,'Check the receipt review details.');
 select * into o from public.orders where reference=p_reference for update;
 select * into p from public.order_payments where order_id=o.id for update;
 perform bitesbro_private.ensure(p.method='youpi' and p.bank_reference=p_bank_reference,'The submitted reference changed. Refresh before reviewing.');
 if p_received and p.status in('paid','refund_pending','refunded') and p.verified_reference=p_bank_reference then return;end if;
 perform bitesbro_private.ensure(p.status='submitted','Choose a bank receipt awaiting review.');
 if p_received then
  update public.order_payments set status=case when o.status='cancelled' then 'refund_pending' else 'paid' end,
   verified_reference=p_bank_reference,reviewed_by=auth.uid(),paid_at=now(),review_note=coalesce(p_note,''),updated_at=now() where order_id=o.id;
 else
  perform bitesbro_private.ensure(char_length(trim(coalesce(p_note,'')))>=3,'Explain why the receipt could not be verified.');
  update public.order_payments set status=case when o.status='cancelled' then 'cancelled' else 'pending' end,
   bank_reference=null,reviewed_by=auth.uid(),review_note=trim(p_note),updated_at=now() where order_id=o.id;
 end if;
 insert into public.payment_audit(order_id,action,actor_id) values(o.id,case when p_received then 'Administrator verified the bank credit' else 'Administrator could not verify the receipt' end,auth.uid());
end $fn$;
create or replace function public.record_cash_receipt(p_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;
begin
 perform bitesbro_private.require_role('admin');
 select * into o from public.orders where reference=p_reference for update;
 perform bitesbro_private.ensure(found and o.status<>'cancelled','Choose an active cash order.');
 update public.order_payments set status='paid',paid_at=now(),reviewed_by=auth.uid(),updated_at=now() where order_id=o.id and method='cod' and status in('due','unrecorded');
 perform bitesbro_private.ensure(found,'This cash payment is already recorded or unavailable.');
 insert into public.payment_audit(order_id,action,actor_id) values(o.id,'Administrator recorded cash received',auth.uid());
end $fn$;
create or replace function public.record_payment_refund(p_reference text,p_refund_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;
begin
 perform bitesbro_private.require_role('admin');
 select * into o from public.orders where reference=p_reference for update;
 select * into p from public.order_payments where order_id=o.id for update;
 perform bitesbro_private.ensure(p.status='refund_pending','Choose a cancelled payment awaiting refund.');
 perform bitesbro_private.ensure(case when p.method='youpi' then p_refund_reference ~ '^[0-9]{12}$' and p_refund_reference<>p.verified_reference else char_length(trim(p_refund_reference)) between 2 and 80 end,'Enter the completed refund receipt or a different 12-digit bank refund reference.');
 update public.order_payments set status='refunded',refund_reference=trim(p_refund_reference),refunded_at=now(),reviewed_by=auth.uid(),updated_at=now() where order_id=o.id;
 insert into public.payment_audit(order_id,action,actor_id) values(o.id,'Administrator recorded a completed refund',auth.uid());
end $fn$;

-- These RPCs are executable only by the server's service role, never browsers.
create or replace function public.service_youpi_begin(p_reference text,p_user uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;s public.youpi_sessions;
begin
 select * into o from public.orders where reference=p_reference and user_id=p_user for update;
 perform bitesbro_private.ensure(found and o.status='received','This order cannot open a payment checkout.');
 select * into p from public.order_payments where order_id=o.id;
 perform bitesbro_private.ensure(p.method='youpi' and p.status in('pending','submitted'),'This payment does not need a new checkout.');
 select * into s from public.youpi_sessions where order_id=o.id;
 if s.payment_id is not null then return jsonb_build_object('reference',o.reference,'amount',p.amount,'paymentId',s.payment_id,'checkoutUrl',s.checkout_url,'status',s.gateway_status);end if;
 perform bitesbro_private.ensure(p_attempt is not null and (not found or s.updated_at<now()-interval '2 minutes'),'Checkout is being prepared. Check My orders before retrying.');
 insert into public.youpi_sessions(order_id,attempt) values(o.id,p_attempt) on conflict(order_id) do update set attempt=excluded.attempt,updated_at=now();
 return jsonb_build_object('reference',o.reference,'amount',p.amount,'currency','INR');
end $fn$;
create or replace function public.service_youpi_created(p_reference text,p_attempt uuid,p_payment text,p_checkout text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 update public.youpi_sessions set payment_id=p_payment,checkout_url=p_checkout,updated_at=now()
 where order_id=(select id from public.orders where reference=p_reference) and attempt=p_attempt and payment_id is null;
 perform bitesbro_private.ensure(found,'Checkout setup changed. Open My orders before retrying.');
end $fn$;
create or replace function public.service_youpi_context(p_reference text,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 select jsonb_build_object('reference',o.reference,'amount',p.amount,'paymentId',s.payment_id,'checkoutUrl',s.checkout_url,'status',s.gateway_status)
 into result from public.orders o join public.order_payments p on p.order_id=o.id join public.youpi_sessions s on s.order_id=o.id
 where o.reference=p_reference and o.user_id=p_user and s.payment_id is not null;
 perform bitesbro_private.ensure(result is not null,'This checkout is not available to this account.');return result;
end $fn$;
create or replace function public.service_youpi_claim(p_delivery uuid,p_reference text,p_payment text,p_amount integer,p_currency text,p_status text,p_utr text,p_timestamp bigint,p_hash text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;p public.order_payments;s public.youpi_sessions;old_hash text;
begin
 perform bitesbro_private.ensure(p_status in('INITIATED','PENDING','MANUAL_REVIEW','OBSERVED_SUCCESS','RECONCILED','SUCCESS','FAILED','EXPIRED','CANCELLED'),'Unsupported YouPI outcome.');
 select * into o from public.orders where reference=p_reference for update;
 perform bitesbro_private.ensure(found,'Unknown YouPI order.');
 select * into p from public.order_payments where order_id=o.id for update;
 select * into s from public.youpi_sessions where order_id=o.id for update;
 perform bitesbro_private.ensure(s.payment_id=p_payment and p.method='youpi' and p.amount=p_amount and p_currency='INR','The YouPI event does not match the saved checkout.');
 select payload_hash into old_hash from public.youpi_webhook_events where delivery_id=p_delivery;
 if found then perform bitesbro_private.ensure(old_hash=p_hash,'A webhook delivery identifier was reused with different content.');return;end if;
 insert into public.youpi_webhook_events(delivery_id,order_id,payload_hash) values(p_delivery,o.id,p_hash);
 if p_timestamp<s.last_event_at then return;end if;
 update public.youpi_sessions set gateway_status=p_status,claimed_utr=case when p_utr ~ '^[0-9]{12}$' then p_utr else claimed_utr end,last_event_at=p_timestamp,updated_at=now() where order_id=o.id;
 -- A valid signed gateway event is a claim, NEVER proof of a bank settlement.
 if p_utr ~ '^[0-9]{12}$' and p_status in('MANUAL_REVIEW','OBSERVED_SUCCESS','RECONCILED','SUCCESS') and p.status in('pending','submitted','failed','expired','cancelled') and (p.bank_reference is null or p.bank_reference=p_utr) then
  update public.order_payments set status='submitted',bank_reference=p_utr,submitted_at=now(),updated_at=now() where order_id=o.id;
 elsif p_status in('FAILED','EXPIRED','CANCELLED') and p.status in('pending','failed','expired') and p.bank_reference is null then
  update public.order_payments set status=case when o.status='cancelled' then 'cancelled' when p_status='FAILED' then 'failed' else 'expired' end,updated_at=now() where order_id=o.id;
 end if;
end $fn$;

alter table public.order_payments enable row level security;
alter table public.youpi_sessions enable row level security;
alter table public.youpi_webhook_events enable row level security;
alter table public.payment_audit enable row level security;
revoke all on public.order_payments,public.youpi_sessions,public.youpi_webhook_events,public.payment_audit from public,anon,authenticated;
grant select on public.order_payments,public.payment_audit to authenticated;
drop policy if exists bitesbro_payment_read on public.order_payments;
create policy bitesbro_payment_read on public.order_payments for select to authenticated using(public.can_read_order(order_id));
drop policy if exists bitesbro_payment_audit_read on public.payment_audit;
create policy bitesbro_payment_audit_read on public.payment_audit for select to authenticated using(public.can_read_order(order_id));
revoke all on function public.get_payment_settings() from public,anon,authenticated;
grant execute on function public.get_payment_settings() to anon,authenticated,service_role;
revoke all on function public.set_online_payments(boolean),public.place_order(jsonb),public.get_operations(),public.transition_order(text,text),public.get_payment_request(text),public.submit_youpi_reference(text,text),public.review_youpi_receipt(text,text,boolean,text),public.record_cash_receipt(text),public.record_payment_refund(text,text) from public,anon,authenticated;
grant execute on function public.set_online_payments(boolean),public.place_order(jsonb),public.get_operations(),public.transition_order(text,text),public.get_payment_request(text),public.submit_youpi_reference(text,text),public.review_youpi_receipt(text,text,boolean,text),public.record_cash_receipt(text),public.record_payment_refund(text,text) to authenticated;
revoke all on function public.service_youpi_begin(text,uuid,uuid),public.service_youpi_created(text,uuid,text,text),public.service_youpi_context(text,uuid),public.service_youpi_claim(uuid,text,text,integer,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.service_youpi_begin(text,uuid,uuid),public.service_youpi_created(text,uuid,text,text),public.service_youpi_context(text,uuid),public.service_youpi_claim(uuid,text,text,integer,text,text,text,bigint,text) to service_role;
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
insert into public.bitesbro_schema_migrations(version) values(8) on conflict do nothing;
notify pgrst,'reload schema';commit;
