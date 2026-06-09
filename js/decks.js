// ══════════════════════════════════════════════════════════
//  DECKS  ·  Decks-Übersicht, Deck-Detail, Kategorien
// ══════════════════════════════════════════════════════════
async function renderDecks(){
  const grid=document.getElementById('decksGrid');
  const empty=document.getElementById('decks-empty');
  if(!allDecks.length){empty.style.display='';grid.innerHTML='';return;}
  empty.style.display='none';

  // Statistiken pro Deck einmalig in einem einzigen DB-Call holen.
  // Vorher wurden n DB-Calls gemacht (1 pro Deck), das ist deutlich schneller
  // bei mehreren Decks und liefert gleich auch die Wertberechnung mit.
  //
  // Berechnete Werte pro Deck:
  //   count:        Gesamtzahl Karten (Summe der quantity)
  //   value:        Gesamtwert in € (purchase_price × quantity)
  //   avgMv:        Durchschnittlicher Manawert (ohne Länder)
  //   colors:       Set der Farben, die im Deck vorkommen (ohne Länder)
  const stats={};
  try{
    const{data:deckCards,error}=await _sb.from('deck_cards').select('deck_id,card_id,quantity');
    if(!error&&deckCards){
      for(const dc of deckCards){
        if(!stats[dc.deck_id])stats[dc.deck_id]={count:0,value:0,manaSum:0,nonLandCount:0,colors:new Set()};
        stats[dc.deck_id].count+=dc.quantity;
        const card=allCards.find(c=>c.id===dc.card_id);
        if(!card)continue;
        stats[dc.deck_id].value+=(parseFloat(card.purchase_price)||0)*dc.quantity;
        // Manawert + Farben nur für Nicht-Länder zählen (sonst dominieren Lands die Charts)
        if(card.type_line&&card.mana_value!=null){
          const isLand=(card.type_line||'').toLowerCase().includes('land');
          if(!isLand){
            stats[dc.deck_id].manaSum+=card.mana_value*dc.quantity;
            stats[dc.deck_id].nonLandCount+=dc.quantity;
            const cs=Array.isArray(card.colors)?card.colors:[];
            for(const c of cs)stats[dc.deck_id].colors.add(c);
          }
        }
      }
    }
  }catch(e){
    // Falls das fehlschlägt, rendern wir die Decks ohne Statistiken — Hauptsache,
    // die Übersicht ist überhaupt sichtbar
  }

  grid.innerHTML=allDecks.map(d=>{
    const s=stats[d.id]||{count:0,value:0,manaSum:0,nonLandCount:0,colors:new Set()};
    const avgMv=s.nonLandCount>0?(s.manaSum/s.nonLandCount):0;

    // Stats-Reihe: erweiterbar — weitere KPIs einfach hier ergänzen
    const statsItems=[
      `<span class="dcs-item"><strong>${s.count}</strong> Karten</span>`,
      s.value>0?`<span class="dcs-item"><strong>${s.value.toFixed(2)} €</strong></span>`:null,
      s.nonLandCount>0?`<span class="dcs-item"><strong>${avgMv.toFixed(1)}</strong> Ø MV</span>`:null,
    ].filter(Boolean).join('');

    // Farb-Indikatoren: kleine Punkte für jede vertretene Farbe (in MTG-Reihenfolge WUBRG)
    const colorOrder=['W','U','B','R','G'];
    const colorDots=colorOrder
      .filter(c=>s.colors.has(c))
      .map(c=>`<span class="dcs-color mana-${c.toLowerCase()}" title="${({W:'Weiß',U:'Blau',B:'Schwarz',R:'Rot',G:'Grün'}[c])}"></span>`)
      .join('');

    return`
    <div class="deck-card" onclick="openDeckDetail('${d.id}')">
      <div class="deck-actions" onclick="event.stopPropagation()">
        <button class="deck-act-btn" onclick="openDeckModal('${d.id}')" title="Bearbeiten">✎</button>
        <button class="deck-act-btn" onclick="deleteDeck('${d.id}')" title="Löschen">🗑</button>
      </div>
      <div class="deck-name">${esc(d.name)}</div>
      <div class="deck-desc">${esc(d.description||'')}</div>
      <div class="deck-card-stats">${statsItems}</div>
      ${colorDots?`<div class="deck-card-colors">${colorDots}</div>`:''}
      ${d.format?`<div class="deck-meta"><span class="deck-tag">${esc(d.format)}</span></div>`:''}
    </div>`;
  }).join('');
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
  const format=document.getElementById('deckFormat').value;
  const fields={name,description:document.getElementById('deckDesc').value.trim(),format};

  // Commander-Format-Spezialregel: Sicherstellen, dass die Kategorie "Commander"
  // ganz oben in der Reihenfolge steht. Wir setzen category_order beim Speichern,
  // damit die Sortierung sofort wirkt — auch beim ersten Öffnen.
  if(format==='Commander'){
    let order=[];
    if(editingDeckId){
      const existing=allDecks.find(d=>d.id===editingDeckId);
      if(existing&&Array.isArray(existing.category_order))order=[...existing.category_order];
    }
    // "Commander" voranstellen, falls noch nicht enthalten
    order=order.filter(c=>c!=='Commander');
    order.unshift('Commander');
    fields.category_order=order;
  }

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
  const deck=allDecks.find(d=>d.id===id);
  const name=deck?.name||'dieses Deck';
  if(!await confirmAction(`Deck "${name}" und alle Karten-Zuordnungen darin wirklich löschen? Die Karten selbst bleiben in deiner Sammlung.`,{
    title:'DECK LÖSCHEN',
    confirmLabel:'Löschen',
    danger:true
  }))return;
  if(await deleteDeckDB(id)){allDecks=allDecks.filter(d=>d.id!==id);renderDecks();toastSuccess('Deck gelöscht');}
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
  // Group by category — Karten OHNE Kategorie werden separat gehalten und oben angezeigt
  const cats={};
  const uncategorized=[];
  currentDeckCards.forEach(dc=>{
    const cat=(dc.category||'').trim();
    if(!cat){
      uncategorized.push(dc);
    }else{
      if(!cats[cat])cats[cat]=[];
      cats[cat].push(dc);
    }
  });
  const totalCards=currentDeckCards.reduce((s,dc)=>s+dc.quantity,0);

  // Reihenfolge der Kategorien: gespeicherte Reihenfolge aus deck.category_order
  // hat Vorrang. Neue (noch nicht gespeicherte) Kategorien hängen wir hinten an.
  const DEFAULT_CAT_ORDER=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const savedOrder=Array.isArray(deck.category_order)?[...deck.category_order]:[];
  const baseOrder=savedOrder.length?savedOrder:DEFAULT_CAT_ORDER;
  const sortedCats=[...new Set([...baseOrder.filter(c=>cats[c]),...Object.keys(cats)])];
  const visibleCats=sortedCats.filter(c=>cats[c]);

  // Edit-Modus / View-Modus für die Buttons im Header
  const editLabel=deckEditMode?'✓ Fertig':'✎ Bearbeiten';
  const editClass=deckEditMode?'btn-gold active-edit':'btn-gold';
  const cardsActive=deckViewMode==='cards'?'active':'';
  const listActive=deckViewMode==='list'?'active':'';

  detailView.innerHTML=`
    <div class="deck-detail-header">
      <button class="back-btn" onclick="closeDeckDetail()">← Zurück</button>
      <div>
        <div class="deck-detail-title">${esc(deck.name)}</div>
        ${deck.format?`<span class="deck-tag" style="font-size:0.6rem">${esc(deck.format)}</span>`:''}
      </div>
      <div class="deck-detail-actions" style="margin-left:auto;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
        <span style="color:var(--text2);font-size:0.85rem">${totalCards} Karten</span>
        <div class="deck-view-toggle">
          <button class="${cardsActive}" onclick="setDeckViewMode('cards')" title="Karten-Ansicht">⊞</button>
          <button class="${listActive}" onclick="setDeckViewMode('list')" title="Listen-Ansicht">☰</button>
        </div>
        <button class="${editClass}" onclick="toggleDeckEditMode()" title="Karten markieren und bearbeiten">${editLabel}</button>
        <button class="back-btn" onclick="openMissingModal(activeDeckId)" title="Liste der Karten in diesem Deck, die du nicht besitzt">✦ Fehlende</button>
        <button class="btn-gold" onclick="openCatModal()">+ Kategorie</button>
        <button class="back-btn" onclick="openDeckModal('${deck.id}')">✎ Deck</button>
      </div>
    </div>
    ${deckEditMode?'':'<div class="deck-validation-panel" id="deck-validation-panel"></div>'}
    <div class="deck-stats-panel" id="deck-stats-panel"></div>
    ${uncategorizedSection(uncategorized,deck.id)}
    ${visibleCats.map((cat,idx)=>catSection(cat,cats[cat],deck.id,idx,visibleCats.length,deck.format)).join('')}
    ${!currentDeckCards.length?`<div class="empty-state" style="padding:2rem 1rem"><div class="empty-icon">🃏</div><p style="color:var(--text2)">Tippe oben ins Feld einen Kartennamen, um loszulegen — auch Karten, die du noch nicht besitzt.</p></div>`:''}
    ${deckEditMode?renderEditActionBar():''}
  `;
  // Statistik-Panel mit Daten füllen (eigene Funktion in deck-stats.js)
  if(typeof renderDeckStats==='function')renderDeckStats(deck,currentDeckCards);
  // Validierungs-Panel füllen — im Bearbeiten-Modus ausgeblendet (User-Wunsch)
  if(!deckEditMode && typeof renderDeckValidation==='function')renderDeckValidation(deck,currentDeckCards);
  // Tippfelder pro Kategorie nach erneutem Rendern wieder fokussieren
  if(typeof dcaPostRender==='function')dcaPostRender();
}

