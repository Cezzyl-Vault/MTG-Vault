// ══════════════════════════════════════════════════════════
//  CONFIG  ·  Supabase-Setup-Screen + Wechsel zwischen Bildschirmen
// ══════════════════════════════════════════════════════════
function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY));}catch(e){return null;}}
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
  loadAll();
}
function s(id,disp){document.getElementById(id).style.display=disp;}

