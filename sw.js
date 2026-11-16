// ══════════════════════════════════════════════════════════
//  SERVICE WORKER  ·  Macht MTG Vault installierbar (Handy-App)
// ══════════════════════════════════════════════════════════
//
//  Strategie „Netz zuerst": Solange Internet da ist, kommt jede Datei frisch
//  vom Server — Updates wirken also sofort wie bisher (Cache-Busting ?v=N).
//  Nur wenn das Netz fehlt, wird die zuletzt geladene Kopie aus dem Cache
//  genommen. So startet die App auch offline und zeigt dann den Hinweis
//  „Keine Internetverbindung" (config.js) statt einer Browser-Fehlerseite.
//
//  Gecacht werden die App-Dateien (gleiche Adresse), der Supabase-Client vom
//  CDN und Kartenbilder (s.u.). Datenbank- und Scryfall-API laufen ungefiltert durch.
//  Jede Datei wird ohne ?v=N gespeichert, damit pro Datei nur eine Kopie bleibt.

//
//  Kartenbilder (cards.scryfall.io) kommen zusätzlich in einen eigenen Cache
//  „Cache zuerst" – Scryfall-Bilder ändern sich unter derselben Adresse nicht.
//  So sind zuletzt angesehene Karten auch im Offline-Lesemodus zu sehen.
//  Höchstens IMG_MAX Bilder (≈ 90 KB pro Bild), älteste fliegen zuerst raus.

const CACHE='mtg-vault-v1';
const IMG_CACHE='mtg-vault-img-v1';
const IMG_HOST='cards.scryfall.io';
const IMG_MAX=800;
const CDN_HOSTS=['cdn.jsdelivr.net'];
let imgPuts=0;

self.addEventListener('install',()=>self.skipWaiting());

self.addEventListener('activate',event=>{
  // Alte Cache-Versionen wegräumen, dann sofort alle offenen Tabs übernehmen
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){if(name!==CACHE&&name!==IMG_CACHE)await caches.delete(name);}
    await self.clients.claim();
  })());
});

// Bilder-Cache auf IMG_MAX begrenzen (keys() liefert in Einfüge-Reihenfolge)
async function trimImageCache(){
  const c=await caches.open(IMG_CACHE);
  const keys=await c.keys();
  for(let i=0;i<keys.length-IMG_MAX;i++)await c.delete(keys[i]);
}

async function handleImage(req){
  const url=new URL(req.url);url.search='';
  const key=url.href;
  const c=await caches.open(IMG_CACHE);
  const hit=await c.match(key);
  if(hit)return hit;
  // Mit CORS laden (Scryfall erlaubt das): keine „opaque" Antwort, die im
  // Speicher-Kontingent stark aufgebläht gezählt würde
  const res=await fetch(req.url,{mode:'cors',credentials:'omit'});
  if(res.ok){
    c.put(key,res.clone()).then(()=>{if(++imgPuts%25===0)trimImageCache();}).catch(()=>{});
  }
  return res;
}

// Speicher-Schlüssel: Adresse ohne Query; Seitenaufrufe immer auf die Startseite
function cacheKey(request){
  const url=new URL(request.url);
  if(request.mode==='navigate')return new URL(self.registration.scope).href;
  url.search='';url.hash='';
  return url.href;
}

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.hostname===IMG_HOST){
    // Fehler (offline, kein Cache) → normaler Abruf durch den Browser schlägt genauso fehl
    event.respondWith(handleImage(req).catch(()=>fetch(req)));
    return;
  }
  const sameOrigin=url.origin===self.location.origin;
  if(!sameOrigin&&!CDN_HOSTS.includes(url.hostname))return;

  event.respondWith((async()=>{
    const key=cacheKey(req);
    try{
      const res=await fetch(req);
      // Nur vollständige Antworten speichern (opaque = CDN-Script ohne CORS)
      if(res.ok||res.type==='opaque'){
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(key,copy)).catch(()=>{});
      }
      return res;
    }catch(e){
      const cached=await caches.match(key);
      if(cached)return cached;
      throw e;
    }
  })());
});
