-- Run as the project owner in Supabase SQL Editor. Transactional and rerunnable.
-- Only BitesBro objects are changed. No auth passwords, accounts or orders are seeded.
begin;
set local standard_conforming_strings=on;

do $guard$
begin
  if to_regclass('public.bitesbro_schema_migrations') is not null then
    if exists(select 1 from public.bitesbro_schema_migrations where version>2) then
      raise exception 'This is the version-2 baseline. Apply forward migrations only; do not downgrade the active schema.';
    end if;
  end if;
  if to_regclass('public.bitesbro_schema_migrations') is null and exists (
    select 1 from information_schema.tables where table_schema = 'public'
    and table_name in ('profiles','user_roles','menu_items','menu_categories','menu_photos',
      'orders','order_items','order_events','reservations','messages','newsletter_subscriptions','restaurant_settings','staff_activity')
  ) then
    raise exception 'Existing application tables found. Review their schema before applying BitesBro; nothing has been changed.';
  end if;
  if to_regclass('public.bitesbro_schema_migrations') is null and exists(select 1 from storage.buckets where id='menu-images') then
    raise exception 'An existing menu-images bucket was found. Review its contents and policies before applying BitesBro.';
  end if;
end $guard$;

create table if not exists public.bitesbro_schema_migrations (
  version integer primary key, applied_at timestamptz not null default now()
);
create schema if not exists bitesbro_private;
revoke all on schema bitesbro_private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  phone text not null default '' check (char_length(phone) <= 24),
  created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','chef','admin')),
  updated_at timestamptz not null default now()
);
create table if not exists public.menu_categories (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(name) between 2 and 80),
  position integer not null default 0
);
create table if not exists public.menu_photos (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  local_path text not null unique check (local_path ~ '^/assets/images/photos/[a-z0-9-]+\.jpg$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  credit jsonb not null check (jsonb_typeof(credit) = 'object' and credit ?& array['title','author','license','source','licenseUrl']),
  object_path text unique check (object_path ~ '^files/[a-z0-9-]+-[a-f0-9]{12}\.jpg$'),
  uploaded_at timestamptz
);
create table if not exists public.menu_items (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(name) between 2 and 80),
  category text not null references public.menu_categories(id),
  description text not null check (char_length(description) between 5 and 400),
  price integer not null check (price between 1 and 500000), -- paise
  photo_id text not null references public.menu_photos(id),
  photo_reference text,
  badge text not null default '' check (char_length(badge) <= 80),
  diet text not null check (diet in ('veg','vegan','non-veg')),
  portion text not null check (char_length(portion) between 1 and 120),
  prep_minutes integer not null check (prep_minutes between 1 and 180),
  spice text not null check (spice in ('none','mild','medium','hot')),
  ingredients jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 30),
  allergens jsonb not null default '[]' check (jsonb_typeof(allergens) = 'array' and jsonb_array_length(allergens) <= 30),
  variants jsonb not null check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 1 and 10),
  addons jsonb not null default '[]' check (jsonb_typeof(addons) = 'array' and jsonb_array_length(addons) <= 20),
  available boolean not null default true,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.restaurant_settings (
  id boolean primary key default true check (id),
  accepting_orders boolean not null default true,
  prep_minutes integer not null default 25 check (prep_minutes between 5 and 120),
  delivery_fee integer not null default 4000 check (delivery_fee between 0 and 500000),
  free_delivery_from integer not null default 49900 check (free_delivery_from between 0 and 5000000)
);
insert into public.restaurant_settings(id) values(true) on conflict do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BB-ORDER-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 7 and 24),
  pickup_date date not null, pickup_time time not null,
  fulfilment text not null check (fulfilment in ('pickup','delivery')),
  address text not null default '' check (char_length(address) <= 300),
  postcode text not null default '',
  instructions text not null default '' check (char_length(instructions) <= 500),
  status text not null default 'received' check (status in ('received','preparing','ready','collected','cancelled')),
  subtotal integer not null check (subtotal > 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee and total > 0),
  consent boolean not null check (consent),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id,request_id),
  check (fulfilment <> 'delivery' or (char_length(address) >= 10 and postcode ~ '^560[0-9]{3}$'))
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id text not null references public.menu_items(id),
  name text not null, image text not null,
  quantity integer not null check (quantity between 1 and 10),
  unit_price integer not null check (unit_price > 0),
  options jsonb not null check (jsonb_typeof(options) = 'object')
);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('received','preparing','ready','collected','cancelled')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BB-TABLE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  user_id uuid references auth.users(id) on delete set null,
  name text not null, email text not null, phone text not null,
  date date not null, time time not null,
  guests integer not null check (guests between 1 and 8),
  notes text not null default '' check (char_length(notes) <= 500),
  consent boolean not null check(consent),
  created_at timestamptz not null default now(),
  unique(user_id,date,time)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BB-HELLO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  user_id uuid references auth.users(id) on delete set null,
  name text not null, email text not null,
  subject text not null check (char_length(subject) between 2 and 100),
  message text not null check (char_length(message) between 10 and 2000),
  consent boolean not null check(consent), created_at timestamptz not null default now()
);
create table if not exists public.newsletter_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null, consent boolean not null check(consent),
  created_at timestamptz not null default now()
);
create table if not exists public.staff_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  role text not null, text text not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_status_created_idx on public.orders(status,created_at);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_events_order_idx on public.order_events(order_id,id);
create index if not exists reservations_slot_idx on public.reservations(date,time);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $fn$
  select r.role from public.user_roles r join auth.users u on u.id = r.user_id
  where r.user_id = auth.uid() and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < now())
