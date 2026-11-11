export const RESTAURANT_ADDRESS='White Rose Layout, 2nd Cross Rd, near Narayana School, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066';
export const STAFF_PARTNER='BitesBro restaurant staff';
export const detailedDelivery=order=>order.fulfilment==='delivery'&&order.delivery?.version>=10;
export function demoDeliveryEstimate(order,now=Date.now()){
 const minutes=Number.isInteger(order.delivery?.estimatedMinutes)&&order.delivery.estimatedMinutes>=10&&order.delivery.estimatedMinutes<=180?order.delivery.estimatedMinutes:45;
 const pickedUp=Date.parse(order.delivery?.pickedUpAt||'');
 if(order.delivery?.status==='delivered'||order.status==='cancelled')return{minutes,arrival:null,overdue:false,complete:true};
 const arrival=Number.isFinite(pickedUp)?new Date(pickedUp+minutes*60000).toISOString():null;
 return{minutes,arrival,overdue:arrival?Date.parse(arrival)<Number(now):false,complete:false};
}

export function partnerPhone(value){
 if(typeof value!=='string'||value.length>24)return null;
 const phone=value.replace(/[\s()-]/g,'');
 return /^\+?[0-9]{7,15}$/.test(phone)?phone:null;
}
