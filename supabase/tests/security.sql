-- Optional real Postgres/RLS integration checks. Run AFTER setup.sql in SQL Editor.
-- Everything, including fixture users and Storage rows, is rolled back. No emails/files are sent.
-- Run this WHOLE file. A SECURITY FAILURE exception means do not deploy.
begin;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
values
 ('b17e0000-0000-4000-8000-000000000001','authenticated','authenticated','customer-a@bitesbro.invalid',now(),'{"role":"admin","display_name":"Security fixture"}','{}',now(),now()),
 ('b17e0000-0000-4000-8000-000000000002','authenticated','authenticated','customer-b@bitesbro.invalid',now(),'{}','{}',now(),now()),
 ('b17e0000-0000-4000-8000-000000000003','authenticated','authenticated','chef@bitesbro.invalid',now(),'{}','{}',now(),now()),
 ('b17e0000-0000-4000-8000-000000000004','authenticated','authenticated','admin@bitesbro.invalid',now(),'{}','{}',now(),now());
update public.user_roles set role='chef' where user_id='b17e0000-0000-4000-8000-000000000003';
update public.user_roles set role='admin' where user_id='b17e0000-0000-4000-8000-000000000004';
-- Temporarily resume ordering for the fixture; original settings return on rollback.
update public.restaurant_settings set accepting_orders=true where id;

set local role anon;
do $test$
begin
 if public.my_role() is not null then raise exception 'SECURITY FAILURE: anonymous role'; end if;
 begin perform public.get_operations(); raise exception 'SECURITY FAILURE: anonymous operations'; exception when insufficient_privilege then null; end;
 begin perform * from public.orders; raise exception 'SECURITY FAILURE: anonymous private table'; exception when insufficient_privilege then null; end;
