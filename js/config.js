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
  s('configScreen','flex');s('authScreen','none');s('appScreen','none');
  const cfg=loadCfg();
  if(cfg){document.getElementById('cfgUrl').value=cfg.url||'';document.getElementById('cfgKey').value=cfg.key||'';}
}
function showAuth(){s('configScreen','none');s('authScreen','flex');s('appScreen','none');}
function showApp(user){
  currentUser=user;
  s('configScreen','none');s('authScreen','none');s('appScreen','block');
  // Start-Reiter aus den Nutzer-Einstellungen anwenden (default: Sammlung)
  if(typeof loadSettings==='function'){
    const settings=loadSettings();
    if(settings.startTab&&settings.startTab!=='collection')switchView(settings.startTab);
  }
  loadAll();
}
function s(id,disp){document.getElementById(id).style.display=disp;}