$fn$;

create or replace function bitesbro_private.require_role(variadic allowed text[]) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare account_role text := public.my_role();
begin
  if account_role is null or not (account_role = any(allowed)) then
    raise exception 'Sign in with an authorised account to continue.' using errcode = '42501';
  end if;
  return account_role;
end $fn$;

create or replace function bitesbro_private.ensure(valid boolean, message text) returns void
language plpgsql set search_path = '' as $fn$
begin
  if valid is distinct from true then raise exception '%', message using errcode = '22023'; end if;
end $fn$;

create or replace function bitesbro_private.on_signup() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- Deliberately ignore role/app claims in user-editable signup metadata.
  insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),80)) on conflict do nothing;
  insert into public.user_roles(user_id,role) values(new.id,'customer') on conflict do nothing;
  return new;
end $fn$;
drop trigger if exists bitesbro_auth_signup on auth.users;
create trigger bitesbro_auth_signup after insert on auth.users for each row execute function bitesbro_private.on_signup();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.user_roles(user_id,role) select id,'customer' from auth.users on conflict do nothing;

create or replace function bitesbro_private.menu_json(m public.menu_items) returns jsonb
language sql stable security definer set search_path = '' as $fn$
 select jsonb_build_object('id',m.id,'name',m.name,'category',m.category,'description',m.description,
  'price',m.price,'image',p.local_path,'storagePath',p.object_path,'badge',m.badge,
  'diet',m.diet,'dietary',jsonb_build_array(case m.diet when 'non-veg' then 'Non-vegetarian' when 'vegan' then 'Plant based' else 'Vegetarian' end),
  'cuisine',c.name,'portion',m.portion,'prepMinutes',m.prep_minutes,'spice',m.spice,
  'ingredients',m.ingredients,'allergens',m.allergens,'variants',m.variants,'addons',m.addons,
  'available',m.available,'archived',m.archived,'photo',p.credit || jsonb_build_object('id',p.id,'reference',m.photo_reference))
 from public.menu_photos p join public.menu_categories c on c.id=m.category where p.id=m.photo_id
$fn$;

create or replace function bitesbro_private.order_json(o public.orders, include_private boolean) returns jsonb
language sql stable security definer set search_path = '' as $fn$
 select jsonb_build_object('reference',o.reference,'origin','customer','fulfilment',o.fulfilment,
  'instructions',o.instructions,'createdAt',o.created_at,'date',o.pickup_date,'time',to_char(o.pickup_time,'HH24:MI'),
  'status',o.status,'subtotal',o.subtotal,'deliveryFee',o.delivery_fee,'total',o.total,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.menu_item_id,'name',i.name,'image',i.image,
    'quantity',i.quantity,'unitPrice',i.unit_price,'options',i.options) order by i.id) from public.order_items i where i.order_id=o.id),'[]'),
  'timeline',coalesce((select jsonb_agg(jsonb_build_object('status',e.status,'at',e.created_at) order by e.id)
    from public.order_events e where e.order_id=o.id),'[]'))
  || case when include_private then jsonb_build_object('name',o.name,'email',o.email,'phone',o.phone,'address',o.address,'postcode',o.postcode) else '{}'::jsonb end
