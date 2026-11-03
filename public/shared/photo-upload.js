import { cloudClient, rootURL, rpc } from './cloud.js';

export const photoObjectPath = photo => `files/${photo.id}-${photo.sha256.slice(0,12)}.jpg`;
async function digest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2,'0')).join(''); }
export async function uploadMenuPhotos(progress = () => {}) {
 const client = await cloudClient();
 if (await rpc('my_role') !== 'admin') throw new Error('Only an administrator can upload menu photographs.');
 const response = await fetch(rootURL('photo-credits.json'), { signal: AbortSignal.timeout(15000) });
 if (!response.ok) throw new Error('The licensed photo manifest could not load.');
 const { photos } = await response.json(); let uploaded = 0;
 for (const photo of photos) {
  progress(`${uploaded}/${photos.length} · Preparing ${photo.id}…`);
  const file = await fetch(rootURL(photo.image), { signal: AbortSignal.timeout(20000) });
  if (!file.ok) throw new Error(`The local ${photo.id} photo could not load.`);
  const bytes = await file.arrayBuffer();
  if (await digest(bytes) !== photo.sha256) throw new Error(`The ${photo.id} photo failed its source-file integrity check.`);
  const path = photoObjectPath(photo);
  const { error } = await client.storage.from('menu-images').upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) {
   // A resumed upload may already exist. Verify its bytes; never overwrite another file.
   const existing = await fetch(client.storage.from('menu-images').getPublicUrl(path).data.publicUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
   if (!existing.ok || await digest(await existing.arrayBuffer()) !== photo.sha256) throw new Error(`Could not upload ${photo.id}. Check the bucket and administrator permission, then retry.`);
  }
  await rpc('register_menu_photo', { p_id: photo.id, p_path: path });
  uploaded++; progress(`${uploaded}/${photos.length} · ${photo.id} stored and linked.`);
 }
 return uploaded;
}
