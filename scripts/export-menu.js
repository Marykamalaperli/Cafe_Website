import {writeFileSync} from 'node:fs';
import {openDatabase} from '../server/database.js';
import {categories,readMenu} from '../server/food-menu.js';
const db=openDatabase(':memory:');
writeFileSync(new URL('../public/menu.json',import.meta.url),JSON.stringify({sample:true,currency:'INR',categories,items:readMenu(db)},null,2)+'\n');
db.close();
console.log('Exported 50 sample dishes for static menu browsing.');