$fn$;

create or replace function public.get_menu() returns jsonb
language sql stable security definer set search_path = '' as $fn$
 select jsonb_build_object('currency','INR',
  'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by position),'[]') from public.menu_categories),
  'items',(select coalesce(jsonb_agg(bitesbro_private.menu_json(m) order by c.position,m.id),'[]')
    from public.menu_items m join public.menu_categories c on c.id=m.category where m.available and not m.archived))
$fn$;

create or replace function public.get_cafe() returns jsonb
language sql stable security definer set search_path = '' as $fn$
 select jsonb_build_object('name','BitesBro','city','Bangalore','timezone','Asia/Kolkata','currency','INR',
  'serverTime',now(),'today',to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD'),
  'currentTime',to_char(now() at time zone 'Asia/Kolkata','HH24:MI'),'hours','Daily, 10am–3pm & 6pm–11pm',
  'openingPeriods','[{"open":"10:00","close":"15:00"},{"open":"18:00","close":"23:00"}]'::jsonb,
  'slots','["10:00","11:30","13:00","18:00","19:30","21:00"]'::jsonb,
  'foodSlots','["10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30"]'::jsonb,
  'deliveryFee',delivery_fee,'freeDeliveryFrom',free_delivery_from,'maxAdvanceDays',60,'maxGuests',8,
  'acceptingOrders',accepting_orders,'prepMinutes',prep_minutes,'demo',true,'address',null,'email',null,'phone',null)
 from public.restaurant_settings where id
$fn$;

