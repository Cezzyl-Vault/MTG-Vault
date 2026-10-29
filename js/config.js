// ══════════════════════════════════════════════════════════
//  CONFIG  ·  Supabase-Setup-Screen + Wechsel zwischen Bildschirmen
// ══════════════════════════════════════════════════════════
//
//  Reihenfolge der Werte:
//  1. LocalStorage (vom Setup-Bildschirm gespeichert) — Vorrang
//  2. Hardcoded Defaults aus defaults.js — Fallback
//  3. Wenn weder noch: Setup-Bildschirm anzeigen
function loadCfg(){
  // Erst LocalStorage prüfen — falls vorhanden, hat das Vorrang
  try{
    const stored=JSON.parse(localStorage.getItem(CFG_KEY));
    if(stored&&stored.url&&stored.key)return stored;
  }catch(e){/* ignorieren */}
  // Fallback: Defaults aus defaults.js (ist optional — Datei könnte fehlen)
  if(typeof DEFAULT_SUPABASE_URL!=='undefined'&&DEFAULT_SUPABASE_URL&&DEFAULT_SUPABASE_KEY){
    return{url:DEFAULT_SUPABASE_URL,key:DEFAULT_SUPABASE_KEY};
  }
  return null;
}
function copySQL(){navigator.clipboard.writeText(document.getElementById('sqlCode').textContent).then(()=>showToast('✓ SQL kopiert'));}

function saveConfig(){
  const url=document.getElementById('cfgUrl').value.trim();
  const key=document.getElementById('cfgKey').value.trim();
  if(!url||!key){alert('Bitte beide Felder ausfüllen.');return;}
  localStorage.setItem(CFG_KEY,JSON.stringify({url,key}));
  _sb=window.supabase.createClient(url,key);
  showAuth();
}

function showConfig(){
  stopDbRetry();
  s('dbStatusScreen','none');s('configScreen','flex');s('authScreen','none');s('appScreen','none');
  const cfg=loadCfg();
  if(cfg){document.getElementById('cfgUrl').value=cfg.url||'';document.getElementById('cfgKey').value=cfg.key||'';}
}
function showAuth(){s('dbStatusScreen','none');s('configScreen','none');s('authScreen','flex');s('appScreen','none');}
function showApp(user){
  currentUser=user;
  s('dbStatusScreen','none');s('configScreen','none');s('authScreen','none');s('appScreen','block');
  // Start-Reiter aus den Nutzer-Einstellungen anwenden (default: Sammlung)
  if(typeof loadSettings==='function'){
    const settings=loadSettings();
    if(settings.startTab&&settings.startTab!=='collection')switchView(settings.startTab);
  }
  loadAll();
}
function s(id,disp){document.getElementById(id).style.display=disp;}

// ══════════════════════════════════════════════════════════
//  DB-STATUS  ·  Verbindung prüfen, Hinweis bei pausierter Datenbank
// ══════════════════════════════════════════════════════════
//  Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne Aktivität.
//  Dann zeigt die App einen eigenen Bildschirm mit Link zum Dashboard
//  ("Restore") und prüft alle 15 Sekunden selbst, ob die DB wieder läuft.
const DB_RETRY_MS=15000;
let dbRetryTimer=null,dbRetryCfg=null;

// Prüft die Verbindung und geht dann zu Login bzw. App weiter
async function connectAndStart(cfg){
  if(!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
  stopDbRetry();
  let session=null;
  try{({data:{session}}=await _sb.auth.getSession());}
  catch(e){showDbPaused(cfg);return;}
  if(session)showApp(session.user);else showAuth();
}

// Dashboard-Link aus der Projekt-URL ableiten (https://<ref>.supabase.co)
function supabaseDashboardUrl(cfg){
  try{
    const host=new URL(cfg.url).hostname;
    if(host.endsWith('.supabase.co'))return'https://supabase.com/dashboard/project/'+host.split('.')[0];
  }catch(e){/* ignorieren */}
  return'https://supabase.com/dashboard';
}

function showDbPaused(cfg){
  s('dbStatusScreen','flex');s('configScreen','none');s('authScreen','none');s('appScreen','none');
  const offline=navigator.onLine===false;
  document.getElementById('dbStatusEmblem').textContent=offline?'📡':'⏸️';
  document.getElementById('dbStatusTitle').textContent=offline?'Keine Internetverbindung':'Datenbank ist pausiert';
  document.getElementById('dbStatusText').textContent=offline
    ?'Dein Gerät ist offline. Sobald du wieder online bist, verbindet sich die App automatisch.'
    :'Die Supabase-Datenbank antwortet nicht – vermutlich wurde das kostenlose Projekt wegen Inaktivität pausiert. Öffne das Dashboard und klicke dort auf „Restore". Das Aufwachen dauert meist ein paar Minuten.';
  const btn=document.getElementById('dbActivateBtn');
  btn.href=supabaseDashboardUrl(cfg);
  btn.style.display=offline?'none':'';
  document.getElementById('dbStatusDetails').classList.add('visible');
  const retryBtn=document.getElementById('dbRetryBtn');
  retryBtn.disabled=false;retryBtn.textContent='Jetzt erneut prüfen';
  document.getElementById('dbStatusHint').textContent=
    'Automatische Prüfung alle 15 Sekunden · zuletzt '+new Date().toLocaleTimeString('de-DE');
  // Nächste Prüfung planen (setTimeout statt setInterval → keine überlappenden Prüfungen)
  dbRetryCfg=cfg;
  clearTimeout(dbRetryTimer);
  dbRetryTimer=setTimeout(()=>connectAndStart(cfg),DB_RETRY_MS);
}

async function retryDbCheck(){
  if(!dbRetryCfg)return;
  clearTimeout(dbRetryTimer);
  const retryBtn=document.getElementById('dbRetryBtn');
  retryBtn.disabled=true;retryBtn.textContent='Prüfe…';
  await connectAndStart(dbRetryCfg);
}

function stopDbRetry(){clearTimeout(dbRetryTimer);dbRetryTimer=null;}