// Bottom-Aktions-Leiste, die im Edit-Modus erscheint
function renderEditActionBar(){
  const n=deckEditSelected.size;
  const hasSelection=n>0;
  return`<div class="edit-action-bar">
    <span class="eab-count">${n} ausgewählt</span>
    <button class="eab-btn" onclick="editModeMoveSelected()" ${hasSelection?'':'disabled'}>📂 Verschieben</button>
    <button class="eab-btn danger" onclick="editModeRemoveSelected()" ${hasSelection?'':'disabled'}>🗑 Entfernen</button>
    <button class="eab-btn" onclick="toggleDeckEditMode()">Abbrechen</button>
  </div>`;
}

// Sektion für Karten ohne Kategorie — visuell etwas dezenter als kategorisierte Bereiche.
// Erscheint oben im Deck, vor allen kategorisierten Karten.
function uncategorizedSection(dcCards,deckId){
  const total=dcCards.reduce((s,dc)=>s+dc.quantity,0);
  const collapsed=deckCollapsedCategories.has('__uncat__');
  const arrowIcon=collapsed?'▸':'▾';
  const body=collapsed?'':renderCategoryBody(dcCards);
  const selectAllBtn=deckEditMode
    ?`<button class="del-cat-btn" onclick="event.stopPropagation();selectAllInCategory('__uncat__')" title="Alle Karten in dieser Kategorie markieren / abwählen">☑ Alle</button>`
    :'';
  return`<div class="category-section uncategorized-section">
    <div class="category-header" onclick="toggleDeckCategoryCollapse('__uncat__')">
      <div class="category-name" style="font-style:italic;color:var(--text2)">
        <span class="cat-collapse-arrow">${arrowIcon}</span>
        ⋯ Ohne Kategorie <span class="category-count">${total} Karten</span>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap" onclick="event.stopPropagation()">
        ${selectAllBtn}
      </div>
    </div>
    ${body}
    ${collapsed?'':inlineAddRow('')}
  </div>`;
}

// Wählt zwischen Karten-Grid und Listen-Anzeige je nach deckViewMode.
// Karten gleichen Namens werden zusammengefasst dargestellt — eine Zeile/Tile
// pro Karten-Name, mit Summe der Anzahlen darüber. So wirkt das Deck wie
// "ein Deck", nicht wie eine DB-Liste mit Sammler-Variantenzeilen.
function renderCategoryBody(dcCards){
  // Karten gleichen Namens innerhalb dieser Kategorie zu Gruppen zusammenfassen
  const groups=groupDcByCardName(dcCards);
  // Nutzer-Einstellung "deckCardSize" als Klasse mitgeben (klein/mittel/groß)
  const sizeClass=loadSettings().deckCardSize||'medium';
  if(deckViewMode==='cards'){
    return`<div class="dc-card-grid size-${sizeClass}">${groups.map(g=>deckCardTile(g)).join('')}</div>`;
  }
  return groups.map(g=>deckCardRow(g)).join('');
}

// Gruppiert Deck-Card-Einträge nach Karten-Namen.
// Ergebnis pro Gruppe: representative (erster dc-Eintrag), alle dcIds,
// die zur Gruppe gehören (wichtig für Multi-Operationen wie Verschieben/Löschen),
// und die Summe der Anzahlen.
//
// Robust gegen:
// - Unterschiedliche Schreibweisen ("Island" vs " island ") via lowercase+trim
// - Quantity als String aus der DB (parseInt-Cast)
// - Karten ohne card-Eintrag in allCards (Fallback auf card_id; gruppiert dann nicht — ist OK)
function groupDcByCardName(dcCards){
  const groups={};
  const ownedMap=buildOwnedNameMap();
  for(const dc of dcCards){
    const card=resolveDeckCard(dc);
    const displayName=card?.name||dc.card_id;
    // Gruppierungsschlüssel ist lowercase + trim, damit "Island", "island", " Island "
    // und Co. zur selben Gruppe gehören
    const key=String(displayName).toLowerCase().trim();
    if(!groups[key]){
      groups[key]={
        name:displayName,         // Anzeige-Name kommt vom ersten Eintrag
        representative:dc,
        repCard:card,
        owned:(ownedMap.get(String(displayName).toLowerCase().trim())||0)>0,
        dcIds:[],
        quantity:0
      };
    }
    groups[key].dcIds.push(dc.id);
    // Quantity als Number sicherstellen — Supabase liefert numeric als Number,
    // aber bei Edge-Cases (string aus altem Bestand) wäre 1 + "1" = "11" der Bug
    const q=parseInt(dc.quantity,10);
    groups[key].quantity+=isNaN(q)?1:q;
  }
  return Object.values(groups);
}

// Karten-Kachel für die Karten-Ansicht
//
// Click-Verhalten:
//  - Karten-Hauptfläche (Bild + Info): IMMER → Karten-Modal mit Deck-Kontext.
//    So sieht der User Varianten und kann auch im Edit-Mode bequem rein/raus.
//  - Checkbox-Overlay (nur im Edit-Mode): toggelt Auswahl der Gruppe.
//  - Trash-Knopf (nur im Edit-Mode): entfernt alle Druckungen aus dem Deck.
//
// Anzahl-Pille (×N) wird IMMER gezeigt — auch ×1, damit man die Anzahl
// jeder Karte im Deck sofort sieht ohne reinklicken zu müssen.
function deckCardTile(g){
  const card=g.repCard;
  const img=card?iUrl(card):null;
  const cardName=g.name;
  // Eine Gruppe ist "selected", wenn ALLE zugehörigen dcIds markiert sind
  const isSelected=g.dcIds.every(id=>deckEditSelected.has(id));
  const dcIdsCsv=g.dcIds.join(',');
  // Hauptfläche-Klick öffnet immer das Karten-Modal mit Deck-Kontext
  const tileClick=`onclick="openDeckCardModal('${dcIdsCsv}')"`;
  // Checkbox: stoppt Propagation, togglet stattdessen die Auswahl
  const checkbox=deckEditMode?`<div class="dc-tile-checkbox" onclick="event.stopPropagation();toggleDeckEditGroup('${dcIdsCsv}')" title="Auswählen">${isSelected?'✓':''}</div>`:'';
  // Trash: entfernt aus Deck (mit Bestätigung)
  const removeBtn=deckEditMode
    ?`<button class="dc-tile-remove" onclick="event.stopPropagation();removeDeckCardGroup('${dcIdsCsv}')" title="Aus Deck entfernen">🗑</button>`
    :'';
  return`<div class="dc-card-tile${isSelected?' selected':''}${g.owned?'':' dc-not-owned'}" ${tileClick} title="${esc(cardName)}${g.quantity>1?` (×${g.quantity})`:''}${g.owned?'':' — nicht in Sammlung'}">
    ${checkbox}
    ${removeBtn}
    ${g.owned?'':`<div class="dc-miss-badge" title="Nicht in deiner Sammlung">fehlt</div>`}
    ${img?`<img src="${img}" alt="${esc(cardName)}">`:`<div class="dc-tile-noimg">🃏</div>`}
    ${g.quantity>1?`<div class="dc-tile-qty">×${g.quantity}</div>`:''}
  </div>`;
}

// Listen-Zeile (klassische Ansicht).
// Gleiche Click-Logik wie der Tile: Hauptfläche öffnet Karten-Modal,
// Checkbox togglet Auswahl, Trash entfernt aus Deck.
function deckCardRow(g){
  const card=g.repCard;
  const img=card?iUrl(card):null;
  const cardName=g.name;
  const isSelected=g.dcIds.every(id=>deckEditSelected.has(id));
  const dcIdsCsv=g.dcIds.join(',');
  const rowClick=`onclick="openDeckCardModal('${dcIdsCsv}')"`;
  const checkbox=deckEditMode?`<div class="dc-row-checkbox" onclick="event.stopPropagation();toggleDeckEditGroup('${dcIdsCsv}')" title="Auswählen">${isSelected?'✓':''}</div>`:'';
  return`<div class="deck-card-row${isSelected?' selected':''}${g.owned?'':' dc-not-owned'}" ${rowClick} title="${esc(cardName)}">
    ${checkbox}
    ${img?`<img class="dc-img" src="${img}" alt="${esc(cardName)}">`:`<div class="dc-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem">🃏</div>`}
    <div style="flex:1;min-width:0">
      <div class="dc-name">${esc(cardName||g.representative.card_id)}${g.owned?'':`<span class="dc-miss-tag">fehlt</span>`}</div>
      <div class="dc-sub">${card?esc(card.set_code)+(card.collector_number?' #'+esc(card.collector_number):''):''} ${card?.foil==='foil'?'· ✦ Foil':''}${g.dcIds.length>1?` · ${g.dcIds.length} Druckungen`:''}</div>
    </div>
    <span class="dc-qty">×${g.quantity}</span>
    <button class="dc-remove" onclick="event.stopPropagation();removeDeckCardGroup('${dcIdsCsv}')" title="Alle ${g.quantity} Karten entfernen">✕</button>
  </div>`;
}

