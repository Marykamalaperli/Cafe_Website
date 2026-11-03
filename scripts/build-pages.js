import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const site=new URL(process.env.PAGES_SITE_URL||'https://marykamalaperli.github.io/Cafe_Website/');
const base=site.pathname.replace(/\/$/,'');
const origin=site.origin+base;
execFileSync(process.execPath,['scripts/export-menu.js'],{stdio:'inherit'});
rmSync('_site',{recursive:true,force:true});mkdirSync('_site');cpSync('public','_site',{recursive:true});
for(const name of ['index.html','styles.css','robots.txt','sitemap.xml']){
 let content=readFileSync('_site/'+name,'utf8').replaceAll('{{SITE_URL}}',origin);
 if(name==='index.html'||name==='styles.css') content=content.replaceAll('/assets/',base+'/assets/');
 if(name==='index.html') content=content.replace(/(href|src)="\/(styles\.css|app\.js)/g,(_,attribute,file)=>attribute+'="'+base+'/'+file);
 writeFileSync('_site/'+name,content);
}
writeFileSync('_site/.nojekyll','');
console.log('Built GitHub Pages food menu at '+origin+'/');
