// A portal chooses a browser session, never a database role or permission.
export const PORTALS=['customer','admin','kitchen'];
export const portalForRole=role=>role==='admin'?'admin':role==='chef'?'kitchen':role==='customer'?'customer':null;
export const portalAllows=(portal,role)=>portal==='kitchen'?['chef','admin'].includes(role):portal==='admin'?role==='admin':portal==='customer'?role==='customer':false;
export const portalPath=portal=>portal==='admin'?'admin/':portal==='kitchen'?'kitchen/':'';
export function isAuthCallback(href){const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1));return['code','error','error_description'].some(key=>url.searchParams.has(key))||['access_token','error','error_description'].some(key=>hash.has(key));}

export function portalForPage(href,root,callbackPortal) {
 const base=new URL(root),url=new URL(href,base);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return'customer';
 const path=url.pathname.slice(base.pathname.length);
 if(/^admin(?:\/|$)/.test(path))return'admin';
 if(/^kitchen(?:\/|$)/.test(path))return'kitchen';
 if(!/^auth(?:\/|$)/.test(path))return'customer';
 if(PORTALS.includes(url.searchParams.get('portal')))return url.searchParams.get('portal');
 if(isAuthCallback(url)&&PORTALS.includes(callbackPortal))return callbackPortal;
 if(url.searchParams.has('next')){
  try{const next=new URL(url.searchParams.get('next'),base);if(next.origin===base.origin&&next.pathname.startsWith(base.pathname)&&!/^auth(?:\/|$)/.test(next.pathname.slice(base.pathname.length)))return portalForPage(next,base);}catch{/* Invalid return paths cannot select a staff portal. */}
 }
 return'customer';
}

export function portalStorageKey(projectURL,root,portal) {
 if(!PORTALS.includes(portal))throw new Error('Choose a supported sign-in portal.');
 const legacy='sb-'+new URL(projectURL).hostname.split('.')[0]+'-auth-token';
 // Keep the established customer key so existing guest order ownership survives.
 return portal==='customer'?legacy:legacy+'-bitesbro-'+encodeURIComponent(new URL(root).pathname)+'-'+portal;
}
