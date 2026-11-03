import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import catalogue from '../public/photo-credits.json' with { type: 'json' };
import { openDatabase } from '../server/database.js';
import { readMenu } from '../server/food-menu.js';

test('every bundled menu photo exists and retains individual free-use provenance',()=>{
 const allowed=/^(CC0|Public domain|CC BY(?:-SA)? \d|Unsplash License|Pexels License)/;
 const images=new Set();
 for(const photo of catalogue.photos){
  assert.match(photo.license,allowed);assert.ok(photo.author);assert.ok(photo.title);
  for(const key of ['source','licenseUrl','mirror','metadataSource'])assert.equal(new URL(photo[key]).protocol,'https:');
  const bytes=readFileSync(new URL('../public'+photo.image,import.meta.url));
  assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),photo.sha256);
  images.add(photo.image);
 }
 const db=openDatabase(':memory:');
 try{
  const menu=readMenu(db);assert.equal(menu.length,50);
  assert.ok(menu.every(item=>images.has(item.image)&&item.photo?.source));
  assert.notEqual(menu.find(i=>i.id==='veg-biryani').image,menu.find(i=>i.id==='hyderabadi-biryani').image);
 }finally{db.close();}
});
