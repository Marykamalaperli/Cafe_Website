import { rpc, resolveMenu, requireRole, cloudClient } from './cloud.js';
import { orderHistory, visibleOrders } from './order-history.js';

// Cloud operational data stays in memory. Never copy real records to the demo/local store.
export async function connectCloudStore(pageRole) {
 const account = await requireRole(pageRole);
 if (!account || account.demo) throw new Error('An authenticated Supabase account is required.');
 let state, stopped = false, pending, timer, subscription;
 let historyAvailable=true,historyVersion=0,historyRequest={p_page:0,p_search:'',p_reference:new URL(location.href).searchParams.get('order')};
 const listeners = new Set();
 const visibility = () => { if (!document.hidden) refresh().catch(() => {}); };
 async function refresh() {
  if (stopped) return;
  return pending ||= (async () => {
   let requestedVersion;
   do{
   requestedVersion=historyVersion;
   const allowed = await requireRole(pageRole);
   if (!allowed) { stop(); return; }
   let data;
   if(pageRole==='customer'&&historyAvailable){
    try{data=await rpc('get_order_history',historyRequest);}catch(error){if(error.code!=='PGRST202'&&error.code!=='42883')throw error;historyAvailable=false;}
   }
   data ||= await rpc('get_operations');
   if(pageRole==='customer'){
    if(!data.history)data={...data,...orderHistory(data.orders,{guest:account.guest,page:historyRequest.p_page,search:historyRequest.p_search,reference:historyRequest.p_reference})};
    data.orders=visibleOrders(data);
   }
   const catalogue = await resolveMenu({ items: data.menu });
   if(stopped)return;
   state = { ...data, menu: catalogue.items, live: true };
   for (const listener of listeners) listener();
   }while(!stopped&&requestedVersion!==historyVersion);
  })().finally(() => { pending = null; });
 }
 await refresh();
 timer = setInterval(() => { if (!document.hidden) refresh().catch(error => { for (const listener of listeners) listener(error); }); }, 8000);
 document.addEventListener('visibilitychange', visibility);
 ({ data: subscription } = (await cloudClient()).auth.onAuthStateChange((event,session) => {
  if (event === 'SIGNED_OUT'||event==='SIGNED_IN'&&session?.user.id!==account.user.id) { state = null; document.body.dataset.accessPending='true'; stop(); location.reload(); }
 }));
 function stop() { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); subscription?.subscription.unsubscribe(); }
 window.addEventListener('pagehide', () => { document.body.dataset.accessPending='true';stop(); }, { once: true });
 window.addEventListener('pageshow', event => { if(event.persisted)location.reload(); });
 return {
  live: true, account,
  read: () => structuredClone(state),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  refresh,
  async loadHistory({page,search,reference}={}){
   historyRequest={p_page:page??historyRequest.p_page,p_search:search??historyRequest.p_search,p_reference:reference===undefined?historyRequest.p_reference:reference};historyVersion++;
   return refresh();
  },
  async dispatch(action) {
   let result;
   if (action.type === 'order.transition') result = await rpc('transition_order', { p_reference: action.reference, p_status: action.status });
   else if(action.type==='order.delivery')result=await rpc('update_order_delivery',{p_reference:action.reference,p_status:action.status});
   else if (action.type === 'menu.availability') await rpc('set_menu_availability', { p_id: action.id, p_value: action.value });
   else if (action.type === 'menu.archive') await rpc('archive_menu_item', { p_id: action.id, p_value: action.value });
   else if (action.type === 'menu.save') {
    const source = state.menu.find(item => item.image === action.fields.image);
    result = await rpc('save_menu_item', { p_id: action.id || null, p: { ...action.fields, image: source?.localImage || action.fields.image } });
   } else if (action.type === 'settings.save') await rpc('save_kitchen_settings', { p_accepting: action.acceptingOrders, p_prep: action.prepMinutes });
   else throw new Error('That operation is not supported.');
   await refresh(); return result;
  }
 };
}
