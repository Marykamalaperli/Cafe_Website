import { startOperations } from '../shared/operations.js?v=history-nav-1';
import { $, escape, orderBadge, orderStatus, money, localTime, siteURL, orderItems, orderTimeline, orderActions, icon, announce, mountRoleNavigation } from '../shared/ui.js?v=history-nav-1';
import { INSTRUCTIONS } from '../shared/demo-model.js?v=history-nav-1';
import { orderHistory, visibleOrders } from '../shared/order-history.js';
import { cloudConfig, identity, cloudClient, loginURL } from '../shared/cloud.js';
import { wireCustomerNavigation } from '../shared/customer-nav.js';

let reference=new URL(location.href).searchParams.get('order'),query='',page=0,store,redraw,busy=false,searchTimer;
const orderDate=value=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
wireCustomerNavigation();

function configurePage({live,guest=true,visitor=false}) {
 document.title=live?'Your orders — BitesBro':'Your orders — BitesBro Demo';
 for(const link of document.querySelectorAll('[data-customer-menu]'))link.href=siteURL(live?'#menu':'?demo=1#menu');
 for(const link of document.querySelectorAll('.brand,.history-footer-brand'))link.href=siteURL(live?'':'?demo=1');
 if(!live)for(const link of document.querySelectorAll('#main-nav a')){const url=new URL(link.href);if(url.hash){url.searchParams.set('demo','1');link.href=url;}}
 $('#history-session-info').textContent=visitor
  ?'Guest history belongs to the browser that placed the order. Sign in to open your registered account history.'
  :!live?'Fictional demo history stays in this browser. No real orders or payments are involved.'
  :guest?'Guest history stays in this browser. Signing into another account or clearing site data removes access to that guest session.'
  :'Your history stays with your account. Open older pages or search a reference to revisit an earlier order.';
 $('#history-refresh-note').textContent=visitor?'Place an order to start tracking':live?'Updates refresh every 8 seconds':'Updates sync between tabs';
 $('#history-service-note').textContent=live
  ?'Order progress is updated by restaurant staff. Online payment, automatic courier booking and confirmation emails are not connected.'
  :'Fictional demo only. Order updates are shared between tabs in this browser; nothing is sent to a real kitchen.';
}

function historyItem(order) {
 const first=order.items[0],count=order.items.reduce((sum,item)=>sum+item.quantity,0);
 return `<li><a href="?order=${encodeURIComponent(order.reference)}" data-track-order="${escape(order.reference)}" ${reference===order.reference?'aria-current="true"':''}><div class="history-card-top">${first?`<img src="${escape(siteURL(first.image))}" alt="" width="54" height="54" loading="lazy">`:''}<div><strong>${escape(order.reference)}</strong><small>${escape(orderDate(order.createdAt))} · ${localTime(order.createdAt)}</small></div>${icon('arrow')}</div><p class="history-card-food">${escape(first?.name||'Food order')}${count>1?` <span>+ ${count-1} more</span>`:''}</p><div class="history-item-bottom">${orderBadge(order)}<span>${money(order.total)}</span></div></a></li>`;
}

