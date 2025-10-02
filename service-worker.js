const VERSION='ge-radio-v2';
const CORE=`${VERSION}-core`;
const SONGS=`${VERSION}-songs`;
const CORE_ASSETS=['./','./index.html','./index_auto.html','./manifest.json','./img/logo.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CORE).then(c=>c.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>!k.startsWith(VERSION)).map(k=>caches.delete(k)))) .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  const isCore = url.origin===location.origin && (url.pathname.endsWith('/') || /\/(index\.html|index_auto\.html|manifest\.json|img\/logo\.png)$/.test(url.pathname));
  if(isCore){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{caches.open(CORE).then(c=>c.put(e.request,res.clone())); return res;})));
    return;
  }
  const isMedia = /\.(mp3|wav|m4a|gif|png|jpe?g|webp)$/i.test(url.pathname);
  if(isMedia){
    e.respondWith(caches.match(e.request,{cacheName:SONGS}).then(r=>r||fetch(e.request).then(res=>{caches.open(SONGS).then(c=>c.put(e.request,res.clone())); return res;}).catch(()=>caches.match(e.request,{cacheName:SONGS}))));
  }
});

self.addEventListener('message', async (event)=>{
  const {type,payload}=event.data||{};
  if(type==='CACHE_LIST'){
    const list=payload?.list||[];
    const cache=await caches.open(SONGS);
    let done=0;
    for (const src of list){
      try{
        const req=new Request(src, {cache:'no-store'});
        const hit=await cache.match(req); if(!hit){ const res=await fetch(req); if(res.ok) await cache.put(req,res.clone()); }
      }catch{}
      done++; event.source?.postMessage({type:'CACHE_PROGRESS',payload:{done,total:list.length}});
    }
    event.source?.postMessage({type:'CACHE_DONE'});
  }
  if(type==='CLEAR_OFFLINE'){
    await caches.delete(SONGS);
    event.source?.postMessage({type:'CLEARED'});
  }
});
