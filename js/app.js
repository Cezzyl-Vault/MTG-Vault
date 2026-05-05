// ══════════════════════════════════════════════════════════
//  APP  ·  Orchestrierung: View-Wechsel, Mobile-Nav, Startup
// ══════════════════════════════════════════════════════════
//
//  Diese Datei verbindet alle anderen Module miteinander.
//  Sie wird ALS LETZTE in der HTML geladen, damit alle Funktionen
//  aus den anderen Dateien beim Start verfügbar sind.

// ── RENDER-ORCHESTRIERUNG ──
// renderAll() ruft alle einzelnen Render-Funktionen auf,
// nachdem sich Daten geändert haben (Import, Edit, Delete).
function renderAll(){
  populateSets();applyFilters();renderStats();renderDecks();
  const has=allCards.length>0;
  document.getElementById('collection-empty').style.display=has?'none':'';
  document.getElementById('collection-content').style.display=has?'':'none';
  document.getElementById('stats-empty').style.display=has?'none':'';
  document.getElementById('stats-content').style.display=has?'':'none';
}

// ── MOBILE NAVIGATION ──
function toggleMobileNav(){
  const nav=document.getElementById('mobileNav');
  const ham=document.getElementById('hamburger');
  nav.classList.toggle('open');
  ham.classList.toggle('open');
}
function closeMobileNav(){
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}

// ── VIEW-WECHSEL (Sammlung / Statistik / Decks) ──
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach((t,i)=>t.classList.toggle('active',['collection','stats','decks'][i]===name));
  // Mobile nav
  document.querySelectorAll('.mobile-nav-btn').forEach((t,i)=>t.classList.toggle('active',['collection','stats','decks'][i]===name));
  if(name==='stats')renderStats();
  if(name==='decks')renderDecks();
}
function setViewMode(mode){
  viewMode=mode;
  document.getElementById('btnGrid').classList.toggle('active',mode==='grid');
  document.getElementById('btnList').classList.toggle('active',mode==='list');
  renderCards();
}

// ── MODAL-OVERLAY: Klick außerhalb schließt das Modal ──
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('open');});
});

// ══════════════════════════════════════════════════════════
//  STARTUP  ·  Wird beim Laden der Seite automatisch ausgeführt
// ══════════════════════════════════════════════════════════
//  Logik:
//   - keine Supabase-Config gespeichert → Setup-Screen zeigen
//   - Config vorhanden, aktive Session → direkt in App
//   - Config vorhanden, keine Session → Login-Screen
(async()=>{
  const cfg=loadCfg();
  if(!cfg){showConfig();return;}
  _sb=window.supabase.createClient(cfg.url,cfg.key);
  const{data:{session}}=await _sb.auth.getSession();
  if(session)showApp(session.user);else showAuth();
})();
