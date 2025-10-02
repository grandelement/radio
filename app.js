const VERSION='ge-radio-v3';   // bump to update browsers
const CORE=`${VERSION}-core`;
const SONGS=`${VERSION}-songs`;

// Core files to cache
const CORE_ASSETS=['./','./index.html','./index_auto.html','./manifest.json','./img/logo.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CORE).then(c=>c.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>!k.startsWith(VERSION)).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// Normalize requests: ignore ?v= cache-busters
function normalize(req){
  const url = new URL(req.url);
  url.search = '';
  return new Request(url.toString(), {
    method:req.method, headers:req.headers, mode:req.mode, credentials:req.credentials, redirect:req.redirect
  });
}

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  const isCore = url.origin===location.origin &&
    (url.pathname.endsWith('/') || /\/(index\.html|index_auto\.html|manifest\.json|img\/logo\.png)$/.test(url.pathname));

  if(isCore){
    e.respondWith(
      caches.match(e.request, {ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{
        caches.open(CORE).then(c=>c.put(normalize(e.request),res.clone()));
        return res;
      }))
    );
    return;
  }

  const isMedia = /\.(mp3|wav|m4a|gif|png|jpe?g|webp)$/i.test(url.pathname);
  if(isMedia){
    const nreq = normalize(e.request);
    e.respondWith(
      caches.match(nreq, {cacheName:SONGS, ignoreSearch:true})
        .then(r=>r || fetch(e.request).then(res=>{
          caches.open(SONGS).then(c=>c.put(nreq,res.clone()));
          return res;
        }).catch(()=>caches.match(nreq, {cacheName:SONGS, ignoreSearch:true})))
    );
  }
});

// Messages from page: cache list, clear cache, progress events
self.addEventListener('message', async (event)=>{
  const {type,payload}=event.data||{};
  if(type==='CACHE_LIST'){
    const list=payload?.list||[];
    const cache=await caches.open(SONGS);
    let done=0;
    for (const src of list){
      try{
        const req=new Request(src, {cache:'no-store'});
        const nreq = normalize(req);
        const hit=await cache.match(nreq, {ignoreSearch:true});
        if(!hit){
          const res=await fetch(req);
          if(res.ok) await cache.put(nreq,res.clone());
        }
      }catch{}
      done++;
      event.source?.postMessage({type:'CACHE_PROGRESS',payload:{done,total:list.length}});
    }
    event.source?.postMessage({type:'CACHE_DONE'});
  }
  if(type==='CLEAR_OFFLINE'){
    await caches.delete(SONGS);
    event.source?.postMessage({type:'CLEARED'});
  }
});
