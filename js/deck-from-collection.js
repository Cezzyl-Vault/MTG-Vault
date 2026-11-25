// ══════════════════════════════════════════════════════════
//  DECK ← SAMMLUNG  ·  Karten eines Decks wieder aus der Sammlung nehmen
// ══════════════════════════════════════════════════════════
//
//  VORÜBERGEHENDE FUNKTION (Wunsch Nov. 2026): Karten wurden früher per
//  „In Sammlung übernehmen" in die Sammlung gelegt, obwohl man sie gar nicht
//  besitzt. Hier lassen sie sich gesammelt wieder herausnehmen.
//
//  Ablauf („⋯ Mehr → ⇧ Aus Sammlung entfernen"):
//   - Kartenliste: aktueller Stand des Decks oder ein älterer Stand aus dem
//     Verlauf (deck-history.js) – falls sich das Deck seitdem geändert hat
//   - Pro Karte (ohne Maybeboard, gleiche Namen zusammengefasst): Anzahl im
//     Deck, Anzahl in der Sammlung, Menge zum Entfernen (vorbelegt: so viele
//     wie im Deck, höchstens so viele wie in der Sammlung). Basic Lands sind
//     nicht vorausgewählt.
//   - Welche Sammlungs-Einträge verringert werden: zuerst dieselbe Druckung
//     wie im Deck („In Sammlung übernehmen" setzt die Deck-Zeile auf die
//     gewählte Druckung), dann die zuletzt angelegten Einträge.
//   - Vorher Rückfrage und (abwählbar) ein Komplett-Backup als Datei.
//     Menge 0 → Eintrag wird gelöscht, sonst nur die Menge verringert.
//
//  Das Deck selbst bleibt unverändert.

let rfc={deckId:null,source:'current',versions:[],items:[]};

