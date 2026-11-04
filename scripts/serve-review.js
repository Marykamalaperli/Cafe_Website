import{createServer}from'node:http';
import{readFile,realpath,stat}from'node:fs/promises';
import{resolve,extname,sep}from'node:path';
import{pathToFileURL}from'node:url';

export async function startStaticReview({port=3211,host='127.0.0.1',prefix='/Cafe_Website/review/'}={}){
 const root=await realpath('_review_site');
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2'};
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://review').pathname;if(!path.startsWith(prefix))throw new Error();
   const relative=decodeURIComponent(path.slice(prefix.length));let file=await realpath(resolve(root,relative||'index.html'));
   if(!file.startsWith(root+sep)&&file!==root)throw new Error();
   if((await stat(file)).isDirectory())file=await realpath(resolve(file,'index.html'));
   if(!file.startsWith(root+sep))throw new Error();
   const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return{server,base:`http://${host}:${server.address().port}${prefix}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=await startStaticReview({port:Number(process.env.STATIC_REVIEW_PORT||3211)});console.log('Static GitHub Pages review ready on port '+app.server.address().port);}