create or replace function public.get_slots(p_date date, p_reservation boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare clock timestamp := now() at time zone 'Asia/Kolkata'; result jsonb;
begin
 perform bitesbro_private.ensure(p_date between clock::date and clock::date+60,'Choose a date within the next 60 days.');
 select jsonb_agg(jsonb_build_object('time',t,'available',not past and seats_left>0,'past',past,'seatsLeft',seats_left) order by t) into result
 from (select t, (p_date+t::time < clock + case when p_reservation then interval '0' else interval '30 minutes' end) as past,
  case when p_reservation then 24-coalesce((select sum(r.guests)::integer from public.reservations r where r.date=p_date and r.time=t::time),0) else 24 end as seats_left
  from jsonb_array_elements_text(public.get_cafe()->(case when p_reservation then 'slots' else 'foodSlots' end)) as times(t)) slots;
 return jsonb_build_object('date',p_date,'timezone','Asia/Kolkata','slots',result);
end $fn$;

create or replace function public.get_operations() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare r text := bitesbro_private.require_role('customer','chef','admin'); result jsonb;
begin
 select jsonb_build_object('categories',public.get_menu()->'categories',
  'menu',(select coalesce(jsonb_agg(bitesbro_private.menu_json(m) order by m.id),'[]') from public.menu_items m
     where r in ('admin','chef') or (m.available and not m.archived)),
  'orders',(select coalesce(jsonb_agg(bitesbro_private.order_json(o,r<>'chef') order by o.created_at desc),'[]') from public.orders o
     where (r='customer' and o.user_id=auth.uid()) or r in ('admin','chef')),
  'settings',(select jsonb_build_object('acceptingOrders',accepting_orders,'prepMinutes',prep_minutes) from public.restaurant_settings where id),
  'activity',case when r='admin' then (select coalesce(jsonb_agg(jsonb_build_object('text',a.text,'at',a.created_at,'role',a.role) order by a.id desc),'[]')
     from (select * from public.staff_activity order by id desc limit 100) a) else '[]'::jsonb end) into result;
 return result;
end $fn$;

create or replace function bitesbro_private.customer_fields(p jsonb) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare email_address text;
begin
 perform bitesbro_private.require_role('customer');
 perform bitesbro_private.ensure(jsonb_typeof(p)='object' and p->'consent'='true'::jsonb and coalesce(p->>'website','')='', 'Your privacy consent is required.');
 select email into email_address from auth.users where id=auth.uid();
 return email_address;
end $fn$;

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
 email_address text := bitesbro_private.customer_fields(p); current_order public.orders; dish public.menu_items;
 settings public.restaurant_settings; line jsonb; variant jsonb; addon jsonb; addon_id text; chosen jsonb;
 calculated jsonb := '[]'; seen text[] := '{}'; selection_key text; spice_choice text; image_path text;
 quantity integer; unit_price integer; subtotal integer := 0; fee integer := 0; item_count integer := 0;
 request uuid; pickup_date date; pickup_time time; fulfilment text := coalesce(p->>'fulfilment','pickup');
begin
 request := (p->>'requestId')::uuid;
 perform bitesbro_private.ensure(char_length(trim(p->>'name')) between 2 and 80,'Use a name of 2–80 characters.');
 perform bitesbro_private.ensure(request is not null,'A checkout request identifier is required.');
 -- Serialize retries for this account/request before checking for an existing order.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || request::text,0));
 select * into current_order from public.orders where user_id=auth.uid() and request_id=request;
 if found then return bitesbro_private.order_json(current_order,true) || jsonb_build_object('message','Your order was already saved. No payment is taken.'); end if;
 perform bitesbro_private.ensure(char_length(p->>'phone') between 7 and 24 and p->>'phone' ~ '^\+?[0-9 ().-]+$'
   and char_length(regexp_replace(p->>'phone','[^0-9]','','g'))>=7,'Use a valid phone number.');
 perform bitesbro_private.ensure(fulfilment in ('pickup','delivery'),'Choose pickup or delivery.');
 perform bitesbro_private.ensure(char_length(coalesce(p->>'instructions',''))<=500,'Keep preparation notes within 500 characters.');
 perform bitesbro_private.ensure(fulfilment<>'delivery' or (char_length(trim(p->>'address')) between 10 and 300 and p->>'postcode' ~ '^560[0-9]{3}$'),'Use a delivery address and Bangalore 560xxx postcode.');
 pickup_date := (p->>'date')::date; pickup_time := (p->>'time')::time;
 perform bitesbro_private.ensure(exists(select 1 from jsonb_array_elements(public.get_slots(pickup_date,false)->'slots') s where (s->>'time')::time=pickup_time and (s->>'available')::boolean),'Choose an available future pickup time.');
 select * into settings from public.restaurant_settings where id for share;
 perform bitesbro_private.ensure(settings.accepting_orders,'The kitchen is paused. Please try again later.');
 perform bitesbro_private.ensure(jsonb_typeof(p->'items')='array' and jsonb_array_length(p->'items') between 1 and 20,'Add between 1 and 20 bag lines.');
 -- Lock selected menu rows in a stable order; menu edits cannot race authoritative pricing.
 perform m.id from public.menu_items m where m.id in (select l->>'id' from jsonb_array_elements(p->'items') l) order by m.id for share;
 for line in select * from jsonb_array_elements(p->'items') loop
  perform bitesbro_private.ensure(jsonb_typeof(line)='object' and jsonb_typeof(line->'quantity')='number' and line->>'quantity' ~ '^[0-9]+$','Check food quantities.');
  quantity := (line->>'quantity')::integer;
  perform bitesbro_private.ensure(quantity between 1 and 10,'Use quantities from 1 to 10.');
  select * into dish from public.menu_items where id=line->>'id' and available and not archived;
  perform bitesbro_private.ensure(found,'A dish is unavailable. Refresh your bag.');
  select v into variant from jsonb_array_elements(dish.variants) v where v->>'id'=coalesce(line->>'variant',dish.variants->0->>'id');
  perform bitesbro_private.ensure(variant is not null,'Choose an available portion.');
  spice_choice := coalesce(line->>'spice',dish.spice);
  perform bitesbro_private.ensure((dish.spice='none' and spice_choice='none') or (dish.spice<>'none' and spice_choice in ('mild','medium','hot')),'Choose a valid spice level.');
  chosen := '[]'; unit_price := dish.price + (variant->>'price')::integer;
  perform bitesbro_private.ensure(jsonb_typeof(coalesce(line->'addons','[]'))='array' and jsonb_array_length(coalesce(line->'addons','[]'))<=20,'Check your add-ons.');
  perform bitesbro_private.ensure((select count(*)=count(distinct a) from jsonb_array_elements(coalesce(line->'addons','[]')) a),'Choose each add-on only once.');
  for addon_id in select jsonb_array_elements_text(coalesce(line->'addons','[]')) loop
   select a into addon from jsonb_array_elements(dish.addons) a where a->>'id'=addon_id;
   perform bitesbro_private.ensure(addon is not null,'An add-on is unavailable.');
   chosen := chosen || jsonb_build_array(addon); unit_price := unit_price + (addon->>'price')::integer;
  end loop;
  selection_key := jsonb_build_array(dish.id,variant->>'id',spice_choice,(select coalesce(jsonb_agg(a order by a),'[]') from jsonb_array_elements(coalesce(line->'addons','[]')) a))::text;
  perform bitesbro_private.ensure(not selection_key=any(seen),'Combine identical dishes into one bag line.'); seen := array_append(seen,selection_key);
  image_path := bitesbro_private.menu_json(dish)->>'image';
  calculated := calculated || jsonb_build_array(jsonb_build_object('id',dish.id,'name',dish.name,'image',image_path,'quantity',quantity,'unitPrice',unit_price,'options',jsonb_build_object('variant',variant,'spice',spice_choice,'addons',chosen)));
  subtotal := subtotal + unit_price*quantity; item_count := item_count+quantity;
 end loop;
 perform bitesbro_private.ensure(item_count<=30,'Limit your order to 30 dishes.');
 if fulfilment='delivery' and subtotal<settings.free_delivery_from then fee:=settings.delivery_fee; end if;
 insert into public.orders(user_id,name,email,phone,pickup_date,pickup_time,fulfilment,address,postcode,instructions,subtotal,delivery_fee,total,consent,request_id)
 values(auth.uid(),trim(p->>'name'),email_address,p->>'phone',pickup_date,pickup_time,fulfilment,
  case when fulfilment='delivery' then trim(p->>'address') else '' end,case when fulfilment='delivery' then p->>'postcode' else '' end,
  coalesce(p->>'instructions',''),subtotal,fee,subtotal+fee,true,request) returning * into current_order;
 insert into public.order_items(order_id,menu_item_id,name,image,quantity,unit_price,options)
 select current_order.id,l->>'id',l->>'name',l->>'image',(l->>'quantity')::integer,(l->>'unitPrice')::integer,l->'options' from jsonb_array_elements(calculated) l;
 insert into public.order_events(order_id,status,actor_id) values(current_order.id,'received',auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'customer',current_order.reference || ' received');
 return bitesbro_private.order_json(current_order,true) || jsonb_build_object('message','Your food order is saved. No payment is taken, delivery is not dispatched and no email is sent.');
