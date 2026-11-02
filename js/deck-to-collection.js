// ══════════════════════════════════════════════════════════
//  DECK → SAMMLUNG  ·  Deck-Karten mit Versionsauswahl übernehmen
// ══════════════════════════════════════════════════════════
//
//  Geht ein Deck Karte für Karte durch (Assistent). Pro Karte wählt man
//  die genaue Version (Set, Nummer, Normal/Foil), damit Marktwert, Bild
//  und Kaufpreis in der Sammlung stimmen.
//
//   - Alle Karten des Decks, gleiche Namen zusammengefasst (Menge = Summe);
//     besitzt man eine schon, steht „besitzt du schon N×" dabei
//   - Basic Lands werden übersprungen
//   - Vorausgewählt ist die Druckung der Deck-Zeile (z.B. vom Listen-Import)
//   - Nur legal spielbare Druckungen (isPlayablePrint, wishlist.js)
//   - Kaufpreis = aktueller Preis der Version/Ausführung, änderbar
//   - Jede Karte wird sofort gespeichert („Übernehmen & weiter") — beim
//     Beenden geht nichts verloren. Gleiche Karte schon da → Menge erhöht
//     (dedupKey aus csv-import.js, wie CSV-Import und „＋ Karte").
//
//  Start: „⇩ In Sammlung" im Deck-Detail (decks.js) oder nach einem
//  Listen-Import (deck-list.js). Nutzt die CSS-Klassen .acs-* aus add-card.js.

const BASIC_LAND_NAMES=['plains','island','swamp','mountain','forest','wastes'];

let d2c={deckId:null,items:[],idx:0,added:0,addedCards:0,skipped:0,prints:new Map(),sel:null,priceTouched:false};

const d2cSleep=ms=>new Promise(r=>setTimeout(r,ms));

function d2cIsBasicLand(name,typeLine){
  if(typeLine)return /\bbasic\b/i.test(typeLine)&&/\bland\b/i.test(typeLine);
  const n=(name||'').toLowerCase().replace(/^snow-covered /,'');
  return BASIC_LAND_NAMES.includes(n);
}

// Deck-Zeilen → Liste der abzufragenden Karten (Commander zuerst, dann
// Kategorien in Deck-Reihenfolge, Karten ohne Kategorie am Ende)
function d2cBuildItems(deck,dcs){
  const cats={};
  for(const dc of dcs){const c=(dc.category||'').trim();if(c)cats[c]=true;}
  const order=orderedDeckCategories(deck,cats);
  const rank=c=>{
    if(!c)return 9999;
    if(c.toLowerCase()==='commander')return -1;
    const i=order.indexOf(c);return i<0?9998:i;
  };
  const sorted=[...dcs].sort((a,b)=>rank((a.category||'').trim())-rank((b.category||'').trim()));
  const byName=new Map();
  for(const dc of sorted){
    const name=dc.card_name||resolveDeckCard(dc).name;
    if(!name||name==='Unbekannt')continue;
    if(d2cIsBasicLand(name,dc.type_line))continue;
    const k=name.toLowerCase().trim();
    if(!byName.has(k))byName.set(k,{name,qty:0,scryfallId:dc.scryfall_id||null,dcIds:[]});
    const it=byName.get(k);
    it.qty+=parseInt(dc.quantity,10)||1;
    it.dcIds.push(dc.id);
  }
  return [...byName.values()];
}

// ── Druckungen laden (mit Cache + Vorladen der nächsten Karte) ──
// Über /cards/named + prints_search_uri statt einer !"Name"-Suche, damit
// auch Namen mit Anführungszeichen (Kongming, "Sleeping Dragon") klappen.
function d2cLoadPrints(name){
  const k=name.toLowerCase();
  if(!d2c.prints.has(k)){
    d2c.prints.set(k,(async()=>{
      const r1=await fetch('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name));
      if(!r1.ok)throw new Error('not-found');
      const card=await r1.json();
      let url=card.prints_search_uri,list=[],pages=0;
      while(url&&pages<4){
        await d2cSleep(100);   // Scryfall bittet um ~10 Anfragen/Sekunde
        const r=await fetch(url);
        if(!r.ok)break;
        const data=await r.json();
        list.push(...(data.data||[]));
        url=data.has_more?data.next_page:null;pages++;
      }
      const playable=list.filter(p=>typeof isPlayablePrint!=='function'||isPlayablePrint(p));
      // Neueste zuerst — meist die gesuchte; die Import-Druckung wird ohnehin vorausgewählt
      return (playable.length?playable:list).sort((a,b)=>(b.released_at||'').localeCompare(a.released_at||''));
    })());
    d2c.prints.get(k).catch(()=>d2c.prints.delete(k));   // Fehler nicht cachen
  }
  return d2c.prints.get(k);
}

const d2cFoilAvail=c=>{const f=c.finishes||[];return f.includes('foil')||f.includes('etched');};
const d2cNonfoilAvail=c=>{const f=c.finishes||[];return f.length?f.includes('nonfoil'):true;};
const d2cImg=c=>(c.image_uris&&c.image_uris.small)||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.small)||'';
const d2cImgNormal=c=>(c.image_uris&&c.image_uris.normal)||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.normal)||d2cImg(c);
function d2cPrice(c,foil){
  const p=c.prices||{};
  const v=foil?(p.eur_foil||p.eur):(p.eur||p.eur_foil);
  return v?parseFloat(v):null;
}