function catSection(cat,dcCards,deckId,index,total,deckFormat){
  const total_qty=dcCards.reduce((s,dc)=>s+dc.quantity,0);
  const collapsed=deckCollapsedCategories.has(cat);
  const arrowIcon=collapsed?'▸':'▾';
  const body=collapsed?'':renderCategoryBody(dcCards);

  // Sonderbehandlung: In Commander-Decks ist die "Commander"-Kategorie geschützt.
  const isLockedCommanderCat=(deckFormat==='Commander'&&cat==='Commander');

  // ▲/▼ deaktivieren am Anfang/Ende ODER für die geschützte Commander-Kategorie
  const upDisabled=(index===0||isLockedCommanderCat)?'disabled':'';
  const downDisabled=(index===total-1||isLockedCommanderCat)?'disabled':'';

  // Sortier-Pfeile NUR im Edit-Mode sichtbar (User-Wunsch)
  const moveBtns=deckEditMode?`
        <button class="cat-move-btn" onclick="event.stopPropagation();moveCategoryUp('${escJs(cat)}')" ${upDisabled} title="Nach oben">▲</button>
        <button class="cat-move-btn" onclick="event.stopPropagation();moveCategoryDown('${escJs(cat)}')" ${downDisabled} title="Nach unten">▼</button>`:'';

  // "Alle markieren"-Button NUR im Edit-Mode (Multi-Select-Helfer pro Kategorie).
  // Toggelt zwischen "alle markieren" und "alle abwählen".
  const selectAllBtn=deckEditMode
    ?`<button class="del-cat-btn" onclick="event.stopPropagation();selectAllInCategory('${escJs(cat)}')" title="Alle Karten in dieser Kategorie markieren / abwählen">☑ Alle</button>`
    :'';

  // Lösch-Button bei der geschützten Commander-Kategorie ganz weglassen
  const deleteBtn=isLockedCommanderCat
    ?''
    :`<button class="del-cat-btn" onclick="event.stopPropagation();removeCategory('${deckId}','${escJs(cat)}')" title="Kategorie entfernen">🗑 Kategorie</button>`;

  // Visuelle Markierung für die Commander-Kategorie (kleines Krönchen)
  const catLabel=isLockedCommanderCat?`👑 ${esc(cat)}`:`◈ ${esc(cat)}`;

  return`<div class="category-section${isLockedCommanderCat?' commander-section':''}">
    <div class="category-header" onclick="toggleDeckCategoryCollapse('${escJs(cat)}')">
      <div class="category-name">
        <span class="cat-collapse-arrow">${arrowIcon}</span>
        ${moveBtns}
        ${catLabel} <span class="category-count">${total_qty} Karten</span>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap" onclick="event.stopPropagation()">
        ${selectAllBtn}
        ${deleteBtn}
      </div>
    </div>
    ${body}
    ${collapsed?'':inlineAddRow(cat)}
  </div>`;
}

// ── View-/Edit-Mode Steuerung ──

function setDeckViewMode(mode){
  deckViewMode=mode;
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
}

function toggleDeckEditMode(){
  deckEditMode=!deckEditMode;
  // Beim Verlassen des Edit-Modes Auswahl zurücksetzen
  if(!deckEditMode)deckEditSelected.clear();
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
}

// Edit-Mode: Auswahl pro Gruppe toggeln.
// Eine "Gruppe" sind alle deck_cards-Einträge mit demselben Karten-Namen
// in derselben Kategorie (z.B. 4× "Insel" aus 4 Sets — ein Tile, 4 dcIds).
// Logik: Wenn alle dcIds der Gruppe schon markiert sind → alle deselektieren.
// Sonst → alle markieren.
function toggleDeckEditGroup(dcIdsCsv){
  const ids=dcIdsCsv.split(',');
  const allSelected=ids.every(id=>deckEditSelected.has(id));
  if(allSelected){
    ids.forEach(id=>deckEditSelected.delete(id));
  }else{
    ids.forEach(id=>deckEditSelected.add(id));
  }
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
}

// "Alle markieren in dieser Kategorie" Button.
// Toggelt: wenn schon alle markiert sind → alle deselektieren. Sonst alle markieren.
function selectAllInCategory(category){
  // Kategorie-Filter: leerer String = "Ohne Kategorie"
  const dcsInCat=currentDeckCards.filter(dc=>{
    const cat=(dc.category||'').trim();
    if(category==='__uncat__')return !cat;
    return cat===category;
  });
  const allIds=dcsInCat.map(dc=>dc.id);
  const allSelected=allIds.length>0&&allIds.every(id=>deckEditSelected.has(id));
  if(allSelected){
    allIds.forEach(id=>deckEditSelected.delete(id));
  }else{
    allIds.forEach(id=>deckEditSelected.add(id));
  }
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
}

function toggleDeckCategoryCollapse(cat){
  if(deckCollapsedCategories.has(cat))deckCollapsedCategories.delete(cat);
  else deckCollapsedCategories.add(cat);
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
}

// Eine ganze Karten-Gruppe entfernen (z.B. "alle 4 Inseln" auf einmal).
// Geht nur mit Bestätigung — destruktive Aktion.
async function removeDeckCardGroup(dcIdsCsv){
  const ids=dcIdsCsv.split(',');
  const totalQty=ids.reduce((s,id)=>{
    const dc=currentDeckCards.find(d=>d.id===id);
    return s+(dc?.quantity||0);
  },0);
  // Karten-Name herausfinden für die Bestätigung
  const firstDc=currentDeckCards.find(d=>d.id===ids[0]);
  const name=firstDc?resolveDeckCard(firstDc).name:'diese Karte';
  const ok=await confirmAction(
    ids.length>1
      ?`Alle ${totalQty} "${name}" (in ${ids.length} Druckungen) aus dem Deck entfernen?`
      :`"${name}"${totalQty>1?` (×${totalQty})`:''} aus dem Deck entfernen?`,
    {title:'KARTE ENTFERNEN',confirmLabel:'Entfernen',danger:true}
  );
  if(!ok)return;

  let success=0,fail=0;
  for(const id of ids){
    if(await removeDeckCardDB(id))success++;else fail++;
  }
  // Lokale Liste aktualisieren
  currentDeckCards=currentDeckCards.filter(dc=>!ids.includes(dc.id));
  // Aus Edit-Selektion entfernen, falls dort
  ids.forEach(id=>deckEditSelected.delete(id));
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
  if(fail>0)toastError(`${success} entfernt, ${fail} Fehler`);
  else toastSuccess(`${success===1?'Karte':success+' Einträge'} entfernt`);
}

// Multi-Select: Markierte Karten verschieben — öffnet den neuen Move-Picker
async function editModeMoveSelected(){
  if(deckEditSelected.size===0)return;
  openMovePicker([...deckEditSelected].join(','));
}

// Multi-Select: Markierte Karten entfernen (mit Bestätigung)
async function editModeRemoveSelected(){
  if(deckEditSelected.size===0)return;
  const n=deckEditSelected.size;
  const ok=await confirmAction(`${n} Karte${n===1?'':'n'} aus dem Deck entfernen? Die Karten bleiben in deiner Sammlung.`,{
    title:'KARTEN ENTFERNEN',
    confirmLabel:'Entfernen',
    danger:true
  });
  if(!ok)return;

  let success=0,fail=0;
  for(const dcId of deckEditSelected){
    if(await removeDeckCardDB(dcId))success++;else fail++;
  }
  // Lokale Liste aktualisieren
  currentDeckCards=currentDeckCards.filter(dc=>!deckEditSelected.has(dc.id));
  deckEditSelected.clear();
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
  if(fail>0)toastError(`${success} entfernt, ${fail} Fehler`);
  else toastSuccess(`${success} Karte${success===1?'':'n'} entfernt`);
}

function closeDeckDetail(){
  activeDeckId=null;currentDeckCards=[];
  // Edit-Modus und Auswahl beim Verlassen zurücksetzen, damit kein Zombie-State bleibt
  deckEditMode=false;
  deckEditSelected.clear();
  deckCollapsedCategories.clear();
  document.getElementById('decks-list-view').style.display='';
  document.getElementById('deck-detail-view').style.display='none';
  renderDecks();
}

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
  const dc=currentDeckCards.find(c=>c.id===dcId);
  const card=dc?allCards.find(c=>c.id===dc.card_id):null;
  const name=card?.name||'diese Karte';
  if(!await confirmAction(`"${name}" aus dem Deck entfernen? Die Karte bleibt in deiner Sammlung.`,{
    title:'KARTE ENTFERNEN',
    confirmLabel:'Entfernen',
    danger:true
  }))return;
  if(await removeDeckCardDB(dcId)){
    currentDeckCards=currentDeckCards.filter(dc=>dc.id!==dcId);
    const deck=allDecks.find(d=>d.id===activeDeckId);
    renderDeckDetail(deck);toastSuccess('Karte entfernt');
  }
}

async function removeCategory(deckId,category){
  // Schutz: Commander-Kategorie in Commander-Decks ist fest und darf nicht
  // gelöscht werden — sie ist die Grundlage für die Validierung.
  const deck=allDecks.find(d=>d.id===deckId);
  if(deck&&deck.format==='Commander'&&category==='Commander'){
    toastError('Die "Commander"-Kategorie ist in Commander-Decks fest und kann nicht entfernt werden.');
    return;
  }

  if(!await confirmAction(`Kategorie "${category}" und alle Karten-Zuordnungen darin aus dem Deck entfernen? Die Karten bleiben in deiner Sammlung.`,{
    title:'KATEGORIE LÖSCHEN',
    confirmLabel:'Löschen',
    danger:true
  }))return;
  if(await removeCategoryDB(deckId,category)){
    currentDeckCards=currentDeckCards.filter(dc=>dc.category!==category);
    const deck2=allDecks.find(d=>d.id===deckId);
    renderDeckDetail(deck2);toastSuccess(`Kategorie "${category}" entfernt`);
  }
}

// ── ADD CARDS TO DECK (Workflow B: Mehrfach-Auswahl + Kategorie) ──

// Set mit IDs aller aktuell angekreuzten Karten im Modal
let addCardsSelected = new Set();

// Modal öffnen. Optionaler Parameter: vorbelegte Kategorie (wenn aus Kategorie-Header geklickt)
function openAddCardsModal(presetCategory){
  if(!activeDeckId){showToast('Kein Deck aktiv.');return;}
  if(!allCards.length){showToast('Importiere zuerst Karten in deine Sammlung.');return;}
  addCardsSelected.clear();

  // Kategorie-Vorschläge aus existierenden Kategorien des Decks + Standard-Liste
  const existingCats=[...new Set(currentDeckCards.map(dc=>dc.category))].filter(Boolean);
  const standardCats=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const allCats=[...new Set([...existingCats,...standardCats])];
  document.getElementById('addCardsCatSuggestions').innerHTML=allCats.map(c=>`<option value="${esc(c)}">`).join('');

  // Vorbelegung: Kategorie + Suchfeld leer
  document.getElementById('addCardsCategory').value=presetCategory||'';
  document.getElementById('addCardsSearch').value='';

  renderAddCardsList();
  updateAddCardsSelectionInfo();
  document.getElementById('addCardsModal').classList.add('open');
}

