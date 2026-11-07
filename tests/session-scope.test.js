import{test}from'node:test';
import assert from'node:assert/strict';
import{portalForPage,portalForRole,portalAllows,portalStorageKey}from'../public/shared/session-scope.js';

const root='https://example.invalid/Cafe_Website/';
test('portal selection follows the page and validated login destination, without using customer role metadata',()=>{
 for(const [path,portal]of[['','customer'],['orders/?portal=admin','customer'],['admin/?portal=customer','admin'],['kitchen/','kitchen'],['auth/?portal=kitchen','kitchen'],['auth/?next=%2FCafe_Website%2Fadmin%2F','admin'],['auth/?next=https://outside.invalid/admin/','customer'],['auth/?next=%2FOther_Project%2Fadmin%2F','customer'],['auth/?portal=owner','customer'],['auth/?code=callback','kitchen']])assert.equal(portalForPage(root+path,root,'kitchen'),portal,path);
 assert.equal(portalForPage('https://outside.invalid/admin/',root),'customer');
 assert.equal(portalForPage(root+'auth/',root,'admin'),'customer','A callback hint does not select the portal for a normal visit.');
 assert.equal(portalForPage(root+'auth/?error=access_denied&error_description=expired',root,'kitchen'),'kitchen','An expired staff email link still uses its own portal.');
 assert.equal(portalForPage(root+'auth/#access_token=fixture&type=recovery',root,'admin'),'admin');
 assert.equal(portalForRole('chef'),'kitchen');assert.equal(portalForRole('owner'),null);
 assert.equal(portalAllows('admin','customer'),false);assert.equal(portalAllows('kitchen','admin'),true);assert.equal(portalAllows('customer','chef'),false);
 assert.equal(portalAllows('owner','customer'),false);
});
test('customer storage remains compatible while staff keys differ by portal and site',()=>{
 const project='https://fixture.supabase.co',customer=portalStorageKey(project,root,'customer'),admin=portalStorageKey(project,root,'admin'),kitchen=portalStorageKey(project,root,'kitchen');
 assert.equal(customer,'sb-fixture-auth-token');assert.equal(new Set([customer,admin,kitchen]).size,3);
 assert.notEqual(admin,portalStorageKey(project,'https://example.invalid/Another_Site/','admin'));
 assert.throws(()=>portalStorageKey(project,root,'owner'));
});
