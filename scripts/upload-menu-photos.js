import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { getSupabaseClient } from '../server/supabase-client.js';
import manifest from '../public/photo-credits.json' with { type: 'json' };

async function credentials() {
 if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal, or use Administrator > Settings > Upload menu photographs.');
 const rl=createInterface({ input:process.stdin,output:process.stdout });
 const email=(await rl.question('Administrator email: ')).trim(); rl.close();
 process.stdout.write('Password (hidden): '); process.stdin.setRawMode(true); process.stdin.resume();
 const password=await new Promise((resolve,reject)=>{
  let value=''; const finish=(error)=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
  function read(chunk){for(const character of chunk.toString()){if(character==='\r'||character==='\n')return finish();if(character==='\u0003')return finish(new Error('Upload cancelled.'));if(character==='\u007f'||character==='\b')value=value.slice(0,-1);else value+=character;}}
  process.stdin.on('data',read);
 });
 return {email,password};
}
let client;
try {
 const login=await credentials(); client=getSupabaseClient();
 const {error:authError}=await client.auth.signInWithPassword(login); login.password='';
 if(authError)throw new Error('Sign-in failed. Check the account credentials and email confirmation.');
 const {data:role,error:roleError}=await client.rpc('my_role');
 if(roleError||role!=='admin')throw new Error('This account does not have the administrator role.');
 let count=0;
 for(const photo of manifest.photos){
  const bytes=await readFile(new URL('../public'+photo.image,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==photo.sha256)throw new Error(`Source integrity check failed for ${photo.id}.`);
  const path=`files/${photo.id}-${photo.sha256.slice(0,12)}.jpg`;
  const {error}=await client.storage.from('menu-images').upload(path,bytes,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
  if(error){const {data:existing,error:downloadError}=await client.storage.from('menu-images').download(path);
   if(downloadError||createHash('sha256').update(Buffer.from(await existing.arrayBuffer())).digest('hex')!==photo.sha256)throw new Error(`Photo upload failed for ${photo.id}. Check bucket policies and retry.`);}
  const {error:linkError}=await client.rpc('register_menu_photo',{p_id:photo.id,p_path:path});
  if(linkError)throw new Error(`Photo ${photo.id} uploaded but could not be linked. Run the migration and retry.`);
  console.log(`${++count}/${manifest.photos.length} · ${photo.id} stored and linked.`);
 }
 console.log('All licensed menu photographs are stored in menu-images/files.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(client)await client.auth.signOut({scope:'local'});}
