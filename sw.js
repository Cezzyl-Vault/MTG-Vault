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
//  Gecacht werden nur die App-Dateien (gleiche Adresse) und der Supabase-
//  Client vom CDN. Datenbank- und Scryfall-Anfragen laufen ungefiltert durch.
//  Jede Datei wird ohne ?v=N gespeichert, damit pro Datei nur eine Kopie bleibt.

const CACHE='mtg-vault-v1';
const CDN_HOSTS=['cdn.jsdelivr.net'];

self.addEventListener('install',()=>self.skipWaiting());

self.addEventListener('activate',event=>{
  // Alte Cache-Versionen wegräumen, dann sofort alle offenen Tabs übernehmen
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){if(name!==CACHE)await caches.delete(name);}
    await self.clients.claim();
  })());
});

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
