// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
const CFG_KEY = 'mtgvault_cfg_v2';
let _sb = null, currentUser = null;
let allCards = [], allDecks = [], currentDeckCards = [];
let filtered = [], viewMode = 'grid';
let editingCardId = null, editingDeckId = null, activeDeckId = null;

// ══════════════════════════════════════════════════════════
//  CONFIG
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

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
let authMode='login';
function switchAuthTab(m){
  authMode=m;
  document.getElementById('tabLogin').classList.toggle('active',m==='login');
  document.getElementById('tabSignup').classList.toggle('active',m==='signup');
  document.getElementById('authSubmit').textContent=m==='login'?'Anmelden':'Registrieren';
  document.getElementById('authError').textContent='';
}
async function submitAuth(){
  const email=document.getElementById('authEmail').value.trim();
  const pw=document.getElementById('authPassword').value;
  const errEl=document.getElementById('authError');
  errEl.textContent='';errEl.style.color='var(--red)';
  if(!email||!pw){errEl.textContent='E-Mail und Passwort erforderlich.';return;}
  let res=authMode==='login'
    ?await _sb.auth.signInWithPassword({email,password:pw})
    :await _sb.auth.signUp({email,password:pw});
  if(res.error){errEl.textContent=res.error.message;return;}
  if(authMode==='signup'&&!res.data.session){errEl.style.color='var(--green)';errEl.textContent='Bestätigungsmail gesendet!';return;}
  showApp(res.data.user||res.data.session.user);
}
async function signOut(){await _sb.auth.signOut();allCards=[];allDecks=[];currentUser=null;showAuth();}

// ══════════════════════════════════════════════════════════
//  STARTUP
// ══════════════════════════════════════════════════════════
(async()=>{
  const cfg=loadCfg();
  if(!cfg){showConfig();return;}
  _sb=window.supabase.createClient(cfg.url,cfg.key);
  const{data:{session}}=await _sb.auth.getSession();
  if(session)showApp(session.user);else showAuth();
})();

// ══════════════════════════════════════════════════════════
//  MOBILE NAV
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
//  DB
// ══════════════════════════════════════════════════════════
function setSyncing(state){
  const dot=document.getElementById('syncDot');
  const lbl=document.getElementById('syncLabel');
  if(!dot)return;
  dot.className='sync-dot'+(state==='syncing'?' syncing':state==='error'?' error':'');
  lbl.textContent=state==='syncing'?'Synchronisiert…':state==='error'?'Fehler':'Verbunden';
}

async function loadAll(){
  setSyncing('syncing');
  const[{data:cards,error:e1},{data:decks,error:e2}]=await Promise.all([
    _sb.from('cards').select('*').order('created_at',{ascending:false}),
    _sb.from('decks').select('*').order('created_at',{ascending:false}),
  ]);
  if(e1||e2){setSyncing('error');showToast('Ladefehler');return;}
  allCards=cards||[];allDecks=decks||[];
  setSyncing('ok');renderAll();
}

async function upsertCards(cards){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').upsert(cards.map(c=>({...c,user_id:currentUser.id})),{onConflict:'id'});
  if(error){setSyncing('error');showToast('Sync-Fehler: '+error.message);return false;}
  setSyncing('ok');return true;
}
async function updateCard(card){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').update(card).eq('id',card.id);
  if(error){setSyncing('error');showToast('Speicherfehler');return false;}
  setSyncing('ok');return true;
}
async function deleteCardDB(id){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').delete().eq('id',id);
  if(error){setSyncing('error');showToast('Löschfehler');return false;}
  setSyncing('ok');return true;
}

// DECK DB
async function createDeckDB(deck){
  const{data,error}=await _sb.from('decks').insert({...deck,user_id:currentUser.id}).select().single();
  if(error){showToast('Fehler: '+error.message);return null;}
  return data;
}
async function updateDeckDB(id,fields){
  const{error}=await _sb.from('decks').update(fields).eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}
