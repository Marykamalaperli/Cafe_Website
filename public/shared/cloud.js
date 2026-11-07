// Cloud requests always use the signed-in user's JWT and Postgres RLS. No service key.
import { PORTALS, portalForPage, portalForRole, portalAllows, portalPath, portalStorageKey, isAuthCallback } from './session-scope.js?v=portal-auth-1';
const root = new URL('../', import.meta.url);
export const rootURL = path => new URL(path.replace(/^\//, ''), root).href;
const callbackKey='bitesbro-auth-callback:'+root.pathname;
function storedCallbackPortal(){try{return localStorage.getItem(callbackKey);}catch{return null;}}
export const sessionPortal=portalForPage(location.href,root,storedCallbackPortal());
const initialCallback=isAuthCallback(location.href);
let configPromise, sdkPromise, guestPromise, migrationPromise;
const clients=new Map();
export function cloudConfig() {
 return configPromise ||= fetch(rootURL('supabase-config.json'), { cache: 'no-store', signal: AbortSignal.timeout(12000) }).then(async response => {
  if (!response.ok) throw new Error('Account configuration could not load. Reload to retry.');
  const config = await response.json();
  if (typeof config.enabled !== 'boolean') throw new Error('Account configuration is invalid.');
  return config;
 });
}
async function loadSDK() {
 return sdkPromise ||= (async()=>{
  // The official browser build declares `var supabase`; load it as a classic
  // same-origin script so its namespace is available on globalThis.
  await new Promise((resolve,reject)=>{
   if(globalThis.supabase?.createClient)return resolve();
   const script=document.createElement('script');script.src=rootURL('vendor/supabase.js');
   script.onload=()=>globalThis.supabase?.createClient?resolve():reject(new Error('The account SDK could not initialize.'));
   script.onerror=()=>reject(new Error('The account SDK could not load. Reload to retry.'));
   document.head.append(script);
  });
 })();
}
function createClient(config,portal,temporary=false) {
 return globalThis.supabase.createClient(config.url, config.publishableKey, {
   auth: { flowType: 'pkce', persistSession: !temporary, autoRefreshToken: !temporary, detectSessionInUrl: !temporary&&portal===sessionPortal,
    storageKey:temporary?'bitesbro-login-check-'+crypto.randomUUID():portalStorageKey(config.url,root,portal) },
   global: { fetch: (url, options) => {
    const target = new URL(url instanceof Request ? url.url : url);
    const project = new URL(config.url);
    const headers = new Headers(url instanceof Request ? url.headers : undefined);
    new Headers(options?.headers).forEach((value, name) => headers.set(name, value));
    // Preserve the caller's Authorization/session headers and explicitly attach
    // the runtime publishable key only to the configured Supabase origin.
    if (target.origin === project.origin) headers.set('apikey', config.publishableKey);
    return fetch(url, { ...options, headers, signal: options?.signal || AbortSignal.timeout(20000) });
   } }
 });
}
async function portalClient(portal) {
 if(!PORTALS.includes(portal))throw new Error('Choose a supported sign-in portal.');
 if(!clients.has(portal))clients.set(portal,(async()=>{
  const config=await cloudConfig();if(!config.enabled)throw new Error('Supabase accounts are not configured on this deployment yet.');
  await loadSDK();return createClient(config,portal);
 })());
 return clients.get(portal);
}

async function migrateLegacyStaff() {
 if(initialCallback)return;
 return migrationPromise ||= (async()=>{
  const config=await cloudConfig(),key=portalStorageKey(config.url,root,'customer'),marker=key+'-bitesbro-staff-migrated';
  const move=async()=>{
   const source=await portalClient('customer'),{data,error}=await source.auth.getSession();
   if(error)throw new Error('Your previous session could not load. Reload to retry.');
   if(!data.session)return;
   let retired=[];try{const saved=JSON.parse(localStorage.getItem(marker)||'[]');if(Array.isArray(saved))retired=saved.filter(value=>typeof value==='string');}catch{/* Ignore damaged migration metadata, never account roles. */}
   let sessionId;try{sessionId=JSON.parse(atob(data.session.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).session_id;}catch{/* Auth and the database still validate this token. */}
   const clearSource=()=>{const stored=JSON.parse(localStorage.getItem(key)||'null');if(stored?.access_token===data.session.access_token&&stored?.refresh_token===data.session.refresh_token)localStorage.removeItem(key);};
   if(sessionId&&retired.includes(sessionId)){clearSource();return;}
   const {data:role,error:roleError}=await source.rpc('my_role');
   if(roleError)throw new Error('Your previous account access could not be checked. Reload to retry.');
   const portal=portalForRole(role);if(!portal||portal==='customer')return;
   // Move only a database-verified legacy staff session. Guest/customer sessions
   // stay at their original key. Never overwrite a newer portal login.
   const target=await portalClient(portal),existing=await target.auth.getSession();
   if(existing.error)throw new Error('The staff session could not load. Reload to retry.');
   if(!existing.data.session){const imported=await target.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});if(imported.error)throw new Error('The staff session could not be moved. Sign in again.');}
   // Remember the migrated session family, not credentials, so a stale old tab
   // cannot restore it after the staff portal signs out.
   if(sessionId)localStorage.setItem(marker,JSON.stringify([...new Set([...retired,sessionId])]));
   clearSource();
  };
  if(navigator.locks)await navigator.locks.request('bitesbro-staff-session-migration:'+key,move);else await move();
 })().catch(error=>{migrationPromise=null;throw error;});
}

export async function cloudClient(portal=sessionPortal) {
 const client=await portalClient(portal);await migrateLegacyStaff();return client;
}

export function rememberAuthCallback() {
 // Keep the existing allowlisted /auth/ callback. PKCE remains in the selected
 // portal's SDK storage; the latest email flow records only its portal name here.
 try{localStorage.setItem(callbackKey,sessionPortal);}catch{throw new Error('Enable browser site storage before requesting an account email.');}
}

export async function signInAccount(email,password) {
 const config=await cloudConfig();await cloudClient();
 // Check credentials/DB role without replacing a guest or another portal login.
 const probe=createClient(config,sessionPortal,true);
 const {data,error}=await probe.auth.signInWithPassword({email,password});
 if(error)throw new Error('Sign-in failed. Check your email and password, and confirm your email first.');
 const {data:role,error:roleError}=await probe.rpc('my_role');
 const portal=sessionPortal==='customer'?portalForRole(role):sessionPortal;
 if(roleError||!portal||!portalAllows(portal,role)){
  await probe.auth.signOut({scope:'local'}).catch(()=>{});
  throw new Error(roleError||!role?'Your account role is not ready. Confirm your email and check the database setup.':`This account does not have ${portal==='admin'?'administrator':'kitchen'} access. Use its authorised sign-in portal.`);
 }
 const client=await portalClient(portal),saved=await client.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 if(saved.error)throw new Error('Your sign-in could not be saved. Please try again.');
 return{user:saved.data.user,role,guest:false,portal};
}
export async function rpc(name, parameters = {}) {
 const client = await cloudClient();
 const { data, error } = await client.rpc(name, parameters);
 if (error) {
  const message = error.code === 'PGRST202' || error.code === '42P01'
   ? 'The Supabase database setup is pending. Run the supplied migration SQL first.'
   : error.code === '42501' ? 'Your session does not have access. Sign in with the correct account.'
   : error.code === '23505' ? 'That request has already been saved.'
   : error.code?.startsWith('22') ? error.message
   : error.code?.startsWith('23') ? 'Please check the required fields and try again.'
   : 'Supabase could not complete this request. Check your connection and retry.';
  const failure = new Error(message); failure.code = error.code; throw failure;
 }
 return data;
}
export const roleHome = role => rootURL(role === 'admin' ? 'admin/' : role === 'chef' ? 'kitchen/' : '');
export async function identity() {
 const client = await cloudClient();
 const { data, error } = await client.auth.getSession();
 if (error || !data.session) return null;
 // The role comes from a protected DB table, never local storage or user_metadata.
 const role = await rpc('my_role');
 return role ? { user: data.session.user, role, guest: data.session.user.is_anonymous === true } : null;
}
export async function ensureGuestCustomer() {
 if (guestPromise) return guestPromise;
 const start = async () => {
  const account = await identity();
  if (account) return account;
  const client = await cloudClient();
  const { data: current } = await client.auth.getSession();
  if (current.session) throw new Error('Your account access is not ready. Please sign in again.');
  try {
   const status = await rpc('get_guest_checkout_status');
   if (!status.enabled) throw new Error('Guest checkout is unavailable.');
  } catch {
   throw new Error('Guest checkout is not available yet. Please try again later or sign in with an existing account.');
  }
  // A guest session has no email/password and sends no signup email. Supabase
  // issues a private UUID/JWT so existing owner-scoped order policies apply.
  const { error } = await client.auth.signInAnonymously();
  if (error) {
   if (error.status === 429) throw new Error('Guest checkout is busy. Please wait before trying again.');
   if (error.code === 'anonymous_provider_disabled') throw new Error('Guest checkout is not available yet. Please try again later or sign in with an existing account.');
   throw new Error('Guest checkout could not start. Please check your connection and try again.');
  }
  const guest = await identity();
  if (!guest || guest.role !== 'customer') throw new Error('Guest checkout could not open. Please try again later.');
  return guest;
 };
 // Serialize creation across tabs too, so two checkouts retain one guest owner.
 guestPromise = (navigator.locks ? navigator.locks.request('bitesbro-guest-checkout', start) : start()).finally(() => { guestPromise = undefined; });
 return guestPromise;
}
export function loginURL(next = location.href) {
 const url = new URL(rootURL('auth/'));
 const target = new URL(next, root);
 if (target.origin === root.origin && target.pathname.startsWith(root.pathname)){
  url.searchParams.set('portal',portalForPage(target,root));url.searchParams.set('next', target.pathname + target.search + target.hash);
 }else url.searchParams.set('portal',sessionPortal);
 return url.href;
}
export async function requireRole(pageRole, { optional = false } = {}) {
 const config = await cloudConfig();
 if (!config.enabled) {
  if (config.demoEnabled) return { demo: true, role: pageRole };
  if (optional) return null;
  location.replace(loginURL()); return null;
 }
 const account = await identity();
 if (!account) {
  if (!optional) location.replace(loginURL());
  return null;
 }
 const allowed = pageRole === 'kitchen' ? ['chef', 'admin'] : [pageRole];
 if (!allowed.includes(account.role)) { location.replace(roleHome(account.role)); return null; }
 return account;
}
export async function signOut() {
 const client = await cloudClient(); const { error } = await client.auth.signOut({ scope: 'local' });
 if (error) throw new Error('Sign-out could not finish. Please retry.');
 location.replace(loginURL(rootURL(portalPath(sessionPortal))));
}
export async function resolveMenu(catalogue) {
 const client = await cloudClient();
 return { ...catalogue, items: catalogue.items.map(item => ({ ...item,
  localImage: item.image, image: item.storagePath ? client.storage.from('menu-images').getPublicUrl(item.storagePath).data.publicUrl : item.image
 })) };
}
export async function cloudRequest(path, options = {}) {
 const url = new URL(path, root); let result;
 if (url.pathname.endsWith('/api/menu')) return resolveMenu(await rpc('get_menu'));
 if (url.pathname.endsWith('/api/cafe')) return rpc('get_cafe');
 if (/\/api\/(availability|fulfilment)$/.test(url.pathname)) return rpc('get_slots', { p_date: url.searchParams.get('date'), p_reservation: url.pathname.endsWith('/availability') });
 const ordering = url.pathname.endsWith('/api/orders');
 const account = ordering ? await ensureGuestCustomer() : await identity();
 if (!account || account.role !== 'customer' || (!ordering && account.guest)) {
  const error = new Error('Sign in with a customer account to save this request.'); error.signIn = true; throw error;
 }
 const p = JSON.parse(options.body || '{}');
 if (ordering) result = { ...await rpc('place_order', { p }), guestCheckout: account.guest === true };
 else result = await rpc('submit_customer_form', { p_kind: url.pathname.split('/').at(-1), p: { ...p, name: p.name || account.user.user_metadata?.display_name || 'Customer' } });
 return result;
}
