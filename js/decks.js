// ══════════════════════════════════════════════════════════
//  DECKS  ·  Decks-Übersicht, Deck-Detail, Kategorien
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
  // Die Default-Liste wird nur verwendet, wenn das Deck noch nie sortiert wurde
  // — als sinnvoller Erst-Vorschlag.
  const DEFAULT_CAT_ORDER=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const savedOrder=Array.isArray(deck.category_order)?[...deck.category_order]:[];
  const baseOrder=savedOrder.length?savedOrder:DEFAULT_CAT_ORDER;
  // Bestehende Reihenfolge übernehmen, dann alle Kategorien aus dem Deck hinten dranhängen,
  // die noch nicht in der Reihenfolge stehen
  const sortedCats=[...new Set([...baseOrder.filter(c=>cats[c]),...Object.keys(cats)])];

  // Pro Kategorie wissen wir den Index, damit ▲/▼-Buttons den ersten/letzten korrekt deaktivieren
  const visibleCats=sortedCats.filter(c=>cats[c]);

  detailView.innerHTML=`
    <div class="deck-detail-header">
      <button class="back-btn" onclick="closeDeckDetail()">← Zurück</button>
      <div>
        <div class="deck-detail-title">${esc(deck.name)}</div>
        ${deck.format?`<span class="deck-tag" style="font-size:0.6rem">${esc(deck.format)}</span>`:''}
      </div>
      <div class="deck-detail-actions" style="margin-left:auto;display:flex;gap:0.5rem;align-items:center">
        <span style="color:var(--text2);font-size:0.85rem">${totalCards} Karten</span>
        <button class="btn-gold" onclick="openAddCardsModal()">+ Karten</button>
        <button class="btn-gold" onclick="openCatModal()">+ Kategorie</button>
        <button class="back-btn" onclick="openDeckModal('${deck.id}')">✎ Deck</button>
      </div>
    </div>
    <div class="deck-stats-panel" id="deck-stats-panel"></div>
    ${uncategorized.length?uncategorizedSection(uncategorized,deck.id):''}
    ${visibleCats.map((cat,idx)=>catSection(cat,cats[cat],deck.id,idx,visibleCats.length)).join('')}
    ${!currentDeckCards.length?`<div class="empty-state" style="padding:3rem"><div class="empty-icon">🃏</div><h2>Keine Karten</h2><p>Öffne eine Karte in der Sammlung und füge sie hier hinzu.</p></div>`:''}
  `;
  // Statistik-Panel mit Daten füllen (eigene Funktion in deck-stats.js)
  if(typeof renderDeckStats==='function')renderDeckStats(deck,currentDeckCards);
}

// Sektion für Karten ohne Kategorie — visuell etwas dezenter als kategorisierte Bereiche.
// Erscheint oben im Deck, vor allen kategorisierten Karten.
function uncategorizedSection(dcCards,deckId){
  const total=dcCards.reduce((s,dc)=>s+dc.quantity,0);
  const rows=dcCards.map(dc=>deckCardRow(dc)).join('');
  return`<div class="category-section uncategorized-section">
    <div class="category-header">
      <div class="category-name" style="font-style:italic;color:var(--text2)">⋯ Ohne Kategorie <span class="category-count">${total} Karten</span></div>
      <div style="display:flex;gap:0.5rem">
        <button class="del-cat-btn" onclick="openAddCardsModal('')" title="Weitere Karten ohne Kategorie hinzufügen">+ Karten</button>
      </div>
    </div>
    ${rows}
  </div>`;
}

// Eine Karten-Zeile — extrahiert, damit catSection und uncategorizedSection sie teilen.
function deckCardRow(dc){
  const card=allCards.find(c=>c.id===dc.card_id);
  const img=card?iUrl(card):null;
  return`<div class="deck-card-row">
    ${img?`<img class="dc-img" src="${img}" alt="${esc(card?.name||'')}">`:`<div class="dc-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem">🃏</div>`}
    <div style="flex:1;min-width:0">
      <div class="dc-name">${esc(card?.name||dc.card_id)}</div>
      <div class="dc-sub">${card?esc(card.set_code)+(card.collector_number?' #'+esc(card.collector_number):''):''} ${card?.foil==='foil'?'· ✦ Foil':''}</div>
    </div>
    <span class="dc-qty">×${dc.quantity}</span>
    <button class="dc-action" onclick="openChangeCategoryModal('${dc.id}')" title="Kategorie ändern">📂</button>
    <button class="dc-remove" onclick="removeDeckCard('${dc.id}')" title="Entfernen">✕</button>
  </div>`;
}