function customerDetail(order,live) {
 const status=orderStatus(order),delivery=order.fulfilment==='delivery',count=order.items.reduce((sum,item)=>sum+item.quantity,0);
 const updates={received:['We’ve got your order.','Your next good meal is waiting for the kitchen to get started.'],preparing:['Good things are cooking.','The kitchen is preparing your food. We’ll keep its progress right here.'],ready:[delivery?'Packed and ready to go.':'Ready when you are.',delivery?'Your food is ready. Waiting for a delivery update from the restaurant.':'Your food is ready for pickup.'],out_for_delivery:['Your meal is on its way.','The restaurant has marked your order out for delivery.'],delivered:['Delivered. Enjoy every bite.','The restaurant has confirmed delivery. Thanks for ordering with BitesBro.'],collected:['Picked up. Dig in.','Your order has been collected. We hope it made your day a little better.'],cancelled:['This order was cancelled.','This order is no longer being prepared.']};
 const [title,description]=status==='collected'&&delivery
  ?['Waiting for a delivery update.','The kitchen has handed off this order. Delivery has not yet been confirmed by the restaurant.']
  :updates[status]||updates.received;
 const latest=order.delivery?.timeline?.at(-1)?.at||order.timeline.at(-1)?.at||order.createdAt;
 const instructions=live?order.instructions||'Standard preparation':INSTRUCTIONS[order.instruction];
 return `<div class="ops-panel-header"><div><p class="eyebrow">${live?'YOUR ORDER':'YOUR FICTIONAL DEMO ORDER'}</p><h2 id="tracking-reference" tabindex="-1">${escape(order.reference)}</h2></div><span class="history-fulfilment">${icon(delivery?'pin':'bag')}${delivery?'Delivery':'Pickup'}</span></div>
 <div class="history-progress-heading"><div class="history-progress-icon">${icon(status==='delivered'||status==='collected'?'check':status==='cancelled'?'close':'plate')}</div><div>${orderBadge(order)}<h3>${title}</h3><p>${description}</p><small>Updated ${escape(orderDate(latest))} · ${localTime(latest)}</small></div></div>
 ${orderTimeline(order)}
 <div class="history-detail-grid"><section class="history-food-detail" aria-labelledby="order-food-title"><h3 id="order-food-title">A bag full of good.</h3><p class="ops-muted">${count} ${count===1?'dish':'dishes'} · ordered ${escape(orderDate(order.createdAt))}</p>${orderItems(order,true)}<dl class="ticket-totals"><div><dt>Food subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Delivery fee</dt><dd>${money(order.deliveryFee)}</dd></div><div><dt>Order total</dt><dd>${money(order.total)}</dd></div></dl></section>
 <section class="history-fulfilment-detail" aria-labelledby="order-fulfilment-title"><p class="eyebrow">${delivery?'TO YOUR DOOR':'FROM OUR COUNTER'}</p><h3 id="order-fulfilment-title">${delivery?'Delivery details':'Pickup details'}</h3>${live&&order.date?`<p class="history-schedule">${icon('clock')}<span><strong>${escape(order.date)} · ${escape(order.time)}</strong><small>Bangalore time</small></span></p>`:'<p class="ops-muted">Fictional fulfilment for this browser demo.</p>'}${live&&delivery?`<p class="history-address">${icon('pin')}<span>${escape(order.address)}<br>${escape(order.postcode)}</span></p>`:''}<div class="history-preparation"><strong>Preparation note</strong><p>${escape(instructions||'Standard preparation')}</p></div><div class="order-detail-actions">${orderActions(order,'customer')}</div></section></div>`;
}

function emptyDetail({visitor=false,guest=true}={}) {
 const unavailable=!visitor&&Boolean(reference||query);
 const title=visitor?'No orders in this browser yet.':unavailable?'This order is outside your available history.':'Your first bite starts here.';
 const description=visitor?'Place a guest order to start tracking, or sign in to see the orders saved to your account.':unavailable?(guest?'Choose one of your three recent orders or an order still in progress.':'Choose an order from your history or search for its reference.'):'Find something delicious on the menu. Your order and its progress will appear here after checkout.';
 return `<div class="history-empty"><div class="history-empty-art" aria-hidden="true">${icon('bag')}<span>${icon('spark')}</span></div><p class="eyebrow">A LITTLE ROOM FOR GOOD FOOD</p><h2>${title}</h2><p>${description}</p><div class="history-empty-actions"><a class="ops-button ops-button-orange" href="${escape(siteURL(document.body.dataset.live==='true'?'#menu':'?demo=1#menu'))}">Browse the menu ${icon('arrow')}</a>${visitor?`<a class="ops-button" href="${escape(loginURL())}">Sign in to your account</a>`:''}</div>${visitor?'<p class="history-empty-footnote">Already ordered as a guest? Use the same browser and profile. Switching accounts or clearing site data removes access to the original guest session.</p>':''}</div>`;
}

