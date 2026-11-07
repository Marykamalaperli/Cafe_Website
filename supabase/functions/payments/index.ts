import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { youpiProvider } from '../_shared/youpi.js';
import { createPaymentsHandler } from '../_shared/payments.js';

const env = Deno.env.toObject();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const userClient = (token: string) => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
Deno.serve(createPaymentsHandler({ env, service, userClient, youpi: youpiProvider(env) }));