// Liste der Karten im Modal rendern (gefiltert per Suchfeld, gruppiert nach Namen)
function renderAddCardsList(){
  const search=(document.getElementById('addCardsSearch').value||'').toLowerCase().trim();

  // Erst alle Karten suchen, dann nach Namen gruppieren
  const matches=allCards.filter(c=>{
    if(!search)return true;
    const hay=`${c.name||''} ${c.set_code||''} ${c.set_name||''}`.toLowerCase();
    return hay.includes(search);
  });

  // Gruppieren: pro unique Name eine Zeile, älteste Variante als Repräsentant
  const byName={};
  for(const c of matches){
    const key=(c.name||'').toLowerCase();
    if(!byName[key])byName[key]=[];
    byName[key].push(c);
  }
  const groups=Object.values(byName).map(variants=>{
    const rep=[...variants].sort((a,b)=>{
      const da=setReleasedAt(a.set_code),db=setReleasedAt(b.set_code);
      if(!da&&!db)return(a.set_code||'').localeCompare(b.set_code||'');
      if(!da)return 1;if(!db)return -1;
      return da.localeCompare(db);
    })[0];
    return{
      representative:rep,
      variants,
      totalQty:variants.reduce((s,v)=>s+(v.quantity||1),0)
    };
  }).sort((a,b)=>(a.representative.name||'').localeCompare(b.representative.name||''));

  const html=groups.slice(0,200).map(g=>{
    const c=g.representative;
    const checked=addCardsSelected.has(c.id);
    const img=iUrl(c);
    const variantsLabel=g.variants.length>1?` <em style="color:var(--text3);font-style:normal;font-size:0.75em">+${g.variants.length-1} weitere</em>`:'';
    return`<label class="add-card-row${checked?' selected':''}" data-id="${c.id}">
      <input type="checkbox" ${checked?'checked':''} onchange="toggleAddCard('${c.id}')">
      ${img?`<img src="${img}" alt="">`:`<div class="add-card-noimg">🃏</div>`}
      <div class="add-card-info">
        <div class="add-card-name">${esc(c.name||'')}${variantsLabel}</div>
        <div class="add-card-meta">${esc(c.set_code||'')}${g.totalQty>1?' · ×'+g.totalQty+' insgesamt':''}</div>
      </div>
    </label>`;
  }).join('');

  const target=document.getElementById('addCardsList');
  target.innerHTML=html||`<div style="padding:1rem;color:var(--text3);text-align:center">Keine Karten gefunden.</div>`;
  if(groups.length>200){
    target.innerHTML+=`<div style="padding:0.6rem;color:var(--text3);text-align:center;font-size:0.8rem">… ${groups.length-200} weitere ausgeblendet. Suche eingrenzen.</div>`;
  }
}

// Wird vom Suchfeld getriggert
function filterAddCards(){renderAddCardsList();}

// Eine Karte (de)selektieren
function toggleAddCard(cardId){
  if(addCardsSelected.has(cardId))addCardsSelected.delete(cardId);
  else addCardsSelected.add(cardId);
  // Nur die eine Zeile umfärben statt alles neu zu rendern
  const row=document.querySelector(`.add-card-row[data-id="${cardId}"]`);
  if(row)row.classList.toggle('selected',addCardsSelected.has(cardId));
  updateAddCardsSelectionInfo();
}

// Anzeige "X ausgewählt" + Button-Text aktualisieren
function updateAddCardsSelectionInfo(){
  const n=addCardsSelected.size;
  document.getElementById('addCardsSelectionInfo').textContent=`${n} ausgewählt`;
  const btn=document.getElementById('addCardsConfirmBtn');
  btn.textContent=n>0?`${n} Karte${n===1?'':'n'} hinzufügen`:'Hinzufügen';
  btn.disabled=n===0;
}

// Auswahl komplett zurücksetzen
function clearAddCardsSelection(){
  addCardsSelected.clear();
  document.querySelectorAll('.add-card-row.selected').forEach(r=>r.classList.remove('selected'));
  document.querySelectorAll('.add-card-row input[type=checkbox]').forEach(cb=>cb.checked=false);
  updateAddCardsSelectionInfo();
}

// Alle aktuell sichtbaren (= gefilterten) Karten in der Liste markieren.
// "Sichtbar" heißt: was renderAddCardsList tatsächlich ins DOM geschrieben hat,
// also nach aktuellem Suchfilter und unter dem 200er-Cap.
function selectAllAddCards(){
  const rows=document.querySelectorAll('.add-card-row[data-id]');
  rows.forEach(row=>{
    const id=row.dataset.id;
    addCardsSelected.add(id);
    row.classList.add('selected');
    const cb=row.querySelector('input[type=checkbox]');
    if(cb)cb.checked=true;
  });
  updateAddCardsSelectionInfo();
}

// Hinzufügen-Button: alle gewählten Karten in die Kategorie schreiben.
// Leere Kategorie ist erlaubt — diese Karten erscheinen oben im Deck unter "Ohne Kategorie".
async function confirmAddCardsToDeck(){
  const category=(document.getElementById('addCardsCategory').value||'').trim();
  // Leerer Kategorie-String wird als null in die DB geschrieben → Karte landet oben im Deck
  const categoryToSave=category||null;
  if(addCardsSelected.size===0){showToast('Keine Karten ausgewählt.');return;}

  const btn=document.getElementById('addCardsConfirmBtn');
  btn.disabled=true;btn.textContent='Hinzufügen…';

  let ok=0,fail=0;
  for(const cardId of addCardsSelected){
    if(await addToDeckDB(activeDeckId,cardId,categoryToSave,1))ok++;else fail++;
  }
  // Deck-Karten frisch laden (wegen Quantity-Updates bei Duplikaten)
  currentDeckCards=await loadDeckCards(activeDeckId);
  const deck=allDecks.find(d=>d.id===activeDeckId);
  renderDeckDetail(deck);
  closeModal('addCardsModal');
  const target=category?`zu "${category}"`:'ohne Kategorie';
  showToast(fail?`${ok} hinzugefügt ${target}, ${fail} Fehler`:`✓ ${ok} Karte${ok===1?'':'n'} ${target} hinzugefügt`);
}


// ── KATEGORIE-WECHSEL ──
//
// Erlaubt es, eine Karte im Deck nachträglich einer anderen Kategorie
// zuzuordnen oder die Kategorie zu entfernen ("Ohne Kategorie").

// ══════════════════════════════════════════════════════════
//  MOVE-PICKER  ·  Visueller Kategorie-Wähler
// ══════════════════════════════════════════════════════════
//
//  Zeigt eine Liste der existierenden Kategorien des aktiven Decks als
//  klickbare Zeilen. Klick auf eine Kategorie verschiebt die Karte(n) sofort
//  dorthin (kein extra Bestätigen). Optional kann unten eine neue Kategorie
//  via Texteingabe erstellt werden.
//
//  Eintrittspunkte:
//  - Tile/Row-Klick im Edit-Mode bei Single-Card → openMovePicker(dcId)
//  - Edit-Action-Bar "Verschieben" → editModeMoveSelected → openMovePicker(...)
//  - Karten-Modal "Verschieben"-Button → openMovePicker(dcIdsCsv)
//
//  movePickerDcIds enthält die zu verschiebenden dc-IDs (auch bei Single als 1-Element-Array).

let movePickerDcIds = [];

function openMovePicker(dcIdsCsv){
  movePickerDcIds=dcIdsCsv?String(dcIdsCsv).split(','):[];
  if(!movePickerDcIds.length)return;

  // Subject-Zeile: was wird verschoben? Karten-Name(n) + Anzahl.
  const dcs=movePickerDcIds.map(id=>currentDeckCards.find(c=>c.id===id)).filter(Boolean);
  const totalQty=dcs.reduce((s,d)=>s+(d.quantity||1),0);
  // Eindeutige Kartennamen sammeln
  const names=[...new Set(dcs.map(dc=>{
    const card=allCards.find(c=>c.id===dc.card_id);
    return card?.name||'Karte';
  }))];
  const subject=names.length===1
    ?`<strong>${esc(names[0])}</strong>${totalQty>1?` (×${totalQty})`:''} verschieben nach…`
    :`<strong>${dcs.length} Einträge</strong> (${totalQty} Karten) verschieben nach…`;
  document.getElementById('movePickerSubject').innerHTML=subject;

  // Liste der existierenden Kategorien rendern. Pro Kategorie: Anzahl Karten.
  // "Ohne Kategorie" als Pseudo-Eintrag, falls Karten ohne Kategorie existieren oder
  // damit der User dorthin verschieben kann.
  const cats={};
  let uncatCount=0;
  for(const dc of currentDeckCards){
    const cat=(dc.category||'').trim();
    if(!cat)uncatCount+=dc.quantity||1;
    else cats[cat]=(cats[cat]||0)+(dc.quantity||1);
  }

  // Reihenfolge respektieren wie im Deck
  const deck=allDecks.find(d=>d.id===activeDeckId);
  const savedOrder=Array.isArray(deck?.category_order)?[...deck.category_order]:[];
  const orderedCats=[...new Set([...savedOrder.filter(c=>cats[c]),...Object.keys(cats)])];

  // Aktuelle Kategorie der ausgewählten Karten — zum Hervorheben/Disable
  const currentCats=new Set(dcs.map(dc=>dc.category||'__uncat__'));

  let html='';
  // "Ohne Kategorie"-Option immer anbieten — nützlich, um Karten "auszuparken"
  const isCurrentUncat=currentCats.has('__uncat__');
  html+=`<button class="move-picker-row${isCurrentUncat?' current':''}" onclick="moveToCategory('__uncat__')" ${isCurrentUncat?'disabled':''}>
    <span class="mp-arrow">→</span>
    <span class="mp-name"><em>⋯ Ohne Kategorie</em></span>
    ${uncatCount>0?`<span class="mp-count">${uncatCount}</span>`:''}
  </button>`;
  for(const cat of orderedCats){
    const isCurrent=currentCats.has(cat);
    html+=`<button class="move-picker-row${isCurrent?' current':''}" onclick="moveToCategory('${escJs(cat)}')" ${isCurrent?'disabled':''}>
      <span class="mp-arrow">→</span>
      <span class="mp-name">${esc(cat)}</span>
      <span class="mp-count">${cats[cat]}</span>
    </button>`;
  }
  document.getElementById('movePickerList').innerHTML=html;
  document.getElementById('movePickerNewInput').value='';

  document.getElementById('movePickerModal').classList.add('open');
}

