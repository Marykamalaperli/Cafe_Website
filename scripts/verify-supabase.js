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
 if (data.uploadedPhotos !== data.photos) { console.log('Pending: sign in as administrator and upload menu photographs from Settings.'); process.exitCode=1; }
} catch (error) { console.error(error.message); process.exitCode=1; }
