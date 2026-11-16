// ══════════════════════════════════════════════════════════
//  OFFLINE  ·  Letzten Stand speichern, ohne Netz nur lesen
// ══════════════════════════════════════════════════════════
//
//  Nach jedem erfolgreichen Laden (loadAll) legt die App einen Schnappschuss
//  aller Tabellen in IndexedDB ab (gedrosselt, im Hintergrund).
//
//  Ohne Internet (oder wenn die Datenbank pausiert ist) startet die App aus
//  diesem Schnappschuss im Nur-Lesen-Modus:
//    - _sb wird durch einen Offline-Client ersetzt, der Abfragen
//      (select/eq/in/not/order/range/limit/single) aus dem Schnappschuss
//      beantwortet. So funktionieren alle Lese-Stellen der App unverändert.
//    - Jeder Schreibversuch (insert/update/upsert/delete) liefert den Fehler
//      „Offline – nur Lesen", den die Aufrufer wie gewohnt als Toast zeigen.
//    - body.offline blendet Knöpfe zum Hinzufügen/Bearbeiten aus, ein Banner
//      zeigt den Stand.
//  Kommt das Netz zurück, verbindet sich die App von selbst wieder normal.

const OFFLINE_DB='mtgvault-offline';
const OFFLINE_STORE='snapshot';
const OFFLINE_TABLES=['cards','decks','deck_cards','wishlist','price_snapshots'];
const OFFLINE_MSG='Offline – nur Lesen möglich';
const OFFLINE_MIN_INTERVAL_MS=60*1000;

let offlineMode=false;
let offlineSnapshot=null;
let _sbOnline=null;
let offlineSaveTimer=null,offlineLastSave=0;

// ── IndexedDB ──
function offlineDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB'in window))return reject(new Error('kein IndexedDB'));
    const req=indexedDB.open(OFFLINE_DB,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(OFFLINE_STORE);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function offlineGet(){
  try{
    const db=await offlineDb();
    return await new Promise((resolve,reject)=>{
      const r=db.transaction(OFFLINE_STORE,'readonly').objectStore(OFFLINE_STORE).get('main');
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
    });
  }catch(e){return null;}
}
async function offlinePut(snap){
  const db=await offlineDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(OFFLINE_STORE,'readwrite');
    tx.objectStore(OFFLINE_STORE).put(snap,'main');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}

// ── Schnappschuss speichern (nach loadAll) ──
// Gedrosselt: höchstens einmal pro Minute, die letzte Änderung kommt aber
// immer noch an (Timer läuft bis zum Ende des Intervalls).
function scheduleOfflineSnapshot(){
  if(offlineMode||!currentUser)return;
  clearTimeout(offlineSaveTimer);
  const wait=Math.max(3000,OFFLINE_MIN_INTERVAL_MS-(Date.now()-offlineLastSave));
  offlineSaveTimer=setTimeout(saveOfflineSnapshot,wait);
}
async function saveOfflineSnapshot(){
  if(offlineMode||!currentUser)return;
  offlineLastSave=Date.now();
  try{
    const snap={userId:currentUser.id,email:currentUser.email||'',at:Date.now(),tables:{cards:allCards,decks:allDecks}};
    for(const t of OFFLINE_TABLES){
      if(snap.tables[t])continue;
      const{data,error}=await fetchAllRows(t);
      snap.tables[t]=error?[]:(data||[]);   // z.B. Wunschliste nicht angelegt → leer
    }
    await offlinePut(snap);
  }catch(e){console.warn('Offline-Stand nicht gespeichert:',e);}
}

// ── Offline-Client: beantwortet Abfragen aus dem Schnappschuss ──
function offlineQuery(table){
  const st={write:false,filters:[],from:null,to:null,limit:null,single:false};
  const q={
    select(){return q;},
    insert(){st.write=true;return q;},update(){st.write=true;return q;},
    upsert(){st.write=true;return q;},delete(){st.write=true;return q;},
    eq(col,val){st.filters.push(r=>r[col]===val);return q;},
    neq(col,val){st.filters.push(r=>r[col]!==val);return q;},
    in(col,vals){const s=new Set(vals||[]);st.filters.push(r=>s.has(r[col]));return q;},
    not(col,op,val){
      if(op==='is'&&val===null)st.filters.push(r=>r[col]!=null);
      else st.filters.push(r=>r[col]!==val);
      return q;
    },
    is(col,val){st.filters.push(r=>val===null?r[col]==null:r[col]===val);return q;},
    match(obj){Object.entries(obj||{}).forEach(([k,v])=>st.filters.push(r=>r[k]===v));return q;},
    order(){return q;},
    range(from,to){st.from=from;st.to=to;return q;},
    limit(n){st.limit=n;return q;},
    single(){st.single=true;return q;},
    maybeSingle(){st.single=true;return q;},
    then(resolve,reject){
      let result;
      if(st.write){
        result={data:null,error:{message:OFFLINE_MSG}};
      }else{
        let rows=((offlineSnapshot&&offlineSnapshot.tables[table])||[]).filter(r=>st.filters.every(f=>f(r)));
        if(st.from!=null)rows=rows.slice(st.from,st.to+1);
        if(st.limit!=null)rows=rows.slice(0,st.limit);
        result=st.single?{data:rows[0]||null,error:rows.length?null:{message:'Nicht gefunden'}}:{data:rows,error:null};
      }
      return Promise.resolve(result).then(resolve,reject);
    }
  };
  return q;
}
function makeOfflineClient(online){
  return{
    from:offlineQuery,
    rpc:async()=>({data:null,error:{message:OFFLINE_MSG}}),
    auth:online?online.auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({})}
  };
}

