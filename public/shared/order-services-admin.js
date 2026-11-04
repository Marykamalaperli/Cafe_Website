import{$,escape,money,announce}from'./ui.js?v=three-roles-2';
import{rpc,cloudConfig,cloudClient,rootURL}from'./cloud.js';
import{orderService}from'./order-services.js';

export async function mountOrderServicesAdmin(store){
 const config=await cloudConfig();
 const quotes=new Map();
 const nav=document.createElement('a');nav.href='#deliveries';nav.dataset.panelLink='deliveries';nav.textContent='06 Deliveries';$('.admin-nav').append(nav);
 const panel=document.createElement('section');panel.className='admin-panel';panel.id='panel-deliveries';panel.hidden=true;
 panel.innerHTML='<div class="ops-panel"><div class="ops-panel-header"><div><h2>From kitchen to doorstep.</h2><p>Assign your own rider, dispatch ready orders, and record the delivery outcome.</p></div></div><div id="delivery-board"></div></div>';
 $('.admin-main').append(panel);
 const settings=document.createElement('section');settings.className='ops-panel';settings.innerHTML='<div class="ops-panel-header"><div><h2>Payments &amp; order emails</h2><p>Online payment is available only when the trusted payment service is configured.</p></div></div><form id="online-payment-settings" class="staff-access-form"><label class="settings-check"><input type="checkbox" name="enabled"><span>Enable online payment</span></label><button class="ops-button" type="submit">Save payment preference</button><p role="status" id="payment-settings-result"></p></form><button class="ops-button ops-button-primary" id="process-order-messages">Process queued emails &amp; refunds</button><p class="ops-form-result" id="order-messages-result" role="status"></p>';
 $('#panel-settings').append(settings);
 orderService('capabilities').then(status=>{const field=$('#online-payment-settings [name=enabled]');if(field&&!field.closest('form').contains(document.activeElement))field.checked=status.payments.enabled;if(status.youpi?.enabled){field.closest('form').hidden=true;settings.querySelector('.ops-panel-header p').textContent='YouPI checkout is configured. UPI receipts require administrator bank verification; email processing is managed below.';}}).catch(()=>{});
 $('#online-payment-settings').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
  try{if(form.elements.enabled.checked){const status=await orderService('capabilities');if(!status.payments.keyId)throw new Error('Configure the trusted payment provider before enabling online payment.');}await rpc('set_online_payments',{p_enabled:form.elements.enabled.checked});$('#payment-settings-result').textContent='Payment preference saved. Refresh the customer page to see the change.';}
  catch(error){$('#payment-settings-result').textContent=error.message;}finally{button.disabled=false;}
 });
 $('#process-order-messages').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{const result=await orderService('notifications/process',{method:'POST',body:{}});$('#order-messages-result').textContent=`${result.submitted} email(s) submitted; ${result.refunds} refund(s) checked.${!result.emailConfigured?' Email provider is not configured.':''}`;await store.refresh();}
  catch(error){$('#order-messages-result').textContent=error.message;}finally{button.disabled=false;}
 });
 const upi=document.createElement('section');upi.className='ops-panel';upi.innerHTML='<div class="ops-panel-header"><div><h2>BitesBro Pay · direct UPI</h2><p>Use your merchant UPI ID. An administrator must verify each bank receipt before the kitchen receives the order.</p></div></div><form id="merchant-upi-form" class="staff-access-form"><label class="ops-field">Merchant UPI ID<input name="upiId" maxlength="193" required autocomplete="off"></label><label class="ops-field">Bank payee name<input name="payeeName" maxlength="80" minlength="2" required></label><button class="ops-button" type="submit">Save merchant UPI details</button><p role="status" id="merchant-upi-result"></p></form><h3>Bank receipts awaiting review</h3><div id="upi-review-list"></div>';
 $('#panel-settings').append(upi);
 rpc('get_order_service_settings').then(data=>{if(!$('#merchant-upi-form').contains(document.activeElement)){$('#merchant-upi-form [name=upiId]').value=data.upiId||'';$('#merchant-upi-form [name=payeeName]').value=data.payeeName||'';}}).catch(()=>{});
 $('#merchant-upi-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;try{await rpc('configure_direct_upi',{p_upi:form.elements.upiId.value.trim(),p_payee:form.elements.payeeName.value.trim()});$('#merchant-upi-result').textContent='Merchant details saved. Refresh the customer page to see the new payment option.';}catch(error){$('#merchant-upi-result').textContent=error.message;}finally{button.disabled=false;}});
 upi.addEventListener('click',async event=>{
  const button=event.target.closest('[data-upi-confirm]');if(!button)return;button.disabled=true;
  try{await rpc('confirm_upi_receipt',{p_reference:button.dataset.reference,p_confirm:button.dataset.upiConfirm==='true'});await store.refresh();announce(button.dataset.upiConfirm==='true'?'Bank receipt confirmed. The kitchen has the order.':'Bank reference rejected. The customer can resubmit.');}catch(error){announce(error.message,true);button.disabled=false;}
 });
 upi.addEventListener('submit',async event=>{const form=event.target.closest('[data-upi-refund]');if(!form)return;event.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;try{await rpc('confirm_upi_refund',{p_reference:form.dataset.upiRefund,p_bank_reference:form.elements.refundReference.value});await store.refresh();announce('Bank refund recorded.');}catch(error){announce(error.message,true);button.disabled=false;}});
 document.addEventListener('click',async event=>{
  const cash=event.target.closest('[data-cash-order]');if(!cash)return;cash.disabled=true;
  try{await rpc('record_cash_payment',{p_reference:cash.dataset.cashOrder});await store.refresh();announce('Cash payment recorded.');}catch(error){announce(error.message,true);cash.disabled=false;}
 });
 panel.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-delivery-order]');if(!form)return;event.preventDefault();if(!form.reportValidity())return;
  const status=event.submitter?.value||'assigned',button=event.submitter;button.disabled=true;
  try{await rpc('dispatch_delivery',{p_reference:form.dataset.deliveryOrder,p_status:status,p_rider_name:form.elements.riderName?.value||'',p_rider_phone:form.elements.riderPhone?.value||'',p_notes:''});await store.refresh();announce('Delivery updated.');}
  catch(error){announce(error.message,true);button.disabled=false;}
 });
 panel.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-courier-order]');if(!form)return;event.preventDefault();if(!form.reportValidity())return;const button=event.submitter;button.disabled=true;
  try{const reference=form.dataset.courierOrder;await rpc('set_delivery_location',{p_reference:reference,p_lat:Number(form.elements.latitude.value),p_lng:Number(form.elements.longitude.value)});quotes.set(reference,await orderService('deliveries/quote',{method:'POST',body:{reference}}));await store.refresh();announce('Courier quote received. Review the cost before booking.');}
  catch(error){announce(error.message,true);button.disabled=false;}
 });
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('[data-courier-action]');if(!button)return;button.disabled=true;const reference=button.dataset.reference,action=button.dataset.courierAction;
  try{
   if(action==='book'){const quote=quotes.get(reference);if(!quote)throw new Error('Request a fresh courier quote.');await orderService('deliveries/book',{method:'POST',body:{quoteId:quote.quoteId}});quotes.delete(reference);}
   else{
    if(config.reviewSandbox&&action!=='refresh'){const client=await cloudClient(),{data}=await client.auth.getSession();const response=await fetch(rootURL('review/courier/advance'),{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({reference,status:action})});if(!response.ok)throw new Error('Simulated courier update failed.');}
    await orderService('deliveries/refresh',{method:'POST',body:{reference}});
   }
   await store.refresh();announce(action==='book'?'Courier booking confirmed.':'Courier status refreshed.');
  }catch(error){announce(error.message,true);if(button.isConnected)button.disabled=false;}
 });
 if(config.reviewSandbox){
  const view=document.createElement('button');view.className='ops-button';view.id='review-emails';view.textContent='Preview simulated emails';settings.append(view);
  view.addEventListener('click',async()=>{
   const client=await cloudClient(),{data}=await client.auth.getSession();const response=await fetch(rootURL('review/emails'),{headers:{Authorization:'Bearer '+data.session.access_token}});const messages=await response.json();
   const dialog=document.createElement('dialog');dialog.className='ops-dialog';dialog.innerHTML='<div class="ops-dialog-header"><h2>Simulated email inbox</h2><button class="ops-button" data-close-dialog>Close</button></div><p>No emails were sent to real inboxes.</p>';
   for(const message of messages){const pre=document.createElement('pre');pre.className='email-preview';pre.textContent=`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`;dialog.append(pre);}
   dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  });
 }
 return state=>{
  $('#upi-review-list').innerHTML=state.orders.filter(order=>order.payment?.method==='upi'&&['submitted','refund_pending'].includes(order.payment.status)).map(order=>`<article class="delivery-card"><h3>${escape(order.reference)} · ${money(order.total)}</h3><p>${escape(order.name)} · Bank reference: <strong>${escape(order.payment.bankReference)}</strong></p>${order.payment.status==='submitted'?`<p>Check the credit, amount and reference in your bank account before confirming. A customer-supplied reference alone is not proof of payment.</p><button class="ops-button ops-button-primary" data-upi-confirm="true" data-reference="${escape(order.reference)}">Confirm bank receipt</button><button class="ops-button" data-upi-confirm="false" data-reference="${escape(order.reference)}">Reject bank reference</button>`:`<p>Return the payment through your bank or UPI app, then record the completed refund reference.</p><form class="staff-access-form" data-upi-refund="${escape(order.reference)}"><label class="ops-field">Refund bank reference<input name="refundReference" required pattern="[0-9]{12}" minlength="12" maxlength="12" inputmode="numeric"></label><button class="ops-button">Record completed bank refund</button></form>`}</article>`).join('')||'<p>No bank receipts awaiting review.</p>';
  const orders=state.orders.filter(order=>order.fulfilment==='delivery'&&order.delivery);
  if($('#delivery-board').contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return;
  $('#delivery-board').innerHTML=orders.length?orders.map(order=>{
   const delivery=order.delivery,assign=order.status!=='cancelled'&&['unassigned','assigned','failed'].includes(delivery.status),dispatch=delivery.status==='assigned'&&['ready','collected'].includes(order.status),complete=delivery.status==='out_for_delivery';
   const quote=quotes.get(order.reference),location=order.deliveryLocation||{};
   const courier=order.courier?`<p>Porter: ${escape(order.courier.status.replaceAll('_',' '))} · ${money(order.courier.amount)}</p><button class="ops-button" data-courier-action="refresh" data-reference="${escape(order.reference)}">Refresh courier status</button>${config.reviewSandbox&&order.courier.status==='booked'?`<button class="ops-button" data-courier-action="out_for_delivery" data-reference="${escape(order.reference)}">Simulate courier pickup</button>`:''}${config.reviewSandbox&&order.courier.status==='out_for_delivery'?`<button class="ops-button ops-button-primary" data-courier-action="delivered" data-reference="${escape(order.reference)}">Simulate courier delivery</button>`:''}`:`<h3>Porter two-wheeler quote</h3><p>The courier fare is a cost to BitesBro; the customer's saved delivery fee remains ${money(order.deliveryFee)}.</p><form class="staff-access-form" data-courier-order="${escape(order.reference)}"><label class="ops-field">Delivery latitude<input name="latitude" type="number" step="any" min="12.5" max="13.5" required value="${escape(location.lat??(config.reviewSandbox?12.9716:''))}"></label><label class="ops-field">Delivery longitude<input name="longitude" type="number" step="any" min="77" max="78.2" required value="${escape(location.lng??(config.reviewSandbox?77.5946:''))}"></label><button class="ops-button" type="submit">Get courier quote</button></form>${quote?`<p>Quoted courier cost: <strong>${money(quote.amount)}</strong> · expires ${escape(new Date(quote.expiresAt).toLocaleTimeString())}</p><button class="ops-button ops-button-primary" data-courier-action="book" data-reference="${escape(order.reference)}" ${order.status==='ready'?'':'disabled'}>Book courier for ${money(quote.amount)}</button>${order.status!=='ready'?'<p>Wait until the kitchen marks this order ready.</p>':''}`:''}`;
   return`<article class="delivery-card" data-courier-card="${escape(order.reference)}"><h3>${escape(order.reference)} · ${money(order.total)}</h3><p>${escape(order.name)} · ${escape(order.address)} · ${escape(order.postcode)}</p><p>Kitchen: ${escape(order.status)} · Delivery: ${escape(delivery.status.replaceAll('_',' '))}</p>${order.payment?.ready===false?'<p>Awaiting verified payment.</p>':order.status==='cancelled'?'<p>This order was cancelled.</p>':courier}${!order.courier&&order.payment?.ready!==false&&order.status!=='cancelled'?`<details><summary>Manual rider fallback</summary><form data-delivery-order="${escape(order.reference)}" class="staff-access-form">${assign?`<label class="ops-field">Rider name<input name="riderName" required minlength="2" maxlength="80" value="${escape(delivery.riderName)}"></label><label class="ops-field">Rider phone<input name="riderPhone" type="tel" required minlength="7" maxlength="24" value="${escape(delivery.riderPhone)}"></label><button class="ops-button" type="submit" value="assigned">Assign rider</button>`:''}${dispatch?'<button class="ops-button ops-button-primary" type="submit" value="out_for_delivery">Dispatch ready order</button>':''}${complete?'<button class="ops-button ops-button-primary" type="submit" value="delivered">Mark delivered</button><button class="ops-button" type="submit" value="failed">Mark delivery failed</button>':''}</form></details>`:''}</article>`;
  }).join(''):'<p class="ops-empty">No delivery requests yet.</p>';
 };
}