end $test$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','b17e0000-0000-4000-8000-000000000001',true);
do $test$
declare result jsonb; request jsonb;
begin
 if public.my_role()<>'customer' then raise exception 'SECURITY FAILURE: user metadata promoted signup'; end if;
 request := jsonb_build_object('requestId',gen_random_uuid(),'name','Security fixture','phone','9000000000','consent',true,
  'date',((now() at time zone 'Asia/Kolkata')::date+1)::text,'time','10:00','fulfilment','pickup',
  'total',1,'role','admin','items',jsonb_build_array(jsonb_build_object('id','masala-dosa','quantity',2)));
 result := public.place_order(request);
 if (result->>'total')::integer <> 2*(select price+(variants->0->>'price')::integer from public.menu_items where id='masala-dosa') then raise exception 'SECURITY FAILURE: trusted client total'; end if;
 perform set_config('bitesbro.test_order',result->>'reference',true);
 if public.place_order(request)->>'reference' <> result->>'reference' then raise exception 'SECURITY FAILURE: duplicate retry'; end if;
 request := request || jsonb_build_object('requestId',gen_random_uuid(),'fulfilment','delivery','address','SQL test fixture address','postcode','560001',
  'items',jsonb_build_array(jsonb_build_object('id','masala-dosa','quantity',1,'variant','ghee-roast','spice','mild','addons',jsonb_build_array('extra-sambar'))));
 result := public.place_order(request);
 if (result->>'subtotal')::integer <> (select price+(select (v->>'price')::integer from jsonb_array_elements(variants) v where v->>'id'='ghee-roast')+(select (a->>'price')::integer from jsonb_array_elements(addons) a where a->>'id'='extra-sambar') from public.menu_items where id='masala-dosa') then raise exception 'SECURITY FAILURE: option pricing'; end if;
 if (result->>'deliveryFee')::integer <> (select case when (result->>'subtotal')::integer<free_delivery_from then delivery_fee else 0 end from public.restaurant_settings where id) then raise exception 'SECURITY FAILURE: delivery pricing'; end if;
 begin perform public.place_order(request || jsonb_build_object('requestId',gen_random_uuid(),'time','10:00:59')); raise exception 'SECURITY FAILURE: off-grid food time'; exception when invalid_parameter_value then null; end;
 begin perform public.place_order(request || jsonb_build_object('requestId',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('id','masala-dosa','quantity',0)))); raise exception 'SECURITY FAILURE: invalid quantity'; exception when invalid_parameter_value then null; end;
 begin perform public.place_order(request || jsonb_build_object('requestId',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('id','masala-dosa','quantity',1,'addons',jsonb_build_array('not-a-real-addon'))))); raise exception 'SECURITY FAILURE: invalid add-on'; exception when invalid_parameter_value then null; end;
 begin perform public.place_order(request || jsonb_build_object('requestId',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('id','masala-dosa','quantity',1),jsonb_build_object('id','masala-dosa','quantity',1)))); raise exception 'SECURITY FAILURE: duplicate bag lines'; exception when invalid_parameter_value then null; end;
 begin update public.user_roles set role='admin' where user_id=auth.uid(); raise exception 'SECURITY FAILURE: role table writable'; exception when insufficient_privilege then null; end;
 begin perform public.set_staff_role('customer-a@bitesbro.invalid','admin'); raise exception 'SECURITY FAILURE: self promotion'; exception when insufficient_privilege then null; end;
 begin perform public.save_kitchen_settings(false,30); raise exception 'SECURITY FAILURE: customer settings'; exception when insufficient_privilege then null; end;
 begin perform public.set_menu_availability('masala-dosa',false); raise exception 'SECURITY FAILURE: customer menu writes'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('menu-images','files/security-fixture-000000000000.jpg'); raise exception 'SECURITY FAILURE: customer storage upload'; exception when insufficient_privilege then null; end;
 begin perform public.transition_order(result->>'reference','ready'); raise exception 'SECURITY FAILURE: customer status skip'; exception when invalid_parameter_value then null; end;
 -- Failed calls above must not partially insert orders or lines.
 if (select count(*) from public.orders)<>2 then raise exception 'SECURITY FAILURE: rejected orders persisted'; end if;
 perform public.submit_customer_form('newsletter','{"consent":true}');
 perform public.submit_customer_form('contact','{"name":"SQL fixture","subject":"SQL test","message":"A harmless SQL test message.","consent":true}');
 perform public.submit_customer_form('reservations',jsonb_build_object('name','SQL fixture','phone','9000000000','date',((now() at time zone 'Asia/Kolkata')::date+1)::text,'time','10:00','guests',8,'consent',true));
 if (select (s->>'seatsLeft')::integer from jsonb_array_elements(public.get_slots((now() at time zone 'Asia/Kolkata')::date+1,true)->'slots') s where s->>'time'='10:00')<>16 then raise exception 'SECURITY FAILURE: reservation capacity'; end if;
end $test$;

select set_config('request.jwt.claim.sub','b17e0000-0000-4000-8000-000000000002',true);
do $test$
begin
 if exists(select 1 from public.orders where reference=current_setting('bitesbro.test_order')) then raise exception 'SECURITY FAILURE: another customer order visible'; end if;
 if exists(select 1 from public.messages) or exists(select 1 from public.reservations) or exists(select 1 from public.newsletter_subscriptions) then raise exception 'SECURITY FAILURE: another customer form visible'; end if;
 if exists(select 1 from jsonb_array_elements(public.get_operations()->'orders') o where o->>'reference'=current_setting('bitesbro.test_order')) then raise exception 'SECURITY FAILURE: another customer RPC order'; end if;
 begin perform public.transition_order(current_setting('bitesbro.test_order'),'cancelled'); raise exception 'SECURITY FAILURE: another customer cancellation'; exception when invalid_parameter_value then null; end;
end $test$;

