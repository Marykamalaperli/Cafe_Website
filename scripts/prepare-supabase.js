import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { categories } from '../server/food-menu.js';
import manifest from '../public/photo-credits.json' with { type: 'json' };

export function catalogueSeed(catalogue, photos = manifest.photos) {
 const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
 const json = value => quote(JSON.stringify(value)) + '::jsonb';
 const statements = ['-- Menu and licensed photo metadata only. Never contains customer records.', 'begin;', 'set local standard_conforming_strings=on;'];
 for (const [index, category] of catalogue.categories.entries()) statements.push(`insert into public.menu_categories(id,name,position) values(${quote(category.id)},${quote(category.name)},${index}) on conflict(id) do nothing;`);
 for (const photo of photos) statements.push(`insert into public.menu_photos(id,local_path,sha256,credit) values(${quote(photo.id)},${quote(photo.image)},${quote(photo.sha256)},${json(photo)}) on conflict(id) do nothing;`);
 for (const item of catalogue.items) {
  const photo = photos.find(photo => photo.image === item.image);
  if (!photo) throw new Error(`Dish ${item.id} has a custom photograph. Add its licence and hash to the manifest before migration.`);
  const values = [item.id,item.name,item.category,item.description,item.price,photo.id,item.photo?.reference || manifest.references[item.id] || null,item.badge || '',item.diet,item.portion,item.prepMinutes,item.spice];
  const sql = values.map(value => value === null ? 'null' : typeof value === 'number' ? String(value) : quote(value));
  sql.push(...['ingredients','allergens','variants','addons'].map(key => json(item[key])), String(item.available !== false));
  statements.push(`insert into public.menu_items(id,name,category,description,price,photo_id,photo_reference,badge,diet,portion,prep_minutes,spice,ingredients,allergens,variants,addons,available) values(${sql.join(',')}) on conflict(id) do nothing;`);
 }
 statements.push('insert into public.bitesbro_schema_migrations(version) values(2) on conflict do nothing;', "notify pgrst, 'reload schema';", 'commit;');
 return statements.join('\n')+'\n';
}

export function prepareSupabase() {
 let catalogue;
 const path = resolve(process.env.DATABASE_PATH || 'data/bitesbro.sqlite');
 if (existsSync(path)) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
   db.exec('begin');
   const items = db.prepare('select * from menu_items order by id').all().map(({ details, dietary, available, ...item }) => ({ ...item, ...JSON.parse(details), dietary:JSON.parse(dietary), available:Boolean(available) }));
   catalogue = { categories, items }; db.exec('commit');
  } finally { db.close(); }
  console.log('Read existing SQLite menu in a read-only transaction. Customer tables were not exported.');
 } else catalogue = JSON.parse(readFileSync('public/menu.json','utf8'));
 const seed = catalogueSeed(catalogue);
 writeFileSync('supabase/migrations/002_catalogue.sql',seed);
 const schema = readFileSync('supabase/migrations/001_bitesbro.sql','utf8');
 writeFileSync('supabase/setup.sql',schema+'\n'+seed);
 console.log(`Prepared supabase/setup.sql: schema, ${catalogue.items.length} dishes, ${manifest.photos.length} licensed photo records. Existing Cloud menu edits are preserved on rerun.`);
}
if (process.argv[1]?.endsWith('/prepare-supabase.js') || process.argv[1] === 'scripts/prepare-supabase.js') prepareSupabase();
