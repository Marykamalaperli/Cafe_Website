// Upload success can precede visibility through the Actions artifact-list API.
// Poll only this workflow run, and never continue to Pages without its artifact.
export async function waitForPagesArtifact({token,repository,runId,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=12,interval=5000}) {
 if(!token||!/^[-\w.]+\/[-\w.]+$/.test(repository||'')||!/^\d+$/.test(String(runId||'')))throw new Error('Pages artifact verification requires this run’s GitHub token, repository and run ID.');
 const url=`https://api.github.com/repos/${repository}/actions/runs/${runId}/artifacts?name=github-pages&per_page=100`;
 for(let attempt=0;attempt<attempts;attempt++){
  let response;
  try{response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});}catch{
   if(attempt===attempts-1)throw new Error('GitHub artifact metadata could not be reached. Retry this workflow.');
  }
  if(response){
   if(response.status===401||response.status===403)throw new Error('GitHub denied artifact metadata access. Check the workflow actions: read permission.');
   if(response.ok){
    const data=await response.json();
    const artifact=data.artifacts?.find(item=>item.name==='github-pages'&&!item.expired);
    if(artifact)return artifact;
   }else if(response.status!==429&&response.status<500)throw new Error(`GitHub artifact metadata returned HTTP ${response.status}.`);
  }
  if(attempt<attempts-1)await pause(interval);
 }
 throw new Error('The uploaded github-pages artifact is not visible to GitHub’s deployment API yet. Retry this workflow; the site build is preserved in this run.');
}
if(process.argv[1]?.endsWith('/wait-pages-artifact.js')){
 try{const artifact=await waitForPagesArtifact({token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY,runId:process.env.GITHUB_RUN_ID});console.log(`Pages artifact is available for deployment (ID ${artifact.id}).`);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
