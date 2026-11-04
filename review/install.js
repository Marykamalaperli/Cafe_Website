// Loaded only by the separately built /review/ site, never the production root.
if(!('serviceWorker'in navigator))throw new Error('This browser cannot run the isolated review. Use a current browser on HTTPS.');
const scope=new URL('./',import.meta.url),worker=new URL('review-worker.js',scope);
await navigator.serviceWorker.register(worker,{type:'module',scope:scope.pathname});
await navigator.serviceWorker.ready;
if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
