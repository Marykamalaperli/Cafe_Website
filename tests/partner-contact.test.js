import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPaymentReviewDatabase} from '../server/payment-review-database.js';
import {partnerPhone} from '../public/shared/delivery-tracking.js';

test('partner dialler links accept only a normalized telephone number',()=>{
 assert.equal(partnerPhone('+91 90000 00000'),'+919000000000');assert.equal(partnerPhone('(080) 1234-5678'),'08012345678');
 for(const input of [null,'','123','javascript:alert(1)','tel:+919000000000','1234567;999','1234567890123456','+91x9000000000'])assert.equal(partnerPhone(input),null);
});
for(const includePayments of [false,true])test(`only administrators save partner contact and only owner/admin receive it (payments=${includePayments})`,async()=>{
 const app=await createPaymentReviewDatabase({includePayments});
 try{
  await app.db.exec(await readFile('supabase/migrations/010_staff_delivery_tracking.sql','utf8'));
  const migration=await readFile('supabase/migrations/011_delivery_partner_contact.sql','utf8');await app.db.exec(migration);await app.db.exec(migration);
  const guest=app.users.find(user=>user.is_anonymous),admin=app.users.find(user=>user.role==='admin'),chef=app.users.find(user=>user.role==='chef'),other=app.users.find(user=>user.email==='demo.other@bitesbro.invalid');
  const cafe=(await app.rpc('get_cafe')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const placed=await app.rpc('place_order',{p:{requestId:crypto.randomUUID(),name:'Contact fixture',email:'contact@fixture.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,fulfilment:'delivery',address:'Isolated fixture address',postcode:'560066',items:[{id:'masala-dosa',quantity:1}]}},guest);assert.equal(placed.error,null);
  const reference=placed.data.reference,args={p_reference:reference,p_rider:'Fixture partner',p_phone:'+91 90000 00000',p_minutes:45};
  assert.ok((await app.rpc('assign_order_delivery_contact',args,admin)).error,'Kitchen readiness is required');
  for(const status of ['preparing','ready'])assert.equal((await app.rpc('transition_order',{p_reference:reference,p_status:status},chef)).error,null);
  for(const who of [null,guest,chef,other])assert.ok((await app.rpc('assign_order_delivery_contact',args,who)).error);
  for(const invalid of [{p_rider:''},{p_phone:''},{p_phone:'javascript:alert(1)'},{p_phone:'123'}])assert.ok((await app.rpc('assign_order_delivery_contact',{...args,...invalid},admin)).error);
  const assigned=await app.rpc('assign_order_delivery_contact',args,admin);assert.equal(assigned.error,null,assigned.error?.message);assert.equal(assigned.data.delivery.riderPhone,'+919000000000');
  assert.equal((await app.rpc('assign_order_delivery_contact',args,admin)).error,null);
  const owned=(await app.rpc('get_order_history',{p_reference:reference},guest)).data.selectedOrder;assert.equal(owned.delivery.riderName,'Fixture partner');assert.equal(owned.delivery.riderPhone,'+919000000000');
  assert.equal((await app.rpc('get_order_history',{p_reference:reference},other)).data.selectedOrder,null);
  const kitchen=(await app.rpc('get_operations',{},chef)).data.orders.find(order=>order.reference===reference);assert.equal(kitchen.delivery.riderName,'');assert.equal(kitchen.delivery.riderPhone,'');
  for(const status of ['picked_up','out_for_delivery'])assert.equal((await app.rpc('update_order_delivery',{p_reference:reference,p_status:status},admin)).error,null);
  const updated=await app.rpc('assign_order_delivery_contact',{...args,p_phone:'+91 91111 11111'},admin);assert.equal(updated.error,null);assert.equal(updated.data.delivery.status,'out_for_delivery');assert.equal(updated.data.delivery.riderPhone,'+919111111111');
  assert.equal((await app.db.query("select count(*)::int as n from public.delivery_events where status='assigned'")).rows[0].n,1,'Contact updates never invent another assignment');
  await app.rpc('update_order_delivery',{p_reference:reference,p_status:'delivered'},admin);
  assert.ok((await app.rpc('assign_order_delivery_contact',args,admin)).error,'Terminal delivery cannot be reassigned');
 }finally{await app.close();}
});
