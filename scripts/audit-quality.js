import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import lighthouse from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import {launch} from 'chrome-launcher';
import {cafe,openingHours,foodSlots} from '../server/cafe.js';

const runs=Number(process.env.QUALITY_RUNS||3),paths=(process.env.QUALITY_PATHS===undefined?',photo-credits.html':process.env.QUALITY_PATHS).split(',');let failed=false;
if(!Number.isInteger(runs)||runs<1||runs>5)throw new Error('QUALITY_RUNS must be between 1 and 5; CI uses three runs.');

// Audit the built repository subpath using public sample data only. No private
// sessions, real orders, remote APIs or database writes are used by this server.
const root=resolve('_site'),base='/Cafe_Website/',catalogue=JSON.parse(await readFile(root+'/menu.json','utf8'));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.txt':'text/plain','.xml':'application/xml'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://localhost');let data,type;
  if(url.pathname.endsWith('/supabase-config.json')){data=JSON.stringify({enabled:false,demoEnabled:false});type='application/json';}
  else if(url.pathname==='/api/menu'){data=JSON.stringify(catalogue);type='application/json';}
  else if(url.pathname==='/api/cafe'){data=JSON.stringify({...cafe,hours:openingHours,serverTime:new Date().toISOString(),today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date())});type='application/json';}
  else if(['/api/fulfilment','/api/availability'].includes(url.pathname)){data=JSON.stringify({slots:foodSlots.map(time=>({time,available:true,past:false,seatsLeft:24}))});type='application/json';}
  else{
   const relative=url.pathname.startsWith(base)?decodeURIComponent(url.pathname.slice(base.length)):url.pathname.slice(1),file=resolve(root,relative.endsWith('/')||!relative?relative+'index.html':relative);
   if(!file.startsWith(root+'/'))throw new Error('Invalid path');data=await readFile(file);type=mime[extname(file)]||'application/octet-stream';
  }
  const compressed=/text|javascript|json|svg|xml/.test(type)&&req.headers['accept-encoding']?.includes('gzip');
  res.writeHead(200,{'Content-Type':type,'Cache-Control':type==='text/html'?'no-cache':'public,max-age=600',...(compressed?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});res.end(compressed?gzipSync(data):data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}${base}`,out=resolve('quality-results');await mkdir(out,{recursive:true});

const categories=['performance','accessibility','best-practices','seo','agentic-browsing'],thresholds={performance:97,accessibility:100,'best-practices':100,seo:100,'agentic-browsing':100};
let chrome;
try{
 chrome=await launch({chromePath:process.env.CHROME_PATH||process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage']});
 for(const profile of ['mobile','desktop'])for(const path of paths){
  const results=[];
  for(let run=0;run<runs;run++){
   const result=await lighthouse(origin+path,{port:chrome.port,output:['json','html'],logLevel:'error',onlyCategories:categories},profile==='desktop'?desktop:undefined);
   const name=`${path?'credits':'home'}-${profile}-${run+1}`;await writeFile(`${out}/${name}.json`,result.report[0]);await writeFile(`${out}/${name}.html`,result.report[1]);results.push(result.lhr);
  }
  const scores=Object.fromEntries(categories.map(category=>{if(category==='seo'&&path==='photo-credits.html')return[category,'noindex (intentional)'];const values=results.map(r=>Math.round((r.categories[category].score||0)*100)).sort((a,b)=>a-b);return[category,values[Math.floor(values.length/2)]];}));
  console.log(`${profile} ${path||'home'}: ${JSON.stringify(scores)}`);
  for(const category of categories)if(typeof scores[category]==='number'&&scores[category]<thresholds[category]){failed=true;console.error(`${category} requires ${thresholds[category]}; review quality-results reports.`);}
 }
}finally{if(chrome)await chrome.kill();await new Promise(resolve=>server.close(resolve));}
if(failed)process.exitCode=1;
