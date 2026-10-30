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
  //   value:        Gesamtwert in € (purchase_price × quantity, nur besessene Karten)
  //   avgMv:        Durchschnittlicher Manawert (ohne Länder)
  //   colors:       Set der Farben, die im Deck vorkommen (ohne Länder)
  // Karten werden wie im Deck-Detail über resolveDeckCard aufgelöst — so zählen
  // auch nicht besessene Karten mit und Übersicht + Detail zeigen dieselben Werte.
  const stats={};
  try{
    const{data:deckCards,error}=await fetchAllRows('deck_cards');
    if(!error&&deckCards){
      const ownedIndex=buildOwnedIndex();
      for(const dc of deckCards){
        if(!stats[dc.deck_id])stats[dc.deck_id]={count:0,value:0,manaSum:0,nonLandCount:0,colors:new Set()};
        const qty=parseInt(dc.quantity,10)||1;
        stats[dc.deck_id].count+=qty;
        const card=resolveDeckCard(dc,ownedIndex);
        stats[dc.deck_id].value+=parsePrice(card.purchase_price)*qty;
        // Manawert + Farben nur für Nicht-Länder zählen (sonst dominieren Lands die Charts)
        if(card.type_line&&card.mana_value!=null){
          const isLand=(card.type_line||'').toLowerCase().includes('land');
          if(!isLand){
            stats[dc.deck_id].manaSum+=card.mana_value*qty;
            stats[dc.deck_id].nonLandCount+=qty;
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

// ── Reihenfolge der Kategorien eines Decks ──
// Gespeicherte Reihenfolge (deck.category_order) hat Vorrang, sonst die
// Standard-Reihenfolge. Kategorien mit Karten, die in keiner der beiden Listen
// stehen, kommen hinten dran. Kategorien aus category_order erscheinen auch
// ohne Karten — so bleibt eine per „+ Kategorie" angelegte Kategorie sichtbar,
// bis man sie füllt oder löscht. cats: Objekt mit Kategorie-Namen als Schlüssel.
const DEFAULT_CAT_ORDER=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
function orderedDeckCategories(deck,cats){
  const savedOrder=Array.isArray(deck&&deck.category_order)?deck.category_order:[];
  const baseOrder=savedOrder.length?savedOrder:DEFAULT_CAT_ORDER.filter(c=>cats[c]);
  return[...new Set([...baseOrder,...Object.keys(cats)])];
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

  const visibleCats=orderedDeckCategories(deck,cats);

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
    ${visibleCats.map((cat,idx)=>catSection(cat,cats[cat]||[],deck.id,idx,visibleCats.length,deck.format)).join('')}
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
function groupDcByCardName(dcCards){
  const groups={};
  const ownedMap=buildOwnedNameMap();
  const ownedIndex=buildOwnedIndex();
  for(const dc of dcCards){
    const card=resolveDeckCard(dc,ownedIndex);
    const displayName=card.name;
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
//  - Karten-Hauptfläche (Bild + Info): IMMER → Deck-Karten-Fenster (openDeckCardModal).
//  - Checkbox-Overlay (nur im Edit-Mode): toggelt Auswahl der Gruppe.
//  - Trash-Knopf (nur im Edit-Mode): entfernt alle Druckungen aus dem Deck.
//
// Anzahl-Pille (×N) erscheint ab einer Anzahl von 2.
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
      <div class="dc-name">${esc(cardName)}${g.owned?'':`<span class="dc-miss-tag">fehlt</span>`}</div>
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
// Neue (leere) Kategorie: wird hinten an deck.category_order angehängt und
// erscheint damit sofort mit eigenem Tippfeld im Deck.
async function addCategory(){
  const name=document.getElementById('catName').value.trim();
  if(!name){toastError('Name erforderlich.');return;}
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;
  const cats={};
  currentDeckCards.forEach(dc=>{const c=(dc.category||'').trim();if(c)cats[c]=true;});
  const order=orderedDeckCategories(deck,cats);
  if(order.some(c=>c.toLowerCase()===name.toLowerCase())){toastError(`Kategorie "${name}" gibt es schon.`);return;}
  order.push(name);
  if(!await updateDeckDB(deck.id,{category_order:order}))return;
  deck.category_order=order;
  closeModal('catModal');
  renderDeckDetail(deck);
  toastSuccess(`Kategorie "${name}" angelegt – tippe jetzt Karten hinein.`);
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
    // Auch aus der gespeicherten Reihenfolge nehmen — sonst bliebe sie als
    // leere Kategorie stehen (siehe orderedDeckCategories)
    if(deck2&&Array.isArray(deck2.category_order)&&deck2.category_order.includes(category)){
      const order=deck2.category_order.filter(c=>c!==category);
      if(await updateDeckDB(deck2.id,{category_order:order}))deck2.category_order=order;
    }
    renderDeckDetail(deck2);toastSuccess(`Kategorie "${category}" entfernt`);
  }
}

// ══════════════════════════════════════════════════════════
//  MOVE-PICKER  ·  Visueller Kategorie-Wähler
// ══════════════════════════════════════════════════════════
//
//  Zeigt eine Liste der existierenden Kategorien des aktiven Decks als
//  klickbare Zeilen. Klick auf eine Kategorie verschiebt die Karte(n) sofort
//  dorthin (kein extra Bestätigen). Optional kann unten eine neue Kategorie
//  via Texteingabe erstellt werden.
//
//  Eintrittspunkt:
//  - Edit-Action-Bar "Verschieben" → editModeMoveSelected → openMovePicker(...)
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
  const names=[...new Set(dcs.map(dc=>resolveDeckCard(dc).name))];
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
  const orderedCats=orderedDeckCategories(deck,cats);

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
      <span class="mp-count">${cats[cat]||0}</span>
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
  const visibleCats=orderedDeckCategories(deck,cats);

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
//  Macht ein Deck zu einer eigenständigen Kartenliste (auch Wunschliste):
//   - Jede deck_cards-Zeile trägt ihre Karten-Identität selbst
//     (card_name, scryfall_id, set_code, … plus mana_value/colors/
//     color_identity/type_line/legal_commander für Statistik+Validierung)
//     und hat card_id = null. Egal ob per Tippfeld oder per „+ Deck" aus
//     der Sammlung hinzugefügt — Löschen in der Sammlung lässt das Deck
//     unberührt.
//   - Ob eine Karte "besessen" ist, wird LIVE per Namensabgleich mit der
//     Sammlung bestimmt: kaufst du sie später und importierst sie, stimmt
//     die Markierung automatisch.
//   - Fehlt-Liste: alle Kartennamen in einem Deck (oder über ALLE Decks),
//     die nicht in der Sammlung sind — kopierbar + als .txt herunterladbar.
//   - Ältere Zeilen, die nur per card_id auf die Sammlung zeigen, stellt
//     migrateLegacyDeckCards einmalig um.

// ── Auflösung einer Deck-Karte ──
// Besitzt du die Karte (Namensabgleich)? → eine Sammlungskarte zurückgeben:
// bevorzugt dieselbe Druckung (scryfall_id), sonst die älteste — so zeigt das
// Deck die Version, die du tatsächlich hast. Sonst → karten-ähnliche Struktur
// aus den am deck_card gespeicherten Feldern (nicht besessene Karten).
// ownedIndex (optional, aus buildOwnedIndex) spart bei vielen Aufrufen das
// wiederholte Durchsuchen der Sammlung.
function resolveDeckCard(dc,ownedIndex){
  // Altlast bis zur Umstellung: Zeile ohne eigene Daten, nur card_id-Verweis
  if(!dc.card_name&&dc.card_id){
    const c=allCards.find(x=>x.id===dc.card_id);
    if(c)return c;
  }
  const nm=(dc.card_name||'').toLowerCase().trim();
  if(nm){
    const owned=ownedIndex
      ?(ownedIndex.get(nm)||[])
      :allCards.filter(c=>(c.name||'').toLowerCase().trim()===nm);
    if(owned.length){
      return (dc.scryfall_id&&owned.find(c=>c.scryfall_id===dc.scryfall_id))||pickOldestPrinting(owned);
    }
  }
  // Nicht besessen: die am deck_card gespeicherten Felder.
  return {
    id:'dc:'+dc.id,
    name:dc.card_name||'Unbekannt',
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

// Map: Kartenname (lowercase) → alle besessenen Druckungen. Einmal pro Render bauen
// und an resolveDeckCard übergeben, wenn viele Deck-Zeilen aufgelöst werden.
function buildOwnedIndex(){
  const m=new Map();
  for(const c of allCards){
    const n=(c.name||'').toLowerCase().trim();
    if(!n)continue;
    if(!m.has(n))m.set(n,[]);
    m.get(n).push(c);
  }
  return m;
}

// ── Kartendaten für eine deck_cards-Zeile ──
// Aus einer Sammlungskarte (z.B. „+ Deck" in der Variantentabelle, Umstellung)
function deckCardFieldsFromCard(c){
  return{
    card_name:c.name,
    scryfall_id:c.scryfall_id||null,
    set_code:c.set_code||'',
    set_name:c.set_name||'',
    collector_number:c.collector_number||'',
    rarity:c.rarity||'',
    mana_value:(c.mana_value!=null?c.mana_value:null),
    colors:Array.isArray(c.colors)?c.colors:[],
    color_identity:Array.isArray(c.color_identity)?c.color_identity:[],
    type_line:c.type_line||null,
    legal_commander:c.legal_commander||null
  };
}
// Aus einem Scryfall-Kartenobjekt (Tippfeld im Deck)
function deckCardFieldsFromScryfall(c){
  return{
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
}

// ── Einmalige Umstellung alter Deck-Zeilen ──
// Früher speicherte „+ Deck" aus der Sammlung nur einen Verweis (card_id).
// Wegen "on delete cascade" in der Datenbank verschwand die Deck-Karte dann
// zusammen mit der Sammlungskarte. Hier bekommen solche Zeilen ihre
// Kartendaten selbst und card_id = null. Läuft nach jedem loadAll, tut aber
// nur etwas, solange es alte Zeilen gibt — und fragt vorher nach.
// Vor dem Umstellen wird ein komplettes Backup heruntergeladen.
let legacyMigrationAsked=false;
async function migrateLegacyDeckCards(){
  if(legacyMigrationAsked)return;  // pro Sitzung höchstens einmal fragen
  const{data:rows,error}=await _sb.from('deck_cards').select('*').not('card_id','is',null);
  if(error||!rows||!rows.length)return;
  legacyMigrationAsked=true;
  const ok=await confirmAction(
    `${rows.length} ältere Deck-Einträge verweisen noch direkt auf Karten deiner Sammlung. Löschst du so eine Karte aus der Sammlung, verschwindet sie bisher auch aus dem Deck. Jetzt umstellen? Vorher wird automatisch ein Backup heruntergeladen.`,
    {title:'DECKS UMSTELLEN',confirmLabel:'Backup + Umstellen'}
  );
  if(!ok)return;
  if(!await downloadFullBackup())return;
  let done=0,fail=0;
  for(const dc of rows){
    const card=allCards.find(c=>c.id===dc.card_id);
    if(!card){fail++;continue;}
    const{error:e}=await _sb.from('deck_cards')
      .update({...deckCardFieldsFromCard(card),card_id:null}).eq('id',dc.id);
    if(e)fail++;else done++;
  }
  if(fail)toastError(`${done} Deck-Einträge umgestellt, ${fail} fehlgeschlagen — beim nächsten Start wird es erneut versucht.`);
  else toastSuccess(`${done} Deck-Einträge umgestellt`);
  // Offenes Deck bzw. Übersicht mit den umgestellten Zeilen neu zeichnen
  if(activeDeckId){
    currentDeckCards=await loadDeckCards(activeDeckId);
    const deck=allDecks.find(d=>d.id===activeDeckId);
    if(deck)renderDeckDetail(deck);
  }else{
    renderDecks();
  }
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

// ── DB: Karte mit eigenen Feldern (denormalisiert) ins Deck schreiben ──
async function addToDeckDenorm(deckId,cardData,category,quantity){
  const{data:rows}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  const catNorm=category||null;
  const nameNorm=(cardData.card_name||'').toLowerCase().trim();
  // Gleiche Karte (Name + Kategorie) schon da? → Menge erhöhen.
  const match=(rows||[]).find(r=>
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
      '.dxm-list{max-height:34vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:0.3rem 0.7rem;margin:0.6rem 0;}',
      '.dxm-row{display:flex;justify-content:space-between;gap:0.6rem;padding:0.3rem 0;border-bottom:1px solid var(--border);font-family:\'EB Garamond\',serif;color:var(--text);}',
      '.dxm-row:last-child{border-bottom:none;}',
      ".dxm-qty{color:var(--gold2);font-family:'Cinzel',serif;font-size:0.8rem;flex-shrink:0;}",
      ".dxm-text{width:100%;min-height:130px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0.6rem;font-family:'EB Garamond',serif;font-size:0.95rem;resize:vertical;box-sizing:border-box;}",
      '.dxm-empty{padding:1.2rem;text-align:center;color:var(--text2);}'
    ].join('\n');
    const s=document.createElement('style');s.id='dx-styles';s.textContent=css;document.head.appendChild(s);
  }

  if(!document.getElementById('missingModal')){
    const w=document.createElement('div');
    w.innerHTML=`
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
    if(typeof toastSuccess==='function')toastSuccess('Liste kopiert');
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
  const ok=await addToDeckDenorm(activeDeckId,deckCardFieldsFromScryfall(c),cat||null,qty);
  if(!ok)return;
  _dcaRefocusCat=cat||'';                       // nach Render wieder hierhin fokussieren
  currentDeckCards=await loadDeckCards(activeDeckId);
  renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
  const owned=ownedQtyByName(c.name)>0;
  toastSuccess((qty>1?qty+'× ':'')+c.name+(owned?'':' (fehlt)'));
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
  // Alt-Zeile (nur card_id, falls die Umstellung abgelehnt wurde) beim Speichern mit umstellen
  if(rep&&!rep.card_name&&rep.card_id){
    Object.assign(patch,deckCardFieldsFromCard(resolveDeckCard(rep)),{card_id:null});
  }
  const{error}=await _sb.from('deck_cards').update(patch).eq('id',repId);
  if(error){toastError('Fehler: '+error.message);return;}
  for(let i=1;i<ids.length;i++){ await removeDeckCardDB(ids[i]); }
  currentDeckCards=await loadDeckCards(activeDeckId);
  renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
  closeModal('deckCardModal');
  toastSuccess('Gespeichert');
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
