import catalogue from '../public/photo-credits.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';

export const dishPhotos = catalogue.dishes;
export const dishPhotoReferences = catalogue.references;
export const photoByImage = new Map(catalogue.photos.map(photo => [photo.image, photo]));

// Only replace the original bundled illustrations. Preserve owner-uploaded paths.
export const bundledIllustrations = new Set([
 'dosa','idli','vada','rice','pizza','meals','curry','naan','biryani','noodles',
 'burger','samosa','fries','sweet','brownie','filter-coffee','cooler'
].map(name => `/assets/images/food/${name}.svg`).concat([
 'latte','iced-coffee','flat-white','matcha','croissant','cookie','toast','sandwich'
].map(name => `/assets/images/${name}.svg`)));

export function migratePhotos(db, backupPath) {
 if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=3').get()) return;
 if (backupPath) db.prepare('VACUUM INTO ?').run(backupPath+'.pre-photos-v3-'+randomUUID()+'.bak');
 db.exec('BEGIN IMMEDIATE');
 try {
  const update = db.prepare('UPDATE menu_items SET image=? WHERE id=? AND image=?');
  for (const {id,image} of db.prepare('SELECT id,image FROM menu_items').all()) {
   const replacement = dishPhotos[id];
   if (replacement && bundledIllustrations.has(image)) update.run(replacement,id,image);
  }
  db.prepare('INSERT INTO schema_migrations(version) VALUES(3)').run();
  db.exec('COMMIT');
 } catch (error) { db.exec('ROLLBACK'); throw error; }
}
