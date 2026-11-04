import{cloudConfig,cloudClient,rootURL,rpc}from'./cloud.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);
let cachedCapabilities;
export async function orderService(path,{method='GET',body}={}){
 const config=await cloudConfig(),client=await cloudClient();
 const{data}=await client.auth.getSession();
 const response=await fetch(config.url+'/functions/v1/order-services/'+path,{method,headers:{apikey:config.publishableKey,...(data.session?{Authorization:'Bearer '+data.session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 let result;try{result=await response.json();}catch{throw new Error('Order services are not deployed or could not be reached.');}
 if(!response.ok)throw new Error(result.error||'The order service could not complete this request.');return result;
}
export async function serviceCapabilities(){
 if(!cachedCapabilities)cachedCapabilities=orderService('capabilities').catch(async()=>{try{const settings=await rpc('get_order_service_settings');return{payments:{enabled:false},directUPI:{enabled:Boolean(settings.upiId&&settings.payeeName),upiId:settings.upiId,payeeName:settings.payeeName},email:{configured:false},delivery:{provider:'own-riders'},schemaVersion:settings.schemaVersion};}catch{return{payments:{enabled:false},directUPI:{enabled:false},email:{configured:false},delivery:{provider:'own-riders'},schemaVersion:0};}});
 return cachedCapabilities;
}
export async function configurePaymentChoice(form){
 if(!form)return;const capabilities=await serviceCapabilities();
 if(capabilities.schemaVersion>=3){
  const note=form.querySelector('.form-note');if(note)note.textContent='Your saved order can be followed in My orders, including payment, preparation and delivery updates.';
  const paymentNote=document.querySelector('.cart-payment');if(paymentNote)paymentNote.textContent=(await cloudConfig()).reviewSandbox?'Payment simulator · no real charge':capabilities.youpi?.enabled?'UPI through YouPI · bank receipt verified by admin':capabilities.directUPI?.enabled?'Direct UPI · bank receipt verified by admin':capabilities.payments.enabled?'Pay online or on pickup / delivery':'Pay on pickup / delivery';
  const privacy=document.querySelector('#privacy-dialog .prose p:last-child');if(privacy)privacy.textContent='UPI checkout collects a transaction reference for bank verification by an administrator. The configured email service submits order updates. The restaurant manages courier bookings. The review sandbox simulates these services.';
 }
 if(!capabilities.payments.enabled&&!capabilities.directUPI?.enabled)return;
 const label=document.createElement('label');label.textContent='Payment method';
 const select=document.createElement('select');select.name='paymentMethod';select.id='payment-method';
 select.add(new Option('Cash on pickup / delivery','cod'));
 if(capabilities.directUPI?.enabled)select.add(new Option(capabilities.youpi?.enabled?(await cloudConfig()).reviewSandbox?'UPI · YouPI contract simulator':'UPI · YouPI checkout (bank receipt checked by admin)':(await cloudConfig()).reviewSandbox?'BitesBro Pay · simulated UPI':'BitesBro Pay · direct UPI (bank receipt checked by admin)','upi'));
 if(capabilities.payments.enabled&&!capabilities.youpi?.enabled)select.add(new Option((await cloudConfig()).reviewSandbox?'Simulated gateway payment · no charge':capabilities.payments.mode==='test'?'Online payment · Razorpay test mode':'Pay online · UPI / cards','razorpay'));
 label.append(select);form.querySelector('h3')?.after(label);
}
async function directUPICheckout(request){
 const config=await cloudConfig();
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='ops-dialog';dialog.setAttribute('aria-labelledby','upi-title');
  const uri='upi://pay?'+new URLSearchParams({pa:request.upiId,pn:request.payeeName,tr:request.reference,tn:'BitesBro '+request.reference,am:(request.amount/100).toFixed(2),cu:'INR'});
  dialog.innerHTML=`<div class="ops-dialog-header"><div><p class="eyebrow">BITESBRO PAY</p><h2 id="upi-title">A little good. <em>Paid securely.</em></h2></div><button class="ops-button" data-upi-close aria-label="Close UPI checkout">×</button></div><p><strong>${money(request.amount)}</strong> · ${escape(request.reference)}</p><p>Payee: ${escape(request.payeeName)}<br><strong>${escape(request.upiId)}</strong></p><div id="upi-qr" class="upi-qr"></div>${config.reviewSandbox?'<p>Simulation only. No UPI app or bank is contacted. Enter 123456789012 as a demo reference.</p>':`<a class="ops-button ops-button-primary" href="${escape(uri)}">Open UPI app</a><p>Scan with your UPI app or use the link. Check the payee and amount in your bank app before approving.</p>`}<form class="staff-access-form"><label class="ops-field">12-digit bank reference (UTR/RRN)<input name="bankReference" inputmode="numeric" pattern="[0-9]{12}" minlength="12" maxlength="12" required autocomplete="off"></label><button class="ops-button ops-button-orange" type="submit">Submit bank reference</button><p class="ops-form-result" role="status"></p></form><p>Your reference is reviewed by an administrator against the bank receipt. The kitchen receives the order only after payment is confirmed.</p>`;
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  dialog.querySelector('[data-upi-close]').addEventListener('click',()=>finish({verified:false,message:'Order saved. Complete UPI payment from My orders.'}));
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish({verified:false,message:'Order saved. Complete UPI payment from My orders.'});});
  dialog.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;
   try{await rpc('submit_upi_reference',{p_reference:request.reference,p_bank_reference:form.elements.bankReference.value});finish({verified:false,submitted:true,message:'Bank reference submitted. Payment is awaiting administrator verification.'});}
   catch(error){form.querySelector('[role=status]').textContent=error.message;button.disabled=false;}
  });
  document.body.append(dialog);dialog.showModal();
  if(!config.reviewSandbox)import(rootURL('vendor/qrcode.mjs')).then(({default:qrcode})=>{if(!dialog.isConnected)return;const qr=qrcode(0,'M');qr.addData(uri);qr.make();dialog.querySelector('#upi-qr').innerHTML=qr.createSvgTag({scalable:true,margin:4,alt:'Scan to pay BitesBro with UPI'});}).catch(()=>{if(dialog.isConnected)dialog.querySelector('#upi-qr').textContent='Use the UPI app link, or pay the displayed UPI ID and exact amount.';});
 });
}
async function youpiCheckout(request){
 const config=await cloudConfig(),checkout=await orderService('youpi/create',{method:'POST',body:{reference:request.reference}});
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='ops-dialog';dialog.setAttribute('aria-labelledby','youpi-title');
  dialog.innerHTML=`<div class="ops-dialog-header"><div><p class="eyebrow">BITESBRO × YOUPI</p><h2 id="youpi-title">Pay by <em>UPI.</em></h2></div><button class="ops-button" data-youpi-close aria-label="Close YouPI checkout">×</button></div><p><strong>${money(request.amount)}</strong> · ${escape(request.reference)}</p>${config.reviewSandbox?'<p>This simulates the YouPI MANUAL_UPI API. No bank, UPI app or hosted YouPI service is contacted.</p><form class="staff-access-form"><label class="ops-field">Demo 12-digit bank reference<input name="bankReference" pattern="[0-9]{12}" minlength="12" maxlength="12" inputmode="numeric" required autocomplete="off" value="123456789012"></label><button class="ops-button ops-button-primary" type="submit">Submit demo UPI reference</button></form>':`<p><a class="ops-button ops-button-primary" target="_blank" rel="noopener noreferrer" href="${escape(checkout.checkoutUrl)}">Open YouPI checkout</a></p><p>Complete payment and submit your bank reference in the YouPI window. YouPI may ask you to sign in to its checkout separately.</p><button class="ops-button" data-youpi-refresh>Check gateway status</button><details><summary>Already paid? Submit or correct a bank reference</summary><p>Use this if the gateway update was delayed. This submits a claim for administrator bank verification.</p><form class="staff-access-form"><label class="ops-field">12-digit bank reference<input name="bankReference" pattern="[0-9]{12}" minlength="12" maxlength="12" inputmode="numeric" required autocomplete="off"></label><button class="ops-button" type="submit">Submit bank reference</button></form></details>`}<p role="status" class="ops-form-result"></p><p>Payment stays pending until an administrator checks the credit, exact amount and reference in the receiving bank account. A gateway success screen does not release the kitchen ticket.</p><button class="ops-button" data-youpi-done>Continue to My orders</button>`;
  const finish=(submitted=false)=>{dialog.close();dialog.remove();resolve({verified:false,submitted,message:submitted?'YouPI reference received. Payment is awaiting administrator bank verification.':'Order saved. Follow payment and bank verification in My orders.'});};
  dialog.querySelector('[data-youpi-close]').addEventListener('click',()=>finish());dialog.querySelector('[data-youpi-done]').addEventListener('click',()=>finish());
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  dialog.querySelector('form')?.addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;
   try{if(config.reviewSandbox){const client=await cloudClient(),{data}=await client.auth.getSession();const response=await fetch(rootURL('review/youpi/submit'),{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({reference:request.reference,utr:form.elements.bankReference.value})});const result=await response.json();if(!response.ok)throw new Error(result.error);}else await rpc('submit_upi_reference',{p_reference:request.reference,p_bank_reference:form.elements.bankReference.value});finish(true);}catch(error){dialog.querySelector('[role=status]').textContent=error.message;button.disabled=false;}
  });
  dialog.querySelector('[data-youpi-refresh]')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const result=await orderService('youpi/status',{method:'POST',body:{reference:request.reference}});dialog.querySelector('[role=status]').textContent='YouPI: '+result.status+'. Administrator bank verification is still required.';}catch(error){dialog.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}});
  document.body.append(dialog);dialog.showModal();
 });
}
async function reviewPayment(order){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='ops-dialog';dialog.setAttribute('aria-labelledby','review-payment-title');
  dialog.innerHTML=`<div class="ops-dialog-header"><h2 id="review-payment-title">Simulated payment</h2><button class="ops-button" data-payment-choice="close" aria-label="Close simulated payment">×</button></div><p>No real payment provider is contacted. No money is charged.</p><p><strong>${escape(order.reference)}</strong> · ${money(order.amount)}</p><div class="ops-form-actions"><button class="ops-button ops-button-primary" data-payment-choice="approve">Approve test payment</button><button class="ops-button" data-payment-choice="decline">Decline test payment</button></div><p class="ops-form-result" role="status"></p>`;
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  dialog.addEventListener('click',async event=>{
   const button=event.target.closest('[data-payment-choice]');if(!button)return;
   if(button.dataset.paymentChoice!=='approve')return finish(null);
   button.disabled=true;
   try{
    const client=await cloudClient(),{data}=await client.auth.getSession();
    const response=await fetch(rootURL('review/payments/complete'),{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({reference:order.reference,providerOrderId:order.providerOrderId})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);finish(result);
   }catch(error){dialog.querySelector('[role=status]').textContent=error.message;button.disabled=false;}
  });document.body.append(dialog);dialog.showModal();
 });
}
async function runCheckout(reference){
 const request=await rpc('get_payment_request',{p_reference:reference});
 if(request.method==='upi')return(await serviceCapabilities()).youpi?.enabled?youpiCheckout(request):directUPICheckout(request);
 const order=await orderService('payments/create',{method:'POST',body:{reference}}),config=await cloudConfig();
 let result;
 if(config.reviewSandbox)result=await reviewPayment(order);
 else{
  await new Promise((resolve,reject)=>{
   if(globalThis.Razorpay)return resolve();const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>reject(new Error('Payment checkout could not load. Your order is saved; retry from My orders.'));document.head.append(script);
  });
  result=await new Promise(resolve=>{
   const checkout=new globalThis.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,order_id:order.providerOrderId,name:'BitesBro',description:reference,
    handler:payment=>resolve({providerOrderId:payment.razorpay_order_id,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature}),
    modal:{ondismiss:()=>resolve(null)},theme:{color:'#253F32'}});
   checkout.on('payment.failed',()=>resolve(null));checkout.open();
  });
 }
 if(!result)return{verified:false,message:'Order saved. Payment is incomplete; resume from My orders.'};
 await orderService('payments/verify',{method:'POST',body:{reference,...result}});
 return{verified:true,message:config.reviewSandbox?'Simulated payment verified. The kitchen has your ticket.':'Payment captured and verified. The kitchen has your ticket.'};
}
export function orderServiceMarkup(order,role){
 if(!order.payment)return'';
 const labels={due:'Cash due',pending:'Awaiting payment',submitted:'Bank reference awaiting review',creating:'Checking payment setup',created:'Awaiting payment',paid:'Paid',cancelled:'Payment cancelled',refund_pending:'Refund awaiting processing',refund_processing:'Refund processing',refund_review:'Refund needs review',refunded:'Refund processed'};
 const canPay=role==='customer'&&order.status!=='cancelled'&&['upi','razorpay'].includes(order.payment.method)&&['pending','created'].includes(order.payment.status);
 const canCash=role==='admin'&&order.payment.method==='cod'&&order.payment.status==='due'&&(order.fulfilment==='pickup'&&order.status==='collected'||order.delivery?.status==='delivered');
 return`<section class="service-summary"><h3>Payment &amp; updates</h3><p><strong>${escape(labels[order.payment.status]||order.payment.status)}</strong> · ${money(order.payment.amount)}</p>${order.notification&&role!=='kitchen'?`<p>Confirmation email: ${escape({queued:'queued',sending:'being submitted',sent:'submitted to email provider',failed:'waiting to retry',needs_review:'needs administrator attention'}[order.notification.status]||order.notification.status)}</p>`:''}${canPay?`<button class="ops-button ops-button-primary" data-pay-order="${escape(order.reference)}">Complete payment</button>`:''}${canCash?`<button class="ops-button" data-cash-order="${escape(order.reference)}">Record cash received</button>`:''}${order.delivery?`<h3>Delivery</h3><p>${escape({unassigned:'Waiting for rider assignment',assigned:'Rider assigned',out_for_delivery:'Out for delivery',delivered:'Delivered',failed:'Delivery attempt failed',cancelled:'Delivery cancelled'}[order.delivery.status])}</p>${order.delivery.riderName?`<p>Rider: ${escape(order.delivery.riderName)}${order.delivery.riderPhone?' · '+escape(order.delivery.riderPhone):''}</p>`:''}`:''}</section>`;
}
export function wireOrderPayments(refresh,notify){
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-pay-order]');if(!button)return;button.disabled=true;
  try{const result=await checkoutPayment(button.dataset.payOrder);notify(result.message,!result.verified);await refresh();}catch(error){notify(error.message,true);}finally{if(button.isConnected)button.disabled=false;}
 });
}

export async function checkoutPayment(reference){
 const open=[...document.querySelectorAll('dialog[open]')];open.forEach(dialog=>dialog.close());
 try{return await runCheckout(reference);}finally{open.forEach(dialog=>{if(dialog.isConnected&&!dialog.open)dialog.showModal();});}
}