function closeMovePicker(){
  closeModal('movePickerModal');
  movePickerDcIds=[];
}

// Karten verschieben: zu existierender Kategorie ('__uncat__' = Ohne Kategorie).
async function moveToCategory(cat){
  if(!movePickerDcIds.length)return;
  const categoryToSave=cat==='__uncat__'?null:cat;
  await performCategoryMove(movePickerDcIds,categoryToSave);
}

// Karten verschieben: zu einer NEU eingegebenen Kategorie.
async function moveToNewCategory(){
  if(!movePickerDcIds.length)return;
  const newName=(document.getElementById('movePickerNewInput').value||'').trim();
  if(!newName){toastError('Bitte einen Namen eingeben.');return;}
  await performCategoryMove(movePickerDcIds,newName);
}

// Gemeinsame DB-Update-Logik für beide Move-Wege.
async function performCategoryMove(dcIds,categoryToSave){
  let success=0,fail=0;
  for(const dcId of dcIds){
    const{error}=await _sb.from('deck_cards').update({category:categoryToSave}).eq('id',dcId);
    if(error){fail++;continue;}
    success++;
    const dc=currentDeckCards.find(c=>c.id===dcId);
    if(dc)dc.category=categoryToSave;
  }
  // Edit-Selektion zurücksetzen, falls von dort verschoben wurde
  deckEditSelected.clear();
  closeMovePicker();
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(deck)renderDeckDetail(deck);
  if(fail>0)toastError(`${success} verschoben, ${fail} Fehler`);
  else{
    const label=categoryToSave?`nach "${categoryToSave}"`:'in "Ohne Kategorie"';
    toastSuccess(`${success===1?'Karte':success+' Einträge'} ${label} verschoben`);
  }
}

// ── KATEGORIE-REIHENFOLGE ÄNDERN ──
//
// Verschiebt eine Kategorie eine Position rauf bzw. runter und speichert die
// neue Reihenfolge in deck.category_order zurück in die DB.
//
// Funktionsweise:
//   1. Aktuelle effektive Reihenfolge berechnen (saved order + neue Kategorien hinten)
//   2. Position der Kategorie finden, mit Nachbar tauschen
//   3. Neue Reihenfolge in DB speichern (decks.category_order)
//   4. Lokales allDecks updaten und Detail neu rendern

async function moveCategoryUp(category){
  await moveCategoryByOffset(category,-1);
}
async function moveCategoryDown(category){
  await moveCategoryByOffset(category,1);
}

async function moveCategoryByOffset(category,offset){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;

  // Schutz: Commander-Kategorie in Commander-Decks ist fixiert
  if(deck.format==='Commander'&&category==='Commander')return;

  // Aktuelle Reihenfolge berechnen — wie in renderDeckDetail
  const cats={};
  currentDeckCards.forEach(dc=>{
    const cat=(dc.category||'').trim();
    if(cat){if(!cats[cat])cats[cat]=[];cats[cat].push(dc);}
  });
  const DEFAULT_CAT_ORDER=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const savedOrder=Array.isArray(deck.category_order)?[...deck.category_order]:[];
  const baseOrder=savedOrder.length?savedOrder:DEFAULT_CAT_ORDER;
  const visibleCats=[...new Set([...baseOrder.filter(c=>cats[c]),...Object.keys(cats)])].filter(c=>cats[c]);

  const idx=visibleCats.indexOf(category);
  const newIdx=idx+offset;
  if(idx===-1||newIdx<0||newIdx>=visibleCats.length)return;

  // Tauschen
  [visibleCats[idx],visibleCats[newIdx]]=[visibleCats[newIdx],visibleCats[idx]];

  // In DB speichern (lokal: zuerst, damit's instant rendern kann)
  const{error}=await _sb.from('decks').update({category_order:visibleCats}).eq('id',deck.id);
  if(error){
    toastError('Konnte Reihenfolge nicht speichern: '+error.message);
    return;
  }
  deck.category_order=visibleCats;
  renderDeckDetail(deck);
}


// ══════════════════════════════════════════════════════════
//  DECK-ERWEITERUNG · Nicht besessene Karten + Fehlt-Liste
// ══════════════════════════════════════════════════════════
//
//  Macht ein Deck zu einer eigenständigen Wunschliste:
//   - Karten können per Suche hinzugefügt werden — auch welche, die man
//     NICHT besitzt. Solche deck_cards tragen ihre Identität selbst
//     (card_name, scryfall_id, set_code, … plus mana_value/colors/
//     color_identity/type_line/legal_commander für Statistik+Validierung)
//     und haben card_id = null.
//   - Ob eine Karte "besessen" ist, wird LIVE per Namensabgleich mit der
//     Sammlung bestimmt: kaufst du sie später und importierst sie, stimmt
//     die Markierung automatisch.
//   - Fehlt-Liste: alle Kartennamen in einem Deck (oder über ALLE Decks),
//     die nicht in der Sammlung sind — kopierbar + als .txt herunterladbar.
//
//  Voraussetzung: einmalige SQL-Erweiterung an deck_cards (siehe Anleitung).

// ── Auflösung einer Deck-Karte ──
// Besessene Karte (card_id triff in der Sammlung)? → die Sammlungskarte,
// exakt wie bisher. Sonst → karten-ähnliche Struktur aus den am deck_card
// gespeicherten Feldern (für Suche hinzugefügte / nicht besessene Karten).
function resolveDeckCard(dc){
  // 1) Direkter Treffer über card_id (explizit aus der Sammlung gewählte Druckung).
  if(dc.card_id){
    const c=allCards.find(x=>x.id===dc.card_id);
    if(c)return c;
  }
  // 2) Besitzt du diese Karte (per Name)? → nimm eine besessene Druckung (die
  //    älteste), damit das Deck die Version zeigt, die du tatsächlich hast –
  //    statt der Scryfall-Standarddruckung. Greift auch rückwirkend.
  const nm=(dc.card_name||dc.card_id||'').toLowerCase().trim();
  if(nm){
    const owned=allCards.filter(c=>(c.name||'').toLowerCase().trim()===nm);
    if(owned.length)return pickOldestPrinting(owned);
  }
  // 3) Sonst (nicht besessen): die am deck_card gespeicherten Felder.
  return {
    id:'dc:'+dc.id,
    name:dc.card_name||dc.card_id||'Unbekannt',
    scryfall_id:dc.scryfall_id||null,
    set_code:dc.set_code||'',
    set_name:dc.set_name||'',
    collector_number:dc.collector_number||'',
    rarity:dc.rarity||'',
    mana_value:(dc.mana_value!=null?dc.mana_value:null),
    colors:Array.isArray(dc.colors)?dc.colors:[],
    color_identity:Array.isArray(dc.color_identity)?dc.color_identity:[],
    type_line:dc.type_line||null,
    legal_commander:dc.legal_commander||null,
    purchase_price:null,
    foil:null
  };
}

// Älteste Druckung aus einer Liste von Sammlungskarten (nach Set-Release-Datum).
// Karten mit unbekanntem Datum landen hinten. Spiegelt die Logik aus collection.js.
function pickOldestPrinting(list){
  return [...list].sort((a,b)=>{
    const da=(typeof setReleasedAt==='function')?setReleasedAt(a.set_code):'';
    const db=(typeof setReleasedAt==='function')?setReleasedAt(b.set_code):'';
    if(!da&&!db)return (a.set_code||'').localeCompare(b.set_code||'');
    if(!da)return 1;
    if(!db)return -1;
    return da.localeCompare(db);
  })[0];
}

// Map: Kartenname (lowercase) → besessene Gesamtmenge. Einmal pro Aufruf gebaut.
function buildOwnedNameMap(){
  const m=new Map();
  for(const c of allCards){
    const n=(c.name||'').toLowerCase().trim();
    if(!n)continue;
    m.set(n,(m.get(n)||0)+(c.quantity||0));
  }
  return m;
}
function ownedQtyByName(name){
  if(!name)return 0;
  return buildOwnedNameMap().get(name.toLowerCase().trim())||0;
}

// Statistik & Validierung sollen nicht besessene Karten MITZÄHLEN:
// Wir leiten ihre Karten-Auflösung auf den Resolver um. (Override der globalen
// Helfer aus deck-stats.js / deck-validation.js — decks.js lädt danach,
// daher greift die Umleitung zur Laufzeit.)
if(typeof dcCard!=='undefined'){ dcCard=function(dc){return resolveDeckCard(dc);}; }
if(typeof dvCard!=='undefined'){ dvCard=function(dc){return resolveDeckCard(dc);}; }

// ── DB: Karte mit eigenen Feldern (denormalisiert) ins Deck schreiben ──
async function addToDeckDenorm(deckId,cardData,category,quantity){
  const{data:rows}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  const catNorm=category||null;
  const nameNorm=(cardData.card_name||'').toLowerCase().trim();
  // Gleiche per-Suche-Karte (Name + Kategorie) schon da? → Menge erhöhen.
  const match=(rows||[]).find(r=>
    !r.card_id &&
    ((r.card_name||'').toLowerCase().trim()===nameNorm) &&
    ((r.category||null)===catNorm)
  );
  if(match){
    const{error}=await _sb.from('deck_cards').update({quantity:(match.quantity||0)+quantity}).eq('id',match.id);
    if(error){toastError('Fehler: '+error.message);return false;}
    return true;
  }
  const row=Object.assign({
    deck_id:deckId,
    card_id:null,
    category:catNorm,
    quantity:quantity,
    user_id:currentUser.id
  },cardData);
  const{error}=await _sb.from('deck_cards').insert(row);
  if(error){toastError('Fehler: '+error.message);return false;}
  return true;
}

