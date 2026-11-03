// Only these two intentionally public settings may cross the server/browser boundary.
export function publicCloudConfig(env = process.env) {
 const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
 const publishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '').trim();
 if (!url && !publishableKey) return { enabled: false, demoEnabled: env.APP_DEMO_MODE === 'true' };
 if (!url || !publishableKey) throw new Error('Both Supabase public settings are required.');
 const parsed = new URL(url);
 if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Use the HTTPS Supabase project origin.');
 let isPublic = publishableKey.startsWith('sb_publishable_');
 if (!isPublic && publishableKey.split('.').length === 3) {
  try { isPublic = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Invalid keys are rejected below. */ }
 }
 if (!isPublic) throw new Error('Browser configuration requires a publishable key, never a secret or service-role key.');
 return { enabled: true, demoEnabled: false, url: parsed.origin, publishableKey };
}
