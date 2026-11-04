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

-- Menu and licensed photo metadata only. Never contains customer records.
begin;
set local standard_conforming_strings=on;
insert into public.menu_categories(id,name,position) values('south-indian','South Indian',0) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('north-indian','North Indian',1) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('biryani','Biryani & rice',2) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('chinese','Indo-Chinese',3) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('global','Pizza, burgers & pasta',4) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('snacks','Street bites',5) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('desserts','Desserts',6) on conflict(id) do nothing;
insert into public.menu_categories(id,name,position) values('beverages','Drinks',7) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('samosa','/assets/images/photos/samosa.jpg','24cd5247526365260dfe460012a144eebdcfab984c89d160bbb78a004a985b6d','{"id":"samosa","image":"/assets/images/photos/samosa.jpg","title":"Samosa with tamarind chutney and tomato sauce","author":"Madhura Vaze","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Samosa_with_tamarind_chutney_and_tomato_sauce.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/samosa.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"24cd5247526365260dfe460012a144eebdcfab984c89d160bbb78a004a985b6d","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('mango-lassi','/assets/images/photos/mango-lassi.jpg','856aa7de3fce92123e9c0965a715c34c20b292120f43111eade715c959140db5','{"id":"mango-lassi","image":"/assets/images/photos/mango-lassi.jpg","title":"Mango lassi at restaurant Momo & More in March 2024","author":"JIP","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Mango_lassi_at_restaurant_Momo_%26_More_in_March_2024.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/mango-lassi.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"856aa7de3fce92123e9c0965a715c34c20b292120f43111eade715c959140db5","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('nimbu-pani','/assets/images/photos/nimbu-pani.jpg','76bf2e89f4f83274bd3e17171d72eeff75d0b35a7ddcd86472114ab11e67a40f','{"id":"nimbu-pani","image":"/assets/images/photos/nimbu-pani.jpg","title":"Neemboo-Paani (Lime Water)","author":"HARIOM.AWASTHI","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Neemboo-Paani_(Lime_Water).JPG","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/nimbu-pani.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"76bf2e89f4f83274bd3e17171d72eeff75d0b35a7ddcd86472114ab11e67a40f","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('cold-coffee','/assets/images/photos/cold-coffee.jpg','dbebd6279931db88cff2e1f6102fabed42ae3c0f28b4879e7e6a473f194936f9','{"id":"cold-coffee","image":"/assets/images/photos/cold-coffee.jpg","title":"Iced Coffee in Glass - Sunshine Coffee - Laramie Cafe (53838344552)","author":"Tony Webster","license":"CC BY 2.0","licenseUrl":"https://creativecommons.org/licenses/by/2.0","source":"https://commons.wikimedia.org/wiki/File:Iced_Coffee_in_Glass_-_Sunshine_Coffee_-_Laramie_Cafe_(53838344552).jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/cold-coffee.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"dbebd6279931db88cff2e1f6102fabed42ae3c0f28b4879e7e6a473f194936f9","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('pizza','/assets/images/photos/pizza.jpg','b0fc848eed45e4ec54c95e05a2a6abdbbfad1b99b0c276d82c2e05d948c102f4','{"id":"pizza","image":"/assets/images/photos/pizza.jpg","title":"Margherita Originale","author":"Mario56","license":"CC BY-SA 3.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/3.0","source":"https://commons.wikimedia.org/wiki/File:Margherita_Originale.JPG","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/pizza.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"b0fc848eed45e4ec54c95e05a2a6abdbbfad1b99b0c276d82c2e05d948c102f4","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('masala-dosa','/assets/images/photos/masala-dosa.jpg','562035b13eb32ab6e7bf200db413f1114cd91e42c54dd138259ab902d17411fd','{"id":"masala-dosa","image":"/assets/images/photos/masala-dosa.jpg","title":"Masala dosa 01","author":"Marajozkee","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Masala_dosa_01.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/masala-dosa.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"562035b13eb32ab6e7bf200db413f1114cd91e42c54dd138259ab902d17411fd","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('pav-bhaji','/assets/images/photos/pav-bhaji.jpg','a5db90c849eb9e7347e08cf5ca95fbf55fef95400c02a147f0f7c38b28eac776','{"id":"pav-bhaji","image":"/assets/images/photos/pav-bhaji.jpg","title":"Pav Bhaji at Home","author":"Nundhaa","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Pav_Bhaji_at_Home.JPG","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/pav-bhaji.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"a5db90c849eb9e7347e08cf5ca95fbf55fef95400c02a147f0f7c38b28eac776","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('biryani','/assets/images/photos/biryani.jpg','6a4e4548cf906b5af13ffeb10fa59132630bfffc06591a5d03775d44ad723d38','{"id":"biryani","image":"/assets/images/photos/biryani.jpg","title":"Chicken Hyderabadi Biryani","author":"Dheerajk88","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Chicken_Hyderabadi_Biryani.JPG","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/biryani.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"6a4e4548cf906b5af13ffeb10fa59132630bfffc06591a5d03775d44ad723d38","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('butter-chicken','/assets/images/photos/butter-chicken.jpg','1afaea229eb13f3e9daecd9e57732aa6fcf1e23031abc9ac7316f33ba8471b07','{"id":"butter-chicken","image":"/assets/images/photos/butter-chicken.jpg","title":"Chicken makhani","author":"stu_spivack","license":"CC BY-SA 2.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/2.0","source":"https://commons.wikimedia.org/wiki/File:Chicken_makhani.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/butter-chicken.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"1afaea229eb13f3e9daecd9e57732aa6fcf1e23031abc9ac7316f33ba8471b07","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('chole-bhature','/assets/images/photos/chole-bhature.jpg','7f4293bf93b87dfaddb129bca5b97e0cf38d1798cf3ba5f01747406bce5c9da6','{"id":"chole-bhature","image":"/assets/images/photos/chole-bhature.jpg","title":"Chole Bhature 6","author":"Gannu03","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Chole_Bhature_6.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/chole-bhature.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"7f4293bf93b87dfaddb129bca5b97e0cf38d1798cf3ba5f01747406bce5c9da6","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('gulab-jamun','/assets/images/photos/gulab-jamun.jpg','969024edc50dd164c7188570fb4253042f2b12e539b80fd7263f4f261e154b20','{"id":"gulab-jamun","image":"/assets/images/photos/gulab-jamun.jpg","title":"Two Gulab Jamun in a plate 01","author":"Suyash.dwivedi","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Two_Gulab_Jamun_in_a_plate_01.jpg","mirror":"https://github.com/Ravjot-Singh/wether_depen/blob/6b7abf1bb8bca2748724aac2f45525ba47076e66/public/food/gulab-jamun.jpg","metadataSource":"https://github.com/Ravjot-Singh/wether_depen/tree/6b7abf1bb8bca2748724aac2f45525ba47076e66","sha256":"969024edc50dd164c7188570fb4253042f2b12e539b80fd7263f4f261e154b20","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('vada','/assets/images/photos/vada.jpg','3e60f4dbaa6232dc92028e41e68861c7274e5fb527137d4d911fcba05bcd09da','{"id":"vada","image":"/assets/images/photos/vada.jpg","title":"Medu Vadas","author":"Mdsmds0","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Medu_Vadas.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/vada.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"3e60f4dbaa6232dc92028e41e68861c7274e5fb527137d4d911fcba05bcd09da","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('gobi-manchurian','/assets/images/photos/gobi-manchurian.jpg','45b7c0633fbc0740002d16a5fd9965547818ba0cfa5de1dbee9f198efaf994b1','{"id":"gobi-manchurian","image":"/assets/images/photos/gobi-manchurian.jpg","title":"Gobi Manchurian","author":"Harsha K R from Bangalore, India","license":"CC BY-SA 2.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/2.0","source":"https://commons.wikimedia.org/wiki/File:Gobi_Manchurian.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/gobi-manchurian.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"45b7c0633fbc0740002d16a5fd9965547818ba0cfa5de1dbee9f198efaf994b1","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('payasam','/assets/images/photos/payasam.jpg','33250c28e3af7fa111c73b0da39102821fd177168f2830bb52a0d8b9af59a298','{"id":"payasam","image":"/assets/images/photos/payasam.jpg","title":"Kheer","author":"stu spivack","license":"CC BY-SA 2.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/2.0","source":"https://commons.wikimedia.org/wiki/File:Kheer.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/kheer.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"33250c28e3af7fa111c73b0da39102821fd177168f2830bb52a0d8b9af59a298","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('chilli-chicken','/assets/images/photos/chilli-chicken.jpg','4d1ff86985f005fc6365bfbf8ef8310120c2855b7e2a7a392d47db0d14d71c37','{"id":"chilli-chicken","image":"/assets/images/photos/chilli-chicken.jpg","title":"Chicken Chilli","author":"Vikramdewangan22889","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Chicken_Chilli.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/chilli-chicken.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"4d1ff86985f005fc6365bfbf8ef8310120c2855b7e2a7a392d47db0d14d71c37","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('filter-coffee','/assets/images/photos/filter-coffee.jpg','e06b54bb120eed5cb6b279e8c6f1b35c0986fb6039935ba6ad48fd7b9e688ec7','{"id":"filter-coffee","image":"/assets/images/photos/filter-coffee.jpg","title":"Filter kaapi","author":"Vallari.a","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Filter_kaapi.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/coffee.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"e06b54bb120eed5cb6b279e8c6f1b35c0986fb6039935ba6ad48fd7b9e688ec7","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('fries','/assets/images/photos/fries.jpg','fabdabea1f924f6abaa38070d6e81f86dcf8ec32ca64db1225f1cf59333aeba6','{"id":"fries","image":"/assets/images/photos/fries.jpg","title":"French Fries","author":"StockSnap","license":"CC0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/deed.en","source":"https://commons.wikimedia.org/wiki/File:French_Fries.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/fries.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"fabdabea1f924f6abaa38070d6e81f86dcf8ec32ca64db1225f1cf59333aeba6","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('noodles','/assets/images/photos/noodles.jpg','7ee2638ad9afc9841debd2220e30cf6149140e4fb0a0e497ac5791538e03f66d','{"id":"noodles","image":"/assets/images/photos/noodles.jpg","title":"HK Arena Sunday AsiaWorld Expo Food Soy Sauce Fried Noodles 豉油皇炒麵","author":"Hoitintungs","license":"CC BY-SA 3.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/3.0/","source":"https://commons.wikimedia.org/wiki/File:HK_Arena_Sunday_AsiaWorld_Expo_Food_Soy_Sauce_Fried_Noodles_%E8%B1%89%E6%B2%B9%E7%9A%87%E7%82%92%E9%BA%B5.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/noodles.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"7ee2638ad9afc9841debd2220e30cf6149140e4fb0a0e497ac5791538e03f66d","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('mutton-biryani','/assets/images/photos/mutton-biryani.jpg','d5341ef63787fe3b3a404bb568a64e1b594e24adce96404eb85a70152b62574c','{"id":"mutton-biryani","image":"/assets/images/photos/mutton-biryani.jpg","title":"Lucknowi Mutton Matka Dum Biriyani","author":"Kalesh","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Lucknowi_Mutton_Matka_Dum_Biriyani.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/goat-biryani.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"d5341ef63787fe3b3a404bb568a64e1b594e24adce96404eb85a70152b62574c","changes":"Resized by Wikimedia and displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('dal-tadka','/assets/images/photos/dal-tadka.jpg','5a2c575bd65d714534b8684b0f70a4e3862e6ccb47656e310918b342465615c5','{"id":"dal-tadka","image":"/assets/images/photos/dal-tadka.jpg","title":"Dal Tadka-Delhi","author":"AugustineKajur","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Dal_Tadka-Delhi.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/dal-tadka.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"5a2c575bd65d714534b8684b0f70a4e3862e6ccb47656e310918b342465615c5","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('chicken-fried-rice','/assets/images/photos/chicken-fried-rice.jpg','6b819e70cb27068ab3944598b7a3293f50331cb2d25a15531742f3d6c4109d92','{"id":"chicken-fried-rice","image":"/assets/images/photos/chicken-fried-rice.jpg","title":"Chicken fried rice","author":"Varaprasad Sidam","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Chicken_fried_rice.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/chicken-fried-rice.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"6b819e70cb27068ab3944598b7a3293f50331cb2d25a15531742f3d6c4109d92","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('veg-biryani','/assets/images/photos/veg-biryani.jpg','be6961d98a78593b52f426828edad0b52464955f509c9ea993e55c4a602517bc','{"id":"veg-biryani","image":"/assets/images/photos/veg-biryani.jpg","title":"Vegetable Biryani","author":"Miansari66","license":"CC0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/deed.en","source":"https://commons.wikimedia.org/wiki/File:Vegetable_Biryani.JPG","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/veg-biryani.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"be6961d98a78593b52f426828edad0b52464955f509c9ea993e55c4a602517bc","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('paneer-curry','/assets/images/photos/paneer-curry.jpg','af8cc8d9d1c61ac76233f2c359fe3f03964df77747030ead1b207c5e0781be72','{"id":"paneer-curry","image":"/assets/images/photos/paneer-curry.jpg","title":"Paneer Butter Masala 5","author":"Gannu03","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Paneer_Butter_Masala_5.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/paneer.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"af8cc8d9d1c61ac76233f2c359fe3f03964df77747030ead1b207c5e0781be72","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('cheese-dosa','/assets/images/photos/cheese-dosa.jpg','e33f98ce72ec7f3efa7c49f5244993b62de2f39f0e98f84d36dfe753d3e90b23','{"id":"cheese-dosa","image":"/assets/images/photos/cheese-dosa.jpg","title":"Cheese masala dosa-IDL FOOD Street, Kukatpally-Hyderabad-DSC 0009","author":"Divya4232","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Cheese_masala_dosa-IDL_FOOD_Street,_Kukatpally-Hyderabad-DSC_0009.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/menu-012-cheese-dosa.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"e33f98ce72ec7f3efa7c49f5244993b62de2f39f0e98f84d36dfe753d3e90b23","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('mysore-dosa','/assets/images/photos/mysore-dosa.jpg','d5e8166c997b3a61f086d8c4dda630f9537d6f30c08ef31576e9cd82ba477259','{"id":"mysore-dosa","image":"/assets/images/photos/mysore-dosa.jpg","title":"Mysore Masala Dosa","author":"Arjunm101","license":"CC BY-SA 3.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/3.0/","source":"https://commons.wikimedia.org/wiki/File:Mysore_Masala_Dosa.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/menu-010-mysore-masala-dosa.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"d5e8166c997b3a61f086d8c4dda630f9537d6f30c08ef31576e9cd82ba477259","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('garlic-naan','/assets/images/photos/garlic-naan.jpg','ea79196898a35c14815f51bcbe0a621b3d9bc756d4ce7d2e1a30ccb8d578519c','{"id":"garlic-naan","image":"/assets/images/photos/garlic-naan.jpg","title":"Butter Garlic Naan","author":"Fatfoodie","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0","source":"https://commons.wikimedia.org/wiki/File:Butter_Garlic_Naan.jpg","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/menu-095-garlic-naan.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"ea79196898a35c14815f51bcbe0a621b3d9bc756d4ce7d2e1a30ccb8d578519c","changes":"Wikimedia thumbnail; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('dosa','/assets/images/photos/dosa.jpg','08d1a5c04d19b7ec72e19f0c97899f99a1a51663cec3a3080135b6b2684a3056','{"id":"dosa","image":"/assets/images/photos/dosa.jpg","title":"dosa","author":"Zoshua Colah","license":"Unsplash License","licenseUrl":"https://unsplash.com/license","source":"https://unsplash.com/photos/a-crispy-dosa-with-dips-on-a-silver-tray-zKmzgVixk_I","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/dosa.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"08d1a5c04d19b7ec72e19f0c97899f99a1a51663cec3a3080135b6b2684a3056","changes":"Resized in the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('idli','/assets/images/photos/idli.jpg','0be7632e3e32d9ac6d0c4dea6b2bf3e8af6265ecc0cd3b18e78fa7a6801190c3','{"id":"idli","image":"/assets/images/photos/idli.jpg","title":"idli","author":"Mayur Roxan","license":"Unsplash License","licenseUrl":"https://unsplash.com/license","source":"https://unsplash.com/photos/idli-with-sambar-chutney-and-coffee-CBP1B46HG1I","mirror":"https://github.com/spinorgs/VJ-s-Indian-restaurant/blob/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f/public/images/idli.jpg","metadataSource":"https://github.com/spinorgs/VJ-s-Indian-restaurant/tree/a83c24aba7253ca65ea213dc91d3b280dfdf8c0f","sha256":"0be7632e3e32d9ac6d0c4dea6b2bf3e8af6265ecc0cd3b18e78fa7a6801190c3","changes":"Resized in the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('south-indian-meals','/assets/images/photos/south-indian-meals.jpg','ad656d6179a8b86b5bfb81246e34b619fee5a148d036752741a65a5e847ae1cf','{"id":"south-indian-meals","image":"/assets/images/photos/south-indian-meals.jpg","title":"South Indian vegetarian thali on a banana leaf","author":"Gill jassu","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/","source":"https://commons.wikimedia.org/w/index.php?curid=195510914","mirror":"https://github.com/Prureddy/vidhatri-bhavan-website/blob/f16e5c569a728be0660cc0755a96feb50e98a8b9/assets/images/gallery-5.jpg","metadataSource":"https://github.com/Prureddy/vidhatri-bhavan-website/tree/f16e5c569a728be0660cc0755a96feb50e98a8b9","sha256":"ad656d6179a8b86b5bfb81246e34b619fee5a148d036752741a65a5e847ae1cf","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('avocado-toast','/assets/images/photos/avocado-toast.jpg','76d5e210455d4fc3b6d6b388a4762608622442166c9968ad60b237c4585fb350','{"id":"avocado-toast","image":"/assets/images/photos/avocado-toast.jpg","title":"Avocado Toast","author":"Lisa Fotios","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://stocksnap.io/photo/avocado-toast-NQNFUT9KD7","mirror":"https://github.com/Axess34/oz-example-littlewren/blob/af164b93fabdc21f88a0f6cd4661354e108afb96/assets/images/048.jpg","metadataSource":"https://github.com/Axess34/oz-example-littlewren/tree/af164b93fabdc21f88a0f6cd4661354e108afb96","sha256":"76d5e210455d4fc3b6d6b388a4762608622442166c9968ad60b237c4585fb350","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('latte','/assets/images/photos/latte.jpg','7139e7221e646034f60c59e86c44dfce1d3dcf60fe6e0b5a8512393d42dd4429','{"id":"latte","image":"/assets/images/photos/latte.jpg","title":"Coffee Latte","author":"Sergey Zolkin","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://stocksnap.io/photo/coffee-latte-MK3VLNK8NA","mirror":"https://github.com/Axess34/oz-example-littlewren/blob/af164b93fabdc21f88a0f6cd4661354e108afb96/assets/images/147.jpg","metadataSource":"https://github.com/Axess34/oz-example-littlewren/tree/af164b93fabdc21f88a0f6cd4661354e108afb96","sha256":"7139e7221e646034f60c59e86c44dfce1d3dcf60fe6e0b5a8512393d42dd4429","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('flat-white','/assets/images/photos/flat-white.jpg','bf24767998b59dd3196cde0ee0b7aabad5103b3685346f1c9693a37db2171585','{"id":"flat-white","image":"/assets/images/photos/flat-white.jpg","title":"Coffee Hot","author":"Nathan Dumlao","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://stocksnap.io/photo/coffee-hot-4DW84GDZ41","mirror":"https://github.com/Axess34/oz-example-littlewren/blob/af164b93fabdc21f88a0f6cd4661354e108afb96/assets/images/018.jpg","metadataSource":"https://github.com/Axess34/oz-example-littlewren/tree/af164b93fabdc21f88a0f6cd4661354e108afb96","sha256":"bf24767998b59dd3196cde0ee0b7aabad5103b3685346f1c9693a37db2171585","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('croissant','/assets/images/photos/croissant.jpg','be9031c3d60ec39be170962fdffec8285136fe6563a294d96940030e22e818ac','{"id":"croissant","image":"/assets/images/photos/croissant.jpg","title":"Croissant with jam and butter – Little Miss Piggies","author":"Photographer not named in source credits","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://commons.wikimedia.org/wiki/File:Croissant_with_jam_and_butter_-_Little_Miss_Piggies.jpg","mirror":"https://github.com/chasvitf/baankanompang/blob/e7fdc529dd300ea955bd654831c7760ddc5a4906/public/img/croissant.jpg","metadataSource":"https://github.com/chasvitf/baankanompang/tree/e7fdc529dd300ea955bd654831c7760ddc5a4906","sha256":"be9031c3d60ec39be170962fdffec8285136fe6563a294d96940030e22e818ac","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('brownie','/assets/images/photos/brownie.jpg','ab8f882c691a921aa48347095eff576de2d64f31812f075b9b2426b8fa9dbdbe','{"id":"brownie","image":"/assets/images/photos/brownie.jpg","title":"Chocolate dessert brownies cake","author":"www.Pixel.la Free Stock Photos","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://commons.wikimedia.org/wiki/File:Chocolate-dessert-brownies-cake.jpg","mirror":"https://github.com/PatienceQuartey/odin-recipes/blob/c3c80b8bfaa60b02b8561c2507cd6e0aa7d8ff04/images/chocolate-brownies.jpg","metadataSource":"https://github.com/PatienceQuartey/odin-recipes/tree/c3c80b8bfaa60b02b8561c2507cd6e0aa7d8ff04","sha256":"ab8f882c691a921aa48347095eff576de2d64f31812f075b9b2426b8fa9dbdbe","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('chicken-burger','/assets/images/photos/chicken-burger.jpg','4f7c814e56ac914e1c87963fcf7b4c365565d7ad82249f516ba7792315b17ed5','{"id":"chicken-burger","image":"/assets/images/photos/chicken-burger.jpg","title":"Chicken sandwich","author":"Evan-Amos / Vanamo Media","license":"Public domain","licenseUrl":"https://commons.wikimedia.org/wiki/User:Evan-Amos","source":"https://github.com/ClangsterXD/odin-recipes#attribution","mirror":"https://github.com/ClangsterXD/odin-recipes/blob/6baeb7dcc73f56fda17ad4657d9c4c26b113f241/images/sandwich.jpg","metadataSource":"https://github.com/ClangsterXD/odin-recipes/tree/6baeb7dcc73f56fda17ad4657d9c4c26b113f241","sha256":"4f7c814e56ac914e1c87963fcf7b4c365565d7ad82249f516ba7792315b17ed5","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('puttu','/assets/images/photos/puttu.jpg','05ec00e57be0587e25aecf9a3f90948bc435424c36aacc602b614b3bd920928c','{"id":"puttu","image":"/assets/images/photos/puttu.jpg","title":"Puttu with chickpea curry","author":"Photographer not named in source repository","license":"Pexels License","licenseUrl":"https://www.pexels.com/license/","source":"https://www.pexels.com/photo/5560763/","mirror":"https://github.com/Natarajan-Gothandaraman/Shanthi_Foods/blob/0d5e57829ae7cae3934f50805a4d12d0fc10ea8f/public/images/puttu.jpg","metadataSource":"https://github.com/Natarajan-Gothandaraman/Shanthi_Foods/tree/0d5e57829ae7cae3934f50805a4d12d0fc10ea8f","sha256":"05ec00e57be0587e25aecf9a3f90948bc435424c36aacc602b614b3bd920928c","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('pasta','/assets/images/photos/pasta.jpg','e4b436d9fef45a40ba551ebca2785f3ae314d31afaa747885593d56005ff061d','{"id":"pasta","image":"/assets/images/photos/pasta.jpg","title":"Italian vegetable pasta","author":"Jiaqian AirplaneFan","license":"CC BY 3.0","licenseUrl":"https://creativecommons.org/licenses/by/3.0/","source":"https://commons.wikimedia.org/wiki/File:Italian_vegetable_pasta_in_Guido_%5E_Angelina_Restaurant_-_panoramio.jpg","mirror":"https://github.com/spidyshivam/shagun-home-delivery/blob/d936a0d545b588f34807ad255ed872b472075239/images/vegetable-pasta.jpg","metadataSource":"https://github.com/spidyshivam/shagun-home-delivery/tree/d936a0d545b588f34807ad255ed872b472075239","sha256":"e4b436d9fef45a40ba551ebca2785f3ae314d31afaa747885593d56005ff061d","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('matcha','/assets/images/photos/matcha.jpg','758f1e3f80c1409d624e8d6f736f4af3ec0b2e9d4348580356d6f46e601ac721','{"id":"matcha","image":"/assets/images/photos/matcha.jpg","title":"Matcha latte","author":"Photographer not named in source credits","license":"Unsplash License","licenseUrl":"https://unsplash.com/license","source":"https://images.unsplash.com/photo-1536256263959-770b48d82b0a","mirror":"https://github.com/mimi-kimi/Matchakohi/blob/44a0da33ba6a83c0bfcda9ad8e4183891f841e3b/public/images/matcha-latte-800.jpg","metadataSource":"https://github.com/mimi-kimi/Matchakohi/tree/44a0da33ba6a83c0bfcda9ad8e4183891f841e3b","sha256":"758f1e3f80c1409d624e8d6f736f4af3ec0b2e9d4348580356d6f46e601ac721","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('chocolate-cookie','/assets/images/photos/chocolate-cookie.jpg','a12ca7894d5643d99b6821b9727f1429f4fa8e6c673581dfcce090d085fc6666','{"id":"chocolate-cookie","image":"/assets/images/photos/chocolate-cookie.jpg","title":"Chocolate chip cookies","author":"Luis Quintero","license":"Pexels License","licenseUrl":"https://www.pexels.com/license/","source":"https://www.pexels.com/photo/plate-of-chocolate-chip-cookies-1626668/","mirror":"https://github.com/VertexModels/chunk-bakehouse/blob/acb701ba68fb2e9fadc8cc7b409d9e951e93d4aa/img/classic.jpg","metadataSource":"https://github.com/VertexModels/chunk-bakehouse/tree/acb701ba68fb2e9fadc8cc7b409d9e951e93d4aa","sha256":"a12ca7894d5643d99b6821b9727f1429f4fa8e6c673581dfcce090d085fc6666","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_photos(id,local_path,sha256,credit) values('sandwich','/assets/images/photos/sandwich.jpg','bff0cde629dff39ac1c0c06582a8e346ab5fa6ae11a0700247dd7982cd971ee0','{"id":"sandwich","image":"/assets/images/photos/sandwich.jpg","title":"The Mediterranean sandwich – Dyke Road Park Cafe","author":"Photographer not named in source credits","license":"CC0 1.0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","source":"https://commons.wikimedia.org/wiki/File:The_Mediterranean_sandwich_-_Dyke_Road_Park_Cafe_2025-05-09.jpg","mirror":"https://github.com/Lucaci04/coffee-demos-studio/blob/14002e7be07e82910f6a85277dd792369c847928/public/photos/loaded-med-sandwich.jpg","metadataSource":"https://github.com/Lucaci04/coffee-demos-studio/tree/14002e7be07e82910f6a85277dd792369c847928","sha256":"bff0cde629dff39ac1c0c06582a8e346ab5fa6ae11a0700247dd7982cd971ee0","changes":"Resized by the source mirror; displayed with responsive cropping."}'::jsonb) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('alfredo-pasta','Creamy Alfredo Pasta','global','Penne in a silky sauce with mushrooms and vegetarian hard cheese.',26000,'pasta','Vegetable pasta reference photo','','veg','1 bowl',25,'medium','["Penne","cream","mushrooms","garlic","cheese"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('appam-stew','Appam & Vegetable Stew','south-indian','Lacy appams with a gentle coconut-milk vegetable stew.',17000,'idli','South Indian breakfast reference photo','','vegan','2 appams + stew',25,'medium','["Rice","coconut milk","carrot","potato"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"2 appams + stew","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('avocado-toast','Green Goodness Toast','global','Smashed avocado, sourdough, cherry tomatoes, and chilli.',34000,'avocado-toast',null,'A good start','vegan','1 serving',10,'none','[]'::jsonb,'["gluten"]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('bisi-bele-bath','Bisi Bele Bath','south-indian','Karnataka’s comforting rice-and-lentil favourite with vegetables.',13000,'south-indian-meals','South Indian meal reference photo','','veg','1 bowl',25,'medium','["Rice","lentils","vegetables","ghee","peanuts"]'::jsonb,'["Milk","Peanuts"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('brownie','Brownie & Ice Cream','desserts','Warm eggless chocolate brownie with vanilla ice cream.',16000,'brownie',null,'','veg','1 serving',10,'none','["Flour","cocoa","milk","vanilla ice cream"]'::jsonb,'["Gluten","Milk","Soy"]'::jsonb,'[{"id":"regular","label":"1 serving","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('butter-chicken','Old Delhi Butter Chicken','north-indian','Tender chicken in a rich tomato-and-butter gravy.',29000,'butter-chicken',null,'','non-veg','1 bowl',25,'medium','["Chicken","tomato","butter","cream","cashews"]'::jsonb,'["Milk","Cashews"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('butter-croissant','The Butter Croissant','snacks','Golden, gloriously flaky layers. Baked for slow mornings.',18000,'croissant',null,'Fresh from the oven','veg','1 serving',10,'none','[]'::jsonb,'["gluten"]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('cheese-dosa','Cheese Masala Dosa','south-indian','Our crisp masala dosa with a generous, melty layer of cheese.',17000,'cheese-dosa',null,'','veg','1 dosa + sides',25,'medium','["Rice","lentils","potato","cheese"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"1 dosa + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chicken-burger','Crispy Chicken Burger','global','Crisp chicken, crunchy slaw and mayo in a soft toasted bun.',22000,'chicken-burger',null,'','non-veg','1 burger',25,'medium','["Chicken","bun","cabbage","mayonnaise"]'::jsonb,'["Gluten","Egg","Milk"]'::jsonb,'[{"id":"regular","label":"1 burger","price":0}]'::jsonb,'[{"id":"cheese","label":"Extra cheese","price":3000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chicken-chettinad-dosa','Chettinad Chicken Dosa','south-indian','A crisp dosa with peppery Chettinad chicken masala and curry leaves.',22000,'dosa','Dosa reference photo; chicken filling not shown','','non-veg','1 dosa + sides',25,'hot','["Rice","lentils","chicken","pepper","curry leaves"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"1 dosa + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chicken-fried-rice','Chicken Fried Rice','chinese','Wok-tossed rice with chicken, egg, spring onion and vegetables.',22000,'chicken-fried-rice',null,'','non-veg','1 bowl',25,'medium','["Rice","chicken","egg","vegetables","soy sauce"]'::jsonb,'["Egg","Soy"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chilli-chicken','Chilli Chicken','chinese','Crisp chicken, peppers and onions in a fiery chilli-garlic sauce.',26000,'chilli-chicken',null,'','non-veg','1 serving',25,'hot','["Chicken","pepper","onion","soy sauce","chilli"]'::jsonb,'["Gluten","Soy","Egg"]'::jsonb,'[{"id":"regular","label":"1 serving","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chocolate-cookie','Chocolate Chunk Cookie','snacks','Crisp edges, a soft centre, and generous dark chocolate.',14000,'chocolate-cookie',null,'','veg','1 serving',10,'none','[]'::jsonb,'["gluten"]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('chole-bhature','Chole Bhature','north-indian','Fluffy bhature with tangy chickpea curry, onions and pickle.',19000,'chole-bhature',null,'','veg','2 bhature + chole',25,'medium','["Wheat","chickpeas","yoghurt","spices"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"2 bhature + chole","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('classic-flat-white','Classic Flat White','beverages','Rich espresso meets a soft, velvety layer of microfoam.',21000,'flat-white',null,'','veg','1 serving',10,'none','[]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('dal-tadka','Homestyle Dal Tadka','north-indian','Yellow lentils with a fragrant garlic-and-cumin tempering.',16000,'dal-tadka',null,'','vegan','1 bowl',25,'medium','["Lentils","garlic","cumin","tomato"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('donne-biryani','Bangalore Donne Biryani','biryani','Seeraga samba rice, herby green masala and juicy chicken.',26000,'biryani','Chicken biryani reference photo','Bangalore favourite','non-veg','Serves 1',25,'hot','["Seeraga samba rice","chicken","coriander","mint","yoghurt"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"Serves 1","price":0},{"id":"large","label":"Serves 2","price":15000}]'::jsonb,'[{"id":"raita","label":"Extra raita","price":2000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('filter-coffee','South Indian Filter Coffee','beverages','Bold decoction, hot milk and a familiar frothy finish.',7000,'filter-coffee',null,'','veg','150 ml',10,'none','["Coffee","milk","sugar"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"150 ml","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('fries','Golden French Fries','snacks','Golden, crisp fries with seasoning and tomato dip.',11000,'fries',null,'','vegan','1 portion',25,'medium','["Potato","oil","salt"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"1 portion","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('garlic-naan','Garlic Butter Naan','north-indian','Soft bread brushed with garlic butter and fresh coriander.',6000,'garlic-naan',null,'','veg','1 naan',25,'medium','["Wheat","yoghurt","butter","garlic"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"1 naan","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('ghee-roast','Ghee Roast Dosa','south-indian','Thin, lacy and golden with ghee. Simple things, done beautifully.',13000,'masala-dosa','Dosa reference photo','','veg','1 dosa + sides',25,'medium','["Rice","urad dal","ghee"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"1 dosa + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('gobi-manchurian','Gobi Manchurian','chinese','Crispy cauliflower in a tangy, garlicky Indo-Chinese sauce.',19000,'gobi-manchurian',null,'','vegan','1 serving',25,'medium','["Cauliflower","flour","soy sauce","garlic"]'::jsonb,'["Gluten","Soy"]'::jsonb,'[{"id":"regular","label":"1 serving","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('gulab-jamun','Warm Gulab Jamun','desserts','Soft golden dumplings in cardamom-and-rose syrup.',9000,'gulab-jamun',null,'','veg','2 pieces',10,'none','["Milk solids","flour","sugar","cardamom"]'::jsonb,'["Milk","Gluten"]'::jsonb,'[{"id":"regular","label":"2 pieces","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('hakka-noodles','Veg Hakka Noodles','chinese','Wok-tossed noodles, crunchy vegetables and smoky goodness.',18000,'noodles',null,'','vegan','1 bowl',25,'medium','["Wheat noodles","vegetables","soy sauce","garlic"]'::jsonb,'["Gluten","Soy"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('hyderabadi-biryani','Hyderabadi Chicken Biryani','biryani','Fragrant basmati, chicken and whole spices, slow cooked. Raita included.',28000,'biryani',null,'','non-veg','Serves 1',25,'medium','["Rice","chicken","yoghurt","mint","whole spices"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"Serves 1","price":0},{"id":"large","label":"Serves 2","price":15000}]'::jsonb,'[{"id":"raita","label":"Extra raita","price":2000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('iced-brown-sugar','Iced Brown Sugar','beverages','Slow-sipped espresso, brown sugar, oat milk, and plenty of ice.',26000,'cold-coffee',null,'BitesBro signature','vegan','1 serving',10,'none','[]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('idli-sambar','Idli Sambar','south-indian','Pillowy steamed idlis, vegetable sambar and fresh coconut chutney.',8000,'idli',null,'','vegan','3 idlis + sides',25,'medium','["Rice","urad dal","lentils","vegetables","coconut"]'::jsonb,'["Mustard"]'::jsonb,'[{"id":"regular","label":"3 idlis + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('lime-soda','Fresh Lime Soda','beverages','Fresh lime, chilled soda and a little fizz.',8000,'nimbu-pani',null,'','vegan','300 ml',10,'none','["Lime","soda","sugar or salt"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"300 ml","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('mango-lassi','Creamy Mango Lassi','beverages','Mango, thick yoghurt and a hint of cardamom.',11000,'mango-lassi',null,'','veg','300 ml',10,'none','["Mango","yoghurt","cardamom"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"300 ml","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('margherita','Margherita Pizza','global','Tomato, fresh mozzarella and basil on a golden pizza base.',25000,'pizza',null,'','veg','8-inch pizza',25,'medium','["Wheat","tomato","mozzarella","basil"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"8-inch pizza","price":0},{"id":"large","label":"12-inch pizza","price":14000}]'::jsonb,'[{"id":"cheese","label":"Extra cheese","price":3000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('masala-dosa','Bangalore Masala Dosa','south-indian','Crisp golden dosa, spiced potato masala, sambar and two chutneys.',12000,'dosa',null,'BitesBro signature','veg','1 dosa + sides',25,'medium','["Rice","urad dal","potato","curry leaves"]'::jsonb,'["Mustard"]'::jsonb,'[{"id":"regular","label":"Classic dosa","price":0},{"id":"ghee-roast","label":"Ghee-roasted","price":2500}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('medu-vada','Crispy Medu Vada','south-indian','Golden lentil vadas with soft centres, curry leaves and sambar.',9000,'vada',null,'','vegan','2 vadas + sides',25,'medium','["Urad dal","curry leaves","pepper","onion"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"2 vadas + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('mutton-biryani','Mutton Dum Biryani','biryani','Slow-cooked mutton and basmati with layers of warming spices.',36000,'mutton-biryani',null,'','non-veg','Serves 1',25,'medium','["Rice","mutton","yoghurt","mint","spices"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"Serves 1","price":0},{"id":"large","label":"Serves 2","price":15000}]'::jsonb,'[{"id":"raita","label":"Extra raita","price":2000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('mysore-dosa','Mysore Masala Dosa','south-indian','Red-chutney dosa with potato filling and a proper Mysore kick.',14000,'mysore-dosa',null,'','veg','1 dosa + sides',25,'hot','["Rice","lentils","potato","red chilli","garlic"]'::jsonb,'["Mustard"]'::jsonb,'[{"id":"regular","label":"1 dosa + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('paneer-butter-masala','Paneer Butter Masala','north-indian','Soft paneer in a silky tomato, butter and cream gravy.',23000,'paneer-curry',null,'','veg','1 bowl',25,'medium','["Paneer","tomato","butter","cream","cashews"]'::jsonb,'["Milk","Cashews"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('paneer-pizza','Tandoori Paneer Pizza','global','Smoky paneer, peppers, onions and melting mozzarella.',31000,'pizza','Vegetarian pizza reference photo','','veg','8-inch pizza',25,'medium','["Wheat","paneer","peppers","mozzarella"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"8-inch pizza","price":0},{"id":"large","label":"12-inch pizza","price":14000}]'::jsonb,'[{"id":"cheese","label":"Extra cheese","price":3000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('pav-bhaji','Mumbai Pav Bhaji','snacks','Butter-toasted pav, hearty spiced vegetable mash, onions and lime.',15000,'pav-bhaji',null,'','veg','2 pav + bhaji',25,'medium','["Pav","potato","peas","tomato","butter"]'::jsonb,'["Gluten","Milk"]'::jsonb,'[{"id":"regular","label":"2 pav + bhaji","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('payasam','Coconut & Jaggery Payasam','desserts','Coconut-milk payasam with jaggery, cardamom and toasted cashews.',10000,'payasam','Rice pudding reference photo','','vegan','1 bowl',10,'none','["Rice","coconut milk","jaggery","cashews"]'::jsonb,'["Cashews"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('pesto-melt','The Pesto Melt','global','Basil pesto, tomatoes, and melting mozzarella on sourdough.',32000,'sandwich','Vegetarian sandwich reference photo','','veg','1 serving',10,'none','[]'::jsonb,'["gluten","nuts"]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('podi-idli','Ghee Podi Idli','south-indian','Soft mini idlis tossed in ghee and a nutty, spiced podi.',12000,'idli','Idli reference photo','','veg','8 mini idlis',25,'medium','["Rice","urad dal","ghee","sesame"]'::jsonb,'["Milk","Sesame"]'::jsonb,'[{"id":"regular","label":"8 mini idlis","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('pongal','Ghee Ven Pongal','south-indian','Comforting rice and moong dal, black pepper and toasted cashews.',11000,'south-indian-meals','South Indian meal reference photo','','veg','1 bowl',25,'medium','["Rice","moong dal","ghee","pepper","cashews"]'::jsonb,'["Milk","Cashews"]'::jsonb,'[{"id":"regular","label":"1 bowl","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('puttu-kadala','Puttu & Kadala Curry','south-indian','Steamed rice-and-coconut puttu with spiced black chickpea curry.',16000,'puttu',null,'','vegan','1 serving',25,'medium','["Rice flour","coconut","black chickpeas","spices"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"1 serving","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('rava-dosa','Onion Rava Dosa','south-indian','A lacy semolina dosa with onions, cumin and green chilli.',14000,'masala-dosa','Dosa reference photo','','vegan','1 dosa + sides',25,'medium','["Semolina","rice flour","onion","cumin"]'::jsonb,'["Gluten"]'::jsonb,'[{"id":"regular","label":"1 dosa + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('samosa','Punjabi Samosa','snacks','Crisp pastry pockets with spiced potato, peas and chutneys.',6000,'samosa',null,'','vegan','2 pieces',25,'medium','["Wheat","potato","peas","spices"]'::jsonb,'["Gluten"]'::jsonb,'[{"id":"regular","label":"2 pieces","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('set-dosa','Soft Set Dosa','south-indian','Three fluffy dosas with vegetable saagu and coconut chutney.',11000,'dosa','Dosa reference photo','','veg','3 dosas + sides',25,'medium','["Rice","lentils","vegetables","coconut"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"3 dosas + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('south-indian-meals','The South Indian Thali','south-indian','Rice, sambar, rasam, poriyal, kootu, curd, papad and a sweet finish.',24000,'south-indian-meals',null,'A whole lot of happy','veg','1 generous thali',25,'medium','["Rice","lentils","seasonal vegetables","yoghurt"]'::jsonb,'["Milk","Mustard"]'::jsonb,'[{"id":"regular","label":"1 generous thali","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('uttapam','Onion Uttapam','south-indian','A thick, soft dosa topped with onion, tomato and green chilli.',12000,'cheese-dosa','South Indian dosa reference photo','','vegan','1 uttapam + sides',25,'medium','["Rice","lentils","onion","tomato"]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"1 uttapam + sides","price":0}]'::jsonb,'[{"id":"extra-sambar","label":"Extra sambar","price":1500},{"id":"extra-chutney","label":"Extra chutney","price":1000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('vanilla-matcha','Vanilla Cloud Matcha','beverages','Earthy Japanese matcha, oat milk, and a whisper of vanilla.',28000,'matcha',null,'A little zen','vegan','1 serving',10,'none','[]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('veg-biryani','Vegetable Dum Biryani','biryani','Basmati, colourful vegetables, mint and spices, sealed and slow cooked.',22000,'veg-biryani',null,'','veg','Serves 1',25,'medium','["Rice","vegetables","yoghurt","mint","spices"]'::jsonb,'["Milk"]'::jsonb,'[{"id":"regular","label":"Serves 1","price":0},{"id":"large","label":"Serves 2","price":15000}]'::jsonb,'[{"id":"raita","label":"Extra raita","price":2000}]'::jsonb,true) on conflict(id) do nothing;
insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values('velvet-latte','Velvet Latte','beverages','A double espresso, silky steamed milk, a little everyday magic.',22000,'latte',null,'The crowd favourite','veg','1 serving',10,'none','[]'::jsonb,'[]'::jsonb,'[{"id":"regular","label":"Regular","price":0}]'::jsonb,'[]'::jsonb,true) on conflict(id) do nothing;
insert into public.bitesbro_schema_migrations(version) values(2) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
