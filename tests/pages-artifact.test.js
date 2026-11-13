import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForPagesArtifact} from '../scripts/wait-pages-artifact.js';
const options={token:'test-token',repository:'fixture/cafe',runId:'123',interval:5,attempts:3};
const response=artifacts=>({ok:true,status:200,json:async()=>({artifacts})});
test('Pages waits for the uploaded artifact in the current run, excluding expired or unrelated artifacts',async()=>{
 let calls=0,waits=0;
 const artifact=await waitForPagesArtifact({...options,pause:async()=>waits++,fetcher:async(url,request)=>{
  assert.match(url,/fixture\/cafe\/actions\/runs\/123\/artifacts/);assert.equal(request.headers.Authorization,'Bearer test-token');
  calls++;return response(calls===1?[{name:'github-pages',expired:true},{name:'other',expired:false}]:[{id:42,name:'github-pages',expired:false}]);
 }});
 assert.equal(artifact.id,42);assert.equal(calls,2);assert.equal(waits,1);
});
test('Pages reports denied permissions and stops rather than deploying without an artifact',async()=>{
 await assert.rejects(waitForPagesArtifact({...options,fetcher:async()=>({ok:false,status:403})}),/actions: read/);
 let calls=0;await assert.rejects(waitForPagesArtifact({...options,pause:async()=>{},fetcher:async()=>{calls++;return response([]);}}),/not visible/);assert.equal(calls,3);
});
test('Pages retries transient metadata failures without logging or exposing credentials',async()=>{
 let calls=0;const artifact=await waitForPagesArtifact({...options,pause:async()=>{},fetcher:async()=>{calls++;if(calls===1)throw new TypeError('network');if(calls===2)return{ok:false,status:503};return response([{id:9,name:'github-pages'}]);}});assert.equal(artifact.id,9);
});
