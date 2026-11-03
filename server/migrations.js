import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { foodMenu } from './food-menu.js';
export function migrateFood(db,backupPath) {
 if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) return;
 if(backupPath) db.prepare('VACUUM INTO ?').run(backupPath+'.pre-food-v2-'+randomUUID()+'.bak');
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
 try {
  db.exec(readFileSync(new URL('./migrations/002_food_ordering.sql',import.meta.url),'utf8'));
  const existing=db.prepare('SELECT id,dietary FROM menu_items').all();
  for(const item of existing){
   const diet=JSON.parse(item.dietary).includes('Plant based')?'vegan':'veg';
   const allergens=JSON.parse(item.dietary).filter(v=>v.startsWith('Contains ')).map(v=>v.slice(9));
   const details={diet,cuisine:'Contemporary',portion:'1 serving',ingredients:[],allergens,prepMinutes:10,spice:'none',variants:[{id:'regular',label:'Regular',price:0}],addons:[]};
   db.prepare('UPDATE menu_items SET details=? WHERE id=?').run(JSON.stringify(details),item.id);
  }
  const insert=db.prepare('INSERT OR IGNORE INTO menu_items(id,name,category,price,description,image,badge,dietary,details) VALUES(?,?,?,?,?,?,?,?,?)');
  for(const item of foodMenu) insert.run(item.id,item.name,item.category,item.price,item.description,item.image,item.badge,JSON.stringify(item.dietary),JSON.stringify(item.details));
  if(db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Food migration would break existing order references.');
  db.exec('COMMIT');
 } catch(error){db.exec('ROLLBACK');throw error;} finally{db.exec('PRAGMA foreign_keys=ON;');}
}
