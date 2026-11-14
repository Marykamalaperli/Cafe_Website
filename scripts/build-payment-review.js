import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildClient } from './build-client.js';
import { paymentPlatform, paymentMigrations } from '../server/payment-review-database.js';

const out = '_payment_review_site', site = new URL(process.env.REVIEW_SITE_URL || 'https://marykamalaperli.github.io/Cafe_Website/review/');
rmSync(out, { recursive: true, force: true }); mkdirSync(out); cpSync('public', out, { recursive: true });
buildClient(out, {}); // No environment settings, Cloud credentials or customer data.
mkdirSync(out + '/vendor/pglite', { recursive: true });
cpSync('node_modules/@electric-sql/pglite/dist', out + '/vendor/pglite', { recursive: true, filter: path => !path.endsWith('.map') && !path.endsWith('.tar.gz') });
cpSync('node_modules/@electric-sql/pglite/LICENSE', out + '/vendor/pglite.LICENSE.txt');
mkdirSync(out + '/services');
for (const name of ['providers.js', 'payments.js', 'youpi.js']) cpSync('supabase/functions/_shared/' + name, out + '/services/' + name);
writeFileSync(out + '/services/review-youpi.js', readFileSync('review/youpi-simulator.js', 'utf8').replaceAll('../supabase/functions/_shared/', './'));
cpSync('review/worker.js', out + '/review-worker.js');
const migrations = [...paymentMigrations,'supabase/migrations/009_guest_account_history.sql','supabase/migrations/010_staff_delivery_tracking.sql','supabase/migrations/011_delivery_partner_contact.sql'].map(file => readFileSync(file, 'utf8'));
const databaseVersion=createHash('sha256').update(migrations.join('\n')).digest('hex').slice(0,12);
writeFileSync(out+'/review-install.js',readFileSync('review/install.js','utf8').replaceAll('{{REVIEW_VERSION}}',databaseVersion));
writeFileSync(out+'/review-version.json',JSON.stringify({databaseVersion}));
writeFileSync(out + '/review-data.js', `export const platform=${JSON.stringify(paymentPlatform)};\nexport const migrations=${JSON.stringify(migrations)};\nexport const databaseVersion='${databaseVersion}';\n`);
// Keep demo bag selections and every portal's Auth/verifier key separate from the
// production site, including when both folders share the same Pages origin.
const bagFile=out+'/shared/bag.js';writeFileSync(bagFile,readFileSync(bagFile,'utf8').replaceAll('bitesbro.food-bag.v2','bitesbro.payment-review.food-bag.v2').replaceAll('bitesbro.bag.v1','bitesbro.payment-review.bag.v1'));
const sessionsFile=out+'/shared/session-scope.js',sessionsSource=readFileSync(sessionsFile,'utf8');
if(!sessionsSource.includes("const legacy='sb-'"))throw new Error('Update the review Auth-key isolation for the changed session helper.');
writeFileSync(sessionsFile,sessionsSource.replace("const legacy='sb-'","const legacy='bitesbro-payment-review-sb-'"));
for (const entry of ['app.js', 'auth/app.js', 'admin/app.js', 'kitchen/app.js', 'orders/app.js', 'shared/customer-page.js']) {
 const prefix = entry.includes('/') ? '../' : './', file = out + '/' + entry;
 writeFileSync(file, `await import(new URL('${prefix}review-install.js',import.meta.url));\n` + readFileSync(file, 'utf8'));
}
for (const file of readdirSync(out, { recursive: true }).filter(name => /\.(html|css)$/.test(name))) {
 let content = readFileSync(out + '/' + file, 'utf8').replaceAll('{{SITE_URL}}', site.href.replace(/\/$/, ''));
 if(file.endsWith('.html'))content=content.replace(/srcset="([^"]*)"/g,(_,value)=>'srcset="'+value.replaceAll('/assets/',site.pathname+'assets/')+'"');
 if (file.endsWith('.html')) content = content.replace('<head>', '<head><meta name="robots" content="noindex,nofollow">').replace(/(href|src)="\/(?!\/)([^"]*)"/g, (_, attribute, path) => `${attribute}="${site.pathname}${path}"`);
 if (file.endsWith('.css')) content = content.replaceAll('/assets/', site.pathname + 'assets/');
 writeFileSync(out + '/' + file, content);
}
const roles = ['customer', 'chef', 'admin'];
writeFileSync(out + '/review.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BitesBro · YouPI payment demo</title><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./operations.css"><link rel="stylesheet" href="./auth.css"><link rel="stylesheet" href="./shared/payments.css"><script type="module" src="./review-launch.js"></script></head><body class="ops-app"><main class="auth-main"><section class="ops-panel auth-card"><p class="eyebrow">BITESBRO × YOUPI · DEMO</p><h1>From your bag<br>to the <em>kitchen.</em></h1><p>Try guest checkout, UPI payment review and kitchen updates in separate tabs. Everything stays in a private database in this browser. No real bank, YouPI server, Supabase project, email or courier is contacted. Use fictional details.</p><p id="review-status" role="status">Starting your private demo…</p><p><a class="ops-button ops-button-orange" href="./" target="_blank" rel="noopener">Order as a guest</a></p>${roles.map(role => `<p><a class="ops-button" href="./auth/?portal=${role === 'chef' ? 'kitchen' : role}&amp;reviewRole=${role}&amp;next=${encodeURIComponent(site.pathname + (role === 'customer' ? '' : role === 'chef' ? 'kitchen/' : 'admin/'))}" target="_blank" rel="noopener">Open ${role} demo</a><br><small>demo.${role}@bitesbro.invalid</small></p>`).join('')}<p>Demo-only password: <code>Demo-only-BitesBro-123!</code><br>The review links prefill these fictional accounts. Click Sign in.</p><ol><li>Add food and choose the YouPI payment demo at checkout.</li><li>Submit a simulated bank reference. The order stays out of the kitchen.</li><li>Administrator → Settings → Payments: verify the simulated bank receipt.</li><li>Chef: prepare the released ticket. Customer: follow it in My orders.</li></ol><p>Customer, admin and kitchen sessions stay independent. Guest history shows three recent orders plus older active orders; member history shows five per page. Reloading preserves this browser’s demo orders.</p><p><a class="text-link" href="../">Return to the main BitesBro site</a></p></section></main></body></html>`);
writeFileSync(out + '/review-launch.js', `import './review-install.js';\nconst status=document.getElementById('review-status');try{const result=await fetch('./review-health');if(!result.ok)throw new Error();status.textContent='Ready. Open the customer, admin and kitchen in separate tabs.';}catch{status.textContent='The demo could not start. Reload in a current browser with site storage enabled.';}\n`);
writeFileSync(out + '/supabase-config.json', JSON.stringify({ enabled: true, demoEnabled: false, reviewSandbox: true, paymentsEnabled: true, url: new URL('sandbox-supabase', site).href, publishableKey: 'sb_publishable_isolated_payment_review' }));
writeFileSync(out + '/.nojekyll', '');
console.log('Built isolated YouPI payment demo at ' + site.href + 'review.html');
