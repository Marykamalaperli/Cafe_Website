// Cloud requests always use the signed-in user's JWT and Postgres RLS. No service key.
const root = new URL('../', import.meta.url);
export const rootURL = path => new URL(path.replace(/^\//, ''), root).href;
let configPromise, clientPromise;
export function cloudConfig() {
 return configPromise ||= fetch(rootURL('supabase-config.json'), { cache: 'no-store', signal: AbortSignal.timeout(12000) }).then(async response => {
  if (!response.ok) throw new Error('Account configuration could not load. Reload to retry.');
  const config = await response.json();
  if (typeof config.enabled !== 'boolean') throw new Error('Account configuration is invalid.');
  return config;
 });
}
export async function cloudClient() {
 return clientPromise ||= (async () => {
  const config = await cloudConfig();
  if (!config.enabled) throw new Error('Supabase accounts are not configured on this deployment yet.');
  // The official browser build declares `var supabase`; load it as a classic
  // same-origin script so its namespace is available on globalThis.
  await new Promise((resolve,reject)=>{
   if(globalThis.supabase?.createClient)return resolve();
   const script=document.createElement('script');script.src=rootURL('vendor/supabase.js');
   script.onload=()=>globalThis.supabase?.createClient?resolve():reject(new Error('The account SDK could not initialize.'));
   script.onerror=()=>reject(new Error('The account SDK could not load. Reload to retry.'));
   document.head.append(script);
  });
  return globalThis.supabase.createClient(config.url, config.publishableKey, {
   auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
 })();
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
 return role ? { user: data.session.user, role } : null;
}
export function loginURL(next = location.href) {
 const url = new URL(rootURL('auth/'));
 const target = new URL(next, root);
 if (target.origin === root.origin && target.pathname.startsWith(root.pathname)) url.searchParams.set('next', target.pathname + target.search + target.hash);
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
 location.replace(rootURL('auth/'));
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
 const account = await identity();
 if (!account || account.role !== 'customer') {
  const error = new Error('Sign in with a customer account to save this request.'); error.signIn = true; throw error;
 }
 const p = JSON.parse(options.body || '{}');
 if (url.pathname.endsWith('/api/orders')) result = await rpc('place_order', { p });
 else result = await rpc('submit_customer_form', { p_kind: url.pathname.split('/').at(-1), p: { ...p, name: p.name || account.user.user_metadata?.display_name || 'Customer' } });
 return result;
}
