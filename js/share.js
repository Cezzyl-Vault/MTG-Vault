// ══════════════════════════════════════════════════════════
//  TEILEN  ·  Deck per Link zeigen – ohne Konto
// ══════════════════════════════════════════════════════════
//
//  Im Deck: „⋯ Mehr → 🔗 Teilen" erzeugt einen zufälligen Schlüssel
//  (decks.share_token, supabase/deck_share.sql). Der Link …/?deck=<token>
//  zeigt immer den aktuellen Stand des Decks.
//
//  Empfänger: app.js erkennt ?deck= beim Start und ruft renderSharedDeck auf –
//  kein Login, eigener Bildschirm, nur lesen. Die Daten kommen über die
//  Datenbank-Funktion get_shared_deck(t), die genau dieses eine Deck liefert
//  (ohne Kaufpreise und Sammlungsdaten).

const SHARE_UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Link-Adresse ──
function shareBaseUrl(){
  return location.origin+location.pathname.replace(/index\.html$/,'');
}
function shareUrlFor(token){return shareBaseUrl()+'?deck='+token;}

// Token aus der Adresse (?deck=…), sonst null
function sharedDeckTokenFromUrl(){
  try{
    const t=new URLSearchParams(location.search).get('deck');
    return t&&SHARE_UUID_RE.test(t)?t.toLowerCase():null;
  }catch(e){return null;}
}