select set_config('request.jwt.claim.sub','b17e0000-0000-4000-8000-000000000003',true);
do $test$
declare ticket jsonb;
begin
 if public.my_role()<>'chef' then raise exception 'SECURITY FAILURE: chef role missing'; end if;
 if exists(select 1 from public.orders) then raise exception 'SECURITY FAILURE: chef direct contact access'; end if;
 select o into ticket from jsonb_array_elements(public.get_operations()->'orders') o where o->>'reference'=current_setting('bitesbro.test_order');
 if ticket is null or ticket ?| array['name','email','phone','address','postcode','user_id'] then raise exception 'SECURITY FAILURE: kitchen private fields'; end if;
 perform public.transition_order(current_setting('bitesbro.test_order'),'preparing');
 begin perform public.transition_order(current_setting('bitesbro.test_order'),'collected'); raise exception 'SECURITY FAILURE: chef status skip'; exception when invalid_parameter_value then null; end;
 begin perform public.transition_order(current_setting('bitesbro.test_order'),'cancelled'); raise exception 'SECURITY FAILURE: chef cancellation'; exception when invalid_parameter_value then null; end;
 begin perform public.save_menu_item(null,'{}'); raise exception 'SECURITY FAILURE: chef price editing'; exception when insufficient_privilege then null; end;
 begin perform public.set_staff_role('chef@bitesbro.invalid','admin'); raise exception 'SECURITY FAILURE: chef promotion'; exception when insufficient_privilege then null; end;
 begin perform public.save_kitchen_settings(false,30); raise exception 'SECURITY FAILURE: chef admin settings'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('menu-images','files/security-fixture-000000000000.jpg'); raise exception 'SECURITY FAILURE: chef storage upload'; exception when insufficient_privilege then null; end;
 perform public.set_menu_availability('masala-dosa',false);
 perform public.set_menu_availability('masala-dosa',true);
 perform public.transition_order(current_setting('bitesbro.test_order'),'ready');
end $test$;

select set_config('request.jwt.claim.sub','b17e0000-0000-4000-8000-000000000004',true);
do $test$
declare ticket jsonb; photo public.menu_photos; path text; dish jsonb; changed jsonb;
begin
 select o into ticket from jsonb_array_elements(public.get_operations()->'orders') o where o->>'reference'=current_setting('bitesbro.test_order');
 if ticket is null or not (ticket ?& array['name','email','phone']) then raise exception 'SECURITY FAILURE: admin order access'; end if;
 perform public.transition_order(current_setting('bitesbro.test_order'),'collected');
 begin perform public.transition_order(current_setting('bitesbro.test_order'),'preparing'); raise exception 'SECURITY FAILURE: reopened terminal order'; exception when invalid_parameter_value then null; end;
 perform public.set_staff_role('customer-b@bitesbro.invalid','chef');
 perform public.save_kitchen_settings(false,30);
 select m into dish from jsonb_array_elements(public.get_operations()->'menu') m where m->>'id'='masala-dosa';
 changed := public.save_menu_item('masala-dosa',dish || jsonb_build_object('name','SQL edited dosa','price',15900));
 if changed->>'name'<>'SQL edited dosa' or (changed->>'price')::integer<>15900 then raise exception 'SECURITY FAILURE: admin menu edit'; end if;
 if exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where o.reference=current_setting('bitesbro.test_order') and i.unit_price=15900) then raise exception 'SECURITY FAILURE: order snapshot changed'; end if;
 changed := public.save_menu_item(null,dish || jsonb_build_object('name','SQL new dish','price',9900));
 perform public.archive_menu_item(changed->>'id',true);
 if exists(select 1 from jsonb_array_elements(public.get_menu()->'items') m where m->>'id'=changed->>'id') then raise exception 'SECURITY FAILURE: archived dish publicly listed'; end if;
 perform public.archive_menu_item(changed->>'id',false);
 select * into photo from public.menu_photos order by id limit 1;
 path := 'files/' || photo.id || '-' || left(photo.sha256,12) || '.jpg';
 -- If the real photo is already present, use its existing row. All changes roll back.
 if not exists(select 1 from storage.objects where bucket_id='menu-images' and name=path) then
  insert into storage.objects(bucket_id,name) values('menu-images',path);
 end if;
 perform public.register_menu_photo(photo.id,path);
 if not exists(select 1 from public.menu_photos where id=photo.id and object_path=path) then raise exception 'SECURITY FAILURE: photo registration'; end if;
end $test$;
reset role;
rollback;
select 'BitesBro security checks passed; all fixture changes rolled back.' as result;
