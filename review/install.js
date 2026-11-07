// Loaded only by the separately built /review/ site, never the production root.
if(!('serviceWorker'in navigator))throw new Error('This browser cannot run the isolated review. Use a current browser on HTTPS.');
const scope=new URL('./',import.meta.url),worker=new URL('review-worker.js?v={{REVIEW_VERSION}}',scope);
const registration=await navigator.serviceWorker.register(worker,{type:'module',scope:scope.pathname,updateViaCache:'none'});
const installing=registration.installing||registration.waiting;
if(installing&&installing.state!=='activated')await new Promise((resolve,reject)=>installing.addEventListener('statechange',()=>{if(installing.state==='activated')resolve();if(installing.state==='redundant')reject(new Error('The review worker could not start.'));}));
await navigator.serviceWorker.ready;
if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
// Schema upgrades reset only the fictional review's tokens, never the main
// site's customer/guest/staff sessions or its saved food bag.
const version='{{REVIEW_VERSION}}',versionKey='bitesbro-payment-review-version:'+scope.pathname;
if(localStorage.getItem(versionKey)!==version){for(const key of Object.keys(localStorage))if(key.startsWith('bitesbro-payment-review-sb-'))localStorage.removeItem(key);localStorage.removeItem('bitesbro-auth-callback:'+scope.pathname);localStorage.setItem(versionKey,version);}
const banner=document.createElement('aside');banner.className='review-banner';banner.setAttribute('aria-label','Payment demo');
const link=document.createElement('a');link.href=new URL('review.html',scope);link.textContent='Payment demo';banner.append(link,' · Private browser database. No real payments, bank connections or emails.');document.body.prepend(banner);
const role=new URL(location.href).searchParams.get('reviewRole'),form=document.querySelector('#auth-form');
if(form&&['customer','chef','admin'].includes(role)){
 const fill=()=>{if(form.hidden)return;form.elements.email.value=`demo.${role}@bitesbro.invalid`;form.elements.password.value='Demo-only-BitesBro-123!';observer.disconnect();};
 const observer=new MutationObserver(fill);observer.observe(form,{attributes:true,attributeFilter:['hidden']});fill();
}
