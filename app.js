/********* change if needed *********/
const OWNER='grandelement', REPO='radio', BRANCH='main';
/***********************************/

if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); }

const audio=document.getElementById('player'), titlebar=document.getElementById('titlebar');
const shuffleBtn=document.getElementById('shuffleBtn'), orderBtn=document.getElementById('orderBtn');
const nextBtn=document.getElementById('nextBtn'), prevBtn=document.getElementById('prevBtn');

const offlineToggle=document.getElementById('offlineToggle'), pfill=document.getElementById('pfill');
const progressText=document.getElementById('progressText'), offlineHint=document.getElementById('offlineHint');

const API=`https://api.github.com/repos/${OWNER}/${REPO}`;
async function apiJson(url){ const r=await fetch(url,{headers:{'Accept':'application/vnd.github+json'}}); if(!r.ok) throw new Error(url); return r.json(); }
async function getTree(){ const b=await apiJson(`${API}/branches/${BRANCH}`); const t=await apiJson(`${API}/git/trees/${b.commit.sha}?recursive=1`); return t.tree; }

function setBg(p){ const u=p+'?v='+Date.now(); const i=new Image(); i.onload=()=>{document.body.style.setProperty('--bg-img',`url("${u}")`);sessionStorage.setItem('lastBg',p)}; i.onerror=()=>{document.body.style.setProperty('--bg-img',`url("${p}")`)}; i.src=p; }

// ---------- TITLE HELPERS ----------
function niceCase(s){
  if(!s) return {num:null,title:''};
  let t=s.replace(/\.[^.]+$/,'').trim().replace(/[_]+/g,' ').replace(/\s{2,}/g,' ');
  let num=null, m=t.match(/^\s*(\d{1,3})\s*(?:[.\-–_]|(?:\s*-\s*))\s*(.+)$/);
  if(m){ num=m[1]; t=m[2]; } else { const m2=t.match(/^\s*(\d{1,3})\s+(.+)$/); if(m2){num=m2[1]; t=m2[2];} }
  const small=new Set(['and','or','of','the','a','an','in','on','to','for','at','by','from']);
  t=t.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Za-z])(\d)/g,'$1 $2').replace(/(\d)([A-Za-z])/g,'$1 $2').replace(/\s+/g,' ').trim();
  t=t.split(' ').map((w,i)=> (i>0&&small.has(w.toLowerCase()))?w.toLowerCase():(w[0]?w[0].toUpperCase()+w.slice(1).toLowerCase():w)).join(' ');
  return {num,title:t};
}
// If file is directly under /music, guess album from filename prefix like "Fire_03_...mp3"
function guessAlbumFromFile(fileTitle){
  const raw=fileTitle.replace(/\.[^.]+$/,'');
  const parts=raw.split(/[-_]/); // Fire_03_Dawning -> ["Fire","03","Dawning"]
  return parts[0] ? niceCase(parts[0]).title : '';
}
function parseAlbumTrack(path){
  const bits=path.split('/'); const file=bits.at(-1)||'';
  let album = (bits.length>=3? bits[1] : ''); // album folder
  const {num,title}=niceCase(file);
  if(!album) album = guessAlbumFromFile(file);          // <- fallback
  const trackNo = num? String(num).padStart(2,'0') : null;
  return { album, trackNo, title };
}
function updateTitle(src){
  const {album,trackNo,title}=parseAlbumTrack(src);
  if (shuffleOn){ titlebar.textContent = album? `${album} • ${title}` : title; }
  else { titlebar.textContent = trackNo? `${album} • ${trackNo}. ${title}` : (album? `${album} • ${title}` : title); }
}

// ---------- PLAYER ----------
let libraryAll=[], libraryAlbum=[], order=[], i=0, shuffleOn=true;
let idList=[], clipList=[];
let sinceLastID=Date.now(), songsSinceBreak=0, nextBreakAt=4+Math.floor(Math.random()*5);

