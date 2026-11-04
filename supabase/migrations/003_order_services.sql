-- Forward migration. Run after setup.sql; existing orders/menu/photos are retained.
-- Payment secrets and provider responses are handled by trusted Edge Functions.
begin;
set local standard_conforming_strings=on;
alter table public.restaurant_settings add column if not exists online_payments_enabled boolean not null default false;
alter table public.restaurant_settings add column if not exists merchant_upi_id text;
alter table public.restaurant_settings add column if not exists merchant_payee_name text;

create table if not exists public.order_payments (
 order_id uuid primary key references public.orders(id),
 method text not null check(method in ('cod','upi','razorpay')),
 status text not null check(status in ('due','pending','submitted','creating','created','paid','cancelled','refund_pending','refund_processing','refund_review','refunded')),
 amount integer not null check(amount>0), currency text not null default 'INR' check(currency='INR'),
 provider_order_id text unique, provider_payment_id text unique, provider_refund_id text unique,
 attempt_id uuid, lease_until timestamptz, paid_at timestamptz, updated_at timestamptz not null default now(),
 bank_reference text check(bank_reference ~ '^[0-9]{12}$'), bank_refund_reference text check(bank_refund_reference ~ '^[0-9]{12}$')
);
create table if not exists public.order_notifications (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 kind text not null check(kind in ('received','cancelled','refunded','dispatched','delivered')),
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','needs_review')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, first_attempt_at timestamptz,
 provider_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
 unique(order_id,kind)
);
create table if not exists public.delivery_assignments (
 order_id uuid primary key references public.orders(id),
 status text not null default 'unassigned' check(status in ('unassigned','assigned','out_for_delivery','delivered','failed','cancelled')),
 rider_name text not null default '' check(char_length(rider_name)<=80),
 rider_phone text not null default '' check(char_length(rider_phone)<=24),
 notes text not null default '' check(char_length(notes)<=300),
 assigned_at timestamptz, dispatched_at timestamptz, delivered_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.delivery_events (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id),
 status text not null, actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.payment_events (
 event_id text primary key, provider_order_id text not null, kind text not null,
 processed_at timestamptz not null default now()
);
create index if not exists notifications_queue_idx on public.order_notifications(status,available_at);
create unique index if not exists confirmed_upi_reference_idx on public.order_payments(bank_reference) where method='upi' and status in ('paid','refund_pending','refund_processing','refund_review','refunded');
create index if not exists delivery_events_order_idx on public.delivery_events(order_id,id);

-- Preserve version-2 entry points privately. No browser can bypass new gates.
do $archive$
begin
 if to_regprocedure('bitesbro_private.place_order_v2(jsonb)') is null then
  alter function public.place_order(jsonb) set schema bitesbro_private;
  alter function bitesbro_private.place_order(jsonb) rename to place_order_v2;
  alter function public.transition_order(text,text) set schema bitesbro_private;
  alter function bitesbro_private.transition_order(text,text) rename to transition_order_v2;
  alter function public.get_operations() set schema bitesbro_private;
  alter function bitesbro_private.get_operations() rename to get_operations_v2;
  alter function bitesbro_private.order_json(public.orders,boolean) rename to order_json_v2;
 end if;
end $archive$;

create or replace function bitesbro_private.order_json(o public.orders,include_private boolean) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select bitesbro_private.order_json_v2(o,include_private) || jsonb_build_object(
  'payment',coalesce((select jsonb_build_object('method',p.method,'status',p.status,'amount',p.amount,
   'ready',p.method='cod' or p.status='paid','bankReference',case when include_private then p.bank_reference else null end) from public.order_payments p where p.order_id=o.id),
   jsonb_build_object('method','cod','status','due','amount',o.total,'ready',true)),
  'notification',(select jsonb_build_object('status',n.status) from public.order_notifications n where n.order_id=o.id and n.kind='received'),
  'delivery',case when o.fulfilment='delivery' then coalesce((select jsonb_build_object('status',d.status,
   'riderName',d.rider_name,'riderPhone',case when include_private then d.rider_phone else null end,
   'timeline',(select coalesce(jsonb_agg(jsonb_build_object('status',e.status,'at',e.created_at) order by e.id),'[]') from public.delivery_events e where e.order_id=o.id))
   from public.delivery_assignments d where d.order_id=o.id),'{"status":"unassigned","timeline":[]}'::jsonb) else null end)
$fn$;

create or replace function bitesbro_private.payment_notification() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if current_setting('bitesbro.skip_notifications',true)='true' then return new; end if;
 if (new.method='cod' or new.status='paid') and exists(select 1 from public.orders where id=new.order_id and status<>'cancelled') then
  insert into public.order_notifications(order_id,kind) values(new.order_id,'received') on conflict do nothing;
 end if;
 if new.status='refunded' then insert into public.order_notifications(order_id,kind) values(new.order_id,'refunded') on conflict do nothing; end if;
 return new;
end $fn$;
drop trigger if exists bitesbro_payment_notification on public.order_payments;
create trigger bitesbro_payment_notification after insert or update on public.order_payments for each row execute function bitesbro_private.payment_notification();

create or replace function bitesbro_private.order_cancelled() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if new.status='cancelled' and old.status<>'cancelled' then
  update public.order_payments set status=case when status='paid' then 'refund_pending' when status in ('refund_pending','refund_processing','refund_review','refunded') then status else 'cancelled' end,updated_at=now() where order_id=new.id;
  update public.delivery_assignments set status='cancelled',updated_at=now() where order_id=new.id;
  insert into public.order_notifications(order_id,kind) values(new.id,'cancelled') on conflict do nothing;
 end if;
 return new;
end $fn$;
drop trigger if exists bitesbro_order_cancelled on public.orders;
create trigger bitesbro_order_cancelled after update of status on public.orders for each row execute function bitesbro_private.order_cancelled();

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare result jsonb; o public.orders; method text:=coalesce(p->>'paymentMethod','cod'); payment public.order_payments;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(method in ('cod','upi','razorpay'),'Choose cash or online payment.');
 if method='upi' then perform bitesbro_private.ensure(exists(select 1 from public.restaurant_settings where id and merchant_upi_id is not null and merchant_payee_name is not null),'Merchant UPI details are not configured.'); end if;
 if method='razorpay' then perform bitesbro_private.ensure((select online_payments_enabled from public.restaurant_settings where id),'Online payments are not enabled. Choose cash or try later.'); end if;
 result:=bitesbro_private.place_order_v2(p);
 select * into o from public.orders where reference=result->>'reference' for update;
 insert into public.order_payments(order_id,method,status,amount) values(o.id,method,case when method='cod' then 'due' else 'pending' end,o.total) on conflict do nothing;
 select * into payment from public.order_payments where order_id=o.id;
 perform bitesbro_private.ensure(payment.method=method,'This saved order uses another payment method. Open My orders to continue.');
 if o.fulfilment='delivery' then insert into public.delivery_assignments(order_id) values(o.id) on conflict do nothing; end if;
 return bitesbro_private.order_json(o,true)||jsonb_build_object('message',case when method='cod' then 'Your order is saved. Pay when you collect or receive it.' else 'Your order is saved. Complete payment to send it to the kitchen.' end);
end $fn$;

create or replace function public.get_operations() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare role_name text:=bitesbro_private.require_role('customer','chef','admin'); result jsonb;
begin
 result:=bitesbro_private.get_operations_v2();
 if role_name='chef' then result:=jsonb_set(result,'{orders}',coalesce((select jsonb_agg(o) from jsonb_array_elements(result->'orders') o where (o->'payment'->>'ready')::boolean),'[]')); end if;
 return result||jsonb_build_object('orderServicesVersion',3);
end $fn$;

create or replace function public.transition_order(p_reference text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare role_name text:=bitesbro_private.require_role('customer','chef','admin'); o public.orders; payment public.order_payments;
begin
 select * into o from public.orders where reference=p_reference and (role_name<>'customer' or user_id=auth.uid()) for update;
 perform bitesbro_private.ensure(found,'That order is not available to this account.');
 select * into payment from public.order_payments where order_id=o.id for update;
 if p_status<>'cancelled' then
  perform bitesbro_private.ensure(payment.method is null or payment.method='cod' or payment.status='paid','Payment must be verified before preparing this order.');
  perform bitesbro_private.ensure(o.fulfilment<>'delivery' or p_status<>'collected','Dispatch delivery orders from Administrator > Deliveries.');
 end if;
 return bitesbro_private.transition_order_v2(p_reference,p_status);
end $fn$;

create or replace function public.dispatch_delivery(p_reference text,p_status text,p_rider_name text default '',p_rider_phone text default '',p_notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders; d public.delivery_assignments;
begin
 perform bitesbro_private.require_role('admin');
 select * into o from public.orders where reference=p_reference and fulfilment='delivery' for update;
 perform bitesbro_private.ensure(found and o.status<>'cancelled','Choose an active delivery order.');
 perform bitesbro_private.ensure(not exists(select 1 from public.order_payments where order_id=o.id and method<>'cod' and status<>'paid'),'Verify payment before dispatch.');
 insert into public.delivery_assignments(order_id) values(o.id) on conflict do nothing;
 select * into d from public.delivery_assignments where order_id=o.id for update;
 if p_status='assigned' then
  perform bitesbro_private.ensure(d.status in ('unassigned','assigned','failed'),'This delivery can no longer be reassigned.');
  perform bitesbro_private.ensure(char_length(trim(p_rider_name)) between 2 and 80 and char_length(p_rider_phone) between 7 and 24 and p_rider_phone ~ '^\+?[0-9 ().-]+$','Enter the rider name and a valid phone number.');
  update public.delivery_assignments set status=p_status,rider_name=trim(p_rider_name),rider_phone=p_rider_phone,notes=p_notes,assigned_at=now(),updated_at=now() where order_id=o.id;
 elsif p_status='out_for_delivery' then
  perform bitesbro_private.ensure(d.status='assigned' and o.status in ('ready','collected'),'Assign a rider and wait until the kitchen marks this order ready.');
  if o.status='ready' then
   update public.orders set status='collected' where id=o.id;
   insert into public.order_events(order_id,status,actor_id) values(o.id,'collected',auth.uid());
  end if;
  update public.delivery_assignments set status=p_status,dispatched_at=now(),updated_at=now() where order_id=o.id;
  insert into public.order_notifications(order_id,kind) values(o.id,'dispatched') on conflict do nothing;
 elsif p_status in ('delivered','failed') then
  perform bitesbro_private.ensure(d.status='out_for_delivery','Only a dispatched delivery can be completed or marked failed.');
  update public.delivery_assignments set status=p_status,delivered_at=case when p_status='delivered' then now() else null end,updated_at=now() where order_id=o.id;
  if p_status='delivered' then insert into public.order_notifications(order_id,kind) values(o.id,'delivered') on conflict do nothing; end if;
 else raise exception 'Invalid delivery action.' using errcode='22023'; end if;
 insert into public.delivery_events(order_id,status,actor_id) values(o.id,p_status,auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||' delivery '||p_status);
 select * into o from public.orders where id=o.id;
 return bitesbro_private.order_json(o,true);
end $fn$;

create or replace function public.set_online_payments(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 update public.restaurant_settings set online_payments_enabled=p_enabled where id;
end $fn$;

create or replace function public.record_cash_payment(p_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 update public.order_payments p set status='paid',paid_at=now(),updated_at=now() from public.orders o
 where o.id=p.order_id and o.reference=p_reference and p.method='cod' and p.status='due'
 and ((o.fulfilment='pickup' and o.status='collected') or exists(select 1 from public.delivery_assignments d where d.order_id=o.id and d.status='delivered'));
 perform bitesbro_private.ensure(found,'Record cash only after collection or delivery.');
end $fn$;

-- Service-only RPC: lease a payment initialization without trusting browser totals.
create or replace function public.service_payment_begin(p_reference text,p_user uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare o public.orders; p public.order_payments;
begin
 select * into o from public.orders where reference=p_reference and user_id=p_user for update;
 perform bitesbro_private.ensure(found and o.status<>'cancelled','This order cannot accept payment.');
 select * into p from public.order_payments where order_id=o.id for update;
 perform bitesbro_private.ensure(p.method='razorpay' and p.status in ('pending','creating','created'),'This order does not need online payment.');
 if p.provider_order_id is not null then return jsonb_build_object('reference',o.reference,'providerOrderId',p.provider_order_id,'amount',p.amount,'currency',p.currency); end if;
 perform bitesbro_private.ensure(p.status='pending','Payment setup is being checked. Please retry later.');
 update public.order_payments set status='creating',attempt_id=p_attempt,lease_until=now()+interval '5 minutes',updated_at=now() where order_id=o.id;
 return jsonb_build_object('reference',o.reference,'amount',p.amount,'currency',p.currency,'attemptId',p_attempt);
end $fn$;

create or replace function public.service_payment_created(p_reference text,p_attempt uuid,p_provider_order text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 update public.order_payments p set status='created',provider_order_id=p_provider_order,updated_at=now()
 from public.orders o where o.id=p.order_id and o.reference=p_reference and p.attempt_id=p_attempt and p.status='creating';
 perform bitesbro_private.ensure(found,'Payment setup changed. Contact the restaurant before retrying.');
end $fn$;

create or replace function public.service_capture_payment(p_event text,p_provider_order text,p_payment text,p_amount integer,p_currency text) returns void
language plpgsql security definer set search_path='' as $fn$
declare p public.order_payments; order_status text;
begin
 select * into p from public.order_payments where provider_order_id=p_provider_order;
 perform bitesbro_private.ensure(found and p.method='razorpay' and p.amount=p_amount and p_currency='INR','Payment does not match the saved order.');
 select status into order_status from public.orders where id=p.order_id for update;
 select * into p from public.order_payments where order_id=p.order_id for update;
 if exists(select 1 from public.payment_events where event_id=p_event) then return; end if;
 perform bitesbro_private.ensure(p.provider_payment_id is null or p.provider_payment_id=p_payment,'Another payment is already attached. Manual review required.');
 update public.order_payments set status=case when order_status='cancelled' then 'refund_pending' else 'paid' end,
  provider_payment_id=p_payment,paid_at=coalesce(paid_at,now()),updated_at=now() where order_id=p.order_id and status not in ('refund_pending','refund_processing','refund_review','refunded');
 insert into public.payment_events(event_id,provider_order_id,kind) values(p_event,p_provider_order,'captured') on conflict do nothing;
end $fn$;

create or replace function public.service_refund_claim(p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare p public.order_payments;
begin
 update public.order_payments set status='refund_review',updated_at=now() where status='refund_processing' and lease_until<now();
 select * into p from public.order_payments where method='razorpay' and status='refund_pending' order by updated_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.order_payments set status='refund_processing',attempt_id=p_lease,lease_until=now()+interval '5 minutes' where order_id=p.order_id;
 return jsonb_build_object('orderId',p.order_id,'paymentId',p.provider_payment_id,'amount',p.amount,'lease',p_lease);
end $fn$;

create or replace function public.service_refund_result(p_order uuid,p_lease uuid,p_refund text,p_status text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.ensure(p_status in ('refunded','refund_review'),'Invalid refund result.');
 update public.order_payments set status=p_status,provider_refund_id=p_refund,updated_at=now()
 where order_id=p_order and attempt_id=p_lease and status='refund_processing';
 perform bitesbro_private.ensure(found,'Refund job changed.');
end $fn$;

create or replace function public.service_email_claim(p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare n public.order_notifications; o public.orders;
begin
 update public.order_notifications set status='needs_review',last_error='Retry window expired'
 where status in ('queued','failed','sending') and (first_attempt_at<now()-interval '23 hours' or (attempts>=8 and lease_until<now()));
 select * into n from public.order_notifications where ((status in ('queued','failed') and available_at<=now()) or (status='sending' and lease_until<now()))
 and attempts<8 order by created_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.order_notifications set status='sending',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()) where id=n.id;
 select * into o from public.orders where id=n.order_id;
 return jsonb_build_object('id',n.id,'kind',n.kind,'to',o.email,'order',bitesbro_private.order_json(o,true),'lease',p_lease);
end $fn$;

create or replace function public.service_email_result(p_id uuid,p_lease uuid,p_sent boolean,p_provider text default null) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 update public.order_notifications set status=case when p_sent then 'sent' when attempts>=8 then 'needs_review' else 'failed' end,
 provider_id=p_provider,last_error=case when p_sent then null else 'Email provider request failed' end,
 available_at=now()+interval '1 minute'*power(2,least(attempts,6)),sent_at=case when p_sent then now() else null end
 where id=p_id and lease_id=p_lease and status='sending';
 perform bitesbro_private.ensure(found,'Email job lease changed.');
end $fn$;

create or replace function public.get_order_service_settings() returns jsonb
language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object('schemaVersion',(select max(version) from public.bitesbro_schema_migrations),'onlineEnabled',online_payments_enabled,
 'upiId',merchant_upi_id,'payeeName',merchant_payee_name)
 from public.restaurant_settings where id
$fn$;
create or replace function public.service_order_context(p_reference text,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare o public.orders; p public.order_payments;
begin
 select * into o from public.orders where reference=p_reference and user_id=p_user;
 perform bitesbro_private.ensure(found,'That order is not available to this account.');
 select * into p from public.order_payments where order_id=o.id;
 return jsonb_build_object('reference',o.reference,'providerOrderId',p.provider_order_id,'amount',p.amount,'status',p.status);
end $fn$;

create or replace function public.configure_direct_upi(p_upi text,p_payee text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_upi ~ '^[a-zA-Z0-9._-]{2,128}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$' and char_length(trim(p_payee)) between 2 and 80,'Enter the merchant UPI ID and payee name.');
 update public.restaurant_settings set merchant_upi_id=trim(p_upi),merchant_payee_name=trim(p_payee) where id;
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin','Merchant UPI details updated');
end $fn$;
create or replace function public.get_payment_request(p_reference text) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare o public.orders; p public.order_payments;
begin
 perform bitesbro_private.require_role('customer');
 select * into o from public.orders where reference=p_reference and user_id=auth.uid();
 perform bitesbro_private.ensure(found and o.status<>'cancelled','This order cannot accept payment.');
 select * into p from public.order_payments where order_id=o.id;
 perform bitesbro_private.ensure(p.method in ('upi','razorpay') and p.status in ('pending','submitted','created'),'This order does not need another payment.');
 return(select jsonb_build_object('method',p.method,'reference',o.reference,'amount',p.amount,'currency','INR','upiId',merchant_upi_id,'payeeName',merchant_payee_name) from public.restaurant_settings where id);
end $fn$;
create or replace function public.submit_upi_reference(p_reference text,p_bank_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(p_bank_reference ~ '^[0-9]{12}$','Enter the 12-digit bank reference (UTR/RRN).');
 select * into o from public.orders where reference=p_reference and user_id=auth.uid() for update;
 perform bitesbro_private.ensure(found and o.status='received','This order is no longer awaiting payment.');
 update public.order_payments set status='submitted',bank_reference=p_bank_reference,updated_at=now() where order_id=o.id and method='upi' and status in ('pending','submitted');
 perform bitesbro_private.ensure(found,'This order cannot accept a UPI reference.');
end $fn$;
create or replace function public.confirm_upi_receipt(p_reference text,p_confirm boolean) returns void
language plpgsql security definer set search_path='' as $fn$
declare o public.orders;
begin
 perform bitesbro_private.require_role('admin');
 select * into o from public.orders where reference=p_reference for update;
 perform bitesbro_private.ensure(found and o.status='received','This order can no longer have a payment approved.');
 update public.order_payments set status=case when p_confirm then 'paid' else 'pending' end,
  paid_at=case when p_confirm then now() else null end,updated_at=now()
 where order_id=o.id and method='upi' and status='submitted';
 perform bitesbro_private.ensure(found,'No UPI payment is awaiting review.');
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',o.reference||case when p_confirm then ' bank receipt confirmed' else ' bank receipt rejected' end);
end $fn$;
create or replace function public.confirm_upi_refund(p_reference text,p_bank_reference text) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_bank_reference ~ '^[0-9]{12}$','Enter the bank refund reference.');
 update public.order_payments p set status='refunded',bank_refund_reference=p_bank_reference,updated_at=now()
 from public.orders o where o.id=p.order_id and o.reference=p_reference and p.method='upi' and p.status='refund_pending';
 perform bitesbro_private.ensure(found,'No manual refund is awaiting confirmation.');
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',p_reference||' bank refund confirmed');
end $fn$;

select set_config('bitesbro.skip_notifications','true',true);
insert into public.order_payments(order_id,method,status,amount) select id,'cod',case when status='cancelled' then 'cancelled' else 'due' end,total from public.orders on conflict do nothing;
select set_config('bitesbro.skip_notifications','false',true);
-- Existing orders are not automatically emailed by the migration.
insert into public.delivery_assignments(order_id) select id from public.orders where fulfilment='delivery' on conflict do nothing;

do $permissions$
declare t text; f record;
begin
 foreach t in array array['order_payments','order_notifications','delivery_assignments','delivery_events','payment_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['service_payment_begin','service_payment_created','service_capture_payment','service_refund_claim','service_refund_result','service_email_claim','service_email_result','service_order_context']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to service_role',f.name);
 end loop;
end $permissions$;
grant select on public.order_payments,public.delivery_assignments,public.delivery_events,public.order_notifications to authenticated;
drop policy if exists bitesbro_payments_read on public.order_payments;
create policy bitesbro_payments_read on public.order_payments for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
drop policy if exists bitesbro_deliveries_read on public.delivery_assignments;
create policy bitesbro_deliveries_read on public.delivery_assignments for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
drop policy if exists bitesbro_delivery_events_read on public.delivery_events;
create policy bitesbro_delivery_events_read on public.delivery_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
drop policy if exists bitesbro_notifications_read on public.order_notifications;
create policy bitesbro_notifications_read on public.order_notifications for select to authenticated using((select public.my_role())='admin');
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
revoke all on function public.place_order(jsonb),public.get_operations(),public.transition_order(text,text),public.dispatch_delivery(text,text,text,text,text),public.set_online_payments(boolean),public.record_cash_payment(text) from public,anon,authenticated;
grant execute on function public.place_order(jsonb),public.get_operations(),public.transition_order(text,text),public.dispatch_delivery(text,text,text,text,text),public.set_online_payments(boolean),public.record_cash_payment(text) to authenticated;
revoke all on function public.get_order_service_settings() from public,anon,authenticated;
grant execute on function public.get_order_service_settings() to anon,authenticated,service_role;
revoke all on function public.configure_direct_upi(text,text),public.get_payment_request(text),public.submit_upi_reference(text,text),public.confirm_upi_receipt(text,boolean),public.confirm_upi_refund(text,text) from public,anon,authenticated;
grant execute on function public.configure_direct_upi(text,text),public.get_payment_request(text),public.submit_upi_reference(text,text),public.confirm_upi_receipt(text,boolean),public.confirm_upi_refund(text,text) to authenticated;
insert into public.bitesbro_schema_migrations(version) values(3) on conflict do nothing;
notify pgrst,'reload schema';
commit;
