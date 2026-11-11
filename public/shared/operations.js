import { connectDemoStore, clearDamagedDemo } from './demo-store.js?v=portal-auth-1';
import { $, $$, escape, mountRoleNavigation, wireDialogs, localTime, announce, showDialog, detailMarkup, setKitchenIndicator } from './ui.js?v=customer-nav-1';
import { STATUS_LABELS } from './demo-model.js?v=portal-auth-1';
import { cloudConfig, requireRole, loginURL } from './cloud.js?v=portal-auth-1';
import { connectCloudStore } from './cloud-store.js?v=portal-auth-1';

// Preserve the operational layouts, while removing historical demo copy in cloud mode.
export function liveCopy(root = document.body) {
 if (document.body.dataset.live !== 'true' || document.body.classList.contains('history-page')) return;
 const guest = document.body.dataset.guest === 'true';
 const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;
 while ((node=walker.nextNode())) {
  if (node.parentElement.closest('script,style,.table-dish,.ticket-items,.popular-list,.ticket-instructions,.payment-panel,.payments-admin')) continue;
  node.textContent=node.textContent
   .replace(/Demo Mode — No real orders or payments\. Shared in this browser only\./g,'Orders saved in Supabase.')
   .replace(/A live view of the fictional orders, menu and kitchen activity in this browser\./g,'Orders, menu and kitchen activity saved in Supabase.')
   .replace(/Prices and availability change only in this browser demo\./g,'Prices and availability are saved in Supabase.')
   .replace(/These switches update the demo customer menu and administrator view\. The actual restaurant database is unchanged\./g,'Availability changes update the customer menu and administrator view.')
   .replace(/This is a browser-based simulation[\s\S]*/g,guest?'Your orders are private to this guest session and authorised staff.':'Your order history is visible only to your account and authorised staff.')
   .replace(/Demo order history/gi,guest?'Guest order history':'Order history')
   .replace(/Your demonstration order/gi,'Your order').replace(/Follow your demonstration order/g,'Follow your order')
   .replace(/Simple preferences for this demonstration\. Real business settings and SQLite stay unchanged\./g,'Manage ordering and kitchen preparation settings.')
   .replace(/Staff sign-in and server-side role permissions are required before connecting real operations\./g,'Staff sign-in is required. Administrators manage kitchen access in Settings.')
   .replace(/Changes sync between tabs in this browser only\./g,'Updates refresh from Supabase every eight seconds.')
   .replace(/simulated sales/gi,'collected order value').replace(/Simulated data only\./g,'Order values only; online payments are not connected.')
   .replace(/demonstration sales/gi,'collected order value').replace(/Simulated reports/g,'Order reports')
   .replace(/demonstration orders/g,'orders').replace(/demonstration menu/g,'menu').replace(/demonstration catalogue/g,'catalogue')
   .replace(/fictional orders/g,'orders').replace(/fictional order/g,'order').replace(/fictional kitchen/g,'kitchen')
   .replace(/fictional history/g,'order history').replace(/fictional preparation/g,'preparation')
   .replace(/demonstration overview/g,'overview').replace(/demonstration status/g,'order status')
   .replace(/demonstration dish/g,'dish').replace(/demonstration settings/g,'kitchen settings')
   .replace(/demonstration ticket/g,'order').replace(/demonstration activity/g,'staff activity')
   .replace(/in this browser/g,'in Supabase').replace(/in this demonstration/g,'in the catalogue')
   .replace(/Customer demo/g,'Customer').replace(/Your demo order/g,'Your order').replace(/Customer demo/g,'Customer')
   .replace(/demo orders/g,'orders').replace(/demo order/g,'order').replace(/demo dish/g,'dish').replace(/demo menu/g,'menu')
   .replace(/demo preferences/g,'kitchen preferences').replace(/Demo preferences/g,'Kitchen preferences')
   .replace(/new demo checkout/g,'new orders').replace(/Demo availability/g,'Menu availability')
   .replace(/demo delivery/g,'delivery').replace(/Demo total/g,'Order total').replace(/Total demo orders/g,'Total orders')
   .replace(/ · DEMO/g,'').replace(/Leave demo/g,'Sign in').replace(/BitesBro Demo/g,'BitesBro');
 }
 document.title=document.title.replace('BitesBro Demo','BitesBro');
}

