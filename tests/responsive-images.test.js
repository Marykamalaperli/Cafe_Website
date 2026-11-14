import {test} from 'node:test';
import assert from 'node:assert/strict';
import {responsiveImage} from '../public/shared/responsive-images.js';
test('bundled photographs retain their original fallback and offer resized versions of the same dish',()=>{
 const fallback='<img src="/assets/images/photos/masala-dosa.jpg" alt="Dosa">',markup=responsiveImage('/assets/images/photos/masala-dosa.jpg',fallback,path=>'/Cafe_Website'+path);
 assert.ok(markup.includes(fallback));assert.match(markup,/\/Cafe_Website\/assets\/images\/optimized\/masala-dosa-320.webp/);assert.match(markup,/<source type="image\/webp"/);
});
test('owner-uploaded and unrecognized photographs are never replaced with a bundled photo',()=>{
 for(const path of ['https://fixture.supabase.co/storage/v1/object/public/menu-images/owner.jpg','/assets/images/photos/new-owner-dish.jpg'])assert.equal(responsiveImage(path,'original',path=>path),'original');
});
