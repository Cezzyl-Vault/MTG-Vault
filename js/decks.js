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