// ══════════════════════════════════════════════════════════
//  1. TEILEN-FENSTER (im eigenen Deck)
// ══════════════════════════════════════════════════════════
(function injectShareModal(){
  if(document.getElementById('shareModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="shareModal">
  <div class="modal sh-modal">
    <div class="modal-header">
      <span class="pt-title" id="shareTitle">TEILEN</span>
      <button class="modal-close" onclick="closeModal('shareModal')">✕</button>
    </div>
    <div class="modal-detail" id="shareBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

function openShareModal(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;
  document.getElementById('shareTitle').textContent='TEILEN · '+(deck.name||'Deck').toUpperCase();
  renderShareBody(deck);
  document.getElementById('shareModal').classList.add('open');
}

function renderShareBody(deck,errorHtml){
  const body=document.getElementById('shareBody');
  if(errorHtml){body.innerHTML=errorHtml;return;}
  if(!deck.share_token){
    body.innerHTML=`
      <p class="sh-text">Erstelle einen Link, mit dem jeder dieses Deck ansehen kann – <b>ohne Konto</b>.
        Der Link zeigt immer den aktuellen Stand: Karten mit Bildern, Kategorien, Manakurve und Marktwert.
        Kaufpreise und deine Sammlung sind nicht zu sehen, ändern kann niemand etwas.</p>
      <button class="btn btn-primary sh-create" onclick="createShareLink(this)">🔗 Link erstellen</button>`;
    return;
  }
  const url=shareUrlFor(deck.share_token);
  body.innerHTML=`
    <p class="sh-text">Jeder mit diesem Link sieht das Deck – ohne Konto, immer im aktuellen Stand, nur lesen.</p>
    <input class="sh-url" id="shareUrl" readonly value="${esc(url)}" onclick="this.select()">
    <div class="sh-actions">
      <button class="btn btn-primary" onclick="copyShareLink()">⧉ Kopieren</button>
      ${navigator.share?`<button class="back-btn" onclick="nativeShareLink()">↗ Teilen…</button>`:''}
      <a class="back-btn" href="${esc(url)}" target="_blank" rel="noopener">👁 Ansehen</a>
    </div>
    <div class="sh-off">
      <button class="back-btn sh-disable" onclick="disableShareLink()">Link deaktivieren</button>
      <span>Danach funktioniert der Link nicht mehr. Ein neuer Link ist jederzeit möglich.</span>
    </div>`;
}

function shareColumnMissing(error){
  return /share_token/i.test((error&&error.message)||'');
}
function shareSqlHint(){
  return`<div class="dxm-empty">Teilen ist noch nicht eingerichtet.<br>
    Bitte einmalig <b>supabase/deck_share.sql</b> im Supabase-SQL-Editor ausführen.</div>`;
}

async function createShareLink(btn){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;
  if(btn)btn.disabled=true;
  const token=crypto.randomUUID();
  const{error}=await _sb.from('decks').update({share_token:token}).eq('id',deck.id);
  if(btn)btn.disabled=false;
  if(error){
    if(shareColumnMissing(error)){renderShareBody(deck,shareSqlHint());return;}
    toastError('Link konnte nicht erstellt werden: '+error.message);return;
  }
  deck.share_token=token;
  renderShareBody(deck);
  toastSuccess('Link erstellt');
}

async function copyShareLink(){
  const inp=document.getElementById('shareUrl');
  if(!inp)return;
  try{
    await navigator.clipboard.writeText(inp.value);
    toastSuccess('Link kopiert');
  }catch(e){
    inp.select();document.execCommand&&document.execCommand('copy');
    toastSuccess('Link kopiert');
  }
}

async function nativeShareLink(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck||!deck.share_token)return;
  try{await navigator.share({title:deck.name||'Deck',text:'Mein Deck „'+(deck.name||'')+'" in MTG Vault',url:shareUrlFor(deck.share_token)});}
  catch(e){/* abgebrochen */}
}

async function disableShareLink(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;
  const ok=await confirmAction('Link deaktivieren? Wer ihn hat, kann das Deck danach nicht mehr ansehen.',
    {title:'LINK DEAKTIVIEREN',confirmLabel:'Deaktivieren',danger:true});
  if(!ok)return;
  const{error}=await _sb.from('decks').update({share_token:null}).eq('id',deck.id);
  if(error){toastError('Fehler: '+error.message);return;}
  deck.share_token=null;
  renderShareBody(deck);
  toastSuccess('Link deaktiviert');
}

// ══════════════════════════════════════════════════════════
//  2. ANSICHT FÜR EMPFÄNGER (ohne Login)
// ══════════════════════════════════════════════════════════
let sharedDeck=null;   // {name, format, description, category_order, cards}

async function renderSharedDeck(token){
  document.body.classList.add('shared-view');
  ['dbStatusScreen','authScreen','appScreen'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  let screen=document.getElementById('sharedScreen');
  if(!screen){
    screen=document.createElement('div');
    screen.id='sharedScreen';screen.className='sh-screen';
    document.body.appendChild(screen);
  }
  screen.innerHTML='<div class="sh-loading">Deck wird geladen…</div>';

  let data=null,error=null;
  try{({data,error}=await _sb.rpc('get_shared_deck',{t:token}));}
  catch(e){error=e;}
  if(error||!data){
    const paused=error&&!(error.code||error.message||'').toString().match(/PGRST|get_shared_deck/i);
    screen.innerHTML=`<div class="sh-missing">
      <div class="auth-emblem">${paused?'⏸️':'🔗'}</div>
      <h2>${paused?'Gerade nicht erreichbar':'Deck nicht gefunden'}</h2>
      <p>${paused
        ?'Die Datenbank antwortet im Moment nicht. Bitte versuche es in ein paar Minuten noch einmal.'
        :'Der Link ist ungültig oder wurde deaktiviert.'}</p>
      <a class="back-btn" href="${esc(shareBaseUrl())}">MTG Vault öffnen</a>
    </div>`;
    return;
  }
  sharedDeck=data;
  sharedDeck.cards=(data.cards||[]).map(r=>Object.assign({},r,{
    colors:Array.isArray(r.colors)?r.colors:[],
    color_identity:Array.isArray(r.color_identity)?r.color_identity:[]
  }));
  document.title=(data.name||'Deck')+' · MTG Vault';
  drawSharedDeck();
  // Marktpreise im Hintergrund holen, dann Wert aktualisieren
  if(typeof ensureDeckSfData==='function'){
    ensureDeckSfData(sharedDeck.cards).catch(()=>{}).then(()=>{
      sharedPricesLoaded=true;
      const el=document.getElementById('shValue');
      if(el)el.innerHTML=sharedValueHtml();
    });
  }
}
let sharedPricesLoaded=false;

function sharedMainCards(){return mainDeckCards(sharedDeck.cards);}

function sharedValueHtml(){
  let sum=0,missing=0;
  sharedMainCards().forEach(dc=>{
    const sf=typeof deckSfOf==='function'?deckSfOf(dc.scryfall_id):null;
    const p=sf?(sf.e!=null?sf.e:sf.f):null;
    if(p!=null)sum+=p*(dc.quantity||1);
    else if(!/basic land/i.test(dc.type_line||''))missing++;
  });
  if(!sum)return`<span class="sh-dim">${sharedPricesLoaded?'Kein Marktwert verfügbar':'Marktwert wird geladen…'}</span>`;
  return`Marktwert ${kpiNum(sum,2,' €')}${missing?` <span class="sh-dim">(${missing} ohne Preis)</span>`:''}`;
}

function sharedCurveHtml(){
  const curve={'0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7+':0};
  sharedMainCards().forEach(dc=>{
    if(/land/i.test(dc.type_line||'')||/^commander$/i.test((dc.category||'').trim()))return;
    const mv=dc.mana_value;
    if(mv==null)return;
    const k=mv>=7?'7+':String(Math.max(0,Math.floor(mv)));
    curve[k]+=dc.quantity||1;
  });
  const max=Math.max(...Object.values(curve),1);
  return`<div class="sh-curve">${Object.entries(curve).map(([k,n])=>`
    <div class="curve-col">
      <div class="curve-bar-track"><div class="curve-bar" style="height:${(n/max*100).toFixed(1)}%"></div></div>
      <div class="curve-count">${n||''}</div>
      <div class="curve-label">${k}</div>
    </div>`).join('')}</div>`;
}

function sharedTile(dc){
  const img=iUrl(dc);
  const name=dc.card_name||'Unbekannt';
  return`<div class="sh-tile" ${img?`onclick="ptZoom('${img}')"`:''} title="${esc(name)}">
    ${img?`<img src="${img}" alt="${esc(name)}" loading="lazy" onerror="this.parentNode.classList.add('sh-broken')">`:''}
    <div class="sh-noimg">${esc(name)}</div>
    ${(dc.quantity||1)>1?`<span class="sh-qty">${dc.quantity}×</span>`:''}
  </div>`;
}

function drawSharedDeck(){
  const d=sharedDeck;
  const screen=document.getElementById('sharedScreen');
  const cats={};const uncategorized=[];
  d.cards.forEach(dc=>{
    const cat=(dc.category||'').trim();
    if(!cat)uncategorized.push(dc);else(cats[cat]=cats[cat]||[]).push(dc);
  });
  const byName=(a,b)=>(a.card_name||'').localeCompare(b.card_name||'');
  const order=orderedDeckCategories(d,cats).filter(c=>cats[c]);
  const maybe=d.cards.filter(dc=>isMaybeCat(dc.category)).sort(byName);
  const total=sharedMainCards().reduce((s,dc)=>s+(dc.quantity||1),0);
  const commanders=(cats['Commander']||[]);
  const section=(title,list,extra)=>{
    const n=list.reduce((s,dc)=>s+(dc.quantity||1),0);
    return`<section class="sh-section${extra?' '+extra:''}">
      <h3>${esc(title)} <span>${n}</span></h3>
      <div class="sh-grid">${[...list].sort(byName).map(sharedTile).join('')}</div>
    </section>`;
  };
  screen.innerHTML=`
    <header class="sh-header">
      <a class="sh-brand" href="${esc(shareBaseUrl())}">MTG Vault</a>
      <span class="sh-badge">Geteiltes Deck · nur ansehen</span>
    </header>
    <div class="sh-top">
      ${commanders.length?`<div class="sh-cmd">${commanders.map(sharedTile).join('')}</div>`:''}
      <div class="sh-info">
        <h1>${esc(d.name||'Deck')}</h1>
        <div class="sh-meta">
          ${d.format?`<span class="deck-tag">${esc(d.format)}</span>`:''}
          <span>${total} Karten${maybe.length?` · ${maybe.reduce((s,dc)=>s+(dc.quantity||1),0)} im Maybeboard`:''}</span>
        </div>
        ${d.description?`<p class="sh-desc">${esc(d.description)}</p>`:''}
        <div class="sh-value" id="shValue">${sharedValueHtml()}</div>
        <div class="sh-curve-wrap"><div class="sh-label">Manakurve</div>${sharedCurveHtml()}</div>
        <div class="sh-actions">
          <button class="btn btn-primary" onclick="copySharedList()" title="Deckliste im üblichen Format (z.B. für Moxfield oder Archidekt) kopieren">⧉ Deckliste kopieren</button>
        </div>
      </div>
    </div>
    ${uncategorized.length?section('Ohne Kategorie',uncategorized):''}
    ${order.filter(c=>c!=='Commander').map(c=>section(c,cats[c])).join('')}
    ${maybe.length?section('Maybeboard · zählt nicht zum Deck',maybe,'sh-maybe'):''}
    <footer class="sh-footer">Erstellt mit <a href="${esc(shareBaseUrl())}">MTG Vault</a> · Kartenbilder und Preise: Scryfall</footer>`;
}

async function copySharedList(){
  if(!sharedDeck)return;
  const text=deckListText(sharedDeck,sharedDeck.cards,'plain',false);
  try{await navigator.clipboard.writeText(text);toastSuccess('Deckliste kopiert');}
  catch(e){toastError('Kopieren nicht möglich.');}
}