async function deleteDeckDB(id){
  const{error}=await _sb.from('decks').delete().eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}

// DECK CARDS DB
async function loadDeckCards(deckId){
  const{data,error}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  if(error){showToast('Fehler: '+error.message);return[];}
  return data||[];
}
async function addToDeckDB(deckId,cardId,category,quantity){
  // Check if already exists in same category
  const{data:existing}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId).eq('card_id',cardId).eq('category',category);
  if(existing&&existing.length>0){
    const{error}=await _sb.from('deck_cards').update({quantity:existing[0].quantity+quantity}).eq('id',existing[0].id);
    if(error){showToast('Fehler: '+error.message);return false;}
  }else{
    const{error}=await _sb.from('deck_cards').insert({deck_id:deckId,card_id:cardId,category,quantity,user_id:currentUser.id});
    if(error){showToast('Fehler: '+error.message);return false;}
  }
  return true;
}
async function removeDeckCardDB(id){
  const{error}=await _sb.from('deck_cards').delete().eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}
async function removeCategoryDB(deckId,category){
  const{error}=await _sb.from('deck_cards').delete().eq('deck_id',deckId).eq('category',category);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}

// ══════════════════════════════════════════════════════════
//  CSV
// ══════════════════════════════════════════════════════════
document.addEventListener('change',e=>{
  if(e.target.id!=='fileInput')return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>parseCSV(ev.target.result);
  reader.readAsText(file,'UTF-8');
  e.target.value='';
});

async function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2){showToast('CSV ist leer.');return;}
  const headers=csvLine(lines[0]).map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
  const ci=name=>{
    const a={name:['name','kartenname'],set_code:['set_code','set','setcode','edition'],set_name:['set_name','setname'],collector_number:['collector_number','number'],foil:['foil'],rarity:['rarity','seltenheit'],quantity:['quantity','qty','anzahl'],manabox_id:['manabox_id'],scryfall_id:['scryfall_id','uuid'],purchase_price:['purchase_price','price','preis'],misprint:['misprint'],altered:['altered'],condition:['condition','zustand'],language:['language','lang','sprache'],currency:['purchase_price_currency','currency']};
    for(const k of(a[name]||[name])){const i=headers.indexOf(k);if(i!==-1)return i;}return -1;
  };
  const newCards=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const cells=csvLine(lines[i]);
    const g=k=>{const idx=ci(k);return idx>=0?(cells[idx]||'').trim():'';};
    newCards.push({id:crypto.randomUUID(),user_id:currentUser.id,name:g('name'),set_code:g('set_code').toUpperCase(),set_name:g('set_name'),collector_number:g('collector_number'),foil:g('foil').toLowerCase(),rarity:g('rarity').toLowerCase(),quantity:parseInt(g('quantity'))||1,manabox_id:g('manabox_id'),scryfall_id:g('scryfall_id'),purchase_price:g('purchase_price'),currency:g('currency')||'EUR',misprint:g('misprint').toLowerCase()==='true',altered:g('altered').toLowerCase()==='true',condition:g('condition').toLowerCase(),language:g('language')});
  }
  if(!newCards.length){showToast('Keine Karten gefunden.');return;}
  showToast(`⬆ Lade ${newCards.length} Karten…`);
  if(await upsertCards(newCards)){await loadAll();showToast(`✓ ${newCards.length} Karten importiert`);}
}
function csvLine(line){
  const r=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(c===','&&!inQ){r.push(cur);cur='';}else cur+=c;}
  r.push(cur);return r;
}

// ══════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════
function renderAll(){
  populateSets();applyFilters();renderStats();renderDecks();
  const has=allCards.length>0;
  document.getElementById('collection-empty').style.display=has?'none':'';
  document.getElementById('collection-content').style.display=has?'':'none';
  document.getElementById('stats-empty').style.display=has?'none':'';
  document.getElementById('stats-content').style.display=has?'':'none';
}

