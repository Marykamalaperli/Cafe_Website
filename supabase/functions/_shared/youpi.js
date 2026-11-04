// Original REST adapter for youpi-pg/YouPI-PG, reviewed at 405327c27d78ae9d0dccdb1e2d2426cefc359477.
// Uses its MANUAL_UPI contract. No upstream source or SDK is redistributed.
import{hmac,equalSignature,ProviderError}from'./providers.js';

export function youpiProvider(env,fetcher=fetch){
 const enabled=Boolean(env.YOUPI_API_URL&&env.YOUPI_CHECKOUT_URL&&env.YOUPI_MERCHANT_ID&&env.YOUPI_MERCHANT_API_KEY&&env.YOUPI_WEBHOOK_SECRET);
 function trustedURL(value){
  let url;try{url=new URL(value);}catch{throw new ProviderError('The YouPI URL is not configured correctly.',503);}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new ProviderError('Configure an HTTPS YouPI URL without credentials, query or fragment.',503);
  return url;
 }
 const api=enabled?trustedURL(env.YOUPI_API_URL):null,checkout=enabled?trustedURL(env.YOUPI_CHECKOUT_URL):null;
 async function request(path,{method='GET',body,reference}={}){
  if(!enabled)throw new ProviderError('YouPI checkout is not configured.',503);
  const response=await fetcher(api.href.replace(/\/$/,'')+'/api/v1/payments'+path,{method,redirect:'error',headers:{'X-Merchant-Id':env.YOUPI_MERCHANT_ID,'X-Merchant-Key':env.YOUPI_MERCHANT_API_KEY,...(body?{'Content-Type':'application/json','Idempotency-Key':'bitesbro-'+reference}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new ProviderError('YouPI could not complete this request. Check My orders before retrying.');
  return response.json();
 }
 function validatePayment(result,order){
  const amount=typeof result.amountPaise==='string'&&/^\d{1,12}$/.test(result.amountPaise)?Number(result.amountPaise):result.amountPaise;
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(result.paymentId||'')||result.orderId!==order.reference||!Number.isSafeInteger(amount)||amount!==order.amount||result.currency!=='INR')throw new ProviderError('The YouPI payment does not match the saved order.');
  return result;
 }
 return{enabled,
  async create(order){
   const site=new URL(env.SITE_URL.endsWith('/')?env.SITE_URL:env.SITE_URL+'/');
   const result=validatePayment(await request('',{method:'POST',reference:order.reference,body:{orderId:order.reference,amount:(order.amount/100).toFixed(2),currency:'INR',method:'MANUAL_UPI',returnUrl:new URL('orders/?order='+encodeURIComponent(order.reference),site).href}}),order);
   let url;try{url=new URL(result.checkoutUrl);}catch{throw new ProviderError('YouPI did not return a valid checkout URL.');}
   if(url.protocol!=='https:'||url.origin!==checkout.origin||!url.pathname.startsWith(checkout.pathname.replace(/\/$/,'')+'/checkout/')||url.username||url.password||url.search||url.hash)throw new ProviderError('The YouPI checkout URL is not trusted.');
   return{paymentId:result.paymentId,checkoutUrl:url.href,status:result.status};
  },
  async status(order){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(order.paymentId||''))throw new ProviderError('Choose a saved YouPI payment.',400);
   const result=validatePayment(await request('/'+encodeURIComponent(order.paymentId)),order);
   if(result.method!=='MANUAL_UPI')throw new ProviderError('This YouPI payment has an unexpected method.');
   return{status:result.status};
  },
  async webhook(raw,headers){
   if(!enabled)throw new ProviderError('YouPI is not configured.',503);
   const signature=headers.get('x-gateway-signature');
   if(!/^sha256=[a-f0-9]{64}$/.test(signature||'')||!equalSignature(signature,'sha256='+await hmac(env.YOUPI_WEBHOOK_SECRET,raw)))throw new ProviderError('YouPI webhook signature is invalid.',401);
   let event;try{event=JSON.parse(raw);}catch{throw new ProviderError('Invalid YouPI webhook JSON.',400);}
   // Upstream retries the SAME signed timestamp for up to an hour. Cover that
   // schedule and deduplicate the signed delivery UUID transactionally in SQL.
   if(!Number.isSafeInteger(event.timestamp)||event.timestamp>Date.now()+300000||event.timestamp<Date.now()-7200000||String(event.timestamp)!==headers.get('x-gateway-timestamp')||event.deliveryId!==headers.get('x-gateway-delivery-id')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.deliveryId||''))throw new ProviderError('YouPI webhook delivery metadata is invalid or expired.',401);
   return event;
  }
 };
}
