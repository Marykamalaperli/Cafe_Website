import { getSupabaseClient } from '../server/supabase-client.js';

try {
  getSupabaseClient();
  const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const endpoint = new URL('/auth/v1/settings', url);
  if (endpoint.protocol !== 'https:') throw new Error('Use the HTTPS URL of your Supabase Cloud project.');

  // Read public project settings only. No sign-in, table query or write occurs.
  const response = await fetch(endpoint, {
    headers: { apikey: publishableKey },
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}.`);
  const settings = await response.json();
  if (!settings || typeof settings.external !== 'object' || settings.external === null) {
    throw new Error('The endpoint did not return Supabase project settings.');
  }
  console.log('Supabase Cloud connection verified: HTTP 200 from the project settings endpoint.');
  console.log('No tables, authentication sessions or website functionality were changed.');
} catch (error) {
  let cause=error, proxyDenied=false;
  while(cause){if(/proxy response.*403/i.test(String(cause.message||'')))proxyDenied=true;cause=cause.cause;}
  if (proxyDenied) {
    console.error('Supabase connection check blocked: the configured HTTPS proxy refused the connection (HTTP 403).');
  } else if (error.name === 'TimeoutError') {
    console.error('Supabase connection check timed out. Check project availability and network access.');
  } else {
    console.error(`Supabase connection check failed: ${error.message}`);
    if (error.cause?.code) console.error(`Network error code: ${error.cause.code}`);
  }
  process.exitCode = 1;
}
