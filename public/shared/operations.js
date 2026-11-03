import { connectDemoStore, clearDamagedDemo } from './demo-store.js?v=three-roles-2';
import { $, $$, escape, mountRoleNavigation, wireDialogs, localTime, announce, showDialog, detailMarkup, setKitchenIndicator } from './ui.js?v=three-roles-2';
import { STATUS_LABELS } from './demo-model.js?v=three-roles-2';

export function statCard(key, label, value, note, highlight = false) {
 return `<article class="stat-card ${highlight ? 'highlight' : ''}" data-metric="${escape(key)}"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`;
}
export async function startOperations(role, render, setup = () => {}) {
 mountRoleNavigation(role, true); wireDialogs();
 const clock = () => { const target = $('#ops-clock'); if (target) { target.dateTime = new Date().toISOString(); target.innerHTML = `${localTime(new Date())}<small>Bangalore · kitchen hours 10–3 &amp; 6–11</small>`; } };
 clock(); setInterval(clock, 60000);
 let store, selectedReference;
 try {
  store = await connectDemoStore();
  const redraw = () => {
   try {
    const focused=document.activeElement;
    const reference=focused?.dataset?.reference;
    const selectors=['data-availability','data-menu-availability','data-archive-dish'];
    const control=selectors.find(attribute=>focused?.hasAttribute?.(attribute));
    const controlValue=control?focused.getAttribute(control):null;
    const state = store.read(); setKitchenIndicator(state); render(state);
    if ($('#order-dialog')?.open && selectedReference) {
     const order = state.orders.find(order => order.reference === selectedReference);
     if (order) $('#order-dialog-content').innerHTML = detailMarkup(order, role); else $('#order-dialog').close();
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
   const action = event.target.closest('[data-order-action]'); if (!action) return;
   action.disabled = true;
   try {
    await store.dispatch({ type: 'order.transition', reference: action.dataset.reference, status: action.dataset.orderAction, role });
    announce(`${action.dataset.reference} is now ${STATUS_LABELS[action.dataset.orderAction]}.`);
   } catch (error) { announce(error.message, true); }
   finally { if (action.isConnected) action.disabled = false; }
  });
  redraw();
  return store;
 } catch (error) {
  const target = role === 'admin' ? $('.admin-main') : $('main');
  target.innerHTML = `<div class="ops-error-state"><h2>The demo couldn’t open.</h2><p>${escape(error.message)}</p><div class="ops-form-actions"><button class="ops-button ops-button-primary" id="retry-demo">Try again</button><button class="ops-button" id="recover-demo">Reset fictional demo data</button></div><p class="ops-muted">Only this browser’s demo namespace is cleared. The restaurant database and saved food bag are unaffected.</p><p class="ops-form-result" id="recovery-error" role="status"></p></div>`;
  $('#retry-demo').addEventListener('click', () => location.reload());
  $('#recover-demo').addEventListener('click', () => { try { clearDamagedDemo(); location.reload(); } catch { $('#recovery-error').textContent='Browser site storage is unavailable. Enable it and reload.'; } });
  return null;
 }
}