// ── Styles + Modals einmalig einfügen ──
(function injectDeckExtras(){
  if(!document.getElementById('dx-styles')){
    const css=[
      '.dc-card-tile.dc-not-owned{opacity:0.5;filter:grayscale(0.4);}',
      '.dc-card-tile.dc-not-owned img{outline:1px dashed var(--border2);outline-offset:-3px;}',
      ".dc-miss-badge{position:absolute;top:4px;left:4px;z-index:3;background:var(--red);color:#fff;font-family:'Cinzel',serif;font-size:0.55rem;letter-spacing:0.06em;padding:0.1rem 0.35rem;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.5);}",
      '.deck-card-row.dc-not-owned{opacity:0.72;}',
      ".dc-miss-tag{display:inline-block;margin-left:0.5rem;background:var(--red);color:#fff;font-family:'Cinzel',serif;font-size:0.55rem;letter-spacing:0.05em;padding:0.05rem 0.35rem;border-radius:4px;vertical-align:middle;}",
      '#deckSearchModal .modal{max-width:560px;width:100%;}',
      '.dxm-list{max-height:34vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:0.3rem 0.7rem;margin:0.6rem 0;}',
      '.dxm-row{display:flex;justify-content:space-between;gap:0.6rem;padding:0.3rem 0;border-bottom:1px solid var(--border);font-family:\'EB Garamond\',serif;color:var(--text);}',
      '.dxm-row:last-child{border-bottom:none;}',
      ".dxm-qty{color:var(--gold2);font-family:'Cinzel',serif;font-size:0.8rem;flex-shrink:0;}",
      ".dxm-text{width:100%;min-height:130px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0.6rem;font-family:'EB Garamond',serif;font-size:0.95rem;resize:vertical;box-sizing:border-box;}",
      '.dxm-empty{padding:1.2rem;text-align:center;color:var(--text2);}'
    ].join('\n');
    const s=document.createElement('style');s.id='dx-styles';s.textContent=css;document.head.appendChild(s);
  }

  if(!document.getElementById('deckSearchModal')){
    const w=document.createElement('div');
    w.innerHTML=`
<div class="modal-overlay" id="deckSearchModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)">KARTE PER SUCHE INS DECK</span>
      <button class="modal-close" onclick="closeModal('deckSearchModal')">✕</button>
    </div>
    <div class="modal-detail">
      <div class="form-field acs-search-wrap">
        <label>KARTE SUCHEN</label>
        <input id="dxsSearch" placeholder="Kartenname tippen…" autocomplete="off" spellcheck="false">
        <div class="acs-suggestions" id="dxsSuggestions"></div>
      </div>
      <div class="acs-printings" id="dxsPrintings"></div>
      <div class="acs-detail" id="dxsDetail" style="display:none">
        <img class="acs-detail-img" id="dxsImg" alt="">
        <div class="acs-detail-controls">
          <div id="dxsTitle" style="font-family:'EB Garamond',serif;font-size:1.05rem;color:var(--text);margin-bottom:0.1rem;"></div>
          <div id="dxsSub" style="font-size:0.8rem;color:var(--text2);margin-bottom:0.7rem;"></div>
          <div class="acs-row2" style="display:flex;gap:0.6rem;">
            <div class="form-field" style="flex:0 0 90px"><label>ANZAHL</label><input type="number" id="dxsQty" min="1" max="99" value="1"></div>
            <div class="form-field" style="flex:1"><label>KATEGORIE</label><input id="dxsCat" placeholder="optional" list="dxsCatList" autocomplete="off"><datalist id="dxsCatList"></datalist></div>
          </div>
          <div id="dxsOwnHint" style="font-size:0.78rem;margin:-0.1rem 0 0.6rem;"></div>
          <div class="btn-row">
            <button class="btn btn-primary" id="dxsAdd">Ins Deck aufnehmen</button>
            <button class="btn" onclick="closeModal('deckSearchModal')">Abbrechen</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="missingModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)" id="missingTitle">FEHLENDE KARTEN</span>
      <button class="modal-close" onclick="closeModal('missingModal')">✕</button>
    </div>
    <div class="modal-detail" id="missingBody"></div>
  </div>
</div>`;
    while(w.firstElementChild){ document.body.appendChild(w.firstElementChild); }
  }

  // "Fehlende Karten (alle Decks)"-Button in die Decks-Übersicht hängen
  const hdr=document.querySelector('.decks-header');
  if(hdr && !document.getElementById('dxAllMissingBtn')){
    const b=document.createElement('button');
    b.id='dxAllMissingBtn';b.className='back-btn';b.type='button';
    b.textContent='✦ Fehlende Karten';
    b.title='Alle Karten aus deinen Decks, die du nicht besitzt';
    b.style.marginLeft='0.5rem';
    b.addEventListener('click',function(){ openMissingModal(null); });
    hdr.appendChild(b);
  }
})();

// ── Deck-Suche: Status + Logik ──
let _dxsPrintings=[], _dxsSelected=null, _dxsDebounce=null;

function openDeckSearchModal(){
  if(!activeDeckId){toastError('Bitte zuerst ein Deck öffnen.');return;}
  _dxsPrintings=[];_dxsSelected=null;
  document.getElementById('dxsSearch').value='';
  document.getElementById('dxsSuggestions').innerHTML='';
  document.getElementById('dxsPrintings').innerHTML='';
  document.getElementById('dxsDetail').style.display='none';
  document.getElementById('dxsQty').value=1;
  document.getElementById('dxsCat').value='';
  const cats=[...new Set(currentDeckCards.map(dc=>dc.category).filter(Boolean))];
  const defs=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const all=[...new Set([...cats,...defs])];
  document.getElementById('dxsCatList').innerHTML=all.map(c=>`<option value="${esc(c)}">`).join('');
  document.getElementById('deckSearchModal').classList.add('open');
  setTimeout(()=>{const e=document.getElementById('dxsSearch');if(e)e.focus();},60);
}

async function dxsFetchSuggestions(q){
  try{
    const res=await fetch('https://api.scryfall.com/cards/autocomplete?q='+encodeURIComponent(q));
    if(!res.ok)throw 0;
    const data=await res.json();
    const box=document.getElementById('dxsSuggestions');
    const names=data.data||[];
    if(!names.length){box.innerHTML='';return;}
    box.innerHTML='';
    names.forEach(name=>{
      const d=document.createElement('div');d.className='acs-suggestion';d.textContent=name;
      d.addEventListener('mousedown',ev=>{ev.preventDefault();dxsChoose(name);});
      box.appendChild(d);
    });
  }catch(e){ const b=document.getElementById('dxsSuggestions');if(b)b.innerHTML=''; }
}

function dxsChoose(name){
  document.getElementById('dxsSearch').value=name;
  document.getElementById('dxsSuggestions').innerHTML='';
  dxsLoadPrintings(name);
}

async function dxsLoadPrintings(name){
  _dxsSelected=null;document.getElementById('dxsDetail').style.display='none';
  const box=document.getElementById('dxsPrintings');
  box.innerHTML='<div class="acs-msg">Lade Druckungen…</div>';
  try{
    const q='!"'+name.replace(/"/g,'')+'"';
    const res=await fetch('https://api.scryfall.com/cards/search?order=released&dir=asc&unique=prints&q='+encodeURIComponent(q));
    if(res.status===404){box.innerHTML='<div class="acs-msg">Keine Karte mit diesem Namen gefunden.</div>';return;}
    if(!res.ok)throw 0;
    const data=await res.json();
    _dxsPrintings=data.data||[];
    if(!_dxsPrintings.length){box.innerHTML='<div class="acs-msg">Keine Druckungen gefunden.</div>';return;}
    box.innerHTML='';
    _dxsPrintings.forEach((c,idx)=>{
      const img=(c.image_uris&&c.image_uris.small)||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.small)||'';
      const price=(c.prices&&c.prices.eur)?'€'+c.prices.eur:((c.prices&&c.prices.eur_foil)?'€'+c.prices.eur_foil+' (Foil)':'–');
      const row=document.createElement('div');row.className='acs-print-row';
      row.innerHTML='<img class="acs-thumb" loading="lazy" alt="" src="'+img+'">'+
        '<div class="acs-print-info"><div class="acs-print-name">'+esc(c.name)+'</div>'+
        '<div class="acs-print-meta">'+esc(c.set_name||'')+' ('+(c.set||'').toUpperCase()+') · #'+esc(c.collector_number||'?')+'</div></div>'+
        '<div class="acs-print-price">'+price+'</div>';
      row.addEventListener('click',()=>dxsSelect(idx));
      box.appendChild(row);
    });
  }catch(e){ box.innerHTML='<div class="acs-msg">Fehler beim Laden der Druckungen.</div>'; }
}

function dxsSelect(idx){
  _dxsSelected=_dxsPrintings[idx];
  const c=_dxsSelected;
  document.querySelectorAll('#dxsPrintings .acs-print-row').forEach((r,i)=>r.classList.toggle('selected',i===idx));
  const img=(c.image_uris&&c.image_uris.normal)||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.normal)||'';
  document.getElementById('dxsImg').src=img;
  document.getElementById('dxsTitle').textContent=c.name;
  document.getElementById('dxsSub').textContent=(c.set_name||'')+' ('+(c.set||'').toUpperCase()+') · #'+(c.collector_number||'?');
  const owned=ownedQtyByName(c.name)>0;
  const hint=document.getElementById('dxsOwnHint');
  hint.textContent=owned?'✓ In deiner Sammlung vorhanden.':'✦ Nicht in deiner Sammlung — wird im Deck als „fehlt" markiert.';
  hint.style.color=owned?'var(--green)':'var(--text2)';
  document.getElementById('dxsDetail').style.display='flex';
  document.getElementById('dxsDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function dxsAddToDeck(){
  if(!_dxsSelected||!activeDeckId)return;
  const c=_dxsSelected;
  const qty=Math.max(1,parseInt(document.getElementById('dxsQty').value,10)||1);
  const category=(document.getElementById('dxsCat').value||'').trim()||null;
  const cardData={
    card_name:c.name,
    scryfall_id:c.id,
    set_code:(c.set||'').toUpperCase(),
    set_name:c.set_name||'',
    collector_number:c.collector_number||'',
    rarity:(c.rarity||'').toLowerCase(),
    mana_value:(c.cmc!=null?Math.floor(c.cmc):null),
    colors:c.colors||[],
    color_identity:c.color_identity||[],
    type_line:c.type_line||null,
    legal_commander:(c.legalities&&c.legalities.commander)||null
  };
  const btn=document.getElementById('dxsAdd');
  if(typeof setBusy==='function')setBusy(btn,true);else btn.disabled=true;
  const ok=await addToDeckDenorm(activeDeckId,cardData,category,qty);
  if(typeof setBusy==='function')setBusy(btn,false);else btn.disabled=false;
  if(!ok)return;
  currentDeckCards=await loadDeckCards(activeDeckId);
  const deck=allDecks.find(d=>d.id===activeDeckId);
  renderDeckDetail(deck);
  closeModal('deckSearchModal');
  const owned=ownedQtyByName(c.name)>0;
  if(typeof toastSuccess==='function')toastSuccess('✓ '+qty+'× '+c.name+' ins Deck'+(owned?'':' (fehlt in Sammlung)'));
}

