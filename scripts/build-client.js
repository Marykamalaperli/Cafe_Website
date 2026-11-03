import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { publicCloudConfig } from '../server/cloud-config.js';

// The SDK already includes its official browser bundle; no CDN or extra bundler is needed.
export function buildClient(root = 'public', env = process.env) {
 const config = publicCloudConfig(env);
 mkdirSync(`${root}/vendor`, { recursive: true });
 cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', `${root}/vendor/supabase.js`);
 cpSync('node_modules/@supabase/supabase-js/LICENSE', `${root}/vendor/supabase.LICENSE.txt`);
 writeFileSync(`${root}/supabase-config.json`, JSON.stringify(config) + '\n');
 console.log(`Prepared local Supabase browser SDK; cloud backend ${config.enabled ? 'configured' : 'not configured'}.`);
 return config;
}
if (process.argv[1]?.endsWith('/build-client.js') || process.argv[1] === 'scripts/build-client.js') buildClient();
