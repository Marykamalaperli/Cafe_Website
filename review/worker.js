// Isolated /review/ sandbox. This worker is NEVER installed by the live storefront.
import { PGlite } from './vendor/pglite/index.js';
import { platform, migrations, databaseVersion } from './review-data.js';
import { createPaymentsHandler } from './services/payments.js';
import { createYoupiSimulator } from './services/review-youpi.js';
const scope = self.registration.scope, password = 'Demo-only-BitesBro-123!';
let ready;
async function backend() {
 return ready ||= (async () => {
  const db = new PGlite('idb://bitesbro-payment-review-' + databaseVersion + '-' + new URL(scope).pathname.replace(/[^a-z0-9]/gi, '-'));
  const fresh=!(await db.query("select to_regclass('public.bitesbro_schema_migrations') as t")).rows[0].t;
  if (fresh) { await db.exec(platform); for (const sql of migrations) await db.exec(sql); }
  await db.exec(`create table if not exists auth.review_sessions(token text primary key,refresh text unique,user_id uuid references auth.users(id),family uuid not null,expires_at timestamptz);
   create table if not exists auth.review_secrets(id boolean primary key,secret text);
   create table if not exists auth.review_youpi(id text primary key,reference text unique,session jsonb);`);
  let secret = (await db.query('select secret from auth.review_secrets where id')).rows[0]?.secret;
  if (!secret) { secret = crypto.randomUUID() + crypto.randomUUID(); await db.query('insert into auth.review_secrets values(true,$1)', [secret]); }
  async function readUser(id) { return (await db.query("select id,email,is_anonymous,raw_user_meta_data as user_metadata,email_confirmed_at,'authenticated' as aud,'authenticated' as role from auth.users where id=$1", [id])).rows[0]; }
  const users = [];
  for (const role of ['customer', 'chef', 'admin']) {
   const email = `demo.${role}@bitesbro.invalid`; let found = (await db.query('select id from auth.users where email=$1', [email])).rows[0];
   if (!found) {
    found = { id: crypto.randomUUID() }; await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)', [found.id, email, { display_name: 'Demo ' + role }]);
    await db.query('update public.user_roles set role=$1 where user_id=$2', [role, found.id]);
   }
   users.push(await readUser(found.id));
  }
  // This affects only the private, fictional PostgreSQL database in this browser.
  if(fresh)await db.exec('update public.restaurant_settings set online_payments_enabled=true where id');
  async function rpc(name, args = {}, who = null, service = false) {
   if (!/^[a-z][a-z0-9_]*$/.test(name) || Object.keys(args).some(key => !/^p(?:_[a-z0-9]+)*$/.test(key))) return { data: null, error: { code: '22023', message: 'Invalid review RPC.' } };
   try {
    const data = await db.transaction(async tx => {
     await tx.exec(`set local role ${service ? 'service_role' : who ? 'authenticated' : 'anon'}`);
     await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [who?.id || '']);
     const keys = Object.keys(args); return (await tx.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, keys.map(key => args[key]))).rows[0]?.result ?? null;
    }); return { data, error: null };
   } catch (error) { return { data: null, error: { code: error.code || 'XX000', message: error.message } }; }
  }
  async function session(token) {
   if (!token) return null;
   const row = (await db.query('select user_id from auth.review_sessions where token=$1 and expires_at>now()', [token])).rows[0]; return row ? readUser(row.user_id) : null;
  }
  async function issue(user, family = crypto.randomUUID()) {
   const exp = Math.floor(Date.now() / 1000) + 3600, refresh = crypto.randomUUID() + crypto.randomUUID();
   const encode = value => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
   const token = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ sub: user.id, role: 'authenticated', exp, session_id: family, jti: crypto.randomUUID() }), 'isolated-demo-signature'].join('.');
   await db.query("insert into auth.review_sessions values($1,$2,$3,$4,now()+interval '1 hour')", [token, refresh, user.id, family]);
   return { access_token: token, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  }
  const service = { rpc: (name, args) => rpc(name, args, null, true) };
  const youpi = createYoupiSimulator({ secret, siteURL: scope,
   load: async (reference, id) => (await db.query('select session from auth.review_youpi where reference=$1 or id=$2', [reference, id])).rows[0]?.session,
   save: async session => { await db.query('insert into auth.review_youpi values($1,$2,$3) on conflict(id) do update set session=excluded.session', [session.paymentId, session.orderId, session]); }
  });
  const userClient = token => ({ auth: { getUser: async () => ({ data: { user: await session(token) }, error: null }) }, rpc: async (name, args) => rpc(name, args, await session(token)) });
  const handler = createPaymentsHandler({ env: { SITE_URL: scope, PAYMENTS_MODE: 'test' }, service, userClient, youpi: youpi.provider, simulation: true });
  return { db, users, readUser, rpc, service, session, issue, youpi, handler };
 })();
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function route(request, path) {
 const server = await backend(), url = new URL(request.url), token = request.headers.get('authorization')?.replace(/^Bearer /, ''), who = await server.session(token);
 if(path==='/supabase-config.json')return json({enabled:true,demoEnabled:false,reviewSandbox:true,paymentsEnabled:true,url:new URL('sandbox-supabase',scope).href,publishableKey:'sb_publishable_isolated_payment_review'});
 if (path === '/review-health') return json({ ready: true, sandbox: true, database: 'isolated-postgresql', schemaVersion: 8 });
 if (path === '/sandbox-supabase/auth/v1/token') {
  const body = await request.json();
  if (url.searchParams.get('grant_type') === 'refresh_token') {
   // Access-token expiry does not expire the private refresh token. This keeps
   // a returning demo guest's history available after the browser was closed.
   const saved = (await server.db.query("select * from auth.review_sessions where refresh=$1 and expires_at>now()-interval '30 days'", [body.refresh_token])).rows[0];
   if (!saved) return json({ error: 'invalid_grant', error_description: 'The demo session expired. Sign in again.' }, 400);
   await server.db.query('delete from auth.review_sessions where token=$1', [saved.token]); return json(await server.issue(await server.readUser(saved.user_id), saved.family));
  }
  const user = server.users.find(user => user.email === body.email);
  if (!user || body.password !== password) return json({ error: 'invalid_grant', error_description: 'Use a listed review account or guest checkout.' }, 400);
  return json(await server.issue(user));
 }
 if (path === '/sandbox-supabase/auth/v1/signup') {
  const body = await request.json(); if (body.email || body.password) return json({ code: 'signup_disabled', message: 'Use the listed demo account or guest checkout. This sandbox sends no signup emails.' }, 400);
  const id = crypto.randomUUID(); await server.db.query("insert into auth.users(id,is_anonymous,raw_user_meta_data) values($1,true,'{}')", [id]); return json(await server.issue(await server.readUser(id)));
 }
 if (path === '/sandbox-supabase/auth/v1/user') return who ? json(who) : json({ message: 'Sign in to the demo first.' }, 401);
 if (path === '/sandbox-supabase/auth/v1/logout') {
  if (who) await server.db.query('delete from auth.review_sessions where family=(select family from auth.review_sessions where token=$1)', [token]);
  return json({});
 }
 if (path.startsWith('/sandbox-supabase/rest/v1/rpc/')) {
  const result = await server.rpc(path.split('/').at(-1), request.method === 'POST' ? await request.json() : Object.fromEntries(url.searchParams), who);
  return result.error ? json(result.error, result.error.code === '42501' ? 403 : 400) : json(result.data);
 }
 if (path.startsWith('/sandbox-supabase/functions/v1/payments/')) return server.handler(request);
 if (path === '/review/youpi/submit' && request.method === 'POST') {
  if ((await server.rpc('my_role', {}, who)).data !== 'customer') return json({ error: 'Open the customer demo session first.' }, 403);
  const body = await request.json();
  const owned = await server.rpc('get_payment_request', { p_reference: body.reference }, who);
  if (owned.error) return json({ error: 'This order is outside your available history.' }, 403);
  const context = await server.service.rpc('service_youpi_context', { p_reference: body.reference, p_user: who.id });
  if (context.error) return json({ error: 'Open a saved demo checkout first.' }, 403);
  return server.youpi.claim(context.data, body.utr, new URL('sandbox-supabase/functions/v1/payments/youpi/webhook', scope), server.handler, body.outcome);
 }
 return json({ error: 'This operation is unavailable in the isolated payment demo.' }, 404);
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url), root = new URL(scope);
 if (url.origin === root.origin && url.pathname.startsWith(root.pathname)) {
  const path = '/' + url.pathname.slice(root.pathname.length);
  if (path.startsWith('/sandbox-supabase/') || path.startsWith('/review/') || path === '/review-health' || path === '/supabase-config.json') event.respondWith(route(event.request, path).catch(() => json({ error: 'The isolated demo database could not complete this request. Reload the demo page.' }, 503)));
 } else if (url.hostname.endsWith('.supabase.co')) event.respondWith(json({ error: 'The payment demo never contacts a real Supabase project.' }, 503));
});