function setButtons(){ if(shuffleOn){shuffleBtn.classList.add('active'); orderBtn.classList.remove('active');} else {orderBtn.classList.add('active'); shuffleBtn.classList.remove('active');} }
function attachMediaSession(src){
  if(!('mediaSession' in navigator)) return;
  const {album,title}=parseAlbumTrack(src);
  navigator.mediaSession.metadata=new MediaMetadata({ title:title||'Grand Element', artist:'Grand Element', album:album||'Grand Element Radio' });
  try{navigator.mediaSession.setActionHandler('previoustrack',()=>loadTrack(i-1))}catch(e){}
  try{navigator.mediaSession.setActionHandler('nexttrack',()=>loadTrack(i+1))}catch(e){}
  try{navigator.mediaSession.setActionHandler('play',()=>audio.play())}catch(e){}
  try{navigator.mediaSession.setActionHandler('pause',()=>audio.pause())}catch(e){}
}
function loadTrack(idx){
  if(!order.length) return;
  i=(idx+order.length)%order.length; const src=order[i];
  audio.src=src+'?v='+Date.now(); audio.load(); updateTitle(src); attachMediaSession(src);
  audio.play().catch(()=>{});
}

function pick(a){return a&&a.length?a[(Math.random()*a.length)|0]:null}
function dueTwenty(){return (Date.now()-sinceLastID)>(20*60*1000)}
audio.addEventListener('ended',()=>setTimeout(()=>advanceAfterSong(),75));
audio.addEventListener('error',()=>setTimeout(()=>advanceAfterSong(),75));
async function playOne(u){ return new Promise(res=>{ const done=()=>{audio.onended=null;audio.onerror=null;res();}; audio.onended=done; audio.onerror=done; audio.src=u+'?v='+Date.now(); audio.load(); attachMediaSession(u); audio.play().catch(()=>{}); }); }
async function playSeq(list,after){ for(const u of list){ await playOne(u); } after&&after(); }
async function advanceAfterSong(){
  songsSinceBreak++; let insert=false, toPlay=[];
  if(songsSinceBreak>=nextBreakAt && clipList.length){ const c=pick(clipList); if(c){insert=true; toPlay.push(c);} songsSinceBreak=0; nextBreakAt=4+Math.floor(Math.random()*5); if(c && /\*/.test(c)){ const id=pick(idList); if(id){toPlay.push(id); sinceLastID=Date.now();}} }
  if(dueTwenty() && idList.length){ const id=pick(idList); if(id){ insert=true; toPlay.push(id); sinceLastID=Date.now(); } }
  if(insert && toPlay.length){ await playSeq(toPlay, ()=>loadTrack(i+1)); } else loadTrack(i+1);
}

// Weighted shuffle to feature “New Release” albums
function buildWeightedShuffle(list){
  const boosted=[]; for(const s of list){ const alb=(s.split('/')[1]||''); if(window.__GE_NEW_RELEASES__?.has(alb)) boosted.push(s,s,s); else boosted.push(s); }
  for(let k=boosted.length-1;k>0;k--){const j=(Math.random()*(k+1))|0; [boosted[k],boosted[j]]=[boosted[j],boosted[k]]}
  const seen=new Set(), uniq=[]; for(const s of boosted){ if(!seen.has(s)){seen.add(s); uniq.push(s);} } return uniq;
}
function setOrder(){
  const cur=audio.src?(libraryAll.find(p=>audio.src.includes(p))||libraryAlbum.find(p=>audio.src.includes(p))):null;
  order = shuffleOn ? buildWeightedShuffle(libraryAll) : libraryAlbum.slice();
  i = cur? Math.max(0, order.indexOf(cur)) : 0;
  setButtons();
}

// ---------- OFFLINE UI ----------
const LS_KEY='ge_offline_enabled';
function setOfflineUI(on,ready=false){
  offlineToggle.classList.toggle('on',on);
  offlineToggle.classList.toggle('off',!on);
  offlineToggle.classList.toggle('ready',ready);
  offlineToggle.textContent = ready? 'Offline READY' : on? 'Offline ON — Tap to turn OFF' : 'Turn Offline ON';
  offlineHint.textContent = on ? (ready ? 'All tracks cached. You can play without internet.' : 'Caching tracks for offline use…')
                               : 'Tap to save music for offline listening (uses device storage).';
}
async function swReg(){ const r=await navigator.serviceWorker.getRegistration(); return navigator.serviceWorker.controller||r?.active; }

offlineToggle.onclick=async ()=>{
  const on=offlineToggle.classList.contains('on'); const sw=await swReg();
  if(on){
    if(confirm('Turn Offline OFF and remove cached files?')){
      pfill.style.width='0%'; progressText.textContent='Clearing offline data…';
      sw?.postMessage({type:'CLEAR_OFFLINE'}); localStorage.setItem(LS_KEY,'0'); setOfflineUI(false,false);
    }
  }else{
    localStorage.setItem(LS_KEY,'1'); setOfflineUI(true,false);
    // build list and show total immediately
    const list=[...libraryAll, ...idList, ...clipList];
    progressText.textContent=`Offline caching: 0 / ${list.length} (0%)`;
    pfill.style.width='0%';
    (await swReg())?.postMessage({type:'CACHE_LIST',payload:{list}});
  }
};