// Verdrahtung der Deck-Suche (Elemente wurden oben injiziert)
(function wireDeckSearch(){
  const s=document.getElementById('dxsSearch');
  if(!s)return;
  const addBtn=document.getElementById('dxsAdd');
  if(addBtn)addBtn.addEventListener('click',dxsAddToDeck);
  const ov=document.getElementById('deckSearchModal');
  if(ov)ov.addEventListener('click',function(ev){ if(ev.target===this)closeModal('deckSearchModal'); });
  s.addEventListener('input',function(){
    clearTimeout(_dxsDebounce);
    const q=s.value.trim();
    _dxsSelected=null;document.getElementById('dxsDetail').style.display='none';
    if(q.length<2){document.getElementById('dxsSuggestions').innerHTML='';return;}
    _dxsDebounce=setTimeout(()=>dxsFetchSuggestions(q),300);
  });
  s.addEventListener('keydown',function(ev){ if(ev.key==='Enter'){ev.preventDefault();const v=s.value.trim();if(v.length>=2)dxsChoose(v);} });
})();

// ── Fehlt-Liste ──
// deckId (string) → genau dieses Deck; null → ALLE Decks zusammen.
async function openMissingModal(deckId){
  const titleEl=document.getElementById('missingTitle');
  const body=document.getElementById('missingBody');
  body.innerHTML='<div class="dxm-empty">Wird berechnet…</div>';
  document.getElementById('missingModal').classList.add('open');

  let dcs=[];
  if(deckId){
    const deck=allDecks.find(d=>d.id===deckId);
    titleEl.textContent='FEHLENDE KARTEN · '+(((deck&&deck.name)||'Deck').toUpperCase());
    dcs=(deckId===activeDeckId&&currentDeckCards.length)?currentDeckCards:await loadDeckCards(deckId);
  }else{
    titleEl.textContent='FEHLENDE KARTEN · ALLE DECKS';
    const{data}=await _sb.from('deck_cards').select('*');
    dcs=data||[];
  }

  const ownedMap=buildOwnedNameMap();
  const miss={};
  for(const dc of dcs){
    const name=resolveDeckCard(dc).name;
    if(!name||name==='Unbekannt')continue;
    if((ownedMap.get(name.toLowerCase().trim())||0)>0)continue; // besitzt du → nicht fehlend
    const key=name.toLowerCase().trim();
    if(!miss[key])miss[key]={name:name,qty:0};
    miss[key].qty+=(dc.quantity||1);
  }
  const list=Object.values(miss).sort((a,b)=>a.name.localeCompare(b.name));

  if(!list.length){
    body.innerHTML='<div class="dxm-empty">🎉 Dir fehlt keine Karte — alles ist in deiner Sammlung.</div>';
    return;
  }

  const rowsHtml=list.map(m=>`<div class="dxm-row"><span>${esc(m.name)}</span><span class="dxm-qty">×${m.qty}</span></div>`).join('');
  const textValue=list.map(m=>m.qty+' '+m.name).join('\n');

  body.innerHTML=`
    <div style="color:var(--text2);font-size:0.9rem;margin-bottom:0.2rem">${list.length} Karte${list.length===1?'':'n'}, die du nicht besitzt:</div>
    <div class="dxm-list">${rowsHtml}</div>
    <label style="font-size:0.65rem;color:var(--text3);font-family:'Cinzel',serif;letter-spacing:0.1em">ALS TEXT (KOPIERBAR)</label>
    <textarea class="dxm-text" id="missingText" readonly>${esc(textValue)}</textarea>
    <div class="btn-row">
      <button class="btn btn-primary" id="missingCopyBtn">In Zwischenablage kopieren</button>
      <button class="btn" id="missingDlBtn">Als .txt herunterladen</button>
    </div>`;
  document.getElementById('missingCopyBtn').addEventListener('click',function(){
    const t=document.getElementById('missingText');t.select();
    try{ navigator.clipboard.writeText(t.value); }catch(e){ try{document.execCommand('copy');}catch(_){} }
    if(typeof toastSuccess==='function')toastSuccess('✓ Liste kopiert');
  });
  document.getElementById('missingDlBtn').addEventListener('click',function(){
    const blob=new Blob([textValue],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='fehlende-karten.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
}


// ══════════════════════════════════════════════════════════
//  DECK-BAU 2.0 · Tippfeld pro Kategorie + einfaches Karten-Fenster
// ══════════════════════════════════════════════════════════
//
//  Entkoppelt das Deck von der Sammlung (deckstats-Stil):
//   - In jeder Kategorie (und in "Ohne Kategorie") gibt es ein Tippfeld:
//     Name eintippen → Vorschläge → auswählen/Enter → Karte landet sofort
//     in genau dieser Kategorie. Schreibt denormalisiert via addToDeckDenorm,
//     Besitz wird wie gehabt live per Name bestimmt ("fehlt"-Markierung).
//   - Klick auf eine Deck-Karte öffnet ein schlichtes Fenster (Anzahl,
//     Kategorie, Entfernen, Scryfall-Link) statt der Sammlungs-Varianten.

// Markup für das Tippfeld einer Kategorie. cat='' bedeutet "Ohne Kategorie".
function inlineAddRow(cat){
  const c=cat||'';
  return `<div class="dca-add" data-cat="${esc(c)}">
    <input class="dca-input" type="text" placeholder="＋ Karte tippen…" autocomplete="off" spellcheck="false">
    <input class="dca-qty" type="number" min="1" max="99" value="1" title="Anzahl">
    <button class="dca-btn" type="button" title="Hinzufügen">＋</button>
    <div class="dca-suggestions"></div>
  </div>`;
}

// Nach erneutem Rendern das zuletzt benutzte Tippfeld wieder fokussieren,
// damit man zügig mehrere Karten hintereinander eintippen kann.
let _dcaRefocusCat=null;
function dcaPostRender(){
  if(_dcaRefocusCat===null)return;
  const sel='.dca-add[data-cat="'+(window.CSS&&CSS.escape?CSS.escape(_dcaRefocusCat):_dcaRefocusCat)+'"] .dca-input';
  const inp=document.querySelector(sel);
  _dcaRefocusCat=null;
  if(inp){ inp.focus(); }
}

// Autocomplete-Vorschläge für ein Tippfeld laden
async function dcaSuggest(q,sugEl){
  try{
    const res=await fetch('https://api.scryfall.com/cards/autocomplete?q='+encodeURIComponent(q));
    if(!res.ok)throw 0;
    const data=await res.json();
    const names=(data.data||[]).slice(0,12);
    if(!names.length){sugEl.innerHTML='';return;}
    sugEl.innerHTML=names.map(n=>`<div class="dca-suggestion">${esc(n)}</div>`).join('');
  }catch(e){ sugEl.innerHTML=''; }
}

// Aus einem Tippfeld heraus eine Karte ins Deck übernehmen
function dcaCommit(wrap,rawName,exact){
  const name=(rawName||'').trim();
  if(!name)return;
  const cat=wrap.dataset.cat||'';
  const qtyEl=wrap.querySelector('.dca-qty');
  const qty=Math.max(1,parseInt(qtyEl&&qtyEl.value,10)||1);
  const sug=wrap.querySelector('.dca-suggestions');
  if(sug)sug.innerHTML='';
  addInlineCard(name,cat,qty,exact);
}

async function addInlineCard(name,cat,qty,exact){
  if(!activeDeckId){toastError('Bitte zuerst ein Deck öffnen.');return;}
  let c;
  try{
    const url='https://api.scryfall.com/cards/named?'+(exact?'exact=':'fuzzy=')+encodeURIComponent(name);
    const res=await fetch(url);
    if(!res.ok){toastError('Karte nicht gefunden: '+name);return;}
    c=await res.json();
  }catch(e){ toastError('Scryfall nicht erreichbar.');return; }
  const cardData={
    card_name:c.name,
    scryfall_id:c.id,
    set_code:(c.set||'').toUpperCase(),
    set_name:c.set_name||'',
    collector_number:c.collector_number||'',
    rarity:(c.rarity||'').toLowerCase(),
    mana_value:(c.cmc!=null?Math.floor(c.cmc):null),
    colors:c.colors||[],
    color_identity:c.color_identity||[],
    type_line:c.type_line||null,
    legal_commander:(c.legalities&&c.legalities.commander)||null
  };
  const ok=await addToDeckDenorm(activeDeckId,cardData,cat||null,qty);
  if(!ok)return;
  _dcaRefocusCat=cat||'';                       // nach Render wieder hierhin fokussieren
  currentDeckCards=await loadDeckCards(activeDeckId);
  renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
  const owned=ownedQtyByName(c.name)>0;
  toastSuccess('✓ '+(qty>1?qty+'× ':'')+c.name+(owned?'':' (fehlt)'));
}

// Delegierte Listener — einmalig auf dem (persistenten) Deck-Detail-Container.
// Überleben das Neu-Rendern, weil das Element bleibt und nur sein Inhalt wechselt.
(function wireInlineAdd(){
  const root=document.getElementById('deck-detail-view');
  if(!root||root.dataset.dcaWired)return;
  root.dataset.dcaWired='1';
  let deb=null;
  root.addEventListener('input',function(ev){
    const inp=ev.target.closest&&ev.target.closest('.dca-input');if(!inp)return;
    const wrap=inp.closest('.dca-add');const sug=wrap.querySelector('.dca-suggestions');
    clearTimeout(deb);
    const q=inp.value.trim();
    if(q.length<2){sug.innerHTML='';return;}
    deb=setTimeout(()=>dcaSuggest(q,sug),250);
  });
  root.addEventListener('keydown',function(ev){
    const inp=ev.target.closest&&ev.target.closest('.dca-input');if(!inp)return;
    if(ev.key==='Enter'){ev.preventDefault();dcaCommit(inp.closest('.dca-add'),inp.value,false);}
    else if(ev.key==='Escape'){inp.closest('.dca-add').querySelector('.dca-suggestions').innerHTML='';}
  });
  root.addEventListener('click',function(ev){
    const btn=ev.target.closest&&ev.target.closest('.dca-btn');
    if(!btn)return;
    const wrap=btn.closest('.dca-add');
    dcaCommit(wrap,wrap.querySelector('.dca-input').value,false);
  });
  // Auswahl eines Vorschlags: mousedown (feuert vor blur), fügt sofort hinzu
  root.addEventListener('mousedown',function(ev){
    const s=ev.target.closest&&ev.target.closest('.dca-suggestion');if(!s)return;
    ev.preventDefault();
    dcaCommit(s.closest('.dca-add'),s.textContent,true);
  });
})();

// ── Einfaches Deck-Karten-Fenster (ersetzt die Sammlungs-Varianten-Ansicht) ──
let _dcmIds=[];
function openDeckCardModal(dcIdsCsv){
  const ids=(dcIdsCsv||'').split(',').filter(Boolean);
  const rows=ids.map(id=>currentDeckCards.find(d=>d.id===id)).filter(Boolean);
  if(!rows.length)return;
  _dcmIds=rows.map(r=>r.id);
  const rep=rows[0];
  const card=resolveDeckCard(rep);
  const totalQty=rows.reduce((s,r)=>s+(r.quantity||1),0);
  const owned=ownedQtyByName(card.name)>0;
  const img=iUrl(card);
  const cats=[...new Set(currentDeckCards.map(dc=>dc.category).filter(Boolean))];
  const defs=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const allCats=[...new Set([...cats,...defs])];
  const scry=card.scryfall_id?('https://scryfall.com/card/'+(card.set_code||'').toLowerCase()+'/'+(card.collector_number||'')):null;
  document.getElementById('deckCardModalBody').innerHTML=`
    <div class="dcm-wrap">
      ${img?`<img class="dcm-img" src="${img}" alt="${esc(card.name)}">`:`<div class="dcm-img dcm-noimg">🃏</div>`}
      <div class="dcm-controls">
        <div class="dcm-name">${esc(card.name)}</div>
        <div class="dcm-meta">${esc(card.set_code||'')}${card.collector_number?' #'+esc(card.collector_number):''}</div>
        <div class="dcm-own ${owned?'is-owned':'is-missing'}">${owned?'✓ In deiner Sammlung':'✦ Nicht in Sammlung — fehlt'}</div>
        <div class="form-field"><label>ANZAHL</label>
          <div class="dcm-qty-row">
            <button type="button" class="dcm-step" onclick="dcmStep(-1)">−</button>
            <input type="number" id="dcmQty" min="1" max="99" value="${totalQty}">
            <button type="button" class="dcm-step" onclick="dcmStep(1)">＋</button>
          </div>
        </div>
        <div class="form-field"><label>KATEGORIE</label>
          <input id="dcmCat" list="dcmCatList" placeholder="Ohne Kategorie" value="${esc(rep.category||'')}" autocomplete="off">
          <datalist id="dcmCatList">${allCats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        ${rows.length>1?`<div class="dcm-hint">Hinweis: ${rows.length} Druckungen — werden beim Speichern zu einem Eintrag zusammengefasst.</div>`:''}
        <div class="btn-row">
          <button class="btn btn-primary" onclick="saveDeckCardModal()">Speichern</button>
          <button class="btn" onclick="closeModal('deckCardModal');removeDeckCardGroup('${_dcmIds.join(',')}')">Entfernen</button>
        </div>
        ${scry?`<a class="dcm-scry" href="${scry}" target="_blank" rel="noopener">🔗 Auf Scryfall ansehen</a>`:''}
      </div>
    </div>`;
  document.getElementById('deckCardModal').classList.add('open');
}
function dcmStep(d){
  const i=document.getElementById('dcmQty');
  i.value=Math.min(99,Math.max(1,(parseInt(i.value,10)||1)+d));
}
async function saveDeckCardModal(){
  const ids=_dcmIds.slice();
  if(!ids.length||!activeDeckId)return;
  const newQty=Math.min(99,Math.max(1,parseInt(document.getElementById('dcmQty').value,10)||1));
  const newCat=(document.getElementById('dcmCat').value||'').trim()||null;
  const repId=ids[0];
  const rep=currentDeckCards.find(d=>d.id===repId);
  const patch={quantity:newQty,category:newCat};
  // Alt-Zeilen (mit card_id, ohne eigene Felder) beim Speichern konsolidieren
  if(rep&&!rep.card_name){
    const c=resolveDeckCard(rep);
    patch.card_id=null;
    patch.card_name=c.name;patch.scryfall_id=c.scryfall_id;patch.set_code=c.set_code;
    patch.set_name=c.set_name;patch.collector_number=c.collector_number;patch.rarity=c.rarity;
    patch.mana_value=c.mana_value;patch.colors=c.colors;patch.color_identity=c.color_identity;
    patch.type_line=c.type_line;patch.legal_commander=c.legal_commander;
  }
  const{error}=await _sb.from('deck_cards').update(patch).eq('id',repId);
  if(error){toastError('Fehler: '+error.message);return;}
  for(let i=1;i<ids.length;i++){ await removeDeckCardDB(ids[i]); }
  currentDeckCards=await loadDeckCards(activeDeckId);
  renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
  closeModal('deckCardModal');
  toastSuccess('✓ Gespeichert');
}

// ── Styles + Modal-Element für Deck-Bau 2.0 (einmalig) ──
(function injectDeckBuild2(){
  if(!document.getElementById('dx2-styles')){
    const css=[
      '.dca-add{position:relative;display:flex;gap:0.4rem;align-items:center;margin:0.7rem 0.2rem 0.2rem;}',
      ".dca-input{flex:1;min-width:0;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:0.45rem 0.6rem;font-family:'EB Garamond',serif;font-size:0.95rem;}",
      '.dca-input:focus{outline:none;border-color:var(--gold-dim);}',
      ".dca-qty{width:52px;flex:0 0 auto;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:0.45rem 0.3rem;text-align:center;font-family:'EB Garamond',serif;}",
      ".dca-btn{flex:0 0 auto;background:var(--surface3);border:1px solid var(--border2);color:var(--gold2);border-radius:6px;width:38px;height:36px;font-size:1.05rem;cursor:pointer;}",
      '.dca-btn:hover{background:var(--surface2);border-color:var(--gold-dim);}',
      '.dca-suggestions{position:absolute;top:100%;left:0;right:54px;z-index:60;background:var(--surface2);border:1px solid var(--border2);border-radius:0 0 8px 8px;max-height:240px;overflow-y:auto;box-shadow:0 10px 28px rgba(0,0,0,0.55);}',
      '.dca-suggestions:empty{display:none;}',
      ".dca-suggestion{padding:0.45rem 0.7rem;cursor:pointer;font-family:'EB Garamond',serif;color:var(--text);border-bottom:1px solid var(--border);}",
      '.dca-suggestion:last-child{border-bottom:none;}',
      '.dca-suggestion:hover{background:var(--surface3);color:var(--gold2);}',
      '.dcm-wrap{display:flex;gap:1rem;flex-wrap:wrap;}',
      '.dcm-img{width:180px;max-width:42%;border-radius:10px;align-self:flex-start;}',
      '.dcm-noimg{display:flex;align-items:center;justify-content:center;font-size:2rem;background:var(--surface2);min-height:170px;}',
      '.dcm-controls{flex:1;min-width:210px;}',
      ".dcm-name{font-family:'EB Garamond',serif;font-size:1.15rem;color:var(--text);}",
      '.dcm-meta{font-size:0.8rem;color:var(--text2);margin-bottom:0.3rem;}',
      '.dcm-own{font-size:0.82rem;margin-bottom:0.7rem;}',
      '.dcm-own.is-owned{color:var(--green);}',
      '.dcm-own.is-missing{color:var(--red);}',
      '.dcm-qty-row{display:flex;gap:0.4rem;align-items:center;}',
      '.dcm-qty-row input{width:70px;text-align:center;}',
      ".dcm-step{width:34px;height:34px;background:var(--surface3);border:1px solid var(--border2);color:var(--gold2);border-radius:6px;font-size:1.05rem;cursor:pointer;}",
      '.dcm-hint{font-size:0.75rem;color:var(--text2);margin:0.4rem 0;}',
      '.dcm-scry{display:inline-block;margin-top:0.6rem;color:var(--teal);text-decoration:none;font-size:0.85rem;}'
    ].join('\n');
    const s=document.createElement('style');s.id='dx2-styles';s.textContent=css;document.head.appendChild(s);
  }
  if(!document.getElementById('deckCardModal')){
    const w=document.createElement('div');
    w.innerHTML=`
<div class="modal-overlay" id="deckCardModal">
  <div class="modal small-modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)">KARTE IM DECK</span>
      <button class="modal-close" onclick="closeModal('deckCardModal')">✕</button>
    </div>
    <div class="modal-detail" id="deckCardModalBody"></div>
  </div>
</div>`;
    while(w.firstElementChild){ document.body.appendChild(w.firstElementChild); }
    document.getElementById('deckCardModal').addEventListener('click',function(ev){ if(ev.target===this)closeModal('deckCardModal'); });
  }
})();