export function statCard(key, label, value, note, highlight = false) {
 return `<article class="stat-card ${highlight ? 'highlight' : ''}" data-metric="${escape(key)}"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`;
}
export async function startOperations(role, render, setup = () => {}) {
 wireDialogs();
 const clock = () => { const target = $('#ops-clock'); if (target) { target.dateTime = new Date().toISOString(); target.innerHTML = `${localTime(new Date())}<small>Bangalore · kitchen hours 10–3 &amp; 6–11</small>`; } };
 clock(); setInterval(clock, 60000);
 let store, selectedReference;
 try {
  const config=await cloudConfig(); const account=await requireRole(role);
  if(!account) return null;
  if(config.enabled) document.body.dataset.live='true';
  if(account.guest)document.body.dataset.guest='true';
  await mountRoleNavigation(role,!config.enabled,account.demo?undefined:account);
  store = config.enabled ? await connectCloudStore(role) : await connectDemoStore();
  if(config.enabled){
   document.querySelectorAll('a[href="../?demo=1"],a[href="../"]').forEach(link=>{if(link.closest('footer'))link.remove();});
   if(role==='customer')document.querySelectorAll('a[href^="../kitchen/"],a[href^="../admin/"]').forEach(link=>link.remove());
  }
  const redraw = error => {
   if(error instanceof Error) return announce('Updates could not load. Check your connection and retry.',true);
   try {
    const focused=document.activeElement;
    const reference=focused?.dataset?.reference;
    const selectors=['data-availability','data-menu-availability','data-archive-dish'];
    const control=selectors.find(attribute=>focused?.hasAttribute?.(attribute));
    const controlValue=control?focused.getAttribute(control):null;
    const state = store.read(); setKitchenIndicator(state); render(state); liveCopy();
    if ($('#order-dialog')?.open && selectedReference) {
     const order = state.orders.find(order => order.reference === selectedReference);
     const editingDelivery=focused?.closest('[data-assign-delivery]');
     const preserveDeliveryForm=editingDelivery&&!editingDelivery.dataset.busy&&['unassigned','assigned','failed','picked_up','out_for_delivery'].includes(order?.delivery?.status);
     if (order&&!preserveDeliveryForm) $('#order-dialog-content').innerHTML = detailMarkup(order, role); else if(!order) $('#order-dialog').close();
    }
    if(focused&&!focused.isConnected){
     const replacement=reference?$(`[data-reference="${CSS.escape(reference)}"]`):control?$(`[${control}="${CSS.escape(controlValue)}"]`):null;
     (replacement||$('dialog[open] [data-close-dialog]')||$('#queue-filters [aria-pressed=true]')||$('#admin-menu-status')||$('#tracking-reference'))?.focus({preventScroll:true});
    }
   } catch (error) { announce(error.message, true); }
  };
  await setup(store, redraw);
  store.subscribe(redraw);
  document.addEventListener('click', async event => {
   const details = event.target.closest('[data-view-order]');
   if (details) {
    const order = store.read().orders.find(order => order.reference === details.dataset.viewOrder);
    if (!order) return announce('That demo order no longer exists.', true);
    selectedReference = order.reference; $('#order-dialog-title').textContent = order.reference;
    $('#order-dialog-content').innerHTML = detailMarkup(order, role); showDialog($('#order-dialog'));
   }
   const delivery=event.target.closest('[data-delivery-action]');
   const action = delivery||event.target.closest('[data-order-action]'); if (!action) return;
   action.disabled = true;
   try {
    const status=delivery?action.dataset.deliveryAction:action.dataset.orderAction;
    await store.dispatch({ type: delivery?'order.delivery':'order.transition', reference: action.dataset.reference, status, role });
    announce(`${action.dataset.reference} is now ${STATUS_LABELS[status]}.`);
   } catch (error) { announce(error.message, true); }
   finally { if (action.isConnected) action.disabled = false; }
  });
  redraw();
  liveCopy(); delete document.body.dataset.accessPending;
  return store;
 } catch (error) {
  const live=document.body.dataset.live==='true';
  const target = role === 'admin' ? $('.admin-main') : $('main');
  if(live || !(await cloudConfig().catch(()=>({}))).demoEnabled){
   target.innerHTML=`<div class="ops-error-state"><h1>This page could not open.</h1><p>${escape(error.message)}</p><a class="ops-button" href="${escape(loginURL())}">Sign in</a><button class="ops-button" id="retry-cloud">Try again</button></div>`;
   $('#retry-cloud').addEventListener('click',()=>location.reload()); delete document.body.dataset.accessPending; return null;
  }
  target.innerHTML = `<div class="ops-error-state"><h2>The demo couldn’t open.</h2><p>${escape(error.message)}</p><div class="ops-form-actions"><button class="ops-button ops-button-primary" id="retry-demo">Try again</button><button class="ops-button" id="recover-demo">Reset fictional demo data</button></div><p class="ops-muted">Only this browser’s demo namespace is cleared. The restaurant database and saved food bag are unaffected.</p><p class="ops-form-result" id="recovery-error" role="status"></p></div>`;
  $('#retry-demo').addEventListener('click', () => location.reload());
  $('#recover-demo').addEventListener('click', () => { try { clearDamagedDemo(); location.reload(); } catch { $('#recovery-error').textContent='Browser site storage is unavailable. Enable it and reload.'; } });
  delete document.body.dataset.accessPending;
  return null;
 }
}
