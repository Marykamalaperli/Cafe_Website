import{createClient}from'npm:@supabase/supabase-js@2.118.0';
import{createOrderServices}from'../_shared/order-services.js';
const env=Deno.env.toObject();
// Supabase supplies these backend settings. Never put the service key in a VITE_* variable.
const service=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const userClient=(token:string)=>createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
Deno.serve(createOrderServices({env,service,userClient}));
