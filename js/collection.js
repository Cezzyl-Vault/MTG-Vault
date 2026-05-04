// ══════════════════════════════════════════════════════════
//  COLLECTION  ·  Sammlung-Anzeige (Filter, Grid, Liste, Karten-Modal)
// ══════════════════════════════════════════════════════════

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


// ── HTML-Templates für eine Karte (Grid-Kachel und Listen-Zeile) ──
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

