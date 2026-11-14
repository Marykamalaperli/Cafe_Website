import {execFileSync} from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { publicCloudConfig } from '../server/cloud-config.js';

// The SDK already includes its official browser bundle; no CDN or extra bundler is needed.
export function buildClient(root = 'public', env = process.env) {
 const config = publicCloudConfig(env);
 const styles=['styles.css','operations.css','shared/customer-nav.css','shared/payments.css','shared/customer-flow.css'].map(file=>readFileSync('public/'+file,'utf8')).join('\n');
 writeFileSync('public/assets/site.css',styles);mkdirSync(`${root}/assets`,{recursive:true});if(root!=='public')writeFileSync(`${root}/assets/site.css`,styles);

 execFileSync(process.execPath,['scripts/build-image-variants.js'],{stdio:'inherit'});
 if(root!=='public'){mkdirSync(`${root}/assets/images/optimized`,{recursive:true});cpSync('public/assets/images/optimized',`${root}/assets/images/optimized`,{recursive:true});}
 mkdirSync(`${root}/vendor`, { recursive: true });
 cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', `${root}/vendor/supabase.js`);
 cpSync('node_modules/@supabase/supabase-js/LICENSE', `${root}/vendor/supabase.LICENSE.txt`);
 writeFileSync(`${root}/supabase-config.json`, JSON.stringify(config) + '\n');
 console.log(`Prepared local Supabase browser SDK; cloud backend ${config.enabled ? 'configured' : 'not configured'}.`);
 return config;
}
if (process.argv[1]?.endsWith('/build-client.js') || process.argv[1] === 'scripts/build-client.js') buildClient();
