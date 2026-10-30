// ══════════════════════════════════════════════════════════
//  CONFIG  ·  Supabase-Verbindung + Wechsel zwischen Bildschirmen
// ══════════════════════════════════════════════════════════
//
//  Die Verbindungsdaten kommen ausschließlich aus js/defaults.js.
//  Projekt wechseln = dort neue URL + Anon-Key eintragen.
function loadCfg(){
  // Früher konnte ein Setup-Bildschirm eine Config im LocalStorage ablegen,
  // die defaults.js überdeckt hat — Altlast einmalig wegräumen.
  try{localStorage.removeItem(CFG_KEY);}catch(e){/* ignorieren */}
  if(typeof DEFAULT_SUPABASE_URL!=='undefined'&&DEFAULT_SUPABASE_URL&&DEFAULT_SUPABASE_KEY){
    return{url:DEFAULT_SUPABASE_URL,key:DEFAULT_SUPABASE_KEY};
  }
  return null;
}

// Fehlt die Konfiguration komplett (defaults.js leer/kaputt), gibt es nichts
// zu prüfen — Hinweis auf dem Status-Bildschirm statt leerer Seite.
function showConfigMissing(){
  stopDbRetry();
  s('dbStatusScreen','flex');s('authScreen','none');s('appScreen','none');
  document.getElementById('dbStatusEmblem').textContent='⚙️';
  document.getElementById('dbStatusTitle').textContent='Keine Datenbank konfiguriert';
  document.getElementById('dbStatusText').textContent='In js/defaults.js fehlen die Supabase-URL oder der Anon-Key.';
  document.getElementById('dbActivateBtn').style.display='none';
  document.getElementById('dbRetryBtn').style.display='none';
  document.getElementById('dbStatusHint').textContent='';
  document.getElementById('dbStatusDetails').classList.add('visible');
}

function showAuth(){s('dbStatusScreen','none');s('authScreen','flex');s('appScreen','none');}
function showApp(user){
  currentUser=user;
  s('dbStatusScreen','none');s('authScreen','none');s('appScreen','block');
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
  s('dbStatusScreen','flex');s('authScreen','none');s('appScreen','none');
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

