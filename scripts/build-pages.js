import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildClient} from './build-client.js';
const site=new URL(process.env.PAGES_SITE_URL||'https://marykamalaperli.github.io/Cafe_Website/');
const base=site.pathname.replace(/\/$/,'');
const origin=site.origin+base;
execFileSync(process.execPath,['scripts/export-menu.js'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/build-photo-credits.js'],{stdio:'inherit'});
rmSync('_site',{recursive:true,force:true});mkdirSync('_site');cpSync('public','_site',{recursive:true});
const config=buildClient('_site');
if(process.env.REQUIRE_SUPABASE==='true'&&!config.enabled)throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in GitHub Actions Variables before deployment.');
for(const name of readdirSync('_site',{recursive:true}).filter(name=>/\.(html|css)$/.test(name)||['robots.txt','sitemap.xml'].includes(name))){
 let content=readFileSync('_site/'+name,'utf8').replaceAll('{{SITE_URL}}',origin);
 if(name.endsWith('.css')) content=content.replaceAll('/assets/',base+'/assets/');
 if(name.endsWith('.html')) content=content.replace(/(href|src)="\/(?!\/)([^\"]*)"/g,(_,attribute,path)=>attribute+'="'+base+'/'+path+'"');
 writeFileSync('_site/'+name,content);
}
writeFileSync('_site/.nojekyll','');
console.log('Built customer, kitchen, administrator and tracking pages at '+origin+'/');