// ── Modus wechseln ──
async function hasOfflineSnapshot(){
  const snap=await offlineGet();
  return !!(snap&&snap.userId);
}

// Startet die App aus dem gespeicherten Stand. false = kein Stand vorhanden.
async function startOfflineMode(){
  const snap=await offlineGet();
  if(!snap||!snap.userId)return false;
  offlineSnapshot=snap;
  if(!offlineMode){_sbOnline=_sb;_sb=makeOfflineClient(_sbOnline);}
  offlineMode=true;
  document.body.classList.add('offline');
  showOfflineBanner();
  showApp({id:snap.userId,email:snap.email});
  return true;
}

function exitOfflineMode(){
  if(!offlineMode)return;
  offlineMode=false;
  if(_sbOnline)_sb=_sbOnline;
  offlineSnapshot=null;
  document.body.classList.remove('offline');
  const b=document.getElementById('offlineBanner');
  if(b)b.remove();
}

function showOfflineBanner(){
  let b=document.getElementById('offlineBanner');
  if(!b){
    b=document.createElement('div');
    b.id='offlineBanner';b.className='offline-banner';
    document.body.appendChild(b);
  }
  const at=offlineSnapshot?new Date(offlineSnapshot.at):null;
  const when=at?at.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+' '+at.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'?';
  b.title='Offline-Lesemodus: Anzeige aus dem zuletzt gespeicherten Stand, Änderungen sind nicht möglich';
  b.innerHTML=`📡 Offline · Stand ${when} <button onclick="retryOnline()" title="Verbindung zur Datenbank erneut prüfen">↻ Verbinden</button>`;
}

// Knopf im Banner bzw. „online"-Ereignis
async function retryOnline(){
  const cfg=loadCfg();
  if(!cfg)return;
  if(await checkDbReachable(cfg,5000)){
    exitOfflineMode();
    toastSuccess('Wieder online');
    connectAndStart(cfg);
  }else{
    toastInfo('Noch keine Verbindung zur Datenbank.');
  }
}
window.addEventListener('online',()=>{if(offlineMode)setTimeout(retryOnline,1500);});