end $fn$;

create or replace function public.transition_order(p_reference text, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare r text := bitesbro_private.require_role('customer','chef','admin'); o public.orders; next_status text;
begin
 select * into o from public.orders where reference=p_reference and (r in ('chef','admin') or user_id=auth.uid()) for update;
 perform bitesbro_private.ensure(found,'That order is not available to this account.');
 next_status := case o.status when 'received' then 'preparing' when 'preparing' then 'ready' when 'ready' then 'collected' end;
 perform bitesbro_private.ensure((r in ('chef','admin') and p_status=next_status) or
   (p_status='cancelled' and ((r='customer' and o.status='received') or (r='admin' and o.status in ('received','preparing')))), 'That status change is not allowed. Refresh the order.');
 update public.orders set status=p_status where id=o.id returning * into o;
 insert into public.order_events(order_id,status,actor_id) values(o.id,p_status,auth.uid());
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),r,o.reference || ' · ' || p_status);
 return bitesbro_private.order_json(o,r<>'chef');
end $fn$;

create or replace function public.set_menu_availability(p_id text,p_value boolean) returns void
language plpgsql security definer set search_path = '' as $fn$
declare r text := bitesbro_private.require_role('chef','admin');
begin
 perform bitesbro_private.ensure(p_value is not null,'Choose an availability setting.');
 update public.menu_items set available=p_value,updated_at=now() where id=p_id and not archived;
 perform bitesbro_private.ensure(found,'Restore an archived dish before changing availability.');
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),r,p_id || case when p_value then ' available' else ' paused' end);
end $fn$;