navigator.serviceWorker.addEventListener('message',(ev)=>{
  const {type,payload}=ev.data||{};
  if(type==='CACHE_PROGRESS'){
    const {done,total}=payload||{done:0,total:0};
    const pct = total? Math.round(100*done/total) : 0;
    pfill.style.width = pct+'%';
    progressText.textContent = `Offline caching: ${done} / ${total} (${pct}%)`;
    setOfflineUI(true,false);
  }
  if(type==='CACHE_DONE'){
    pfill.style.width='100%'; progressText.textContent='Offline caching complete ✅';
    setOfflineUI(true,true);
  }
  if(type==='CLEARED'){
    pfill.style.width='0%'; progressText.textContent='Offline cache cleared.';
    setOfflineUI(false,false);
  }
});

// ---------- BOOT ----------
(async function boot(){
  // allow audio play after first tap/keypress (iOS)
  window.addEventListener('pointerdown', ()=>audio.play().catch(()=>{}), {once:true});
  window.addEventListener('keydown', ()=>audio.play().catch(()=>{}), {once:true});

  const tree=await getTree();

  // backgrounds
  const imgs=tree.filter(n=>n.path.startsWith('img/') && n.type==='blob' && /\.(gif|png|jpe?g|webp)$/i.test(n.path) && !/\/logo\.(png|jpe?g|webp)$/i.test(n.path)).map(n=>n.path);
  if(imgs.length){ const last=sessionStorage.getItem('lastBg'); let pick=imgs[(Math.random()*imgs.length)|0]; if(imgs.length>1 && pick===last){ const idx=imgs.indexOf(pick); pick=imgs[(idx+1)%imgs.length]; } setBg(pick); }

  // music
  const music=tree.filter(n=>n.type==='blob' && n.path.startsWith('music/') && /\.mp3$/i.test(n.path)).map(n=>n.path);
  if(!music.length){ titlebar.textContent='No music found in /music'; return; }

  // album order (optional)
  const orderTxt=tree.find(n=>n.type==='blob' && n.path==='ALBUM_RELEASE_ORDER.txt'); let albumOrder=[];
  if(orderTxt){ const raw=await fetch('ALBUM_RELEASE_ORDER.txt?'+Date.now()).then(r=>r.text()); albumOrder=raw.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#')); }

  // group by folder
  const byAlbum={}; for(const p of music){ const alb=p.split('/')[1]||''; (byAlbum[alb]??=[]).push(p); }

  // New Release = folders not listed and not 'Singles'
  const listed=new Set(albumOrder);
  const newReleaseAlbums=Object.keys(byAlbum).filter(a=> a && !listed.has(a) && a!=='Singles');
  window.__GE_NEW_RELEASES__=new Set(newReleaseAlbums);

  // album-order list (strict to ALBUM_RELEASE_ORDER)
  if(albumOrder.length){ libraryAlbum = albumOrder.flatMap(a => (byAlbum[a]||[]).sort()); }
  else { libraryAlbum = music.slice().sort(); }

  // everything for shuffle
  libraryAll = Object.keys(byAlbum).sort().flatMap(a=>byAlbum[a].slice().sort());

  // ids/clips
  idList   = tree.filter(n=>n.type==='blob' && n.path.startsWith('id/')    && /\.(mp3|wav|m4a)$/i.test(n.path)).map(n=>n.path);
  clipList = tree.filter(n=>n.type==='blob' && n.path.startsWith('clips/') && /\.(mp3|wav|m4a)$/i.test(n.path)).map(n=>n.path);

  setOrder(); loadTrack(i);

  const enabled = localStorage.getItem(LS_KEY)==='1';
  setOfflineUI(enabled,false);
  if(enabled){ const list=[...libraryAll, ...idList, ...clipList]; progressText.textContent=`Offline caching: 0 / ${list.length} (0%)`; (await swReg())?.postMessage({type:'CACHE_LIST',payload:{list}}); }
})().catch(err=>{ titlebar.textContent='Error loading site'; console.error(err); });
