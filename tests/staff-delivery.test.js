import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPaymentReviewDatabase} from '../server/payment-review-database.js';
import {RESTAURANT_ADDRESS,STAFF_PARTNER,demoDeliveryEstimate} from '../public/shared/delivery-tracking.js';

test('demo arrival times stay illustrative and never complete an order automatically',()=>{
 const order={status:'collected',delivery:{status:'out_for_delivery',estimatedMinutes:45,pickedUpAt:'2026-11-11T10:00:00Z'}};
 assert.equal(demoDeliveryEstimate(order,Date.parse('2026-11-11T10:10:00Z')).arrival,'2026-11-11T10:45:00.000Z');
 assert.equal(demoDeliveryEstimate(order,Date.parse('2026-11-11T11:00:00Z')).overdue,true);assert.equal(order.delivery.status,'out_for_delivery');
 assert.equal(demoDeliveryEstimate({...order,delivery:{status:'unassigned'}}).arrival,null);
 assert.equal(demoDeliveryEstimate({...order,delivery:{status:'delivered'}}).complete,true);
});
for(const includePayments of [false,true])test(`staff delivery enforces assignment, pickup, departure and arrival without losing payments (payments=${includePayments})`,async()=>{
 const app=await createPaymentReviewDatabase({includePayments});
 try{
  const migration=await readFile('supabase/migrations/010_staff_delivery_tracking.sql','utf8');await app.db.exec(migration);await app.db.exec(migration);
  const guest=app.users.find(user=>user.is_anonymous),admin=app.users.find(user=>user.role==='admin'),chef=app.users.find(user=>user.role==='chef'),other=app.users.find(user=>user.email==='demo.other@bitesbro.invalid');
  const cafe=(await app.rpc('get_cafe')).data;assert.equal(cafe.address,RESTAURANT_ADDRESS);
  const date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={requestId:crypto.randomUUID(),name:'Delivery fixture',email:'delivery@fixture.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,fulfilment:'delivery',address:'Isolated delivery fixture address',postcode:'560066',items:[{id:'masala-dosa',quantity:1}],paymentMethod:'cod'};
  const placed=await app.rpc('place_order',{p:input},guest);assert.equal(placed.error,null);const reference=placed.data.reference;
  const assignment={p_reference:reference,p_partner:STAFF_PARTNER,p_rider:'Fixture staff',p_minutes:50};
  const change=status=>app.rpc('update_order_delivery',{p_reference:reference,p_status:status},admin);
  assert.ok((await app.rpc('assign_order_delivery',assignment,admin)).error);
  for(const status of ['preparing','ready'])assert.equal((await app.rpc('transition_order',{p_reference:reference,p_status:status},chef)).error,null);
  for(const who of [null,guest,chef,other])assert.ok((await app.rpc('assign_order_delivery',assignment,who)).error);
  assert.ok((await change('out_for_delivery')).error);assert.ok((await change('picked_up')).error);
  assert.ok((await app.rpc('assign_order_delivery',{...assignment,p_partner:'Unknown courier'},admin)).error);
  assert.ok((await app.rpc('assign_order_delivery',{...assignment,p_minutes:0},admin)).error);
  const assigned=await app.rpc('assign_order_delivery',assignment,admin);assert.equal(assigned.error,null);assert.equal(assigned.data.delivery.status,'assigned');assert.equal(assigned.data.delivery.estimatedMinutes,50);assert.equal(assigned.data.delivery.partnerName,STAFF_PARTNER);assert.equal(assigned.data.delivery.restaurantAddress,RESTAURANT_ADDRESS);
  assert.equal((await app.rpc('assign_order_delivery',assignment,admin)).error,null);
  let history=(await app.rpc('get_order_history',{p_reference:reference},guest)).data;
  assert.equal(history.selectedOrder.delivery.version,10);assert.equal(history.selectedOrder.delivery.riderName,'Fixture staff');
  assert.equal((await app.rpc('get_order_history',{p_reference:reference},other)).data.selectedOrder,null);
  const kitchen=(await app.rpc('get_operations',{},chef)).data.orders.find(order=>order.reference===reference);assert.equal(kitchen.delivery.riderName,'');assert.equal(kitchen.address,undefined);
  assert.ok((await change('delivered')).error);
  const pickup=await change('picked_up');assert.equal(pickup.error,null);assert.equal(pickup.data.status,'collected');assert.ok(pickup.data.delivery.pickedUpAt);
  assert.equal((await change('picked_up')).error,null);assert.equal((await change('out_for_delivery')).error,null);assert.equal((await change('delivered')).error,null);
  assert.ok((await change('out_for_delivery')).error);assert.ok((await app.rpc('assign_order_delivery',assignment,admin)).error);
  const events=(await app.db.query('select status from public.delivery_events where order_id=(select id from public.orders where reference=$1) order by id',[reference])).rows.map(row=>row.status);assert.deepEqual(events,['assigned','picked_up','out_for_delivery','delivered']);
  if(!includePayments){
   await app.db.exec(await readFile('supabase/migrations/008_youpi_payments.sql','utf8'));
   await app.db.exec(migration);
   const upgraded=(await app.rpc('get_order_history',{p_reference:reference},guest)).data.selectedOrder;
   assert.equal(upgraded.delivery.version,10);assert.equal(upgraded.payment.method,'cod','Later payment setup and rerunning 010 retain both projections');
  }
  if(includePayments){
   history=(await app.rpc('get_order_history',{p_reference:reference},guest)).data;assert.equal(history.selectedOrder.payment.method,'cod');
   await app.rpc('set_online_payments',{p_enabled:true},admin);
   const unpaid=await app.rpc('place_order',{p:{...input,requestId:crypto.randomUUID(),paymentMethod:'youpi'}},guest);assert.equal(unpaid.error,null);
   await app.db.query("update public.orders set status='ready' where reference=$1",[unpaid.data.reference]);
   assert.ok((await app.rpc('assign_order_delivery',{...assignment,p_reference:unpaid.data.reference},admin)).error,'Unpaid UPI cannot enter delivery');
  }
 }finally{await app.close();}
});
