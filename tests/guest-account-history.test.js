import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPaymentReviewDatabase} from '../server/payment-review-database.js';
import {historyLocation} from '../public/shared/order-history.js';

test('history URLs retain a valid page and search without trusting invalid page numbers',()=>{
 assert.deepEqual(historyLocation('https://fixture.invalid/orders/?page=3&search=BB-1&order=BB-12'),{page:2,search:'BB-1',reference:'BB-12'});
 for(const value of ['-1','0','NaN','1.5','999999999'])assert.equal(historyLocation('https://fixture.invalid/?page='+value).page,0);
});
for(const includePayments of [false,true])test(`guest orders transfer only with both identities, preserve records and paginate with member orders (payments=${includePayments})`,async()=>{
 const app=await createPaymentReviewDatabase({includePayments});
 try{
  const migration=await readFile('supabase/migrations/009_guest_account_history.sql','utf8');await app.db.exec(migration);await app.db.exec(migration);
  const guest=app.users.find(user=>user.role==='customer'&&user.is_anonymous),member=app.users.find(user=>user.role==='customer'&&!user.is_anonymous),other=app.users.find(user=>user.email==='demo.other@bitesbro.invalid'),chef=app.users.find(user=>user.role==='chef');
  const cafe=(await app.rpc('get_cafe')).data,date=new Date(cafe.today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);
  const input={name:'Transfer fixture',email:'same@fixture.invalid',phone:'9000000000',date:date.toISOString().slice(0,10),time:'10:00',consent:true,fulfilment:'pickup',items:[{id:'masala-dosa',quantity:1}]};
  async function place(who){const result=await app.rpc('place_order',{p:{...input,requestId:crypto.randomUUID()}},who);assert.equal(result.error,null,result.error?.message);return result.data.reference;}
  const guestRefs=[];for(let i=0;i<6;i++)guestRefs.push(await place(guest));const memberRef=await place(member),otherRef=await place(other);
  await app.db.query("update public.orders set status='collected' where user_id=$1",[guest.id]);
  assert.equal((await app.rpc('get_order_history',{},guest)).data.history.total,3);
  assert.ok((await app.rpc('claim_guest_orders',{p_guest:guest.id},member)).error,'Knowing a guest UUID does not authorize transfer');
  assert.ok((await app.rpc('prepare_guest_order_transfer',{p_customer:member.id},member)).error);
  assert.ok((await app.rpc('prepare_guest_order_transfer',{p_customer:chef.id},guest)).error);
  assert.ok((await app.rpc('prepare_guest_order_transfer',{p_customer:member.id})).error);
  assert.equal((await app.rpc('prepare_guest_order_transfer',{p_customer:member.id},guest)).error,null);
  assert.ok((await app.rpc('claim_guest_orders',{p_guest:guest.id},other)).error);
  assert.ok((await app.rpc('claim_guest_orders',{p_guest:guest.id},guest)).error);
  await app.db.query("update bitesbro_private.guest_order_transfers set created_at=now()-interval '11 minutes' where guest_id=$1",[guest.id]);
  assert.ok((await app.rpc('claim_guest_orders',{p_guest:guest.id},member)).error,'An abandoned authorization expires');
  assert.equal((await app.rpc('prepare_guest_order_transfer',{p_customer:member.id},guest)).error,null);
  await app.db.query('update auth.users set is_anonymous=false where id=$1',[guest.id]);
  assert.ok((await app.rpc('claim_guest_orders',{p_guest:guest.id},member)).error,'A now-registered identity cannot be transferred as a guest');
  await app.db.query('update auth.users set is_anonymous=true where id=$1',[guest.id]);
  assert.equal((await app.rpc('claim_guest_orders',{p_guest:guest.id},member)).data,6);
  assert.equal((await app.rpc('claim_guest_orders',{p_guest:guest.id},member)).data,6,'Claim retry is idempotent');
  assert.ok((await app.rpc('prepare_guest_order_transfer',{p_customer:other.id},guest)).error,'A transferred guest cannot be reassigned');
  assert.equal((await app.rpc('prepare_guest_order_transfer',{p_customer:member.id},guest)).error,null);
  const first=(await app.rpc('get_order_history',{p_page:0},member)).data,second=(await app.rpc('get_order_history',{p_page:1},member)).data;
  assert.equal(first.history.total,7);assert.equal(first.history.items.length,5);assert.equal(second.history.items.length,2);
  assert.deepEqual(new Set([...first.history.items,...second.history.items].map(order=>order.reference)),new Set([...guestRefs,memberRef]));
  assert.equal((await app.rpc('get_order_history',{p_reference:otherRef},member)).data.selectedOrder,null);
  assert.equal((await app.rpc('get_order_history',{},guest)).data.history.total,0);
  assert.equal((await app.rpc('get_order_history',{},other)).data.history.total,1);
  assert.ok((await app.rpc('place_order',{p:{...input,requestId:crypto.randomUUID()}},guest)).error,'Stale guest tabs cannot create abandoned orders');
  await place(member);assert.equal((await app.rpc('get_order_history',{},member)).data.history.total,8);
  assert.equal((await app.db.query('select count(*)::int as n from public.orders')).rows[0].n,9);
  if(includePayments)assert.equal((await app.db.query('select count(*)::int as n from public.order_payments')).rows[0].n,9);
  await assert.rejects(app.db.transaction(async tx=>{await tx.exec('set local role authenticated');return tx.query('select * from bitesbro_private.guest_order_transfers');}),/permission denied/);
 }finally{await app.close();}
});
