// Presentation only; date scope, permissions and transitions stay with existing services.
export const ORDER_QUEUES=[['all','All orders'],['kitchen','In kitchen'],['assign','Assign partner'],['pickup','Awaiting pickup'],['delivery','Delivery in progress'],['complete','Completed']];
export function orderQueue(order){
 if(order.status==='cancelled')return 'cancelled';
 if(order.fulfilment==='delivery'){
  const status=order.delivery?.status;
  if(status==='delivered')return 'complete';
  if(['picked_up','out_for_delivery'].includes(status))return 'delivery';
  if(status==='assigned')return 'pickup';
  if(['ready','collected'].includes(order.status))return 'assign';
 }else if(order.status==='collected')return 'complete';
 return 'kitchen';
}
export function orderNextStep(order){
 if(order.status==='cancelled')return 'Cancelled';
 if(order.payment?.method==='youpi'&&order.payment.status!=='paid'&&order.status==='received')return 'Review payment';
 return {assign:'Assign delivery partner',pickup:'Confirm staff pickup',delivery:order.delivery?.status==='picked_up'?'Mark on the way':'Confirm delivery',complete:'Completed',kitchen:order.status==='received'?'Start preparation':order.status==='preparing'?'Finish preparation':'Await collection'}[orderQueue(order)];
}
