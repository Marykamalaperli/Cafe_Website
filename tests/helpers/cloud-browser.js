import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import catalogue from '../../public/menu.json' with {type:'json'};
import manifest from '../../public/photo-credits.json' with {type:'json'};
import { orderHistory } from '../../public/shared/order-history.js';

export const SITE='https://bitesbro.test/Cafe_Website/';
export const CLOUD='https://bitesbro-test.supabase.co';
export const PASSWORD='Test-only-password-123';
const users=[['customer','customer@bitesbro.invalid'],['chef','chef@bitesbro.invalid'],['admin','admin@bitesbro.com']].map(([role,email],index)=>({
 id:`b17e0000-0000-4000-8000-00000000000${index+1}`,role,email,
 user_metadata:{display_name:role==='customer'?'Test Customer':'Test Staff',role:'admin'},email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated'
}));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
export function cloudFixture({guestReady=true,guestAuthEnabled=true,historyReady=true,transferReady=true,callbackRole='customer'}={}){
 const roles=new Map(users.map(user=>[user.id,user.role])),tokens=new Map(),uploads=new Map(),linked=new Map(),families=new Map(),tokenFamilies=new Map(),refreshFamilies=new Map();
 const calls=[],orders=[],guestUsers=[],transfers=new Map();let sequence=1,settings={acceptingOrders:true,prepMinutes:25};
 function session(user,family=crypto.randomUUID()){
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,role:'authenticated',exp,aud:'authenticated',session_id:family,jti:crypto.randomUUID()}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.test-signature';
  const refresh='test-refresh-'+crypto.randomUUID();families.set(family,user);tokens.set(token,user);tokenFamilies.set(token,family);refreshFamilies.set(refresh,family);
  return{access_token:token,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:exp,user};
 }
 const menu=()=>catalogue.items.map(item=>({...structuredClone(item),available:true,archived:false,storagePath:linked.get(item.photo.id)||null}));
 const publicOrder=(order,role)=>{const copy=structuredClone(order);delete copy.owner;if(role==='chef')for(const key of ['name','email','phone','address','postcode'])delete copy[key];return copy;};
 const initialOther={reference:'BB-ORDER-OTHER',owner:'someone-else',origin:'customer',name:'Another Customer',email:'private@bitesbro.invalid',phone:'9999999999',address:'Private address',postcode:'560001',status:'received',createdAt:new Date().toISOString(),date:'2030-06-01',time:'10:00',fulfilment:'pickup',instructions:'Pack chutneys separately',subtotal:12000,deliveryFee:0,total:12000,
  items:[{id:'masala-dosa',name:'Bangalore Masala Dosa',image:catalogue.items[0].image,quantity:1,unitPrice:12000,options:{variant:catalogue.items[0].variants[0],spice:'medium',addons:[]}}],timeline:[{status:'received',at:new Date().toISOString()}]};
 orders.push(initialOther);
 async function attach(context){
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version,cache-control,x-upsert','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','X-Supabase-Api-Version':'2024-01-01','Access-Control-Expose-Headers':'X-Supabase-Api-Version'};
   const respond=(json,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(json)});
   if(url.origin===new URL(CLOUD).origin){
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const token=request.headers().authorization?.replace(/^Bearer /,''),user=tokens.get(token),role=user?roles.get(user.id):null;
    let body;try{body=request.postDataJSON();}catch{body={};}
    calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method(),body,role,apikey:request.headers().apikey,authorization:request.headers().authorization});
    const denied=()=>respond({code:'42501',message:'permission denied'},403);
    if(url.pathname==='/auth/v1/token'){
     if(url.searchParams.get('grant_type')==='refresh_token'){const family=refreshFamilies.get(body.refresh_token),owner=families.get(family);return owner?respond(session(owner,family)):respond({code:'refresh_token_not_found',message:'Invalid refresh token'},400);}
     if(url.searchParams.get('grant_type')==='pkce')return respond(session(users.find(user=>user.role===callbackRole)));
     const found=users.find(user=>user.email===body?.email);
     return found&&body.password===PASSWORD?respond(session(found)):respond({error:'invalid_grant',error_description:'Invalid login credentials'},400);
    }
    if(url.pathname==='/auth/v1/user')return user?respond(user):denied();
    if(url.pathname==='/auth/v1/signup'){
     if(!body.email&&!body.password){
      if(!guestAuthEnabled)return respond({code:'anonymous_provider_disabled',message:'Anonymous sign-ins are disabled'},422);
      const guest={id:crypto.randomUUID(),is_anonymous:true,email:null,user_metadata:{},aud:'authenticated',role:'authenticated'};guestUsers.push(guest);roles.set(guest.id,'customer');return respond(session(guest));
     }
     return respond({id:'new-customer',email:body.email,user_metadata:body.data});
    }
    if(url.pathname==='/auth/v1/recover')return respond({});
    if(url.pathname==='/auth/v1/logout'){
     const family=tokenFamilies.get(token),removed=new Set([...families].filter(([id,owner])=>id===family||(url.searchParams.get('scope')!=='local'&&owner.id===user?.id)).map(([id])=>id));
     for(const id of removed)families.delete(id);
     for(const [access,id]of tokenFamilies)if(removed.has(id)){tokenFamilies.delete(access);tokens.delete(access);}
     for(const [refresh,id]of refreshFamilies)if(removed.has(id))refreshFamilies.delete(refresh);
     return respond({});
    }
    if(url.pathname.startsWith('/rest/v1/rpc/')){
     const name=url.pathname.split('/').at(-1);
     if(name==='my_role')return respond(role);
     if(name==='get_menu')return respond({...catalogue,items:menu()});
     if(name==='get_cafe')return respond({name:'BitesBro',city:'Bangalore',timezone:'Asia/Kolkata',currency:'INR',serverTime:'2030-05-31T04:00:00Z',today:'2030-05-31',currentTime:'09:30',hours:'Daily, 10am–3pm & 6pm–11pm',openingPeriods:[{open:'10:00',close:'15:00'},{open:'18:00',close:'23:00'}],foodSlots:['10:00','10:30','18:00'],slots:['10:00','11:30','18:00'],maxAdvanceDays:60,maxGuests:8,deliveryFee:4000,freeDeliveryFrom:49900,demo:true,...settings});
     if(name==='get_slots')return respond({slots:['10:00','10:30','11:30','18:00'].map(time=>({time,available:true,past:false,seatsLeft:24}))});
     if(name==='get_guest_checkout_status')return respond({enabled:guestReady});
     if(!role)return denied();
     if(['prepare_guest_order_transfer','claim_guest_orders'].includes(name)){
      if(!transferReady)return respond({code:'PGRST202',message:'Transfer migration missing'},404);
      if(role!=='customer')return denied();
      if(name==='prepare_guest_order_transfer'){
       const target=users.find(item=>item.id===body.p_customer),previous=transfers.get(user.id);
       if(!user.is_anonymous||!target||target.role!=='customer'||previous?.claimed&&previous.target!==target.id)return denied();
       transfers.set(user.id,previous?.claimed?previous:{target:target.id,claimed:false});return respond(null);
      }
      const grant=transfers.get(body.p_guest);if(user.is_anonymous||grant?.target!==user.id)return denied();
      if(grant.claimed)return respond(grant.count);
      const owned=orders.filter(order=>order.owner===body.p_guest);for(const order of owned)order.owner=user.id;
      grant.claimed=true;grant.count=owned.length;return respond(grant.count);
     }

     if(name==='get_order_history'&&!historyReady)return respond({code:'PGRST202',message:'History migration is not applied.'},404);
     if(name==='get_operations'&&role==='customer'&&!historyReady)return respond({categories:catalogue.categories,menu:menu(),orders:orders.filter(order=>order.owner===user.id).map(order=>publicOrder(order,role)),settings,activity:[]});
     if(name==='get_order_history'||name==='get_operations'&&role==='customer'){
      if(role!=='customer')return denied();
      if(user.is_anonymous&&body?.p_page>0)return respond({code:'22023',message:'Guest history contains only the latest three orders.'},400);
      const data=orderHistory(orders.filter(order=>order.owner===user.id).map(order=>publicOrder(order,role)),{guest:!!user.is_anonymous,page:body?.p_page||0,search:body?.p_search||'',reference:body?.p_reference});
      return respond({categories:catalogue.categories,menu:menu(),orders:data.history.items,...data,historyVersion:7,settings,activity:[]});
     }
     if(name==='get_operations')return respond({categories:catalogue.categories,menu:menu(),orders:orders.map(order=>publicOrder(order,role)),settings,activity:[],historyVersion:7});
     if(name==='place_order'){
      if(role!=='customer')return denied();
      const p=body.p,previous=orders.find(order=>order.owner===user.id&&order.requestId===p.requestId);
      if(previous)return respond(publicOrder(previous,role));
      const items=p.items.map(line=>{const item=catalogue.items.find(item=>item.id===line.id),variant=item.variants.find(v=>v.id===line.variant)||item.variants[0],addons=item.addons.filter(a=>line.addons?.includes(a.id));return{id:item.id,name:item.name,image:item.image,quantity:line.quantity,unitPrice:item.price+variant.price+addons.reduce((n,a)=>n+a.price,0),options:{variant,spice:line.spice||item.spice,addons}};});
      const subtotal=items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0),deliveryFee=p.fulfilment==='delivery'&&subtotal<49900?4000:0,createdAt=new Date().toISOString();
      const order={reference:'BB-ORDER-TEST'+sequence++,owner:user.id,requestId:p.requestId,origin:'customer',name:p.name,email:user.is_anonymous?p.email:user.email,phone:p.phone,address:p.address||'',postcode:p.postcode||'',date:p.date,time:p.time,fulfilment:p.fulfilment,instructions:p.instructions||'',status:'received',createdAt,subtotal,deliveryFee,total:subtotal+deliveryFee,items,timeline:[{status:'received',at:createdAt}]};
      if(order.fulfilment==='delivery')order.delivery={status:'unassigned',timeline:[]};
      orders.push(order);return respond({...publicOrder(order,role),message:'Your food order is saved. No payment is taken.'});
     }
     if(name==='update_order_delivery'){
      if(role!=='admin')return denied();const order=orders.find(order=>order.reference===body.p_reference);
      if(!order||order.fulfilment!=='delivery'||order.status==='cancelled')return respond({code:'22023',message:'Choose an active delivery order.'},400);
      order.delivery ||= {status:'unassigned',timeline:[]};if(order.delivery.status===body.p_status)return respond(publicOrder(order,role));
      if(body.p_status==='out_for_delivery'&&['ready','collected'].includes(order.status)&&['unassigned','assigned','failed'].includes(order.delivery.status)){
       if(order.status==='ready'){order.status='collected';order.timeline.push({status:'collected',at:new Date().toISOString()});}
      }else if(!(body.p_status==='delivered'&&order.delivery.status==='out_for_delivery'))return respond({code:'22023',message:'Wait for the preceding delivery step.'},400);
      order.delivery.status=body.p_status;order.delivery.timeline.push({status:body.p_status,at:new Date().toISOString()});return respond(publicOrder(order,role));
     }
     if(name==='transition_order'){
      const order=orders.find(order=>order.reference===body.p_reference);
      const next={received:'preparing',preparing:'ready',ready:'collected'}[order?.status];
      if(!order||(role==='customer'&&order.owner!==user.id))return denied();
      const allowed=role==='customer'?order.status==='received'&&body.p_status==='cancelled':body.p_status===next||(role==='admin'&&body.p_status==='cancelled'&&['received','preparing'].includes(order.status));
      if(!allowed||order.delivery&&body.p_status==='collected')return respond({code:'22023',message:'That status change is not allowed.'},400);
      order.status=body.p_status;if(order.delivery&&order.status==='cancelled')order.delivery.status='cancelled';order.timeline.push({status:order.status,at:new Date().toISOString()});return respond(publicOrder(order,role));
     }
     if(name==='save_kitchen_settings'){if(role!=='admin')return denied();settings={acceptingOrders:body.p_accepting,prepMinutes:body.p_prep};return respond(null);}
     if(name==='set_staff_role'){if(role!=='admin')return denied();const target=users.find(u=>u.email===body.p_email);if(target)roles.set(target.id,body.p_role);return respond(null);}
     if(name==='register_menu_photo'){if(role!=='admin')return denied();linked.set(body.p_id,body.p_path);return respond(null);}
     return denied();
    }
    if(url.pathname.startsWith('/storage/v1/object/public/menu-images/')){
     const path=url.pathname.split('/menu-images/')[1],bytes=uploads.get(path);
     return bytes?route.fulfill({contentType:'image/jpeg',headers,body:bytes}):respond({error:'not found'},404);
    }
    if(url.pathname.startsWith('/storage/v1/object/menu-images/')){
     if(role!=='admin')return denied();
     const path=url.pathname.split('/menu-images/')[1];if(uploads.has(path))return respond({statusCode:'409',message:'The resource already exists'},409);uploads.set(path,request.postDataBuffer());return respond({Key:'menu-images/'+path});
    }
    return respond({error:'Unhandled cloud fixture endpoint'},404);
   }
   if(url.origin!==new URL(SITE).origin)return respond({error:'External request blocked by test'},404);
   let relative=decodeURIComponent(url.pathname.slice(new URL(SITE).pathname.length));
   if(relative==='supabase-config.json')return respond({enabled:true,demoEnabled:false,url:CLOUD,publishableKey:'sb_publishable_browser_fixture'});
   if(!relative||relative.endsWith('/'))relative+='index.html';
   const root=resolve('_site'),file=resolve(root,relative);
   if(!file.startsWith(root+'/'))return respond({error:'not found'},404);
   try{return route.fulfill({status:200,contentType:mime[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{return respond({error:'not found'},404);}
  });
 }
 return{attach,calls,orders,uploads,linked,roles,users,guestUsers,manifest,sessionFor:role=>session(users.find(user=>user.role===role))};
}
export async function signIn(page,role,next=''){
 const user=users.find(user=>user.role===role);
 await page.goto(SITE+'auth/'+(next?'?next='+encodeURIComponent(next):''));
 await page.locator('[name=email]').fill(user.email);await page.locator('[name=password]').fill(PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
}
