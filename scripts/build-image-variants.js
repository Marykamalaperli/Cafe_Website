import sharp from 'sharp';
import {readFile,mkdir,stat} from 'node:fs/promises';
const heroNames=['dosa','biryani','pizza','gulab-jamun'];
const {photos}=JSON.parse(await readFile('public/photo-credits.json','utf8'));
const names=[...new Set(photos.map(photo=>photo.image.split('/').at(-1).replace(/\.jpg$/,'')))];
export async function buildImageVariants(root='public'){
 await mkdir(root+'/assets/images/optimized',{recursive:true});
 for(const name of names)for(const width of (heroNames.includes(name)?[320,640,960,1280]:[320,640])){
  const source=`public/assets/images/photos/${name}.jpg`,target=`${root}/assets/images/optimized/${name}-${width}.webp`;
  try{if((await stat(target)).mtimeMs>=(await stat(source)).mtimeMs)continue;}catch{}
  await sharp(source).resize({width,withoutEnlargement:true}).webp({quality:78}).toFile(target);
 }
}
if(process.argv[1]?.endsWith('/build-image-variants.js'))await buildImageVariants();
