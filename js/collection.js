// ══════════════════════════════════════════════════════════
//  COLLECTION  ·  Sammlung-Anzeige (Filter, Grid, Liste, Karten-Modal)
// ══════════════════════════════════════════════════════════
//
//  Karten werden nach Namen gruppiert dargestellt:
//  - Eine "Group" = alle Varianten einer Karte (z.B. 5× Lightning Bolt
//    aus verschiedenen Sets/Zuständen/Sprachen).
//  - In der Übersicht zeigen wir pro Group EINE Kachel/Zeile.
//  - Beim Klick öffnet das Modal die Liste aller Varianten dieser Karte.
//  - "Anzahl" in der Übersicht = Summe der quantity über alle Varianten.

function populateSets(){
  const sel=document.getElementById('filterSet');const cur=sel.value;
  const sets=[...new Map(allCards.map(c=>[c.set_code,c.set_name||c.set_code])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  sel.innerHTML='<option value="">Alle Sets</option>'+sets.map(([code,name])=>`<option value="${code}">${name} (${code})</option>`).join('');
  sel.value=cur;
}

// Aktuell gefilterte Groups (jede Group hat: name, cards[], representative, totalQty, totalValue)
let filteredGroups = [];

// Hilfsfunktion: Gruppiert eine Liste von Karten nach Namen.
// Rückgabe: Array von { name, cards, representative, totalQty, totalValue }
//   - representative: die Variante, deren Bild/Daten in der Übersicht gezeigt wird
//   - bestimmt durch: ÄLTESTE Edition (Default), oder PASSENDE Variante wenn Set-Filter aktiv
function buildGroups(cards, activeSetFilter){
  const byName={};
  for(const c of cards){
    const key=(c.name||'').toLowerCase();
    if(!byName[key])byName[key]=[];
    byName[key].push(c);
  }

  const groups=[];
  for(const key in byName){
    const variants=byName[key];

    // Repräsentative Variante wählen
    let representative;
    if(activeSetFilter){
      // Set-Filter aktiv: bevorzuge eine Variante aus genau diesem Set
      representative=variants.find(v=>v.set_code===activeSetFilter)||variants[0];
    }else{
      // Default: älteste Edition (über setReleasedAt aus sets.js)
      representative=[...variants].sort((a,b)=>{
        const da=setReleasedAt(a.set_code);
        const db=setReleasedAt(b.set_code);
        // Karten mit unbekanntem Datum ans Ende
        if(!da&&!db)return(a.set_code||'').localeCompare(b.set_code||'');
        if(!da)return 1;
        if(!db)return -1;
        return da.localeCompare(db); // ältestes Datum zuerst
      })[0];
    }

    const totalQty=variants.reduce((s,v)=>s+(v.quantity||1),0);
    const totalValue=variants.reduce((s,v)=>s+((parseFloat(v.purchase_price)||0)*(v.quantity||1)),0);

    groups.push({
      name:representative.name,
      cards:variants,
      representative,
      totalQty,
      totalValue
    });
  }
  return groups.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
}

function applyFilters(){
  const q=document.getElementById('searchInput').value.toLowerCase();
  const rar=document.getElementById('filterRarity').value;
  const foil=document.getElementById('filterFoil').value;
  const set=document.getElementById('filterSet').value;
  const cond=document.getElementById('filterCondition').value;
  const type=document.getElementById('filterType').value;

  // Manawert-Filter: Set aus aktiven Pills (Strings: '0','1','2','3','4','5+')
  const manaActive=new Set();
  document.querySelectorAll('.filter-pill[data-mv].active').forEach(b=>manaActive.add(b.dataset.mv));

  // Farb-Filter: Set aus aktiven Mana-Pills (W,U,B,R,G,C)
  const colorActive=new Set();
  document.querySelectorAll('.mana-pill.active').forEach(b=>colorActive.add(b.dataset.color));

  // Filter werden auf VARIANTEN angewendet:
  // Eine Group bleibt sichtbar, wenn MINDESTENS EINE ihrer Varianten den Filter erfüllt.
  // Erst die Karten filtern, dann gruppieren.
  const matchingCards=allCards.filter(c=>{
    if(q&&!c.name.toLowerCase().includes(q)&&!(c.set_name||'').toLowerCase().includes(q))return false;
    if(rar&&c.rarity!==rar)return false;
    if(foil==='foil'&&c.foil!=='foil')return false;
    if(foil==='normal'&&c.foil==='foil')return false;
    if(set&&c.set_code!==set)return false;
    if(cond&&!(c.condition||'').includes(cond.split('_')[0]))return false;

    // Typ-Filter (z.B. "creature" matched type_line = "Creature — Human Wizard")
    if(type){
      const tl=(c.type_line||'').toLowerCase();
      if(!tl.includes(type))return false;
    }

    // Manawert-Filter
    if(manaActive.size){
      if(c.mana_value==null)return false;
      const mv=c.mana_value;
      let hit=false;
      for(const v of manaActive){
        if(v==='5+'){if(mv>=5){hit=true;break;}}
        else if(mv===parseInt(v,10)){hit=true;break;}
      }
      if(!hit)return false;
    }

    // Farb-Filter (Logik: "enthält mindestens diese Farben")
    // Sonderfall Farblos (C): nur erfüllt, wenn die Karte tatsächlich keine Farbe hat
    if(colorActive.size){
      const cardColors=Array.isArray(c.colors)?c.colors:[];
      if(colorActive.has('C')){
        // Farblos-Filter: nur Karten mit colors=[] zählen.
        // (Farblos und andere Farben gleichzeitig sind in der UI gegenseitig ausgeschlossen,
        //  daher reicht hier die simple Prüfung.)
        if(cardColors.length>0)return false;
      }else{
        // Reguläre Farben: alle ausgewählten müssen in der Karte enthalten sein
        for(const col of colorActive){
          if(!cardColors.includes(col))return false;
        }
      }
    }

    return true;
  });

  filteredGroups=buildGroups(matchingCards,set);

  // Stats-Bar: Einträge (= unique Namen), Karten (= Summe), Gesamtwert (in €)
  const totalEntries=filteredGroups.length;
  const totalCards=filteredGroups.reduce((s,g)=>s+g.totalQty,0);
  const totalValue=filteredGroups.reduce((s,g)=>s+g.totalValue,0);

  // Vergleich zur Gesamt-Sammlung (nur anzeigen wenn gefiltert)
  const allGroups=buildGroups(allCards);
  const isFiltered=totalEntries!==allGroups.length||totalCards!==allCards.reduce((s,c)=>s+(c.quantity||1),0);

  document.getElementById('statsBar').innerHTML=
    `<span>${totalEntries} <strong>Einträge</strong></span>`+
    `<span>${totalCards} <strong>Karten</strong></span>`+
    `<span>${totalValue.toFixed(2)} € <strong>Gesamtwert</strong></span>`+
    (isFiltered?`<span style="color:var(--purple)">(von ${allGroups.length} Einträgen)</span>`:'');

  // Indikator am Filter-Toggle: Anzahl aktiver Filter
  updateFilterToggleBadge();

  renderCards();
}

// ── Filter-UI Helpers (aufrufbar aus dem HTML) ──

function toggleManaPill(btn){btn.classList.toggle('active');applyFilters();}
function clearManaPills(){
  document.querySelectorAll('.filter-pill[data-mv].active').forEach(b=>b.classList.remove('active'));
  applyFilters();
}

// Toggle Farb-Pill mit Sonderlogik:
// "Farblos" (C) und reguläre Farben sind gegenseitig ausgeschlossen,
// damit die Filter-Semantik klar bleibt (nicht "weiße Karten ODER farblose").
function toggleColorPill(btn){
  const isColorless=btn.dataset.color==='C';
  btn.classList.toggle('active');
  if(btn.classList.contains('active')){
    document.querySelectorAll('.mana-pill').forEach(o=>{
      if(o===btn)return;
      const otherIsColorless=o.dataset.color==='C';
      if(isColorless!==otherIsColorless)o.classList.remove('active');
    });
  }
  // Hinweis-Text dynamisch: "ist farblos" wenn ◇ aktiv, sonst "enthält mindestens"
  const hint=document.getElementById('colorFilterHint');
  if(hint){
    const colorlessActive=document.querySelector('.mana-pill[data-color="C"]')?.classList.contains('active');
    hint.textContent=colorlessActive?'ist farblos':'enthält mindestens';
  }
  applyFilters();
}
function clearColorPills(){
  document.querySelectorAll('.mana-pill.active').forEach(b=>b.classList.remove('active'));
  const hint=document.getElementById('colorFilterHint');
  if(hint)hint.textContent='enthält mindestens';
  applyFilters();
}

// Mobile: Filter-Bereich ein-/ausklappen
function toggleAdvancedFilters(){
  const adv=document.getElementById('filterAdvanced');
  const btn=document.getElementById('filterToggleBtn');
  adv.classList.toggle('open');
  btn.classList.toggle('open');
}

// Badge am Filter-Button: Anzahl aktiver Filter (für mobile sichtbar)
function updateFilterToggleBadge(){
  let count=0;
  if(document.getElementById('filterRarity').value)count++;
  if(document.getElementById('filterFoil').value)count++;
  if(document.getElementById('filterSet').value)count++;
  if(document.getElementById('filterCondition').value)count++;
  if(document.getElementById('filterType').value)count++;
  count+=document.querySelectorAll('.filter-pill[data-mv].active').length>0?1:0;
  count+=document.querySelectorAll('.mana-pill.active').length>0?1:0;
  const btn=document.getElementById('filterToggleBtn');
  if(!btn)return;
  btn.classList.toggle('has-active',count>0);
  btn.dataset.count=count||'';
}

function renderCards(){
  const container=document.getElementById('cardContainer');
  if(!filteredGroups.length){container.innerHTML='<div style="text-align:center;padding:4rem;color:var(--text2)">Keine Karten gefunden.</div>';return;}
  if(viewMode==='grid'){
    container.innerHTML='<div class="card-grid">'+filteredGroups.map(g=>gridHTML(g)).join('')+'</div>';
    container.querySelectorAll('[data-src]').forEach(el=>{
      const img=new Image();
      img.onload=()=>{el.src=el.dataset.src;el.removeAttribute('data-src');};
      img.src=el.dataset.src;
    });
  }else{
    container.innerHTML='<div class="card-list"><div class="list-header"><span>NAME</span><span>SET</span><span>SELTENHEIT</span><span>VARIANTEN</span><span>FOIL</span><span>QTY</span><span>WERT</span><span>SPRACHE</span><span></span></div>'+filteredGroups.map(g=>listHTML(g)).join('')+'</div>';
  }
}


// ── HTML-Templates: jetzt für eine GROUP statt für eine einzelne Karte ──
function gridHTML(g){
  const c=g.representative;
  const img=iUrl(c);const r=rc(c.rarity);
  // Badges: zeigen zusammengefasste Eigenschaften der Group
  const hasFoil=g.cards.some(v=>v.foil==='foil');
  const hasMisprint=g.cards.some(v=>v.misprint);
  const hasAltered=g.cards.some(v=>v.altered);
  const badges=[
    hasFoil?'<span class="badge badge-foil">✦ FOIL</span>':'',
    hasMisprint?'<span class="badge badge-misprint">⚠ MISPRINT</span>':'',
    hasAltered?'<span class="badge badge-altered">✎ ALTERED</span>':''
  ].filter(Boolean).join('');
  return`<div class="card-item" onclick="openCardModal('${escJs(g.name)}')">
    <div class="img-wrap">
      ${img?`<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-src="${img}" alt="${esc(c.name)}">`:`<div class="img-placeholder">🃏<span>${esc(c.name)}</span></div>`}
      ${g.totalQty>1?`<span class="qty-badge">×${g.totalQty}</span>`:''}
    </div>
    <div class="rarity-bar ${r}"></div>
    <div class="card-meta">
      <div class="card-name" title="${esc(c.name)}">${esc(c.name)}</div>
      <div class="card-sub"><span>${esc(c.set_code)}${g.cards.length>1?` <em style="color:var(--text3);font-style:normal">+${g.cards.length-1}</em>`:''}</span><div style="display:flex;gap:3px;flex-wrap:wrap">${badges}</div></div>
    </div>
  </div>`;
}

function listHTML(g){
  const c=g.representative;
  const r=rc(c.rarity);
  const price=g.totalValue>0?`${g.totalValue.toFixed(2)} ${c.currency||'€'}`:'–';
  // Bei Liste: Varianten-Spalte zeigt die Anzahl unterschiedlicher Versionen
  const variantsLabel=g.cards.length>1?`<strong>${g.cards.length}</strong> Varianten`:'1 Variante';
  const hasFoil=g.cards.some(v=>v.foil==='foil');
  // Sprachen kompakt zusammenfassen
  const languages=[...new Set(g.cards.map(v=>v.language).filter(Boolean))];
  const langLabel=languages.length===0?'–':languages.length===1?languages[0]:languages.length+' Sprachen';
  return`<div class="list-row" onclick="openCardModal('${escJs(g.name)}')">
    <span class="name-col"><span class="rarity-dot ${r}" style="margin-right:5px"></span>${esc(c.name)}</span>
    <span class="col">${esc(c.set_name||c.set_code)}${g.cards.length>1?' …':''}</span>
    <span class="col" style="text-transform:capitalize">${esc(c.rarity)}</span>
    <span class="col">${variantsLabel}</span>
    <span class="col">${hasFoil?'✦':'–'}</span>
    <span class="col">×${g.totalQty}</span>
    <span class="col">${price}</span>
    <span class="col">${esc(langLabel)}</span>
    <div class="list-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="openCardModal('${escJs(g.name)}')">👁</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════
//  CARD MODAL  ·  Zeigt jetzt ALLE Varianten einer Karte
// ══════════════════════════════════════════════════════════
//
//  Das Modal nimmt jetzt einen NAMEN entgegen (nicht mehr eine ID).
//  Es zeigt links die repräsentative Karte (älteste Edition oder
//  gefilterte Variante) und rechts eine Liste aller Varianten mit
//  ihren individuellen Eigenschaften (Set, Zustand, Foil, Sprache, Preis).
//  Bearbeiten und Löschen geht jetzt PRO Variante.
// openCardModal kann in zwei Kontexten aufgerufen werden:
// - Sammlung (deckContextDcIds=null): zeigt "Zu Deck hinzufügen"-Block
// - Deck-Detail (deckContextDcIds='dc1,dc2,...'): zeigt stattdessen
//   "📂 Verschieben" + "🗑 Aus Deck entfernen" Buttons, die auf die übergebenen
//   Deck-Card-Einträge wirken. Variantentabelle bleibt informativ sichtbar.
function openCardModal(name,deckContextDcIds){
  const variants=allCards.filter(c=>(c.name||'').toLowerCase()===(name||'').toLowerCase());
  if(!variants.length)return;
  // Deck-Kontext im State merken — wird von den Buttons abgegriffen
  cardModalDeckContext=deckContextDcIds?deckContextDcIds.split(','):null;

  // Repräsentative Variante: berücksichtigt aktuell aktiven Set-Filter
  const activeSet=document.getElementById('filterSet').value;
  let representative;
  if(activeSet){
    representative=variants.find(v=>v.set_code===activeSet)||variants[0];
  }else{
    representative=[...variants].sort((a,b)=>{
      const da=setReleasedAt(a.set_code);
      const db=setReleasedAt(b.set_code);
      if(!da&&!db)return(a.set_code||'').localeCompare(b.set_code||'');
      if(!da)return 1;
      if(!db)return -1;
      return da.localeCompare(db);
    })[0];
  }

  editingCardId=representative.id;
  const c=representative;
  const img=iUrl(c);const r=rc(c.rarity);
  const totalQty=variants.reduce((s,v)=>s+(v.quantity||1),0);
  const totalValue=variants.reduce((s,v)=>s+((parseFloat(v.purchase_price)||0)*(v.quantity||1)),0);
  const decksOptions=allDecks.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');

  // Deck-Kontext: berechnen, wie viele Karten dieser Gruppe im Deck sind
  // und welche Sammlungs-Varianten konkret dort verwendet werden.
  // cardModalDeckContext enthält die dc-IDs der angeklickten Gruppe (z.B. alle
  // dc-Einträge "Mountain" in Kategorie "Lands"). Aus diesen können wir die
  // tatsächlich im Deck verwendeten Varianten ableiten.
  let deckTotalQty=0;
  const variantsInDeck=new Map();  // card.id (=variant.id) → quantity im Deck
  if(cardModalDeckContext&&cardModalDeckContext.length){
    for(const dcId of cardModalDeckContext){
      const dc=currentDeckCards.find(d=>d.id===dcId);
      if(!dc)continue;
      const q=parseInt(dc.quantity,10)||1;
      deckTotalQty+=q;
      variantsInDeck.set(dc.card_id,(variantsInDeck.get(dc.card_id)||0)+q);
    }
  }

  // Tabelle aller Varianten — auch bei nur 1 Variante zeigen wir die Tabelle,
  // damit Bearbeiten und Löschen direkt zugänglich sind ohne Umweg über das
  // Detail-Grid.
  // Im Deck-Kontext bekommen Zeilen, deren Variante im aktiven Deck genutzt wird,
  // einen visuellen Marker "im Deck" — sonst sind sie ausgegraut/normal.
  // Aktions-Buttons sind kontextabhängig:
  //   Sammlungs-Kontext        → [+ Deck] [✎] [🗑]   (Deck-Add + Sammlungs-Bearbeiten/Löschen)
  //   Deck-Kontext, im Deck    → [−1] [+1] [🗑 Deck]  (Anzahl ändern + ganze Variante raus)
  //   Deck-Kontext, nicht drin → [+ Deck]              (Variante zum Deck hinzufügen)
  const rows=variants.map(v=>{
    const vPrice=v.purchase_price?`${parseFloat(v.purchase_price).toFixed(2)} ${v.currency||'€'}`:'–';
    const inDeckQty=variantsInDeck.get(v.id)||0;
    const inDeckMarker=cardModalDeckContext
      ?(inDeckQty>0
        ?`<span class="variant-in-deck" title="Diese Variante ist im Deck">✓ im Deck ×${inDeckQty}</span>`
        :`<span class="variant-not-in-deck" title="Diese Variante ist nur in der Sammlung">— nur Sammlung</span>`)
      :'';

    let actionButtons='';
    if(cardModalDeckContext){
      // Deck-Kontext
      if(inDeckQty>0){
        // −1 reduziert Anzahl um 1; bei Quantity=1 wird die Variante komplett entfernt.
        // +1 erhöht die Anzahl um 1.
        // 🗑 Deck nur sichtbar wenn >1, weil bei =1 das −1 dasselbe macht.
        actionButtons=`
          <button class="icon-btn deck-minus-btn" onclick="event.stopPropagation();decrementVariantInDeck('${v.id}')" title="Eine Karte dieser Variante aus dem Deck entfernen">−1</button>
          <button class="icon-btn deck-plus-btn" onclick="event.stopPropagation();incrementVariantInDeck('${v.id}')" title="Eine weitere Karte dieser Variante zum Deck hinzufügen">+1</button>
          ${inDeckQty>1?`<button class="icon-btn danger" onclick="event.stopPropagation();removeVariantFromDeck('${v.id}')" title="Alle ${inDeckQty} Karten dieser Variante aus dem Deck entfernen">🗑 Deck</button>`:''}
        `;
      }else if(allDecks.length>0){
        // Variante nicht im Deck → kann hinzugefügt werden
        actionButtons=`<button class="icon-btn deck-add-btn" onclick="event.stopPropagation();openAddVariantToDeckModal('${v.id}')" title="Diese Variante zum Deck hinzufügen">+ Deck</button>`;
      }
    }else{
      // Sammlungs-Kontext: + Deck (falls Decks da) + Sammlung-Bearbeiten/Löschen
      if(allDecks.length>0){
        actionButtons+=`<button class="icon-btn deck-add-btn" onclick="event.stopPropagation();openAddVariantToDeckModal('${v.id}')" title="Diese Variante zu einem Deck hinzufügen">+ Deck</button>`;
      }
      actionButtons+=`
        <button class="icon-btn" onclick="event.stopPropagation();openVariantEdit('${v.id}')" title="Variante in Sammlung bearbeiten">✎</button>
        <button class="icon-btn danger" onclick="event.stopPropagation();deleteCard('${v.id}')" title="Variante aus Sammlung löschen">🗑</button>
      `;
    }

    return`<div class="variant-row${cardModalDeckContext&&inDeckQty>0?' is-in-deck':''}">
      <div class="variant-set">
        <strong>${esc(v.set_name||v.set_code)}</strong>
        <span class="variant-meta">${esc(v.set_code)}${v.collector_number?' #'+esc(v.collector_number):''}${v.foil==='foil'?' · ✦ Foil':''}${v.language?' · '+esc(v.language):''}</span>
      </div>
      ${inDeckMarker}
      <span class="condition-badge ${cc(v.condition)}">${cl(v.condition)}</span>
      <span class="variant-qty">×${v.quantity}</span>
      <span class="variant-price">${vPrice}</span>
      ${actionButtons}
    </div>`;
  }).join('');

  // Summary-Zeile über der Tabelle: im Deck-Kontext zwei Zeilen (Deck + Sammlung).
  // In Sammlungs-Kontext nur eine (Sammlung).
  const summaryHTML=cardModalDeckContext
    ?`<div class="variants-summary deck-context-summary">
        <span class="summary-row primary">
          <strong>Im aktiven Deck:</strong>
          <span><strong>${deckTotalQty}</strong> Karten</span>
          <span><strong>${cardModalDeckContext.length}</strong> ${cardModalDeckContext.length===1?'Variante':'Varianten'}</span>
        </span>
        <span class="summary-row secondary">
          <strong>In Sammlung:</strong>
          <span>${totalQty} Karten</span>
          <span>${variants.length} ${variants.length===1?'Variante':'Varianten'}</span>
          ${totalValue>0?`<span>${totalValue.toFixed(2)} € Gesamtwert</span>`:''}
        </span>
      </div>`
    :`<div class="variants-summary">
        <span><strong>${variants.length}</strong> ${variants.length===1?'Variante':'Varianten'}</span>
        <span><strong>${totalQty}</strong> Karten gesamt</span>
        ${totalValue>0?`<span><strong>${totalValue.toFixed(2)} €</strong> Gesamtwert</span>`:''}
      </div>`;

  const variantsBlock=`
    ${summaryHTML}
    <div class="variants-list">${rows}</div>`;

  document.getElementById('modalInner').innerHTML=`
    <div class="modal-img-side">
      ${img?`<img src="${img}" alt="${esc(c.name)}">`:`<div class="modal-img-placeholder">🃏</div>`}
      ${c.scryfall_id?`<a href="https://scryfall.com/card/${(c.set_code||'').toLowerCase()}/${c.collector_number}" target="_blank" style="font-size:0.72rem;color:var(--teal);text-decoration:none;margin-top:0.5rem">🔗 Scryfall</a>`:''}
    </div>
    <div class="modal-detail">
      <div class="modal-title">${esc(c.name)}</div>
      <div class="modal-set">${esc(c.set_name||c.set_code)}${variants.length>1?' (älteste Variante angezeigt)':''}</div>
      ${cardModalDeckContext?`<div class="modal-deck-badge">⚔️ ${deckTotalQty} im aktiven Deck</div>`:''}
      ${variantsBlock}

      ${cardModalDeckContext?`
      <div class="add-to-deck-section deck-actions-section">
        <h4>⚔️ AKTIONEN IM AKTIVEN DECK</h4>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="openMovePicker('${cardModalDeckContext.join(',')}')">📂 Verschieben</button>
          <button class="btn btn-danger" onclick="removeFromDeckFromCardModal()">🗑 Aus Deck entfernen</button>
        </div>
        <div style="font-size:0.72rem;color:var(--text3);margin-top:0.5rem;font-style:italic">
          Wirkt nur auf die ${deckTotalQty} ${deckTotalQty===1?'Karte':'Karten'} im aktiven Deck. Die ${variants.length} ${variants.length===1?'Variante':'Varianten'} in deiner Sammlung bleiben unberührt.
        </div>
        ${allDecks.length>0?`<div style="font-size:0.72rem;color:var(--text3);margin-top:0.4rem;font-style:italic">Über den <strong>+ Deck</strong>-Button in der Variantentabelle kannst du weitere Druckungen zu einem Deck hinzufügen.</div>`:''}
      </div>
      `:(allDecks.length>0?`
      <div class="add-to-deck-hint">
        <span style="font-size:0.78rem;color:var(--text3);font-style:italic">Klicke <strong>+ Deck</strong> in der Variantentabelle, um eine Variante zu einem Deck hinzuzufügen.</span>
      </div>`:'<div style="font-size:0.85rem;color:var(--text3);font-style:italic;margin-bottom:0.75rem">Erstelle zuerst ein Deck im Decks-Reiter.</div>')}

      ${variants.length===1?`
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
      </details>`:''}
    </div>`;
  document.getElementById('cardModal').classList.add('open');
}

// Wird aus dem Karten-Modal aufgerufen, wenn der Benutzer im Deck-Kontext
// auf "Aus Deck entfernen" klickt. Ruft die bestehende Gruppen-Lösch-Funktion
// in decks.js auf und schließt das Modal danach.
async function removeFromDeckFromCardModal(){
  if(!cardModalDeckContext||!cardModalDeckContext.length)return;
  const csv=cardModalDeckContext.join(',');
  // Modal schließen, damit der confirmAction-Dialog davor liegt
  closeModal('cardModal');
  if(typeof removeDeckCardGroup==='function'){
    await removeDeckCardGroup(csv);
  }
  cardModalDeckContext=null;
}

// ── VARIANTE IM DECK BEARBEITEN ──
//
// Buttons "−1", "+1" und "🗑 Deck" pro Variantenzeile (im Deck-Kontext).
// Sie operieren auf der dc-row, deren card_id der Varianten-ID entspricht
// und die Teil von cardModalDeckContext ist (= zur geklickten Gruppe gehört).

// Hilfsfunktion: zur Variante die zugehörige dc-ID im Kontext finden
function findDcIdForVariant(variantId){
  if(!cardModalDeckContext||!cardModalDeckContext.length)return null;
  return cardModalDeckContext.find(id=>{
    const dc=currentDeckCards.find(d=>d.id===id);
    return dc&&dc.card_id===variantId;
  })||null;
}

// −1: eine Karte dieser Variante aus dem Deck entfernen.
// Wenn quantity dadurch auf 0 fällt, wird der dc-Eintrag komplett gelöscht.
async function decrementVariantInDeck(variantId){
  const dcId=findDcIdForVariant(variantId);
  if(!dcId)return;
  const dc=currentDeckCards.find(d=>d.id===dcId);
  if(!dc)return;

  const newQty=(parseInt(dc.quantity,10)||1)-1;
  if(newQty<=0){
    // Letzte Karte → Eintrag löschen
    if(!await removeDeckCardDB(dcId)){toastError('Konnte nicht entfernen');return;}
    currentDeckCards=currentDeckCards.filter(d=>d.id!==dcId);
    cardModalDeckContext=cardModalDeckContext.filter(id=>id!==dcId);
    toastSuccess('Letzte Karte dieser Variante aus dem Deck entfernt');
  }else{
    const{error}=await _sb.from('deck_cards').update({quantity:newQty}).eq('id',dcId);
    if(error){toastError('Fehler: '+error.message);return;}
    dc.quantity=newQty;
    toastSuccess(`Eine Karte entfernt (jetzt ${newQty}× im Deck)`);
  }
  await refreshAfterDeckEdit(variantId);
}

// +1: eine weitere Karte dieser Variante zum Deck hinzufügen.
// Funktioniert nur wenn die Variante schon im Deck ist (sonst ist es "+ Deck").
async function incrementVariantInDeck(variantId){
  const dcId=findDcIdForVariant(variantId);
  if(!dcId)return;
  const dc=currentDeckCards.find(d=>d.id===dcId);
  if(!dc)return;

  const newQty=(parseInt(dc.quantity,10)||1)+1;
  const{error}=await _sb.from('deck_cards').update({quantity:newQty}).eq('id',dcId);
  if(error){toastError('Fehler: '+error.message);return;}
  dc.quantity=newQty;
  toastSuccess(`Eine Karte hinzugefügt (jetzt ${newQty}× im Deck)`);
  await refreshAfterDeckEdit(variantId);
}

// 🗑 Deck: ganze Variante aus dem Deck entfernen (alle Kopien).
async function removeVariantFromDeck(variantId){
  const dcId=findDcIdForVariant(variantId);
  if(!dcId)return;
  const dc=currentDeckCards.find(d=>d.id===dcId);
  if(!dc)return;

  const ok=await confirmAction(
    `Alle ${dc.quantity} Karten dieser Variante aus dem Deck entfernen?`,
    {title:'VARIANTE ENTFERNEN',confirmLabel:'Entfernen',danger:true}
  );
  if(!ok)return;

  if(!await removeDeckCardDB(dcId)){toastError('Konnte nicht entfernen');return;}
  currentDeckCards=currentDeckCards.filter(d=>d.id!==dcId);
  cardModalDeckContext=cardModalDeckContext.filter(id=>id!==dcId);
  toastSuccess('Variante aus Deck entfernt');
  await refreshAfterDeckEdit(variantId);
}

// Nach einer Deck-Änderung im Karten-Modal: Modal neu rendern oder schließen,
// und das Deck-Detail (falls aktiv) aktualisieren.
async function refreshAfterDeckEdit(variantId){
  const v=allCards.find(c=>c.id===variantId);

  // Wenn Karte gar nicht mehr im Deck ist (alle Druckungen entfernt), Modal schließen
  if(!cardModalDeckContext||cardModalDeckContext.length===0){
    closeModal('cardModal');
    cardModalDeckContext=null;
  }else if(v&&document.getElementById('cardModal').classList.contains('open')){
    // Karten-Modal mit aktualisiertem Kontext neu rendern (zeigt neue ×N-Werte)
    openCardModal(v.name,cardModalDeckContext.join(','));
  }

  // Deck-Detail neu rendern, damit Anzahl-Pillen, Validierung etc. aktualisiert sind
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck&&typeof renderDeckDetail==='function')renderDeckDetail(deck);
}

// Bearbeiten einer einzelnen Variante (über Bleistift-Symbol in Variantentabelle).
// Schließt das aktuelle Modal und öffnet ein dediziertes Bearbeiten-Modal für diese Variante.
function openVariantEdit(cardId){
  const v=allCards.find(c=>c.id===cardId);
  if(!v)return;
  editingCardId=cardId;
  const r=rc(v.rarity);
  const img=iUrl(v);
  document.getElementById('modalInner').innerHTML=`
    <div class="modal-img-side">
      ${img?`<img src="${img}" alt="${esc(v.name)}">`:`<div class="modal-img-placeholder">🃏</div>`}
    </div>
    <div class="modal-detail">
      <div class="modal-title">${esc(v.name)} <span style="font-size:0.7rem;color:var(--text3);font-weight:400">(Variante bearbeiten)</span></div>
      <div class="modal-set">${esc(v.set_name||v.set_code)} · ${esc(v.set_code)}${v.collector_number?' #'+esc(v.collector_number):''}</div>
      <div class="edit-form">
        <div><label>NAME</label><input id="e_name" value="${esc(v.name)}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
          <div><label>ANZAHL</label><input id="e_qty" type="number" min="1" value="${v.quantity}"></div>
          <div><label>KAUFPREIS</label><input id="e_price" value="${esc(v.purchase_price||'')}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
          <div><label>ZUSTAND</label><select id="e_cond">${['near_mint','lightly_played','moderately_played','heavily_played','damaged'].map(x=>`<option value="${x}"${v.condition===x?' selected':''}>${x.replace(/_/g,' ')}</option>`).join('')}</select></div>
          <div><label>FOIL</label><select id="e_foil"><option value="normal"${v.foil!=='foil'?' selected':''}>Normal</option><option value="foil"${v.foil==='foil'?' selected':''}>Foil</option></select></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="saveCardEdit()">Speichern</button>
          <button class="btn" onclick="openCardModal('${escJs(v.name)}')">Zurück</button>
          <button class="btn btn-danger" onclick="deleteCard('${v.id}')">Löschen</button>
        </div>
      </div>
    </div>`;
}

// ── VARIANTE ZU DECK HINZUFÜGEN ──
//
// Wird vom "+ Deck"-Button in der Variantentabelle aufgerufen. Speichert die
// gewünschte Variant-ID, befüllt das Modal mit Defaults und öffnet's.
let pendingAddVariantId = null;

function openAddVariantToDeckModal(variantId){
  if(!allDecks.length){toastError('Erstelle zuerst ein Deck im Decks-Reiter.');return;}
  const v=allCards.find(c=>c.id===variantId);
  if(!v){toastError('Variante nicht gefunden.');return;}
  pendingAddVariantId=variantId;

  // Subject: zeigt eindeutig welche Variante hinzugefügt wird
  document.getElementById('addVariantSubject').innerHTML=
    `<strong>${esc(v.name||'Karte')}</strong><br>
     <span style="color:var(--text2);font-size:0.85rem">${esc(v.set_name||v.set_code)}${v.collector_number?' #'+esc(v.collector_number):''}${v.foil==='foil'?' · ✦ Foil':''}${v.language?' · '+esc(v.language):''}</span>`;

  // Deck-Dropdown füllen — wenn ein aktives Deck offen ist, das vorauswählen
  const decksHtml=allDecks.map(d=>
    `<option value="${d.id}"${d.id===activeDeckId?' selected':''}>${esc(d.name)}</option>`
  ).join('');
  document.getElementById('addVariantDeckSelect').innerHTML=decksHtml;

  // Kategorie und Anzahl resetten
  document.getElementById('addVariantCategory').value='';
  document.getElementById('addVariantQty').value=1;

  document.getElementById('addVariantToDeckModal').classList.add('open');
  setTimeout(()=>document.getElementById('addVariantQty').focus(),50);
}

async function confirmAddVariantToDeck(){
  if(!pendingAddVariantId){closeModal('addVariantToDeckModal');return;}
  const deckId=document.getElementById('addVariantDeckSelect').value;
  const category=(document.getElementById('addVariantCategory').value||'').trim()||null;
  const qty=parseInt(document.getElementById('addVariantQty').value,10)||1;
  if(!deckId){toastError('Kein Deck ausgewählt.');return;}
  if(qty<1||qty>99){toastError('Anzahl muss zwischen 1 und 99 liegen.');return;}

  const v=allCards.find(c=>c.id===pendingAddVariantId);
  const result=await addToDeckDB(deckId,pendingAddVariantId,category,qty);
  if(!result){toastError('Hinzufügen fehlgeschlagen.');return;}

  const deck=allDecks.find(d=>d.id===deckId);
  closeModal('addVariantToDeckModal');
  toastSuccess(`${qty}× "${v?.name||'Karte'}" zu "${deck?.name||'Deck'}" hinzugefügt`);

  // Wenn das Deck, zu dem hinzugefügt wurde, gerade offen ist, neu laden
  // damit die Anzahl-Pille und Validierung sich aktualisieren
  if(activeDeckId===deckId&&typeof loadDeckCards==='function'){
    currentDeckCards=await loadDeckCards(activeDeckId);
    if(typeof renderDeckDetail==='function'&&deck)renderDeckDetail(deck);
  }
  pendingAddVariantId=null;

  // Wenn das Karten-Modal noch offen ist (Sammlung-Kontext oder Deck-Kontext mit Mehr-Hinzufügen),
  // dort das angereicherte Modell neu rendern, damit "im Deck"-Marker sich aktualisieren
  if(document.getElementById('cardModal').classList.contains('open')&&v){
    openCardModal(v.name,cardModalDeckContext?cardModalDeckContext.join(','):null);
  }
}

async function saveCardEdit(){
  if(!editingCardId)return;
  const idx=allCards.findIndex(c=>c.id===editingCardId);if(idx===-1)return;
  const updated={...allCards[idx],name:document.getElementById('e_name').value.trim(),quantity:parseInt(document.getElementById('e_qty').value)||1,purchase_price:document.getElementById('e_price').value.trim(),condition:document.getElementById('e_cond').value,foil:document.getElementById('e_foil').value};
  // Speichern-Button im Modal in Lade-Zustand versetzen
  const btn=document.querySelector('#cardModal .btn-primary');
  setBusy(btn,true,'Speichert…');
  const ok=await updateCard(updated);
  setBusy(btn,false);
  if(ok){allCards[idx]=updated;closeModal('cardModal');renderAll();toastSuccess('Karte gespeichert');}
}

async function deleteCard(id){
  const card=allCards.find(c=>c.id===id);
  const name=card?.name||'diese Karte';
  if(!await confirmAction(`Diese Variante von "${name}" wirklich aus deiner Sammlung löschen?`,{
    title:'VARIANTE LÖSCHEN',
    confirmLabel:'Löschen',
    danger:true
  }))return;
  if(await deleteCardDB(id)){allCards=allCards.filter(c=>c.id!==id);closeModal('cardModal');renderAll();toastSuccess('Variante gelöscht');}
}