create or replace function public.save_menu_item(p_id text,p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare r text := bitesbro_private.require_role('admin'); m public.menu_items; photo public.menu_photos; list text; value jsonb;
begin
 perform bitesbro_private.ensure(jsonb_typeof(p)='object','Provide dish details.');
 select * into photo from public.menu_photos where local_path=p->>'image' or object_path=p->>'image';
 perform bitesbro_private.ensure(found,'Choose an existing credited menu photograph.');
 perform bitesbro_private.ensure(jsonb_typeof(p->'price')='number' and p->>'price' ~ '^[0-9]+$' and jsonb_typeof(p->'prepMinutes')='number' and p->>'prepMinutes' ~ '^[0-9]+$','Use whole paise and preparation minutes.');
 foreach list in array array['ingredients','allergens'] loop
  perform bitesbro_private.ensure(jsonb_typeof(p->list)='array' and jsonb_array_length(p->list)<=30,'Use short ingredient and allergen lists.');
  for value in select * from jsonb_array_elements(p->list) loop
   perform bitesbro_private.ensure(jsonb_typeof(value)='string' and char_length(value#>>'{}') between 1 and 80,'Keep each ingredient or allergen within 80 characters.');
  end loop;
 end loop;
 if p_id is null then
  insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons)
  values('dish-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),trim(p->>'name'),p->>'category',trim(p->>'description'),(p->>'price')::integer,photo.id,'Representative food photograph',p->>'diet','1 serving',(p->>'prepMinutes')::integer,'medium',p->'ingredients',p->'allergens','[{"id":"regular","label":"Regular serving","price":0}]','[]') returning * into m;
 else
  update public.menu_items set name=trim(p->>'name'),description=trim(p->>'description'),category=p->>'category',price=(p->>'price')::integer,
   photo_reference=case when photo_id<>photo.id then 'Representative food photograph' else photo_reference end,photo_id=photo.id,diet=p->>'diet',
   prep_minutes=(p->>'prepMinutes')::integer,ingredients=p->'ingredients',allergens=p->'allergens',updated_at=now() where id=p_id returning * into m;
  perform bitesbro_private.ensure(found,'That dish no longer exists.');
 end if;
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),r,m.name || ' saved');
 return bitesbro_private.menu_json(m);
end $fn$;

create or replace function public.archive_menu_item(p_id text,p_value boolean) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_value is not null,'Choose an archive setting.');
 update public.menu_items set archived=p_value,available=not p_value,updated_at=now() where id=p_id;
 perform bitesbro_private.ensure(found,'That dish no longer exists.');
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin',p_id || case when p_value then ' archived' else ' restored' end);
end $fn$;

create or replace function public.save_kitchen_settings(p_accepting boolean,p_prep integer) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
 perform bitesbro_private.require_role('admin');
 update public.restaurant_settings set accepting_orders=p_accepting,prep_minutes=p_prep where id;
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin','Kitchen preferences updated');
end $fn$;

