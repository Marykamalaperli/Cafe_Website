// Porter two-wheeler adapter. Test environment is the default; live bookings
// require the merchant's API account and an explicit COURIER_MODE=live setting.
import{ProviderError}from'./providers.js';
async function transport(url,{method,headers,body}){
 // Porter's quote endpoint uses GET with a JSON body. Node's HTTP API supports
 // that protocol, unlike browser fetch. Supabase Edge supports Node built-ins.
 if(method!=='GET'||!body)return fetch(url,{method,headers,...(body?{body}:{}),signal:AbortSignal.timeout(20000)});
 const{request}=await import('node:https');
 return new Promise((resolve,reject)=>{
  const req=request(url,{method,headers:{...headers,'Content-Length':String(new TextEncoder().encode(body).length)},timeout:20000},res=>{
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();reject(new ProviderError('Courier response was too large.'));}else chunks.push(chunk);});
   res.on('end',()=>{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}resolve(new Response(bytes,{status:res.statusCode,headers:{'Content-Type':'application/json'}}));});
  });req.on('error',()=>reject(new ProviderError('Courier quote could not be reached.')));req.on('timeout',()=>{req.destroy();reject(new ProviderError('Courier quote timed out.'));});req.end(body);
 });
}
export function porterProvider(env,send=transport){
 const enabled=Boolean(env.PORTER_API_KEY),testMode=env.COURIER_MODE!=='live';
 const base=testMode?'https://pfe-apigw-uat.porter.in/v1/':'https://pfe-apigw.porter.in/v1/';
 const pickup={name:env.COURIER_PICKUP_NAME||'BitesBro',phone:env.COURIER_PICKUP_PHONE,address:env.COURIER_PICKUP_ADDRESS,postcode:env.COURIER_PICKUP_POSTCODE,lat:Number(env.COURIER_PICKUP_LAT),lng:Number(env.COURIER_PICKUP_LNG)};
 const configured=enabled&&Boolean(pickup.address&&/^\+?[0-9 ()-]{7,24}$/.test(pickup.phone||'')&&/^560[0-9]{3}$/.test(pickup.postcode||'')&&pickup.lat>=12.5&&pickup.lat<=13.5&&pickup.lng>=77&&pickup.lng<=78.2);
 async function call(path,method='GET',body){
  if(!configured)throw new ProviderError('Courier API and restaurant pickup details are not configured.',503);
  const response=await send(base+path,{method,headers:{'x-api-key':env.PORTER_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new ProviderError('The courier could not complete this request.');return response.json();
 }
 function point(person){return{address:{apartment_address:'',street_address1:person.address,street_address2:'',landmark:'',city:'Bengaluru',state:'Karnataka',country:'India',pincode:person.postcode,lat:person.lat,lng:person.lng,contact_details:{name:person.name,phone_number:person.phone}}};}
 return{enabled:configured,testMode,name:'porter',
  async quote(order){
   const result=await call('get_quote','GET',{pickup_details:{lat:pickup.lat,lng:pickup.lng},drop_details:{lat:order.lat,lng:order.lng},customer:{name:order.name,mobile:{country_code:'+91',number:order.phone.replace(/\D/g,'').slice(-10)}}});
   const options=(result.vehicles||[]).filter(v=>['2w','2wheeler','twowheeler','2wheelers'].includes(String(v.type||'').toLowerCase().replace(/[^a-z0-9]/g,''))&&v.fare?.currency==='INR'&&Number.isSafeInteger(v.fare.minor_amount)&&v.fare.minor_amount>0).sort((a,b)=>a.fare.minor_amount-b.fare.minor_amount);
   if(!options.length)throw new ProviderError('No supported two-wheeler quote was returned.');
   return{amount:options[0].fare.minor_amount,currency:'INR',vehicle:options[0].type,etaMinutes:options[0].eta?.minutes??null};
  },
  async book(order){
   const result=await call('orders/create','POST',{request_id:order.requestId,delivery_instructions:{instructions_list:[{type:'text',description:'Restaurant food order. Keep upright and handle with care.'}]},pickup_details:point(pickup),drop_details:point(order),additional_comments:'BitesBro '+order.reference});
   if(!result.order_id)throw new ProviderError('Courier booking needs manual review.');
   return{id:String(result.order_id)};
  },
  async track(id){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new ProviderError('Invalid courier booking.',400);
   const result=await call('orders/'+encodeURIComponent(id)),raw=String(result.status||result.order_status||'').toLowerCase();
   const status={open:'booked',live:'out_for_delivery',ended:'delivered',cancelled:'cancelled',canceled:'cancelled'}[raw];
   if(!status)throw new ProviderError('The courier returned a status that needs review.');return{status};
  }
 };
}
