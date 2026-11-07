import { startOperations } from '../shared/operations.js?v=history-7';
import { $, escape, orderBadge, money, localDate, localTime, siteURL, detailMarkup, announce } from '../shared/ui.js?v=history-7';
import { orderHistory, visibleOrders } from '../shared/order-history.js';

let reference=new URL(location.href).searchParams.get('order'),query='',page=0,store,redraw,busy=false,searchTimer;
function historyItem(order){
 return `<li><a href="?order=${encodeURIComponent(order.reference)}" data-track-order="${escape(order.reference)}" ${reference===order.reference?'aria-current="true"':''}><strong>${escape(order.reference)}</strong><small>${localDate(order.createdAt)} · ${localTime(order.createdAt)}</small><div class="history-item-bottom">${orderBadge(order)}<span>${money(order.total)}</span></div></a></li>`;
}
function render(state){
 const data=state.history?state:orderHistory(state.live?state.orders:state.orders.filter(order=>order.origin==='customer'),{guest:store?.account?.guest??true,page,search:query,reference}),history=data.history;
 const ids=new Set(history.items.map(order=>order.reference));
 const active=(data.activeOrders||[]).filter(order=>!ids.has(order.reference)&&order.reference.toLowerCase().includes(query.toLowerCase()));
 page=history.page;
 if(!reference)reference=history.items[0]?.reference||active[0]?.reference;
 const available=state.history?state.orders:visibleOrders(data);
 const order=data.selectedOrder?.reference===reference?data.selectedOrder:available.find(order=>order.reference===reference);
 $('#history-title').textContent=history.guest?'Recent guest orders':'Order history';
 $('#history-policy').textContent=history.guest?'Your latest 3 orders appear here. Older active orders remain below until finished.':'Showing 5 orders per page. Search or open older pages to retrieve your earlier orders.';
 $('#order-history').innerHTML=history.items.length?history.items.map(historyItem).join(''):'<li class="ops-empty">No matching orders.</li>';
 $('#history-range').textContent=history.total?`${history.page*history.pageSize+1}–${Math.min((history.page+1)*history.pageSize,history.total)} of ${history.total} orders`:'';
 $('#history-pagination').hidden=history.guest||history.total<=history.pageSize;
 $('#history-newer').disabled=busy||!history.hasNewer;$('#history-older').disabled=busy||!history.hasOlder;
 $('#active-history-section').hidden=!active.length;$('#active-order-history').innerHTML=active.map(historyItem).join('');
 const count=order?.items.reduce((sum,item)=>sum+item.quantity,0);
 $('#tracking-detail').innerHTML=order?`<div class="ops-panel-header"><div><p class="eyebrow">${state.live?'YOUR ORDER':'YOUR FICTIONAL DEMO ORDER'}</p><h2 id="tracking-reference" tabindex="-1">${escape(order.reference)}</h2></div><span class="ops-muted">${count} ${count===1?'dish':'dishes'}</span></div>${detailMarkup(order,'customer')}`:`<div class="ops-empty"><h2>This order is outside your available history.</h2><p>${history.guest?'Choose one of your three recent orders or an order still in progress.':'Choose an order from your history or search for its reference.'}</p><a class="ops-button" href="${escape(siteURL(state.live?'#menu':'?demo=1#menu'))}">Browse the menu</a></div>`;
 const url=new URL(location.href);if(reference)url.searchParams.set('order',reference);else url.searchParams.delete('order');historyURL(url);
}
function historyURL(url){window.history.replaceState(null,'',url);}
async function load(changes={}){
 busy=true;$('#history-newer').disabled=true;$('#history-older').disabled=true;
 try{if(store.loadHistory)await store.loadHistory(changes);else redraw();if(changes.page!==undefined||changes.search!==undefined)reference=null;}
 catch(error){announce(error.message,true);}finally{busy=false;redraw();}
}
await startOperations('customer',render,async(connection,refresh)=>{
 store=connection;redraw=refresh;
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