create or replace function public.submit_customer_form(p_kind text,p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare email_address text := bitesbro_private.customer_fields(p); date_value date; time_value time; count_guests integer; ref text;
begin
 if p_kind='newsletter' then
  insert into public.newsletter_subscriptions(user_id,email,consent) values(auth.uid(),email_address,true)
  on conflict(user_id) do update set email=excluded.email,consent=true;
  return jsonb_build_object('message','Your signup is saved. Newsletter delivery is not connected yet.');
 elsif p_kind='contact' then
  perform bitesbro_private.ensure(char_length(trim(p->>'name')) between 2 and 80,'Use a name of 2–80 characters.');
  insert into public.messages(user_id,name,email,subject,message,consent) values(auth.uid(),trim(p->>'name'),email_address,trim(p->>'subject'),trim(p->>'message'),true) returning reference into ref;
  return jsonb_build_object('reference',ref,'message','Your message is saved. Email delivery is not connected yet.');
 elsif p_kind='reservations' then
  perform bitesbro_private.ensure(char_length(trim(p->>'name')) between 2 and 80,'Use a name of 2–80 characters.');
  perform bitesbro_private.ensure(char_length(p->>'phone') between 7 and 24 and p->>'phone' ~ '^\+?[0-9 ().-]+$','Use a valid phone number.');
  perform bitesbro_private.ensure(jsonb_typeof(p->'guests')='number' and p->>'guests' ~ '^[0-9]+$','Choose 1–8 guests.');
  date_value := (p->>'date')::date; time_value := (p->>'time')::time; count_guests := (p->>'guests')::integer;
  perform bitesbro_private.ensure(count_guests between 1 and 8,'Choose 1–8 guests.');
  perform pg_advisory_xact_lock(hashtextextended(date_value::text || time_value::text,0));
  perform bitesbro_private.ensure(exists(select 1 from jsonb_array_elements(public.get_slots(date_value,true)->'slots') s where (s->>'time')::time=time_value and (s->>'available')::boolean and (s->>'seatsLeft')::integer>=count_guests),'That sitting is unavailable. Choose another time.');
  insert into public.reservations(user_id,name,email,phone,date,time,guests,notes,consent) values(auth.uid(),trim(p->>'name'),email_address,p->>'phone',date_value,time_value,count_guests,coalesce(p->>'notes',''),true) returning reference into ref;
  return jsonb_build_object('reference',ref,'message','Your reservation request is saved. No confirmation email is sent.');
 else raise exception 'Unknown customer form.' using errcode='22023';
 end if;
end $fn$;

create or replace function public.set_staff_role(p_email text,p_role text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare target uuid;
begin
 perform bitesbro_private.require_role('admin');
 perform bitesbro_private.ensure(p_role in ('customer','chef','admin'),'Choose customer, chef or admin.');
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 perform bitesbro_private.ensure(target is not null,'That account must sign up and confirm its email first.');
 perform bitesbro_private.ensure(target<>auth.uid(),'Use another administrator to change your own role.');
 -- Serialize role changes. Users cannot edit user_roles or promote themselves.
 perform pg_advisory_xact_lock(hashtextextended('bitesbro-staff-roles',0));
 perform bitesbro_private.require_role('admin'); -- Recheck after a concurrent administrator's change.
 update public.user_roles set role=p_role,updated_at=now() where user_id=target;
 insert into public.staff_activity(actor_id,role,text) values(auth.uid(),'admin','Staff access updated');
end $fn$;

create or replace function public.register_menu_photo(p_id text,p_path text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare photo public.menu_photos;
begin
 perform bitesbro_private.require_role('admin');
 select * into photo from public.menu_photos where id=p_id;
 perform bitesbro_private.ensure(found and p_path='files/' || photo.id || '-' || left(photo.sha256,12) || '.jpg','Use the matching licensed photo file.');
 perform bitesbro_private.ensure(exists(select 1 from storage.objects where bucket_id='menu-images' and name=p_path),'Upload the photograph before registering it.');
 update public.menu_photos set object_path=p_path,uploaded_at=now() where id=p_id;
end $fn$;

create or replace function public.bitesbro_health() returns jsonb
language sql stable security definer set search_path = '' as $fn$
 select jsonb_build_object('schemaVersion',coalesce((select max(version) from public.bitesbro_schema_migrations),0),
  'menuItems',(select count(*) from public.menu_items),'photos',(select count(*) from public.menu_photos),
  'uploadedPhotos',(select count(*) from public.menu_photos where object_path is not null),
  'bucketReady',exists(select 1 from storage.buckets where id='menu-images'))
$fn$;

-- All data tables use RLS. Direct writes are denied except the two editable profile columns.
do $rls$
declare t text;
begin
 foreach t in array array['bitesbro_schema_migrations','profiles','user_roles','menu_categories','menu_photos','menu_items',
   'restaurant_settings','orders','order_items','order_events','reservations','messages','newsletter_subscriptions','staff_activity'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public, anon, authenticated',t);
 end loop;
end $rls$;
grant select on public.menu_categories,public.menu_photos,public.menu_items,public.restaurant_settings to anon,authenticated;
grant select on public.profiles,public.user_roles,public.orders,public.order_items,public.order_events,
 public.reservations,public.messages,public.newsletter_subscriptions,public.staff_activity to authenticated;
grant update(display_name,phone) on public.profiles to authenticated;

drop policy if exists bitesbro_profiles_read on public.profiles;
create policy bitesbro_profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.my_role())='admin');
drop policy if exists bitesbro_profiles_update on public.profiles;
create policy bitesbro_profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
drop policy if exists bitesbro_roles_read on public.user_roles;
create policy bitesbro_roles_read on public.user_roles for select to authenticated using(user_id=(select auth.uid()) or (select public.my_role())='admin');
drop policy if exists bitesbro_categories_read on public.menu_categories;
create policy bitesbro_categories_read on public.menu_categories for select to anon,authenticated using(true);
drop policy if exists bitesbro_photos_read on public.menu_photos;
create policy bitesbro_photos_read on public.menu_photos for select to anon,authenticated using(true);
drop policy if exists bitesbro_menu_read on public.menu_items;
create policy bitesbro_menu_read on public.menu_items for select to anon,authenticated using((available and not archived) or (select public.my_role()) in ('chef','admin'));
drop policy if exists bitesbro_settings_read on public.restaurant_settings;
create policy bitesbro_settings_read on public.restaurant_settings for select to anon,authenticated using(true);
drop policy if exists bitesbro_orders_read on public.orders;
create policy bitesbro_orders_read on public.orders for select to authenticated using(((select public.my_role())='customer' and user_id=(select auth.uid())) or (select public.my_role())='admin');
drop policy if exists bitesbro_lines_read on public.order_items;
create policy bitesbro_lines_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
drop policy if exists bitesbro_events_read on public.order_events;
create policy bitesbro_events_read on public.order_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
drop policy if exists bitesbro_reservations_read on public.reservations;
create policy bitesbro_reservations_read on public.reservations for select to authenticated using(user_id=(select auth.uid()) or (select public.my_role())='admin');
drop policy if exists bitesbro_messages_read on public.messages;
create policy bitesbro_messages_read on public.messages for select to authenticated using(user_id=(select auth.uid()) or (select public.my_role())='admin');
drop policy if exists bitesbro_subscriptions_read on public.newsletter_subscriptions;
create policy bitesbro_subscriptions_read on public.newsletter_subscriptions for select to authenticated using(user_id=(select auth.uid()) or (select public.my_role())='admin');
drop policy if exists bitesbro_activity_read on public.staff_activity;
create policy bitesbro_activity_read on public.staff_activity for select to authenticated using((select public.my_role())='admin');

-- A public food-photo bucket: public image reads, authenticated administrator writes only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-images','menu-images',true,5242880,array['image/jpeg'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'];
drop policy if exists bitesbro_menu_images_read on storage.objects;
create policy bitesbro_menu_images_read on storage.objects for select to anon,authenticated using(bucket_id='menu-images');
drop policy if exists bitesbro_menu_images_insert on storage.objects;
create policy bitesbro_menu_images_insert on storage.objects for insert to authenticated
 with check(bucket_id='menu-images' and name ~ '^files/[a-z0-9-]+-[a-f0-9]{12}\.jpg$' and (select public.my_role())='admin');
-- No customer/chef upload, overwrite or delete policy is granted.

-- PostgreSQL otherwise grants PUBLIC execution on new functions, including definer functions.
revoke all on all functions in schema bitesbro_private from public,anon,authenticated;
revoke all on function public.my_role(),public.get_menu(),public.get_cafe(),public.get_slots(date,boolean),
 public.get_operations(),public.place_order(jsonb),public.transition_order(text,text),public.set_menu_availability(text,boolean),
 public.save_menu_item(text,jsonb),public.archive_menu_item(text,boolean),public.save_kitchen_settings(boolean,integer),
 public.submit_customer_form(text,jsonb),public.set_staff_role(text,text),public.register_menu_photo(text,text),public.bitesbro_health()
 from public,anon,authenticated;
grant execute on function public.my_role(),public.get_menu(),public.get_cafe(),public.get_slots(date,boolean),public.bitesbro_health() to anon,authenticated;
grant execute on function public.get_operations(),public.place_order(jsonb),public.transition_order(text,text),public.set_menu_availability(text,boolean),
 public.save_menu_item(text,jsonb),public.archive_menu_item(text,boolean),public.save_kitchen_settings(boolean,integer),
 public.submit_customer_form(text,jsonb),public.set_staff_role(text,text),public.register_menu_photo(text,text) to authenticated;
insert into public.bitesbro_schema_migrations(version) values(1) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
