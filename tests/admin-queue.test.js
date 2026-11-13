import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderQueue,orderNextStep} from '../public/shared/admin-queue.js';
test('delivery handover stays active after the kitchen has collected the order',()=>{
 const order={fulfilment:'delivery',status:'collected',delivery:{status:'picked_up'}};
 assert.equal(orderQueue(order),'delivery');assert.equal(orderNextStep(order),'Mark on the way');
 assert.equal(orderQueue({...order,delivery:{status:'out_for_delivery'}}),'delivery');assert.equal(orderQueue({...order,delivery:{status:'delivered'}}),'complete');
 assert.equal(orderQueue({...order,status:'cancelled'}),'cancelled');
});
test('order tasks distinguish preparation, assignment, pickup and payment review',()=>{
 assert.equal(orderQueue({fulfilment:'delivery',status:'ready',delivery:{status:'unassigned'}}),'assign');
 assert.equal(orderQueue({fulfilment:'delivery',status:'ready',delivery:{status:'assigned'}}),'pickup');
 assert.equal(orderQueue({fulfilment:'pickup',status:'ready'}),'kitchen');
 assert.equal(orderQueue({fulfilment:'pickup',status:'collected'}),'complete');
 assert.equal(orderNextStep({fulfilment:'delivery',status:'received',payment:{method:'youpi',status:'submitted'}}),'Review payment');
});
