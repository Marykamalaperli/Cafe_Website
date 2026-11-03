import { createClient } from '@supabase/supabase-js';

export function createCloudApi(config, factory = createClient) {
 return async function cloudApi(path, req, data, url) {
  const bearer = req.headers.authorization;
  const client = factory(config.url, config.publishableKey, {
   auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
   global: { headers: bearer ? { Authorization: bearer } : {} }
  });
  async function call(name, params = {}) {
   const { data: value, error } = await client.rpc(name, params);
   if (error) {
    const failure = new Error(error.code === '42501' ? 'Sign in with an authorised account.' : error.code === 'PGRST202' || error.code === '42P01' ? 'Supabase database setup is pending.' : error.code?.startsWith('22') ? error.message : 'Supabase could not complete this request.');
    failure.status = error.code === '42501' ? 403 : error.code?.startsWith('22') || error.code?.startsWith('23') ? 400 : 503;
    throw failure;
   }
   return value;
  }
  if (req.method === 'GET') {
   if (path === '/api/health') { const result = await call('bitesbro_health'); if(result.schemaVersion<2){const error=new Error('Supabase catalogue migration is pending.');error.status=503;throw error;}return { ...result, status:'ok',database: 'supabase' }; }
   if (path === '/api/cafe') return call('get_cafe');
   if (path === '/api/menu') {
    const result = await call('get_menu');
    const category=url.searchParams.get('category')||'all',diet=url.searchParams.get('diet')||'all',query=(url.searchParams.get('q')||'').slice(0,120).toLowerCase();
    if((category!=='all'&&!result.categories.some(item=>item.id===category))||!['all','veg','vegan','non-veg'].includes(diet)){const error=new Error('Unknown menu filter.');error.status=400;throw error;}
    result.items=result.items.filter(item=>(category==='all'||item.category===category)&&(diet==='all'||(diet==='veg'?item.diet!=='non-veg':item.diet===diet))&&(!query||(item.name+' '+item.description+' '+item.ingredients.join(' ')).toLowerCase().includes(query)));
    result.items = result.items.map(item => ({ ...item, image: item.storagePath ? client.storage.from('menu-images').getPublicUrl(item.storagePath).data.publicUrl : item.image }));
    return result;
   }
   if (['/api/availability','/api/fulfilment'].includes(path)) return call('get_slots', { p_date: url.searchParams.get('date'), p_reservation: path === '/api/availability' });
  }
  if (req.method === 'POST' && ['/api/orders','/api/reservations','/api/contact','/api/newsletter'].includes(path)) {
   if (!bearer?.startsWith('Bearer ')) { const error = new Error('Sign in before saving a request.'); error.status = 401; throw error; }
   const { data: account, error } = await client.auth.getUser(bearer.slice(7));
   if (error || !account.user) { const failure = new Error('Your sign-in session is invalid or expired.'); failure.status = 401; throw failure; }
   if (path === '/api/orders') return call('place_order', { p: data });
   return call('submit_customer_form', { p_kind: path.split('/').at(-1), p: { ...data, name: data.name || account.user.user_metadata?.display_name || 'Customer' } });
  }
  const error = new Error('This endpoint does not exist.'); error.status = 404; throw error;
 };
}