function populateSets(){
  const sel=document.getElementById('filterSet');const cur=sel.value;
  const sets=[...new Map(allCards.map(c=>[c.set_code,c.set_name||c.set_code])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  sel.innerHTML='<option value="">Alle Sets</option>'+sets.map(([code,name])=>`<option value="${code}">${name} (${code})</option>`).join('');
  sel.value=cur;
}

function applyFilters(){
  const q=document.getElementById('searchInput').value.toLowerCase();
  const rar=document.getElementById('filterRarity').value;
  const foil=document.getElementById('filterFoil').value;
  const set=document.getElementById('filterSet').value;
  const cond=document.getElementById('filterCondition').value;
  filtered=allCards.filter(c=>{
    if(q&&!c.name.toLowerCase().includes(q)&&!(c.set_name||'').toLowerCase().includes(q))return false;
    if(rar&&c.rarity!==rar)return false;
    if(foil==='foil'&&c.foil!=='foil')return false;
    if(foil==='normal'&&c.foil==='foil')return false;
    if(set&&c.set_code!==set)return false;
    if(cond&&!(c.condition||'').includes(cond.split('_')[0]))return false;
    return true;
  });
  const tot=filtered.reduce((s,c)=>s+c.quantity,0);
  document.getElementById('statsBar').innerHTML=
    `<span>${filtered.length} <strong>Einträge</strong></span><span>${tot} <strong>Karten</strong></span>`+
    (filtered.length!==allCards.length?`<span style="color:var(--purple)">(von ${allCards.length})</span>`:'');
  renderCards();
}

function renderCards(){
  const container=document.getElementById('cardContainer');
  if(!filtered.length){container.innerHTML='<div style="text-align:center;padding:4rem;color:var(--text2)">Keine Karten gefunden.</div>';return;}
  if(viewMode==='grid'){
    container.innerHTML='<div class="card-grid">'+filtered.map(c=>gridHTML(c)).join('')+'</div>';
    container.querySelectorAll('[data-src]').forEach(el=>{
      const img=new Image();
      img.onload=()=>{el.src=el.dataset.src;el.removeAttribute('data-src');};
      img.src=el.dataset.src;
    });
  }else{
    container.innerHTML='<div class="card-list"><div class="list-header"><span>NAME</span><span>SET</span><span>SELTENHEIT</span><span>ZUSTAND</span><span>FOIL</span><span>QTY</span><span>PREIS</span><span>SPRACHE</span><span></span></div>'+filtered.map(c=>listHTML(c)).join('')+'</div>';
  }
}

// ── HELPERS ──
function iUrl(c){return c.scryfall_id?`https://cards.scryfall.io/normal/front/${c.scryfall_id[0]}/${c.scryfall_id[1]}/${c.scryfall_id}.jpg`:null;}
function rc(r){return['mythic','rare','uncommon'].includes(r)?r:'common';}
function cc(c=''){if(c.includes('near'))return'cond-nm';if(c.includes('light'))return'cond-lp';if(c.includes('moderate'))return'cond-mp';if(c.includes('heavy'))return'cond-hp';if(c.includes('damage'))return'cond-dm';return'';}
function cl(c=''){if(c.includes('near'))return'NM';if(c.includes('light'))return'LP';if(c.includes('moderate'))return'MP';if(c.includes('heavy'))return'HP';if(c.includes('damage'))return'DM';return c.toUpperCase().slice(0,3)||'–';}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function gridHTML(c){
  const img=iUrl(c);const r=rc(c.rarity);
  const badges=[c.foil==='foil'?'<span class="badge badge-foil">✦ FOIL</span>':'',c.misprint?'<span class="badge badge-misprint">⚠ MISPRINT</span>':'',c.altered?'<span class="badge badge-altered">✎ ALTERED</span>':''].filter(Boolean).join('');
  return`<div class="card-item" onclick="openCardModal('${c.id}')">
    <div class="img-wrap">
      ${img?`<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-src="${img}" alt="${esc(c.name)}">`:`<div class="img-placeholder">🃏<span>${esc(c.name)}</span></div>`}
      ${c.quantity>1?`<span class="qty-badge">×${c.quantity}</span>`:''}
    </div>
    <div class="rarity-bar ${r}"></div>
    <div class="card-meta">
      <div class="card-name" title="${esc(c.name)}">${esc(c.name)}</div>
      <div class="card-sub"><span>${esc(c.set_code)}${c.collector_number?' #'+esc(c.collector_number):''}</span><div style="display:flex;gap:3px;flex-wrap:wrap">${badges}</div></div>
    </div>
  </div>`;
}

function listHTML(c){
  const r=rc(c.rarity);
  const price=c.purchase_price?`${parseFloat(c.purchase_price).toFixed(2)} ${c.currency||'€'}`:'–';
  const cond=c.condition?`<span class="condition-badge ${cc(c.condition)}">${cl(c.condition)}</span>`:'–';
  return`<div class="list-row" onclick="openCardModal('${c.id}')">
    <span class="name-col"><span class="rarity-dot ${r}" style="margin-right:5px"></span>${esc(c.name)}</span>
    <span class="col">${esc(c.set_name||c.set_code)}</span>
    <span class="col" style="text-transform:capitalize">${esc(c.rarity)}</span>
    <span class="col">${cond}</span>
    <span class="col">${c.foil==='foil'?'✦':'–'}</span>
    <span class="col">×${c.quantity}</span>
    <span class="col">${price}</span>
    <span class="col">${esc(c.language||'–')}</span>
    <div class="list-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="openCardModal('${c.id}')">👁</button>
      <button class="icon-btn danger" onclick="deleteCard('${c.id}')">🗑</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════
//  CARD MODAL
// ══════════════════════════════════════════════════════════
function openCardModal(id){
  editingCardId=id;
  const c=allCards.find(x=>x.id===id);if(!c)return;
  const img=iUrl(c);const r=rc(c.rarity);
  const price=c.purchase_price?`${parseFloat(c.purchase_price).toFixed(2)} ${c.currency||'€'}`:'–';
  const decksOptions=allDecks.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');

  document.getElementById('modalInner').innerHTML=`
    <div class="modal-img-side">
      ${img?`<img src="${img}" alt="${esc(c.name)}">`:`<div class="modal-img-placeholder">🃏</div>`}
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;margin-top:0.3rem">
        ${c.foil==='foil'?'<span class="badge badge-foil">✦ FOIL</span>':''}
        ${c.misprint?'<span class="badge badge-misprint">⚠ MISPRINT</span>':''}
        ${c.altered?'<span class="badge badge-altered">✎ ALTERED</span>':''}
      </div>
      ${c.scryfall_id?`<a href="https://scryfall.com/card/${(c.set_code||'').toLowerCase()}/${c.collector_number}" target="_blank" style="font-size:0.72rem;color:var(--teal);text-decoration:none;margin-top:0.5rem">🔗 Scryfall</a>`:''}
    </div>
    <div class="modal-detail">
      <div class="modal-title">${esc(c.name)}</div>
      <div class="modal-set">${esc(c.set_name||c.set_code)} · ${esc(c.set_code)} · #${esc(c.collector_number)}</div>
      <div class="detail-grid">
        <div class="detail-item"><label>SELTENHEIT</label><div class="val" style="text-transform:capitalize;color:var(--${r})">${esc(c.rarity)}</div></div>
        <div class="detail-item"><label>ANZAHL</label><div class="val">×${c.quantity}</div></div>
        <div class="detail-item"><label>ZUSTAND</label><div class="val"><span class="condition-badge ${cc(c.condition)}">${cl(c.condition)}</span></div></div>
        <div class="detail-item"><label>SPRACHE</label><div class="val">${esc(c.language||'–')}</div></div>
        <div class="detail-item"><label>KAUFPREIS</label><div class="val">${price}</div></div>
        <div class="detail-item"><label>FOIL</label><div class="val">${c.foil==='foil'?'✦ Foil':'Normal'}</div></div>
      </div>

      ${allDecks.length>0?`
      <div class="add-to-deck-section">
        <h4>⚔️ ZU DECK HINZUFÜGEN</h4>
        <div class="add-deck-row">
          <select id="deckSelect">${decksOptions}</select>
          <input id="deckCategory" placeholder="Kategorie" list="catSuggestions2" value="Creatures">
          <datalist id="catSuggestions2">
            <option value="Commander"><option value="Lands"><option value="Ramp">
            <option value="Creatures"><option value="Removal"><option value="Card Draw">
            <option value="Enchantments"><option value="Artifacts"><option value="Instants">
            <option value="Sorceries"><option value="Planeswalkers"><option value="Sonstige">
          </datalist>
          <input id="deckQty" type="number" min="1" max="99" value="1" style="max-width:60px">
          <button class="add-deck-submit" onclick="addCardToDeck('${c.id}')">+ Hinzufügen</button>
        </div>
      </div>`:'<div style="font-size:0.85rem;color:var(--text3);font-style:italic;margin-bottom:0.75rem">Erstelle zuerst ein Deck im Decks-Reiter.</div>'}

      <details style="margin-top:0.75rem">
        <summary style="font-family:'Cinzel',serif;font-size:0.68rem;letter-spacing:0.1em;color:var(--text3);cursor:pointer;margin-bottom:0.75rem;outline:none">✎ BEARBEITEN</summary>
        <div class="edit-form">
          <div><label>NAME</label><input id="e_name" value="${esc(c.name)}"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <div><label>ANZAHL</label><input id="e_qty" type="number" min="1" value="${c.quantity}"></div>
            <div><label>KAUFPREIS</label><input id="e_price" value="${esc(c.purchase_price||'')}"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
            <div><label>ZUSTAND</label><select id="e_cond">${['near_mint','lightly_played','moderately_played','heavily_played','damaged'].map(v=>`<option value="${v}"${c.condition===v?' selected':''}>${v.replace(/_/g,' ')}</option>`).join('')}</select></div>
            <div><label>FOIL</label><select id="e_foil"><option value="normal"${c.foil!=='foil'?' selected':''}>Normal</option><option value="foil"${c.foil==='foil'?' selected':''}>Foil</option></select></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onclick="saveCardEdit()">Speichern</button>
            <button class="btn btn-danger" onclick="deleteCard('${c.id}')">Löschen</button>
          </div>
        </div>
      </details>
    </div>`;
  document.getElementById('cardModal').classList.add('open');
}

async function addCardToDeck(cardId){
  const deckId=document.getElementById('deckSelect').value;
  const category=document.getElementById('deckCategory').value.trim()||'Sonstige';
  const qty=parseInt(document.getElementById('deckQty').value)||1;
  if(!deckId){showToast('Bitte ein Deck auswählen.');return;}
  const ok=await addToDeckDB(deckId,cardId,category,qty);
  if(ok){
    const deck=allDecks.find(d=>d.id===deckId);
    showToast(`✓ Zu "${deck?.name}" hinzugefügt`);
  }
}

async function saveCardEdit(){
  if(!editingCardId)return;
  const idx=allCards.findIndex(c=>c.id===editingCardId);if(idx===-1)return;
  const updated={...allCards[idx],name:document.getElementById('e_name').value.trim(),quantity:parseInt(document.getElementById('e_qty').value)||1,purchase_price:document.getElementById('e_price').value.trim(),condition:document.getElementById('e_cond').value,foil:document.getElementById('e_foil').value};
  if(await updateCard(updated)){allCards[idx]=updated;closeModal('cardModal');renderAll();showToast('✓ Karte gespeichert');}
}

async function deleteCard(id){
  if(!confirm('Karte wirklich löschen?'))return;
  if(await deleteCardDB(id)){allCards=allCards.filter(c=>c.id!==id);closeModal('cardModal');renderAll();showToast('Karte gelöscht');}
}

// ══════════════════════════════════════════════════════════
//  DECKS
// ══════════════════════════════════════════════════════════
function renderDecks(){
  const grid=document.getElementById('decksGrid');
  const empty=document.getElementById('decks-empty');
  if(!allDecks.length){empty.style.display='';grid.innerHTML='';return;}
  empty.style.display='none';
  grid.innerHTML=allDecks.map(d=>`
    <div class="deck-card" onclick="openDeckDetail('${d.id}')">
      <div class="deck-actions" onclick="event.stopPropagation()">
        <button class="deck-act-btn" onclick="openDeckModal('${d.id}')" title="Bearbeiten">✎</button>
        <button class="deck-act-btn" onclick="deleteDeck('${d.id}')" title="Löschen">🗑</button>
      </div>
      <div class="deck-name">${esc(d.name)}</div>
      <div class="deck-desc">${esc(d.description||'')}</div>
      <div class="deck-meta">
        ${d.format?`<span class="deck-tag">${esc(d.format)}</span>`:''}
        <span class="deck-count" id="dcount-${d.id}">Lädt…</span>
      </div>
    </div>`).join('');
  // Load card counts
  allDecks.forEach(async d=>{
    const{count}=await _sb.from('deck_cards').select('*',{count:'exact',head:true}).eq('deck_id',d.id);
    const el=document.getElementById('dcount-'+d.id);
    if(el)el.textContent=`${count||0} Einträge`;
  });
}

function openDeckModal(id=null){
  editingDeckId=id;
  document.getElementById('deckModalTitle').textContent=id?'DECK BEARBEITEN':'NEUES DECK';
  if(id){
    const d=allDecks.find(x=>x.id===id);
    document.getElementById('deckName').value=d?.name||'';
    document.getElementById('deckDesc').value=d?.description||'';
    document.getElementById('deckFormat').value=d?.format||'';
  }else{
    document.getElementById('deckName').value='';
    document.getElementById('deckDesc').value='';
    document.getElementById('deckFormat').value='';
  }
  document.getElementById('deckModal').classList.add('open');
}

async function saveDeck(){
  const name=document.getElementById('deckName').value.trim();
  if(!name){showToast('Name erforderlich.');return;}
  const fields={name,description:document.getElementById('deckDesc').value.trim(),format:document.getElementById('deckFormat').value};
  if(editingDeckId){
    if(await updateDeckDB(editingDeckId,fields)){
      const idx=allDecks.findIndex(d=>d.id===editingDeckId);
      if(idx!==-1)allDecks[idx]={...allDecks[idx],...fields};
      closeModal('deckModal');renderDecks();showToast('✓ Deck gespeichert');
    }
  }else{
    const deck=await createDeckDB(fields);
    if(deck){allDecks.unshift(deck);closeModal('deckModal');renderDecks();showToast('✓ Deck erstellt');}
  }
}

async function deleteDeck(id){
  if(!confirm('Deck und alle zugeordneten Karten daraus löschen?'))return;
  if(await deleteDeckDB(id)){allDecks=allDecks.filter(d=>d.id!==id);renderDecks();showToast('Deck gelöscht');}
}

// ── DECK DETAIL ──
async function openDeckDetail(deckId){
  activeDeckId=deckId;
  const deck=allDecks.find(d=>d.id===deckId);
  document.getElementById('decks-list-view').style.display='none';
  const detailView=document.getElementById('deck-detail-view');
  detailView.style.display='block';
  detailView.innerHTML=`<div style="text-align:center;padding:3rem;color:var(--text2)">Lädt…</div>`;

  currentDeckCards=await loadDeckCards(deckId);
  renderDeckDetail(deck);
}

function renderDeckDetail(deck){
  const detailView=document.getElementById('deck-detail-view');
  // Group by category
  const cats={};
  currentDeckCards.forEach(dc=>{
    const cat=dc.category||'Sonstige';
    if(!cats[cat])cats[cat]=[];
    cats[cat].push(dc);
  });
  const totalCards=currentDeckCards.reduce((s,dc)=>s+dc.quantity,0);

  const catOrder=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const sortedCats=[...new Set([...catOrder.filter(c=>cats[c]),...Object.keys(cats)])];

  detailView.innerHTML=`
    <div class="deck-detail-header">
      <button class="back-btn" onclick="closeDeckDetail()">← Zurück</button>
      <div>
        <div class="deck-detail-title">${esc(deck.name)}</div>
        ${deck.format?`<span class="deck-tag" style="font-size:0.6rem">${esc(deck.format)}</span>`:''}
      </div>
      <div class="deck-detail-actions" style="margin-left:auto;display:flex;gap:0.5rem;align-items:center">
        <span style="color:var(--text2);font-size:0.85rem">${totalCards} Karten</span>
        <button class="btn-gold" onclick="openCatModal()">+ Kategorie</button>
        <button class="back-btn" onclick="openDeckModal('${deck.id}')">✎ Deck</button>
      </div>
    </div>
    ${sortedCats.filter(c=>cats[c]).map(cat=>catSection(cat,cats[cat],deck.id)).join('')}
    ${!currentDeckCards.length?`<div class="empty-state" style="padding:3rem"><div class="empty-icon">🃏</div><h2>Keine Karten</h2><p>Öffne eine Karte in der Sammlung und füge sie hier hinzu.</p></div>`:''}
  `;
}

function catSection(cat,dcCards,deckId){
  const total=dcCards.reduce((s,dc)=>s+dc.quantity,0);
  const rows=dcCards.map(dc=>{
    const card=allCards.find(c=>c.id===dc.card_id);
    const img=card?iUrl(card):null;
    return`<div class="deck-card-row">
      ${img?`<img class="dc-img" src="${img}" alt="${esc(card?.name||'')}">`:`<div class="dc-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem">🃏</div>`}
      <div style="flex:1;min-width:0">
        <div class="dc-name">${esc(card?.name||dc.card_id)}</div>
        <div class="dc-sub">${card?esc(card.set_code)+(card.collector_number?' #'+esc(card.collector_number):''):''} ${card?.foil==='foil'?'· ✦ Foil':''}</div>
      </div>
      <span class="dc-qty">×${dc.quantity}</span>
      <button class="dc-remove" onclick="removeDeckCard('${dc.id}')" title="Entfernen">✕</button>
    </div>`;
  }).join('');
  return`<div class="category-section">
    <div class="category-header">
      <div class="category-name">◈ ${esc(cat)} <span class="category-count">${total} Karten</span></div>
      <button class="del-cat-btn" onclick="removeCategory('${deckId}','${esc(cat)}')" title="Kategorie entfernen">🗑 Kategorie</button>
    </div>
    ${rows}
  </div>`;
}

function closeDeckDetail(){
  activeDeckId=null;currentDeckCards=[];
  document.getElementById('decks-list-view').style.display='';
  document.getElementById('deck-detail-view').style.display='none';
  renderDecks();
}

let pendingCatDeckId=null;
function openCatModal(){
  document.getElementById('catName').value='';
  document.getElementById('catModal').classList.add('open');
}
function addCategory(){
  const name=document.getElementById('catName').value.trim();
  if(!name){showToast('Name erforderlich.');return;}
  closeModal('catModal');
  showToast(`Kategorie "${name}" bereit – füge jetzt Karten über die Sammlung hinzu.`);
}

async function removeDeckCard(dcId){
  if(!confirm('Karte aus Deck entfernen?'))return;
  if(await removeDeckCardDB(dcId)){
    currentDeckCards=currentDeckCards.filter(dc=>dc.id!==dcId);
    const deck=allDecks.find(d=>d.id===activeDeckId);
    renderDeckDetail(deck);showToast('Karte entfernt');
  }
}

async function removeCategory(deckId,category){
  if(!confirm(`Kategorie "${category}" und alle darin enthaltenen Karten aus dem Deck entfernen?`))return;
  if(await removeCategoryDB(deckId,category)){
    currentDeckCards=currentDeckCards.filter(dc=>dc.category!==category);
    const deck=allDecks.find(d=>d.id===deckId);
    renderDeckDetail(deck);showToast(`Kategorie "${category}" entfernt`);
  }
}

// ══════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════
function renderStats(){
  const sc=document.getElementById('stats-content');
  if(!allCards.length){sc.style.display='none';return;}sc.style.display='';
  const total=allCards.reduce((s,c)=>s+c.quantity,0);
  const totalVal=allCards.reduce((s,c)=>s+(parseFloat(c.purchase_price)||0)*c.quantity,0);
  const foilC=allCards.filter(c=>c.foil==='foil').reduce((s,c)=>s+c.quantity,0);
  const sets=new Set(allCards.map(c=>c.set_code)).size;
  const rC={};allCards.forEach(c=>{rC[c.rarity]=(rC[c.rarity]||0)+c.quantity;});
  const rCol={mythic:'var(--mythic)',rare:'var(--gold)',uncommon:'var(--uncommon)',common:'var(--text3)'};
  const maxR=Math.max(...Object.values(rC),1);
  const sC={};allCards.forEach(c=>{sC[c.set_code]=(sC[c.set_code]||0)+c.quantity;});
  const topS=Object.entries(sC).sort((a,b)=>b[1]-a[1]).slice(0,10);const maxS=Math.max(...topS.map(s=>s[1]),1);
  const lC={};allCards.forEach(c=>{const l=c.language||'Unbekannt';lC[l]=(lC[l]||0)+c.quantity;});
  const topL=Object.entries(lC).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxL=Math.max(...topL.map(l=>l[1]),1);
  const cC={};allCards.forEach(c=>{const l=c.condition||'Unbekannt';cC[l]=(cC[l]||0)+c.quantity;});

  sc.innerHTML=`
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-val">${total.toLocaleString('de')}</div><div class="kpi-label">Karten gesamt</div></div>
    <div class="kpi"><div class="kpi-val">${allCards.length.toLocaleString('de')}</div><div class="kpi-label">Einträge</div></div>
    <div class="kpi"><div class="kpi-val">${sets}</div><div class="kpi-label">Sets</div></div>
    <div class="kpi"><div class="kpi-val">${foilC.toLocaleString('de')}</div><div class="kpi-label">Foil-Karten</div></div>
    <div class="kpi"><div class="kpi-val">${allDecks.length}</div><div class="kpi-label">Decks</div></div>
    <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${totalVal.toFixed(2)} €</div><div class="kpi-label">Gesamtwert</div></div>
  </div>
  <div class="stats-section"><h2>◈ SELTENHEIT</h2><div class="bar-chart">${['mythic','rare','uncommon','common'].filter(r=>rC[r]).map(r=>`<div class="bar-row"><span class="bar-label" style="text-transform:capitalize;color:${rCol[r]}">${r}</span><div class="bar-track"><div class="bar-fill" style="width:${(rC[r]/maxR*100).toFixed(1)}%;background:${rCol[r]}">${rC[r]}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ TOP SETS</h2><div class="bar-chart">${topS.map(([c,n])=>`<div class="bar-row"><span class="bar-label">${c}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxS*100).toFixed(1)}%;background:var(--purple)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ SPRACHEN</h2><div class="bar-chart">${topL.map(([l,n])=>`<div class="bar-row"><span class="bar-label">${l}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxL*100).toFixed(1)}%;background:var(--teal)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ ZUSTAND</h2><div class="bar-chart">${Object.entries(cC).sort((a,b)=>b[1]-a[1]).map(([cond,n])=>`<div class="bar-row"><span class="bar-label">${cl(cond)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/total*100).toFixed(1)}%;background:var(--green)">${n} (${(n/total*100).toFixed(0)}%)</div></div></div>`).join('')}</div></div>`;
}

// ══════════════════════════════════════════════════════════
//  UI
// ══════════════════════════════════════════════════════════
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
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('open');});
});
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}
