// ══════════════════════════════════════════════════════════
//  WUNSCHLISTE  ·  Karten mit Wunschpreis + Preisalarm
// ══════════════════════════════════════════════════════════
//
//  Tabelle wishlist (einmalig anlegen: supabase/wishlist.sql) mit
//  card_name + max_price. Fehlt die Tabelle, zeigt das Fenster einen
//  Hinweis statt eines Fehlers.
//
//  Preis = günstigste Druckung mit Euro-Preis laut Scryfall (Cardmarket).
//  Pro Gerät 24 Stunden im LocalStorage zwischengespeichert. Liegt er auf
//  oder unter dem Wunschpreis:
//   - Zähler am Button „★ Wunschliste" in der Decks-Übersicht
//   - Hinweis beim App-Start (pro Tag und Karten-Auswahl nur einmal)
//
//  Karten kommen per Tippfeld ins Fenster oder gesammelt aus der
//  Fehlt-Liste („★ Auf die Wunschliste", decks.js → openMissingModal).

const WISH_PRICE_KEY='mtgvault_wish_prices';
const WISH_ALERT_KEY='mtgvault_wish_alert';
const WISH_PRICE_MAX_AGE_MS=24*60*60*1000;
let wishlist=[];
let wishTableMissing=false;
let wishPrices={};       // Name (klein) → {eur,set,setName,cm,at}
let wishPricesLoading=null;

const wishSleep=ms=>new Promise(r=>setTimeout(r,ms));
const wishKey=name=>(name||'').toLowerCase().trim();

// Tabelle noch nicht angelegt? (Postgres 42P01 bzw. PostgREST PGRST205)
function isMissingTableError(err){
  return !!err&&(err.code==='42P01'||err.code==='PGRST205'||/does not exist|could not find the table/i.test(err.message||''));
}

async function loadWishlist(){
  const{data,error}=await fetchAllRows('wishlist');
  if(error){wishTableMissing=isMissingTableError(error);wishlist=[];return false;}
  wishTableMissing=false;
  wishlist=data||[];
  return true;
}

// ── Preise ──
function loadWishPriceCache(){
  try{wishPrices=JSON.parse(localStorage.getItem(WISH_PRICE_KEY)||'{}')||{};}catch(e){wishPrices={};}
}
function saveWishPriceCache(){
  try{localStorage.setItem(WISH_PRICE_KEY,JSON.stringify(wishPrices));}catch(e){/* nur im RAM */}
}

