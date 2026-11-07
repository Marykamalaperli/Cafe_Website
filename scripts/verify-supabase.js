import { getSupabaseClient } from '../server/supabase-client.js';

// Read-only readiness checks. Never create test accounts, orders or storage objects.
try {
 const client = getSupabaseClient();
 const { data, error } = await client.rpc('bitesbro_health');
 if (error) throw new Error('Database setup is pending or unavailable. Run supabase/setup.sql in the project SQL Editor.');
 if (data.schemaVersion < 2 || data.menuItems < 1 || !data.bucketReady) throw new Error('The schema, menu seed or menu-images bucket is incomplete.');
 const { error: protectedError } = await client.rpc('get_operations');
 if (!protectedError) throw new Error('Anonymous operational access was allowed. Review permissions before deployment.');
 if (protectedError.code !== '42501' && !['401','403'].includes(String(protectedError.status))) throw new Error('The protected operations check could not verify permissions.');
 const { data: role, error: roleError } = await client.rpc('my_role');
 if (roleError || role !== null) throw new Error('The anonymous role check did not pass.');
 console.log(`Supabase schema v${data.schemaVersion}: ${data.menuItems} dishes; menu-images bucket ready.`);
 console.log('Anonymous operational reads denied; anonymous staff role unavailable.');
 console.log(`Licensed menu photographs linked in Storage: ${data.uploadedPhotos}/${data.photos}.`);
 if(data.schemaVersion>=6){
  const{data:guest,error:guestError}=await client.rpc('get_guest_checkout_status');
  if(guestError||!guest?.enabled)throw new Error('Guest checkout SQL is unavailable. Review migration 006_guest_checkout.sql.');
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
  const response=await fetch(new URL('/auth/v1/settings',url),{headers:{apikey:key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Guest sign-in settings could not be checked.');
  const settings=await response.json();
  if(settings.external?.anonymous_users===true)console.log('Guest checkout SQL ready; Supabase anonymous sign-ins enabled.');
  else{console.log('Guest checkout SQL ready. Pending: enable Anonymous Sign-Ins under Authentication > Sign In / Providers.');process.exitCode=1;}
 }else console.log('Guest checkout pending: apply 006_guest_checkout.sql and enable Anonymous Sign-Ins.');
 if(data.schemaVersion>=7){
  const{error:historyError}=await client.rpc('get_order_history');
  if(historyError?.code!=='42501')throw new Error('The unauthenticated order-history permission check did not pass.');
  console.log('Order history v7 ready; unauthenticated history reads denied.');
 }else{console.log('Order history pending: run 007_order_history_delivery.sql for guest visibility limits and manual delivery tracking.');process.exitCode=1;}
 if (data.uploadedPhotos !== data.photos) { console.log('Pending: sign in as administrator and upload menu photographs from Settings.'); process.exitCode=1; }
} catch (error) { console.error(error.message); process.exitCode=1; }