function catSection(cat,dcCards,deckId,index,total){
  const total_qty=dcCards.reduce((s,dc)=>s+dc.quantity,0);
  const rows=dcCards.map(dc=>deckCardRow(dc)).join('');
  // ▲/▼ deaktivieren am Anfang/Ende
  const upDisabled=index===0?'disabled':'';
  const downDisabled=index===total-1?'disabled':'';
  return`<div class="category-section">
    <div class="category-header">
      <div class="category-name">
        <button class="cat-move-btn" onclick="moveCategoryUp('${esc(cat)}')" ${upDisabled} title="Nach oben">▲</button>
        <button class="cat-move-btn" onclick="moveCategoryDown('${esc(cat)}')" ${downDisabled} title="Nach unten">▼</button>
        ◈ ${esc(cat)} <span class="category-count">${total_qty} Karten</span>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="del-cat-btn" onclick="openAddCardsModal('${esc(cat)}')" title="Karten zu dieser Kategorie hinzufügen">+ Karten</button>
        <button class="del-cat-btn" onclick="removeCategory('${deckId}','${esc(cat)}')" title="Kategorie entfernen">🗑 Kategorie</button>
      </div>
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
  if(!await confirmAction(`Kategorie "${category}" und alle Karten-Zuordnungen darin aus dem Deck entfernen? Die Karten bleiben in deiner Sammlung.`,{
    title:'KATEGORIE LÖSCHEN',
    confirmLabel:'Löschen',
    danger:true
  }))return;
  if(await removeCategoryDB(deckId,category)){
    currentDeckCards=currentDeckCards.filter(dc=>dc.category!==category);
    const deck=allDecks.find(d=>d.id===deckId);
    renderDeckDetail(deck);toastSuccess(`Kategorie "${category}" entfernt`);
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

let changingCategoryDcId = null;  // welcher Deck-Card-Eintrag wird gerade verschoben

function openChangeCategoryModal(dcId){
  const dc=currentDeckCards.find(c=>c.id===dcId);
  if(!dc)return;
  changingCategoryDcId=dcId;
  const card=allCards.find(c=>c.id===dc.card_id);

  // Karten-Name + aktuelle Kategorie anzeigen
  const currentCat=dc.category||'Ohne Kategorie';
  document.getElementById('changeCategoryCardName').innerHTML=
    `<strong>${esc(card?.name||'Karte')}</strong> — aktuell: <em style="color:var(--text2)">${esc(currentCat)}</em>`;

  // Eingabefeld leer + Vorschläge aus existierenden Kategorien des Decks + Standard-Kategorien
  document.getElementById('changeCategoryInput').value='';
  const existingCats=[...new Set(currentDeckCards.map(c=>c.category).filter(Boolean))];
  const standardCats=['Commander','Lands','Ramp','Creatures','Removal','Card Draw','Enchantments','Artifacts','Instants','Sorceries','Planeswalkers','Sideboard','Sonstige'];
  const allCats=[...new Set([...existingCats,...standardCats])];
  document.getElementById('changeCategorySuggestions').innerHTML=allCats.map(c=>`<option value="${esc(c)}">`).join('');

  document.getElementById('changeCategoryModal').classList.add('open');
  setTimeout(()=>document.getElementById('changeCategoryInput').focus(),50);
}

async function confirmChangeCategory(){
  if(!changingCategoryDcId)return;
  const newCategory=(document.getElementById('changeCategoryInput').value||'').trim();
  // Leerer String → null in DB → Karte landet wieder bei "Ohne Kategorie"
  const categoryToSave=newCategory||null;

  const dc=currentDeckCards.find(c=>c.id===changingCategoryDcId);
  if(!dc){closeModal('changeCategoryModal');return;}

  // Wenn sich nichts ändert, einfach Modal schließen
  if((dc.category||null)===categoryToSave){
    closeModal('changeCategoryModal');
    toastInfo('Kategorie unverändert.');
    return;
  }

  // Update in DB ausführen — direkt über _sb, da wir keine bestehende
  // Helfer-Funktion dafür haben (bisher gab es nur "hinzufügen" und "entfernen")
  const{error}=await _sb.from('deck_cards').update({category:categoryToSave}).eq('id',changingCategoryDcId);
  if(error){
    toastError('Konnte Kategorie nicht ändern: '+error.message);
    return;
  }

  // Lokal updaten + neu rendern (kein voller DB-Reload nötig)
  dc.category=categoryToSave;
  const deck=allDecks.find(d=>d.id===activeDeckId);
  renderDeckDetail(deck);
  closeModal('changeCategoryModal');
  changingCategoryDcId=null;
  toastSuccess(newCategory?`Verschoben nach "${newCategory}"`:'In "Ohne Kategorie" verschoben');
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