// Günstigste Druckung mit Euro-Preis: Karte holen, dann ihre Druckungen
// (prints_search_uri, erste Seite reicht praktisch immer) durchsuchen.
async function fetchCheapestPrint(name){
  const r1=await fetch('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name));
  if(!r1.ok)return{eur:null};
  const card=await r1.json();
  await wishSleep(100);
  let best=null;
  try{
    const r2=await fetch(card.prints_search_uri);
    if(r2.ok){
      for(const p of (await r2.json()).data||[]){
        const e=parseFloat(p.prices&&p.prices.eur);
        if(e>0&&(!best||e<best.e))best={e,p};
      }
    }
  }catch(e){/* nur Grundkarte bekannt */}
  if(!best)return{eur:null};
  return{
    eur:best.e,
    set:(best.p.set||'').toUpperCase(),
    setName:best.p.set_name||'',
    cm:(best.p.purchase_uris&&best.p.purchase_uris.cardmarket)||null
  };
}

// Holt fehlende bzw. veraltete Preise. Gibt true zurück, wenn sich etwas änderte.
async function refreshWishPrices(force=false){
  if(wishPricesLoading)return wishPricesLoading;
  wishPricesLoading=(async()=>{
    loadWishPriceCache();
    const now=Date.now();
    let changed=false;
    for(const w of wishlist){
      const k=wishKey(w.card_name);
      const c=wishPrices[k];
      if(!force&&c&&now-c.at<WISH_PRICE_MAX_AGE_MS)continue;
      try{
        wishPrices[k]={...(await fetchCheapestPrint(w.card_name)),at:now};
        changed=true;
      }catch(e){/* nächstes Mal erneut */}
      await wishSleep(100);   // Scryfall bittet um ~10 Anfragen/Sekunde
    }
    if(changed)saveWishPriceCache();
    return changed;
  })();
  try{return await wishPricesLoading;}finally{wishPricesLoading=null;}
}

function wishPriceInfo(w){return wishPrices[wishKey(w.card_name)]||null;}
function wishPriceOf(w){const c=wishPriceInfo(w);return c&&c.eur!=null?c.eur:null;}
function isWishAlert(w){
  const p=wishPriceOf(w);
  return p!=null&&w.max_price!=null&&p<=parseFloat(w.max_price);
}

// ── Preisalarm beim Start (db.js → loadAll) ──
async function checkWishlistAlerts(){
  try{
    if(!await loadWishlist()){updateWishBadge();return;}
    loadWishPriceCache();
    updateWishBadge();
    await refreshWishPrices(false);
    updateWishBadge();
    const alerts=wishlist.filter(isWishAlert);
    if(!alerts.length)return;
    // Pro Tag und Karten-Auswahl nur einmal melden
    const sig=localDateStr()+'|'+alerts.map(a=>a.id).sort().join(',');
    let last='';
    try{last=localStorage.getItem(WISH_ALERT_KEY)||'';}catch(e){}
    if(last===sig)return;
    try{localStorage.setItem(WISH_ALERT_KEY,sig);}catch(e){}
    showToastTyped(alerts.length===1
      ?`🔔 „${alerts[0].card_name}" ist unter deinem Wunschpreis (Decks → ★ Wunschliste)`
      :`🔔 ${alerts.length} Karten sind unter deinem Wunschpreis (Decks → ★ Wunschliste)`,'info',7000);
  }catch(e){console.warn('[Wunschliste]',e);}
}

// ── Ändern ──
// Name über Scryfall bestätigen (Tippfehler, Groß-/Kleinschreibung)
async function addToWishlist(rawName,maxPrice){
  let card;
  try{
    const res=await fetch('https://api.scryfall.com/cards/named?fuzzy='+encodeURIComponent(rawName));
    if(!res.ok){toastError('Karte nicht gefunden: '+rawName);return false;}
    card=await res.json();
  }catch(e){toastError('Scryfall nicht erreichbar.');return false;}
  if(wishlist.some(w=>wishKey(w.card_name)===wishKey(card.name))){
    toastError(`„${card.name}" steht schon auf der Wunschliste.`);return false;
  }
  const{data,error}=await _sb.from('wishlist')
    .insert({user_id:currentUser.id,card_name:card.name,max_price:maxPrice})
    .select().single();
  if(error){toastError('Fehler: '+error.message);return false;}
  wishlist.push(data);
  return card.name;
}

// Mehrere Namen auf einmal (aus der Fehlt-Liste). Vorhandene werden übersprungen.
async function addManyToWishlist(names){
  if(!await loadWishlist()){
    if(wishTableMissing)openWishlistModal();   // zeigt den SQL-Hinweis
    else toastError('Wunschliste konnte nicht geladen werden.');
    return;
  }
  const have=new Set(wishlist.map(w=>wishKey(w.card_name)));
  const fresh=[...new Set(names)].filter(n=>n&&!have.has(wishKey(n)));
  if(!fresh.length){toastInfo('Alle Karten stehen schon auf der Wunschliste.');return;}
  const{data,error}=await _sb.from('wishlist')
    .insert(fresh.map(card_name=>({user_id:currentUser.id,card_name})))
    .select();
  if(error){toastError('Fehler: '+error.message);return;}
  wishlist.push(...(data||[]));
  toastSuccess(`${fresh.length} Karte${fresh.length===1?'':'n'} auf die Wunschliste gesetzt`);
  updateWishBadge();
}

async function updateWishMax(id,value){
  const v=String(value||'').trim();
  const max=v===''?null:parsePrice(v);
  if(v!==''&&!(max>0)){toastError('Bitte einen Preis wie 2,50 eingeben.');renderWishlistBody();return;}
  const{error}=await _sb.from('wishlist').update({max_price:max}).eq('id',id);
  if(error){toastError('Fehler: '+error.message);return;}
  const w=wishlist.find(x=>x.id===id);
  if(w)w.max_price=max;
  renderWishlistBody();updateWishBadge();
}

async function removeWish(id){
  const{error}=await _sb.from('wishlist').delete().eq('id',id);
  if(error){toastError('Fehler: '+error.message);return;}
  wishlist=wishlist.filter(w=>w.id!==id);
  renderWishlistBody();updateWishBadge();
}

// ── Oberfläche ──
(function injectWishlist(){
  if(!document.getElementById('wl-styles')){
    const css=[
      '.wl-badge{display:inline-block;min-width:1.2rem;margin-left:0.35rem;padding:0 0.3rem;border-radius:9px;background:var(--green);color:#0a0800;font-size:0.65rem;font-weight:700;text-align:center;}',
      '.wl-add{display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem;}',
      '.wl-add input{background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0.5rem 0.7rem;font-family:\'EB Garamond\',serif;font-size:0.95rem;}',
      '.wl-add .wl-add-name{flex:1;min-width:160px;}',
      '.wl-add .wl-add-max{width:7rem;}',
      '.wl-list{display:flex;flex-direction:column;gap:0.4rem;max-height:52vh;overflow-y:auto;}',
      '.wl-row{display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.75rem;background:var(--surface2);border:1px solid var(--border);border-radius:8px;}',
      '.wl-row.wl-alert{border-color:var(--green);background:rgba(76,175,80,0.08);}',
      '.wl-main{flex:1;min-width:0;}',
      '.wl-name{color:var(--text);text-decoration:none;}',
      '.wl-name:hover{color:var(--gold);}',
      '.wl-owned{margin-left:0.4rem;color:var(--green);font-size:0.75rem;}',
      '.wl-price{color:var(--text2);font-size:0.82rem;}',
      '.wl-price a{color:var(--teal);text-decoration:none;margin-left:0.4rem;}',
      '.wl-set{color:var(--text3);font-size:0.75rem;}',
      '.wl-hit{color:var(--green);font-size:0.8rem;font-weight:600;}',
      '.wl-max{display:flex;align-items:center;gap:0.25rem;color:var(--text3);font-size:0.75rem;white-space:nowrap;}',
      '.wl-max input{width:4.2rem;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:0.25rem 0.35rem;text-align:right;font-size:0.85rem;}',
      '.wl-foot{display:flex;justify-content:space-between;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-top:0.8rem;color:var(--text3);font-size:0.78rem;}',
      '.wl-sql{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:0.6rem;font-size:0.75rem;color:var(--text2);white-space:pre-wrap;}',
      '@media(max-width:480px){.wl-row{flex-wrap:wrap;}.wl-main{flex-basis:100%;}}'
    ].join('\n');
    const s=document.createElement('style');s.id='wl-styles';s.textContent=css;document.head.appendChild(s);
  }
  if(!document.getElementById('wishlistModal')){
    const w=document.createElement('div');
    w.innerHTML=`
<div class="modal-overlay" id="wishlistModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)">★ WUNSCHLISTE</span>
      <button class="modal-close" onclick="closeModal('wishlistModal')">✕</button>
    </div>
    <div class="modal-detail" id="wishlistBody"></div>
  </div>
</div>`;
    while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
  }
  // Button in der Decks-Übersicht (neben „✦ Fehlende Karten")
  const hdr=document.querySelector('.decks-header');
  if(hdr&&!document.getElementById('wlBtn')){
    const b=document.createElement('button');
    b.id='wlBtn';b.className='back-btn';b.type='button';
    b.title='Karten mit Wunschpreis beobachten';
    b.style.marginLeft='0.5rem';
    b.addEventListener('click',()=>openWishlistModal());
    hdr.appendChild(b);
    updateWishBadge();
  }
})();

function updateWishBadge(){
  const b=document.getElementById('wlBtn');
  if(!b)return;
  const n=wishlist.filter(isWishAlert).length;
  b.innerHTML='★ Wunschliste'+(n?`<span class="wl-badge" title="${n} unter Wunschpreis">${n}</span>`:'');
}

async function openWishlistModal(){
  const body=document.getElementById('wishlistBody');
  body.innerHTML='<div class="dxm-empty">Wird geladen…</div>';
  document.getElementById('wishlistModal').classList.add('open');
  await loadWishlist();
  loadWishPriceCache();
  renderWishlistBody();
  if(!wishTableMissing&&await refreshWishPrices(false)){renderWishlistBody();updateWishBadge();}
}

function renderWishlistBody(){
  const body=document.getElementById('wishlistBody');
  if(!body)return;
  if(wishTableMissing){
    body.innerHTML=`
      <p style="color:var(--text2);margin-top:0">Für die Wunschliste fehlt noch die Tabelle in der Datenbank. Einmalig im Supabase-Dashboard unter <strong>SQL Editor → New query</strong> den Inhalt von <code>supabase/wishlist.sql</code> (im Repo) einfügen und auf <strong>Run</strong> klicken, danach dieses Fenster neu öffnen.</p>`;
    return;
  }
  const owned=typeof buildOwnedNameMap==='function'?buildOwnedNameMap():new Map();
  const sorted=[...wishlist].sort((a,b)=>(isWishAlert(b)-isWishAlert(a))||a.card_name.localeCompare(b.card_name));
  const rows=sorted.map(w=>{
    const info=wishPriceInfo(w);
    const p=wishPriceOf(w);
    const hit=isWishAlert(w);
    const has=(owned.get(wishKey(w.card_name))||0)>0;
    const priceHtml=!info?'<span class="wl-set">Preis wird geladen…</span>'
      :p==null?'<span class="wl-set">kein Euro-Preis bekannt</span>'
      :`ab <strong>${p.toFixed(2)} €</strong> <span class="wl-set">${esc(info.set||'')}</span>${info.cm?`<a href="${esc(info.cm)}" target="_blank" rel="noopener">Cardmarket ↗</a>`:''}`;
    const max=w.max_price!=null?parseFloat(w.max_price).toFixed(2):'';
    return`<div class="wl-row${hit?' wl-alert':''}">
      <div class="wl-main">
        <div><a class="wl-name" href="https://scryfall.com/search?q=${encodeURIComponent('!"'+w.card_name+'"')}" target="_blank" rel="noopener" title="Bei Scryfall ansehen">${esc(w.card_name)}</a>${has?'<span class="wl-owned">✓ besitzt du</span>':''}</div>
        <div class="wl-price">${priceHtml}${hit?' <span class="wl-hit">🔔 unter Wunschpreis</span>':''}</div>
      </div>
      <label class="wl-max">Wunsch <input type="text" inputmode="decimal" value="${max}" placeholder="–" onchange="updateWishMax('${w.id}',this.value)"> €</label>
      <button class="icon-btn danger" type="button" onclick="removeWish('${w.id}')" title="Von der Wunschliste nehmen">✕</button>
    </div>`;
  }).join('');
  const stand=Object.values(wishPrices).reduce((m,c)=>Math.max(m,c.at||0),0);
  body.innerHTML=`
    <div class="wl-add">
      <input class="wl-add-name" id="wlAddName" placeholder="Kartenname, z.B. Rhystic Study" onkeydown="if(event.key==='Enter')submitWishAdd()">
      <input class="wl-add-max" id="wlAddMax" inputmode="decimal" placeholder="Wunsch €" onkeydown="if(event.key==='Enter')submitWishAdd()">
      <button class="btn btn-primary" type="button" id="wlAddBtn" onclick="submitWishAdd()">Hinzufügen</button>
    </div>
    ${wishlist.length?`<div class="wl-list">${rows}</div>`
      :'<div class="dxm-empty">Noch leer. Tippe oben eine Karte ein oder übernimm sie aus „✦ Fehlende Karten".</div>'}
    <div class="wl-foot">
      <span>Preis = günstigste Druckung laut Scryfall (Cardmarket)${stand?', Stand '+new Date(stand).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</span>
      ${wishlist.length?'<button class="btn-mini" type="button" onclick="forceRefreshWishPrices(this)">↻ Preise</button>':''}
    </div>`;
}

async function submitWishAdd(){
  const nameEl=document.getElementById('wlAddName');
  const maxEl=document.getElementById('wlAddMax');
  const name=nameEl.value.trim();
  if(!name){toastError('Bitte einen Kartennamen eingeben.');return;}
  const maxRaw=maxEl.value.trim();
  const max=maxRaw===''?null:parsePrice(maxRaw);
  if(maxRaw!==''&&!(max>0)){toastError('Bitte einen Preis wie 2,50 eingeben.');return;}
  const btn=document.getElementById('wlAddBtn');
  setBusy(btn,true,'Suche…');
  const added=await addToWishlist(name,max);
  setBusy(btn,false);
  if(!added)return;
  renderWishlistBody();
  toastSuccess(`„${added}" auf der Wunschliste`);
  await refreshWishPrices(false);
  renderWishlistBody();updateWishBadge();
  const n=document.getElementById('wlAddName');if(n)n.focus();
}

async function forceRefreshWishPrices(btn){
  setBusy(btn,true,'Lade…');
  try{await refreshWishPrices(true);}finally{setBusy(btn,false);}
  renderWishlistBody();updateWishBadge();
}
