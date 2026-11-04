// Shared between Supabase Edge Functions, the local review server and tests.
// No provider secret or card data is ever returned to a browser.
const utf8=new TextEncoder();
export async function hmac(secret,message,encoding='hex'){
 const key=await crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,typeof message==='string'?utf8.encode(message):message));
 return encoding==='hex'?[...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...bytes));
}
export function equalSignature(actual,expected){
 if(typeof actual!=='string'||actual.length!==expected.length)return false;
 let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);return mismatch===0;
}
export class ProviderError extends Error{constructor(message,status=502){super(message);this.status=status;}}
export function razorpayProvider(env,fetcher=fetch){
 const enabled=Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET);
 // Test-only until the owner explicitly opts into a production gateway.
 const testMode=env.PAYMENTS_MODE!=='live';
 if(enabled&&!env.RAZORPAY_KEY_ID.startsWith(testMode?'rzp_test_':'rzp_live_'))throw new Error('Razorpay key and PAYMENTS_MODE do not match.');
 async function request(path,method='GET',body){
  if(!enabled)throw new ProviderError('Online payment is not configured.',503);
  const response=await fetcher('https://api.razorpay.com/v1/'+path,{method,headers:{Authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new ProviderError('The payment provider could not complete the request.');
  return response.json();
 }
 return{enabled,testMode,keyId:enabled?env.RAZORPAY_KEY_ID:null,
  createOrder:order=>request('orders','POST',{amount:order.amount,currency:'INR',receipt:order.reference.slice(0,40),payment_capture:1,notes:{bitesbro_reference:order.reference}}),
  payment:id=>{if(!/^pay_[A-Za-z0-9]+$/.test(id))throw new ProviderError('Invalid payment reference.',400);return request('payments/'+id);},
  async verifyCheckout({providerOrderId,paymentId,signature}){return equalSignature(signature,await hmac(env.RAZORPAY_KEY_SECRET,providerOrderId+'|'+paymentId));},
  async verifyWebhook(raw,signature){return Boolean(env.RAZORPAY_WEBHOOK_SECRET)&&equalSignature(signature,await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw));},
  async refund(job){
   const result=await request('payments/'+encodeURIComponent(job.paymentId)+'/refund','POST',{amount:job.amount,notes:{bitesbro_refund:job.orderId}});
   if(!result.id||result.payment_id!==job.paymentId||result.amount!==job.amount)throw new ProviderError('Refund response needs manual review.');
   return{id:result.id,confirmed:result.status==='processed'};
  }
 };
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);
export function orderEmail(job,siteURL){
 const order=job.order;
 const titles={received:'Your BitesBro order is received',cancelled:'Your BitesBro order was cancelled',refunded:'Your BitesBro refund was processed',dispatched:'Your BitesBro order is out for delivery',delivered:'Your BitesBro order was marked delivered'};
 const heading=titles[job.kind];if(!heading)throw new Error('Unknown order email.');
 const link=new URL('orders/?order='+encodeURIComponent(order.reference),siteURL.endsWith('/')?siteURL:siteURL+'/').href;
 const lines=order.items.map(item=>`${item.quantity} × ${item.name} — ${money(item.unitPrice*item.quantity)}`);
 const note=job.kind==='received'?'This confirms receipt of your order. Follow its progress on the website.':job.kind==='cancelled'&&order.payment?.status==='refund_pending'?'Your online payment refund is queued. A separate update will confirm processing.':'';
 return{subject:`${heading} · ${order.reference}`,
  text:[heading,order.reference,...lines,`Total: ${money(order.total)}`,`Scheduled: ${order.date} ${order.time} (Bangalore)`,note,link].filter(Boolean).join('\n'),
  html:`<!doctype html><html><body><h1>${escape(heading)}</h1><p>Hello ${escape(order.name)},</p><p><strong>${escape(order.reference)}</strong></p><ul>${lines.map(line=>`<li>${escape(line)}</li>`).join('')}</ul><p>Total: ${escape(money(order.total))}</p><p>${escape(note)}</p><p><a href="${escape(link)}">Track your order</a></p><p>BitesBro · Bangalore</p></body></html>`};
}
export function resendProvider(env,fetcher=fetch){
 const enabled=Boolean(env.RESEND_API_KEY&&env.ORDER_EMAIL_FROM&&env.SITE_URL);
 return{enabled,async send(job){
  if(!enabled)throw new ProviderError('Order email delivery is not configured.',503);
  const content=orderEmail(job,env.SITE_URL);
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'bitesbro-'+job.id},body:JSON.stringify({from:env.ORDER_EMAIL_FROM,to:[job.to],...content}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new ProviderError('The email provider did not accept this message.');
  const result=await response.json();if(!result.id)throw new ProviderError('The email provider response was incomplete.');return result.id;
 }};
}