function render(state) {
 const data=state.history?state:orderHistory(state.live?state.orders:state.orders.filter(order=>order.origin==='customer'),{guest:store?.account?.guest??true,page,search:query,reference}),history=data.history;
 const ids=new Set(history.items.map(order=>order.reference));
 const active=(data.activeOrders||[]).filter(order=>!ids.has(order.reference)&&order.reference.toLowerCase().includes(query.toLowerCase()));
 page=history.page;
 if(!reference)reference=history.items[0]?.reference||active[0]?.reference;
 const available=state.history?state.orders:visibleOrders(data);
 const order=data.selectedOrder?.reference===reference?data.selectedOrder:available.find(order=>order.reference===reference);
 $('#history-title').textContent=history.guest?'Recent guest orders':'Order history';
 $('#history-policy').textContent=history.guest?'Your latest 3 orders appear here. Older active orders remain below until finished.':'Showing 5 orders per page. Search or open older pages to retrieve your earlier orders.';
 $('#order-history').innerHTML=history.items.length?history.items.map(historyItem).join(''):`<li class="ops-empty">${query?'No matching orders.':'No orders yet.'}</li>`;
 $('#history-range').textContent=history.total?`${history.page*history.pageSize+1}–${Math.min((history.page+1)*history.pageSize,history.total)} of ${history.total} orders`:'';
 $('#history-search-field').hidden=!history.total&&!query&&!(data.activeOrders||[]).length;
 $('#history-pagination').hidden=history.guest||history.total<=history.pageSize;
 $('#history-newer').disabled=busy||!history.hasNewer;$('#history-older').disabled=busy||!history.hasOlder;
 $('#active-history-section').hidden=!active.length;$('#active-order-history').innerHTML=active.map(historyItem).join('');
 $('#history-active-count').textContent=(data.activeOrders||[]).length;$('#history-active-label').textContent=data.activeOrders?.length===1?'order':'orders';
 $('#tracking-detail').innerHTML=order?customerDetail(order,state.live):emptyDetail({guest:history.guest});
 $('#history-jump').hidden=!order;
 const url=new URL(location.href);if(reference)url.searchParams.set('order',reference);else url.searchParams.delete('order');window.history.replaceState(null,'',url);
}

async function load(changes={}) {
 busy=true;$('#history-newer').disabled=true;$('#history-older').disabled=true;
 try{if(store.loadHistory)await store.loadHistory(changes);else redraw();if(changes.page!==undefined||changes.search!==undefined)reference=null;}
 catch(error){announce(error.message,true);}finally{busy=false;redraw();}
}

async function showVisitorHistory() {
 document.body.dataset.live='true';document.body.dataset.visitor='true';configurePage({live:true,visitor:true});
 await mountRoleNavigation('customer',false,null);
 $('#history-title').textContent='Recent guest orders';$('#history-policy').textContent='Your latest 3 orders will appear here after guest checkout.';
 $('#order-history').innerHTML='<li class="ops-empty">No guest session in this browser.</li>';
 $('#history-search-field').hidden=true;$('#history-active-count').textContent='0';
 $('#tracking-detail').innerHTML=emptyDetail({visitor:true});delete document.body.dataset.accessPending;
 const {data}= (await cloudClient()).auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session)location.reload();});
 window.addEventListener('pagehide',()=>{document.body.dataset.accessPending='true';data.subscription.unsubscribe();},{once:true});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
}

async function boot() {
 try {
  const config=await cloudConfig();
  if(config.enabled&&!await identity()){await showVisitorHistory();return;}
  await startOperations('customer',render,async(connection,refresh)=>{
   store=connection;redraw=refresh;configurePage({live:connection.live===true,guest:connection.account?.guest??true});
   $('.tracking-history').addEventListener('click',async event=>{
    const link=event.target.closest('[data-track-order]');if(!link)return;
    event.preventDefault();reference=link.dataset.trackOrder;await load({reference});
   });
   $('#history-search').addEventListener('input',event=>{
    query=event.target.value.trim();page=0;reference=null;clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>load({page:0,search:query,reference:null}),250);
   });
   $('#history-newer').addEventListener('click',()=>{page=Math.max(0,page-1);reference=null;load({page,reference:null});});
   $('#history-older').addEventListener('click',()=>{page++;reference=null;load({page,reference:null});});
   window.addEventListener('pagehide',()=>clearTimeout(searchTimer),{once:true});
  });
 }catch(error){
  $('#tracking-detail').innerHTML=`<div class="history-empty"><h2>Your history couldn’t load.</h2><p>${escape(error.message)}</p><button class="ops-button ops-button-primary" id="retry-history" type="button">Try again</button></div>`;
  $('#retry-history').addEventListener('click',()=>location.reload());$('#history-session-info').textContent='Check your connection and try loading your history again.';$('#history-refresh-note').textContent='Updates unavailable';delete document.body.dataset.accessPending;
 }
}
await boot();