// ── Oberfläche ──
(function injectDeckToCollection(){
  if(document.getElementById('d2cModal'))return;
  const css=[
    '#d2cModal .modal{max-width:620px;width:100%;}',
    '.d2c-head{display:flex;justify-content:space-between;align-items:baseline;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.4rem;}',
    '.d2c-name{font-family:\'EB Garamond\',serif;font-size:1.15rem;color:var(--text);}',
    '.d2c-step{color:var(--text3);font-size:0.8rem;white-space:nowrap;}',
    '.d2c-owned{color:var(--green);font-size:0.82rem;}',
    '.d2c-bar{height:3px;background:var(--surface3);border-radius:2px;margin-bottom:0.8rem;overflow:hidden;}',
    '.d2c-bar>div{height:100%;background:var(--gold);transition:width 0.2s;}',
    '#d2cPrints{max-height:32vh;margin-top:0;}',
    '.d2c-detail{display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.9rem;}',
    '.d2c-detail img{width:110px;border-radius:7px;align-self:flex-start;box-shadow:0 6px 18px rgba(0,0,0,0.5);}',
    '.d2c-controls{flex:1;min-width:220px;}',
    '.d2c-controls .form-field{margin-bottom:0.55rem;}',
    '.d2c-row2{display:flex;gap:0.5rem;}.d2c-row2 .form-field{flex:1;min-width:0;}',
    '.d2c-nav{display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem;}',
    '.d2c-nav .btn-primary{flex:1;min-width:170px;}',
    '@media(max-width:480px){.d2c-detail img{width:90px;}}'
  ].join('\n');
  const st=document.createElement('style');st.id='d2c-styles';st.textContent=css;document.head.appendChild(st);
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="d2cModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)" id="d2cTitle">IN SAMMLUNG ÜBERNEHMEN</span>
      <button class="modal-close" onclick="finishDeckToCollection()">✕</button>
    </div>
    <div class="modal-detail" id="d2cBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

async function openDeckToCollection(deckId){
  if(!currentUser){toastError('Bitte zuerst anmelden.');return;}
  const deck=allDecks.find(d=>d.id===deckId);
  if(!deck)return;
  const dcs=(deckId===activeDeckId&&currentDeckCards.length)?currentDeckCards:await loadDeckCards(deckId);
  const items=d2cBuildItems(deck,dcs);
  if(!items.length){toastInfo('Keine Karten zum Übernehmen (Standardländer werden übersprungen).');return;}
  d2c={deckId,items,idx:0,added:0,addedCards:0,skipped:0,prints:new Map(),sel:null,priceTouched:false};
  document.getElementById('d2cTitle').textContent='IN SAMMLUNG ÜBERNEHMEN · '+deck.name.toUpperCase();
  document.getElementById('d2cModal').classList.add('open');
  d2cShow();
}

async function d2cShow(){
  const body=document.getElementById('d2cBody');
  const it=d2c.items[d2c.idx];
  const total=d2c.items.length;
  const owned=buildOwnedNameMap().get(it.name.toLowerCase().trim())||0;
  d2c.sel=null;d2c.priceTouched=false;
  body.innerHTML=`
    <div class="d2c-head">
      <span class="d2c-name">${esc(it.name)}</span>
      <span class="d2c-step">Karte ${d2c.idx+1} von ${total} · im Deck ${it.qty}×</span>
    </div>
    ${owned?`<div class="d2c-owned">✓ besitzt du schon ${owned}× – übernehmen erhöht die Menge</div>`:''}
    <div class="d2c-bar"><div style="width:${(d2c.idx/total*100).toFixed(1)}%"></div></div>
    <div class="acs-printings" id="d2cPrints"><div class="acs-msg">Lade Versionen…</div></div>
    <div class="d2c-detail" id="d2cDetail" style="display:none">
      <img id="d2cImg" alt="">
      <div class="d2c-controls">
        <div class="d2c-row2">
          <div class="form-field"><label>ANZAHL</label><input type="number" id="d2cQty" min="1" max="999" value="${it.qty}"></div>
          <div class="form-field"><label>AUSFÜHRUNG</label><select id="d2cFoil" onchange="d2cUpdatePrice()"></select></div>
        </div>
        <div class="d2c-row2">
          <div class="form-field"><label>ZUSTAND</label><select id="d2cCond">
            <option value="near_mint">Near Mint</option><option value="lightly_played">Lightly Played</option>
            <option value="moderately_played">Moderately Played</option><option value="heavily_played">Heavily Played</option>
            <option value="damaged">Damaged</option></select></div>
          <div class="form-field"><label>SPRACHE</label><select id="d2cLang">
            <option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option>
            <option value="it">Italiano</option><option value="es">Español</option><option value="pt">Português</option>
            <option value="ja">日本語</option><option value="ko">한국어</option><option value="ru">Русский</option>
            <option value="zhs">中文 (简)</option><option value="zht">中文 (繁)</option></select></div>
        </div>
        <div class="form-field"><label>KAUFPREIS (€) <span style="color:var(--text3);font-size:0.7rem;letter-spacing:0">vorbelegt mit aktuellem Preis</span></label>
          <input id="d2cPrice" inputmode="decimal" autocomplete="off" oninput="d2c.priceTouched=true"></div>
      </div>
    </div>
    <div class="d2c-nav">
      <button class="btn btn-primary" type="button" id="d2cAddBtn" onclick="d2cAdd()" disabled>Übernehmen & weiter</button>
      <button class="btn" type="button" onclick="d2cSkip()">Überspringen</button>
      ${d2c.idx>0?'<button class="btn" type="button" onclick="d2cBack()">← Zurück</button>':''}
      <button class="btn" type="button" onclick="finishDeckToCollection()">Beenden</button>
    </div>`;

  const showIdx=d2c.idx;
  let prints;
  try{prints=await d2cLoadPrints(it.name);}
  catch(e){
    if(d2c.idx!==showIdx)return;
    document.getElementById('d2cPrints').innerHTML='<div class="acs-msg">Karte bei Scryfall nicht gefunden – bitte überspringen.</div>';
    return;
  }
  if(d2c.idx!==showIdx||!document.getElementById('d2cPrints'))return;   // inzwischen weitergeblättert
  d2cRenderPrints(prints,it);
  // Nächste Karte im Hintergrund vorladen
  const next=d2c.items[d2c.idx+1];
  if(next)d2cLoadPrints(next.name).catch(()=>{});
}

function d2cRenderPrints(prints,it){
  const box=document.getElementById('d2cPrints');
  if(!prints.length){box.innerHTML='<div class="acs-msg">Keine Versionen gefunden.</div>';return;}
  box.innerHTML=prints.map((c,i)=>{
    const eur=c.prices&&c.prices.eur?'€'+c.prices.eur:(c.prices&&c.prices.eur_foil?'€'+c.prices.eur_foil+' (Foil)':'–');
    return`<div class="acs-print-row" data-i="${i}" onclick="d2cSelect(${i})">
      <img class="acs-thumb" loading="lazy" alt="" src="${esc(d2cImg(c))}">
      <div class="acs-print-info">
        <div class="acs-print-name">${esc(c.set_name||'')}</div>
        <div class="acs-print-meta">${esc((c.set||'').toUpperCase())} · #${esc(c.collector_number||'?')} · ${esc(c.released_at||'')}</div>
      </div>
      <div class="acs-print-price">${eur}</div>
    </div>`;
  }).join('');
  d2c.currentPrints=prints;
  const pre=d2cDefaultIndex(prints,it.scryfallId);
  d2cSelect(pre);
  const row=box.querySelector(`.acs-print-row[data-i="${pre}"]`);
  if(row)row.scrollIntoView({block:'nearest'});
}

// Vorauswahl: die Druckung der Deck-Zeile; sonst die neueste „normale"
// (nicht Promo, nicht Showcase/Borderless/Full-Art, als Normal erhältlich) —
// sonst stünde oft eine teure Secret-Lair-Foil oben.
function d2cDefaultIndex(prints,scryfallId){
  const exact=prints.findIndex(p=>p.id===scryfallId);
  if(exact>=0)return exact;
  const plain=prints.findIndex(p=>!p.promo&&!p.full_art&&p.border_color!=='borderless'
    &&!(p.frame_effects||[]).some(f=>['showcase','extendedart','etched','inverted'].includes(f))
    &&d2cNonfoilAvail(p)&&p.prices&&p.prices.eur);
  return plain>=0?plain:0;
}

function d2cSelect(i){
  const c=d2c.currentPrints[i];
  if(!c)return;
  d2c.sel=c;
  document.querySelectorAll('#d2cPrints .acs-print-row').forEach(r=>r.classList.toggle('selected',r.dataset.i===String(i)));
  document.getElementById('d2cImg').src=d2cImgNormal(c);
  const foilSel=document.getElementById('d2cFoil');
  const prev=foilSel.value;
  foilSel.innerHTML='';
  if(d2cNonfoilAvail(c))foilSel.add(new Option('Normal','normal'));
  if(d2cFoilAvail(c))foilSel.add(new Option('Foil','foil'));
  if([...foilSel.options].some(o=>o.value===prev))foilSel.value=prev;
  const langSel=document.getElementById('d2cLang');
  if(c.lang&&[...langSel.options].some(o=>o.value===c.lang))langSel.value=c.lang;
  d2c.priceTouched=false;   // neue Version → Preis neu vorbelegen
  d2cUpdatePrice();
  document.getElementById('d2cDetail').style.display='flex';
  document.getElementById('d2cAddBtn').disabled=false;
}

// Kaufpreis = aktueller Preis der gewählten Version + Ausführung (solange nicht selbst geändert)
function d2cUpdatePrice(){
  if(!d2c.sel||d2c.priceTouched)return;
  const p=d2cPrice(d2c.sel,document.getElementById('d2cFoil').value==='foil');
  document.getElementById('d2cPrice').value=p!=null?p.toFixed(2):'';
}

async function d2cAdd(){
  const c=d2c.sel;
  if(!c)return;
  const it=d2c.items[d2c.idx];
  const qty=Math.max(1,parseInt(document.getElementById('d2cQty').value,10)||1);
  const isFoil=document.getElementById('d2cFoil').value==='foil';
  const priceRaw=document.getElementById('d2cPrice').value.trim();
  if(priceRaw!==''&&!(parsePrice(priceRaw)>0)){toastError('Bitte einen Preis wie 2,50 eingeben.');return;}
  const newCard={
    id:crypto.randomUUID(),
    user_id:currentUser.id,
    name:c.name,
    set_code:(c.set||'').toUpperCase(),
    set_name:c.set_name||'',
    collector_number:c.collector_number||'',
    foil:isFoil?'foil':'normal',
    rarity:(c.rarity||'').toLowerCase(),
    quantity:qty,
    manabox_id:'',
    scryfall_id:c.id,
    purchase_price:normalizePrice(priceRaw),
    currency:'EUR',
    misprint:false,
    altered:false,
    condition:document.getElementById('d2cCond').value,
    language:document.getElementById('d2cLang').value,
    mana_value:(c.cmc!=null)?Math.floor(c.cmc):null,
    colors:c.colors||[],
    type_line:c.type_line||null,
    color_identity:c.color_identity||[],
    legal_commander:(c.legalities&&c.legalities.commander)||null
  };
  const btn=document.getElementById('d2cAddBtn');
  setBusy(btn,true,'Speichere…');
  const existing=allCards.find(x=>dedupKey(x)===dedupKey(newCard));
  const row=existing?{...existing,quantity:(existing.quantity||0)+qty}:newCard;
  const ok=await upsertCards([row]);
  if(!ok){setBusy(btn,false);return;}   // upsertCards meldet den Fehler
  if(existing)Object.assign(existing,row);else allCards.push(newCard);
  // Deck-Zeilen auf die gewählte Version setzen (kosmetisch: Deck zeigt genau diese)
  if(it.scryfallId!==c.id){
    await _sb.from('deck_cards').update({
      scryfall_id:c.id,set_code:newCard.set_code,set_name:newCard.set_name,collector_number:newCard.collector_number
    }).in('id',it.dcIds);
    it.scryfallId=c.id;
  }
  d2c.added++;d2c.addedCards+=qty;
  d2cNext();
}

function d2cSkip(){d2c.skipped++;d2cNext();}
function d2cBack(){if(d2c.idx>0){d2c.idx--;d2cShow();}}
function d2cNext(){
  if(d2c.idx+1>=d2c.items.length){finishDeckToCollection();return;}
  d2c.idx++;d2cShow();
}

async function finishDeckToCollection(){
  const modal=document.getElementById('d2cModal');
  if(!modal.classList.contains('open'))return;
  closeModal('d2cModal');
  if(d2c.added){
    toastSuccess(`${d2c.added} Karte${d2c.added===1?'':'n'} übernommen (${d2c.addedCards} Stück)${d2c.skipped?`, ${d2c.skipped} übersprungen`:''}`);
    await loadAll();
    if(d2c.deckId&&activeDeckId===d2c.deckId){
      currentDeckCards=await loadDeckCards(d2c.deckId);
      const deck=allDecks.find(d=>d.id===d2c.deckId);
      if(deck)renderDeckDetail(deck);
    }
  }
}