(function injectRfcModal(){
  if(document.getElementById('rfcModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="rfcModal">
  <div class="modal rfc-modal">
    <div class="modal-header">
      <span class="pt-title" id="rfcTitle">AUS SAMMLUNG ENTFERNEN</span>
      <button class="modal-close" onclick="closeModal('rfcModal')">✕</button>
    </div>
    <div class="modal-detail" id="rfcBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

async function openRemoveFromCollection(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  if(!deck)return;
  rfc={deckId:deck.id,source:'current',versions:[],items:[]};
  document.getElementById('rfcTitle').textContent='AUS SAMMLUNG ENTFERNEN · '+(deck.name||'Deck').toUpperCase();
  document.getElementById('rfcModal').classList.add('open');
  // Ältere Stände aus dem Verlauf (falls eingerichtet) – Fehler egal
  try{
    const{data,error}=await _sb.from('deck_history').select('*').eq('deck_id',deck.id)
      .order('created_at',{ascending:false}).limit(60);
    if(!error)rfc.versions=data||[];
  }catch(e){/* Verlauf nicht da */}
  rfcBuildItems();
  rfcRender();
}

function rfcSourceRows(){
  if(rfc.source==='current')return currentDeckCards||[];
  const v=rfc.versions.find(x=>x.id===rfc.source);
  return(v&&v.cards)||[];
}

function rfcIsBasic(name,typeLine){
  return typeof d2cIsBasicLand==='function'?d2cIsBasicLand(name,typeLine):/\bbasic\b/i.test(typeLine||'');
}

// Sammlungs-Einträge zu einem Namen in der Reihenfolge, in der sie verringert werden
function rfcOwnedEntries(nameLc,scryfallIds){
  return allCards
    .filter(c=>(c.name||'').toLowerCase().trim()===nameLc)
    .sort((a,b)=>{
      const sa=scryfallIds.has(a.scryfall_id)?0:1,sb=scryfallIds.has(b.scryfall_id)?0:1;
      if(sa!==sb)return sa-sb;
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
}

function rfcBuildItems(){
  const groups=new Map();
  mainDeckCards(rfcSourceRows()).forEach(dc=>{
    const c=dc.card_name?null:(typeof resolveDeckCard==='function'?resolveDeckCard(dc):null);
    const name=dc.card_name||(c&&c.name)||'';
    const key=name.toLowerCase().trim();
    if(!key)return;
    if(!groups.has(key))groups.set(key,{key,name,deckQty:0,scryfallIds:new Set(),typeLine:dc.type_line||(c&&c.type_line)||''});
    const g=groups.get(key);
    g.deckQty+=dc.quantity||1;
    if(dc.scryfall_id)g.scryfallIds.add(dc.scryfall_id);
  });
  rfc.items=[...groups.values()].map(g=>{
    const entries=rfcOwnedEntries(g.key,g.scryfallIds);
    const owned=entries.reduce((s,c)=>s+(c.quantity||0),0);
    const basic=rfcIsBasic(g.name,g.typeLine);
    return Object.assign(g,{entries,owned,qty:Math.min(g.deckQty,owned),checked:owned>0&&!basic,basic});
  }).sort((a,b)=>a.name.localeCompare(b.name));
}

function rfcSetSource(val){rfc.source=val;rfcBuildItems();rfcRender();}
function rfcToggle(i,cb){rfc.items[i].checked=cb.checked;rfcRenderSummary();}
function rfcSetQty(i,inp){
  const it=rfc.items[i];
  let q=parseInt(inp.value,10);
  if(!(q>=0))q=0;
  q=Math.min(q,it.owned);
  it.qty=q;inp.value=q;
  if(q===0)it.checked=false;
  rfcRender(true);
}
function rfcSelectAll(on){rfc.items.forEach(it=>{if(it.owned>0&&it.qty>0)it.checked=on;});rfcRender(true);}

function rfcEntryLabel(c){
  const parts=[(c.set_code||'').toUpperCase(),c.collector_number?'#'+c.collector_number:'',c.foil==='foil'?'Foil':''].filter(Boolean);
  return`${parts.join(' ')} · ${c.quantity}×`;
}

function rfcRender(keepScroll){
  const body=document.getElementById('rfcBody');
  const scroll=keepScroll?body.scrollTop:0;
  const owned=rfc.items.filter(it=>it.owned>0);
  const notOwned=rfc.items.length-owned.length;
  const fmtDate=v=>typeof dhWhen==='function'?dhWhen(v.updated_at||v.created_at,true):new Date(v.created_at).toLocaleString('de-DE');
  body.innerHTML=`
    <p class="rfc-intro">Nimmt Karten dieses Decks wieder aus deiner <b>Sammlung</b> – z.B. wenn du sie früher
      per „In Sammlung übernehmen" eingetragen hast, aber gar nicht besitzt. Das Deck selbst bleibt unverändert.</p>
    ${rfc.versions.length?`<label class="rfc-source">Kartenliste:
      <select onchange="rfcSetSource(this.value)">
        <option value="current"${rfc.source==='current'?' selected':''}>Aktueller Stand des Decks</option>
        ${rfc.versions.map(v=>`<option value="${v.id}"${rfc.source===v.id?' selected':''}>Stand von ${esc(fmtDate(v))}${v.note?' ('+esc(v.note)+')':''}</option>`).join('')}
      </select></label>`:''}
    ${owned.length?`
      <div class="rfc-tools">
        <button class="back-btn" onclick="rfcSelectAll(true)">Alle auswählen</button>
        <button class="back-btn" onclick="rfcSelectAll(false)">Keine</button>
        ${notOwned?`<span>${notOwned} Karte${notOwned===1?'':'n'} des Decks ${notOwned===1?'ist':'sind'} nicht in der Sammlung</span>`:''}
      </div>
      <div class="rfc-list">${rfc.items.map((it,i)=>it.owned>0?`
        <div class="rfc-row${it.checked?' rfc-on':''}">
          <input type="checkbox" ${it.checked?'checked':''} ${it.qty>0?'':'disabled'} onchange="rfcToggle(${i},this)">
          <div class="rfc-main">
            <div class="rfc-name">${esc(it.name)}${it.basic?' <span class="rfc-tag">Standardland</span>':''}</div>
            <div class="rfc-sub">im Deck ${it.deckQty}× · in der Sammlung ${it.owned}× (${it.entries.map(rfcEntryLabel).map(esc).join(', ')})</div>
          </div>
          <label class="rfc-qty">entfernen <input type="number" min="0" max="${it.owned}" value="${it.qty}" onchange="rfcSetQty(${i},this)"></label>
        </div>`:'').join('')}
      </div>
      <div class="rfc-foot">
        <label class="rfc-backup"><input type="checkbox" id="rfcBackup" checked> Vorher Komplett-Backup herunterladen</label>
        <div class="rfc-summary" id="rfcSummary"></div>
      </div>`
    :`<div class="dxm-empty">Keine Karte dieser Liste ist in deiner Sammlung.</div>`}`;
  body.scrollTop=scroll;
  rfcRenderSummary();
}

function rfcSelected(){return rfc.items.filter(it=>it.checked&&it.qty>0);}

function rfcRenderSummary(){
  const el=document.getElementById('rfcSummary');
  if(!el)return;
  const sel=rfcSelected();
  const pieces=sel.reduce((s,it)=>s+it.qty,0);
  document.querySelectorAll('#rfcBody .rfc-row').forEach(row=>{
    const cb=row.querySelector('input[type=checkbox]');
    row.classList.toggle('rfc-on',!!(cb&&cb.checked));
  });
  el.innerHTML=sel.length
    ?`<span>${sel.length} Karte${sel.length===1?'':'n'} · ${pieces} Stück</span>
      <button class="btn btn-danger" onclick="rfcExecute(this)">⇧ Aus Sammlung entfernen</button>`
    :'<span class="rfc-dim">Nichts ausgewählt</span>';
}

// Pro Karte die Einträge verringern: Ergebnis {updates:[card], deletes:[id]}
function rfcPlan(){
  const updates=[],deletes=[];
  rfcSelected().forEach(it=>{
    let rest=it.qty;
    for(const c of it.entries){
      if(rest<=0)break;
      const take=Math.min(rest,c.quantity||0);
      if(!take)continue;
      rest-=take;
      const left=(c.quantity||0)-take;
      if(left>0)updates.push({...c,quantity:left});else deletes.push(c.id);
    }
  });
  return{updates,deletes};
}

async function rfcExecute(btn){
  const sel=rfcSelected();
  if(!sel.length)return;
  const pieces=sel.reduce((s,it)=>s+it.qty,0);
  const ok=await confirmAction(
    `${pieces} Stück (${sel.length} Karte${sel.length===1?'':'n'}) aus der Sammlung entfernen? `+
    'Einträge mit Menge 0 werden gelöscht. Das Deck bleibt unverändert.',
    {title:'AUS SAMMLUNG ENTFERNEN',confirmLabel:'Entfernen',danger:true}
  );
  if(!ok)return;
  const backup=document.getElementById('rfcBackup');
  if(backup&&backup.checked){
    const saved=await downloadFullBackup(btn);
    if(!saved){toastError('Backup fehlgeschlagen – es wurde nichts entfernt.');return;}
  }
  const{updates,deletes}=rfcPlan();
  setBusy(btn,true,'Entferne…');
  try{
    if(updates.length){
      // Nur die Felder der Tabelle schicken (keine Zusatzfelder aus dem Speicher)
      const ok=await upsertCards(updates.map(({user_id,...c})=>c));
      if(!ok)return;
    }
    for(let i=0;i<deletes.length;i+=100){
      const{error}=await _sb.from('cards').delete().in('id',deletes.slice(i,i+100));
      if(error){toastError('Löschen fehlgeschlagen: '+error.message);return;}
    }
    toastSuccess(`${pieces} Stück aus der Sammlung entfernt`);
    closeModal('rfcModal');
    await loadAll();
    if(activeDeckId===rfc.deckId){
      const deck=allDecks.find(d=>d.id===rfc.deckId);
      if(deck)renderDeckDetail(deck);
    }
  }finally{
    setBusy(btn,false);
  }
}
