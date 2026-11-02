// ══════════════════════════════════════════════════════════
//  DECK-LISTE  ·  Deck als Text exportieren / aus Text importieren
// ══════════════════════════════════════════════════════════
//
//  Export (aus dem Deck-Detail, Button „⇅ Liste"):
//   - Mit Kategorien:  „// Ramp" als Überschrift, darunter „1 Sol Ring" —
//                      lässt sich hier verlustfrei wieder importieren
//   - Einfach:         nur „1 Sol Ring"-Zeilen (Moxfield, Archidekt, Chat …)
//   - MTG Arena:       Blöcke „Commander" / „Deck" / „Sideboard"
//   Optional mit Set + Nummer: „1 Sol Ring (C21) 263".
//
//  Import (Decks-Übersicht „⇩ Liste importieren" = neues Deck,
//  oder im Deck-Detail = Karten zu diesem Deck hinzufügen). Versteht:
//   1 Sol Ring · 1x Sol Ring · Sol Ring · 1 Sol Ring (C21) 263
//   1x Sol Ring (c21) 263 [Ramp]        (Archidekt: Kategorie in Klammern)
//   // Ramp · # Ramp · Ramp: · Commander · Deck · Sideboard   (Überschriften)
//   SB: 1 Sol Ring                      (MTGO-Sideboard)
//  Karten werden gesammelt bei Scryfall nachgeschlagen (/cards/collection,
//  75 pro Anfrage), Tippfehler danach einzeln per Fuzzy-Suche. Geschrieben
//  wird denormalisiert wie beim Tippfeld (deckCardFieldsFromScryfall).

// Bekannte Block-Überschriften → Kategorie (null = ohne Kategorie)
const DL_HEADERS={
  deck:null,main:null,mainboard:null,maindeck:null,
  commander:'Commander',commanders:'Commander',
  sideboard:'Sideboard',maybeboard:'Maybeboard',considering:'Maybeboard',
  companion:'Companion'
};

const dlSleep=ms=>new Promise(r=>setTimeout(r,ms));

// ── Parser ──
// Liefert [{qty,name,set,number,category}] in Listen-Reihenfolge.
function parseDeckList(text){
  const items=[];
  let cat=null;
  for(const raw of (text||'').split(/\r?\n/)){
    let line=raw.trim();
    if(!line)continue;
    let lineCat;
    // MTGO: "SB: 1 Name"
    const sb=line.match(/^SB:\s*(.+)$/i);
    if(sb){line=sb[1].trim();lineCat='Sideboard';}
    const m=line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if(!m){
      // Überschrift? "// Ramp", "# Ramp", "Ramp:", "Commander", "Creatures (25)"
      const h=line.replace(/^(\/\/|#)\s*/,'').replace(/:$/,'').replace(/\s*\(\d+\)$/,'').trim();
      const known=Object.prototype.hasOwnProperty.call(DL_HEADERS,h.toLowerCase());
      if(/^(\/\/|#)/.test(line)||/:$/.test(line)||known){
        cat=known?DL_HEADERS[h.toLowerCase()]:(h||null);
        continue;
      }
    }
    const qty=m?parseInt(m[1],10):1;
    let rest=(m?m[2]:line).trim();
    // Markierungen wie *F* (Foil), *CMDR*, ^Tag^ und #Tags entfernen
    if(/\*CMDR\*/i.test(rest)&&lineCat===undefined)lineCat='Commander';
    rest=rest.replace(/\s*\^[^^]*\^/g,'').replace(/\s*\*[A-Za-z]+\*/g,'').replace(/\s+#\S+/g,'').trim();
    // Archidekt-Kategorie "[Ramp]" bzw. "[Commander{top}]" / "[Ramp,Removal]"
    const br=rest.match(/\s*\[([^\]]*)\]\s*$/);
    if(br){
      rest=rest.slice(0,br.index).trim();
      const first=br[1].split(',')[0].replace(/\{[^}]*\}/g,'').trim();
      if(first&&lineCat===undefined)lineCat=first;
    }
    // Set + Sammlernummer: "(C21) 263" bzw. nur "(C21)"
    let set='',number='';
    const sn=rest.match(/\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★\-]+))?$/);
    if(sn){set=sn[1];number=sn[2]||'';rest=rest.slice(0,sn.index).trim();}
    if(!rest||!qty)continue;
    items.push({qty,name:rest,set,number,category:lineCat!==undefined?lineCat:cat});
  }
  return items;
}

// ── Scryfall-Abgleich ──
function dlLookupKey(it){
  return it.set&&it.number?`s:${it.set.toLowerCase()}|${it.number.toLowerCase()}`:`n:${it.name.toLowerCase()}`;
}
// Set + Nummer zählen nur, wenn auch der Name passt — sonst (vertippte Nummer)
// lieber per Name suchen als eine falsche Karte ins Deck legen.
function dlMatches(c,it){
  const n=it.name.toLowerCase();
  const full=(c.name||'').toLowerCase();
  const nameOk=full===n||full.split(' // ')[0]===n;
  if(it.set&&it.number){
    return nameOk&&(c.set||'').toLowerCase()===it.set.toLowerCase()&&String(c.collector_number||'').toLowerCase()===it.number.toLowerCase();
  }
  return nameOk;
}

// Hängt an jedes Item .card (Scryfall-Objekt oder null). onProgress(done,total)
async function lookupDeckListCards(items,onProgress){
  const uniq=new Map();
  for(const it of items){const k=dlLookupKey(it);if(!uniq.has(k))uniq.set(k,it);}
  const entries=[...uniq.entries()];
  const found=new Map();
  let done=0;
  for(let i=0;i<entries.length;i+=75){
    const chunk=entries.slice(i,i+75);
    const identifiers=chunk.map(([,it])=>it.set&&it.number
      ?{set:it.set.toLowerCase(),collector_number:it.number}
      :{name:it.name});
    const res=await fetch('https://api.scryfall.com/cards/collection',{
      method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({identifiers})
    });
    if(!res.ok)throw new Error('Scryfall '+res.status);
    const data=await res.json();
    for(const c of data.data||[]){
      const hit=chunk.find(([k,it])=>!found.has(k)&&dlMatches(c,it));
      if(hit)found.set(hit[0],c);
    }
    done+=chunk.length;
    if(onProgress)onProgress(done,entries.length);
    await dlSleep(100);   // Scryfall bittet um ~10 Anfragen/Sekunde
  }
  // Nicht gefunden (Tippfehler, unbekannter Set-Code …) → einzeln per Name, fuzzy
  for(const [k,it] of entries){
    if(found.has(k))continue;
    try{
      const res=await fetch('https://api.scryfall.com/cards/named?fuzzy='+encodeURIComponent(it.name));
      if(res.ok)found.set(k,await res.json());
    }catch(e){/* bleibt "nicht gefunden" */}
    await dlSleep(100);
  }
  return items.map(it=>({...it,card:found.get(dlLookupKey(it))||null}));
}

// ── In ein Deck schreiben (gesammelt statt Karte für Karte) ──
// Gleiche Karte + Kategorie wie eine vorhandene Zeile → Menge erhöhen,
// sonst neue Zeile. Gibt die Anzahl hinzugefügter Karten zurück oder -1.
async function addDeckListToDeck(deckId,resolved){
  const{data:rows,error}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  if(error){toastError('Fehler: '+error.message);return -1;}
  const key=(name,cat)=>(name||'').toLowerCase().trim()+'|'+(cat||'');
  const existing=new Map((rows||[]).map(r=>[key(r.card_name,r.category),r]));
  const inserts=new Map();
  const updates=new Map();   // id → neue Menge
  let added=0;
  for(const it of resolved){
    if(!it.card)continue;
    const fields=deckCardFieldsFromScryfall(it.card);
    const cat=it.category||null;
    const k=key(fields.card_name,cat);
    added+=it.qty;
    if(inserts.has(k)){inserts.get(k).quantity+=it.qty;continue;}
    const ex=existing.get(k);
    if(ex){updates.set(ex.id,(updates.has(ex.id)?updates.get(ex.id):(ex.quantity||0))+it.qty);continue;}
    inserts.set(k,Object.assign({deck_id:deckId,card_id:null,category:cat,quantity:it.qty,user_id:currentUser.id},fields));
  }
  if(inserts.size){
    const{error:e}=await _sb.from('deck_cards').insert([...inserts.values()]);
    if(e){toastError('Fehler: '+e.message);return -1;}
  }
  for(const [id,quantity] of updates){
    const{error:e}=await _sb.from('deck_cards').update({quantity}).eq('id',id);
    if(e){toastError('Fehler: '+e.message);return -1;}
  }
  return added;
}

// ── Export ──
function deckListText(deck,dcs,format,withSet){
  const idx=buildOwnedIndex();
  // Pro Kategorie nach Name zusammenfassen
  const cats={};const order=[];
  for(const dc of dcs){
    const cat=(dc.category||'').trim();
    if(!cats[cat]){cats[cat]=new Map();order.push(cat);}
    const c=resolveDeckCard(dc,idx);
    const name=dc.card_name||c.name;
    if(!name||name==='Unbekannt')continue;
    const k=name.toLowerCase();
    const g=cats[cat].get(k);
    if(g)g.qty+=dc.quantity||1;
    else cats[cat].set(k,{qty:dc.quantity||1,name,set:dc.set_code||c.set_code||'',number:dc.collector_number||c.collector_number||''});
  }
  const line=g=>{
    let n=format==='arena'?g.name.split(' // ')[0]:g.name;
    let s=g.qty+' '+n;
    if(withSet&&g.set&&g.number)s+=` (${g.set.toUpperCase()}) ${g.number}`;
    return s;
  };
  const lines=cat=>cats[cat]?[...cats[cat].values()].sort((a,b)=>a.name.localeCompare(b.name)).map(line):[];
  const named=orderedDeckCategories(deck,Object.fromEntries(order.filter(Boolean).map(c=>[c,true]))).filter(c=>cats[c]);
  const isSide=c=>/^(sideboard|maybeboard)$/i.test(c);

  if(format==='categories'){
    const out=[...lines('')];
    for(const cat of named){
      if(out.length)out.push('');
      out.push('// '+cat,...lines(cat));
    }
    return out.join('\n');
  }
  const cmd=named.filter(c=>c.toLowerCase()==='commander');
  const side=named.filter(isSide);
  const main=['',...named.filter(c=>!cmd.includes(c)&&!side.includes(c))];
  const block=list=>list.flatMap(lines);
  if(format==='arena'){
    const out=[];
    if(cmd.length)out.push('Commander',...block(cmd),'');
    out.push('Deck',...block(main));
    if(side.length)out.push('','Sideboard',...block(side));
    return out.join('\n');
  }
  // Einfach: Commander zuerst, dann der Rest, Sideboard abgesetzt
  const out=[...block(cmd),...block(main)];
  if(side.length)out.push('','Sideboard',...block(side));
  return out.join('\n');
}

// ── Fenster ──
let deckListDeckId=null;   // null = neues Deck aus Liste anlegen

(function injectDeckListModal(){
  if(document.getElementById('deckListModal'))return;
  const css=[
    '.dl-section{margin-bottom:1.1rem;}',
    '.dl-section h4{font-family:\'Cinzel\',serif;font-size:0.65rem;letter-spacing:0.12em;color:var(--text3);margin:0 0 0.5rem;font-weight:400;}',
    '.dl-opts{display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem;}',
    '.dl-opts select{background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-family:\'EB Garamond\',serif;font-size:0.9rem;}',
    '.dl-opts label{display:flex;gap:0.35rem;align-items:center;color:var(--text2);font-size:0.9rem;cursor:pointer;}',
    '.dl-hint{color:var(--text2);font-size:0.85rem;margin:0 0 0.5rem;}',
    '.dl-result{font-size:0.9rem;color:var(--text2);margin-top:0.5rem;}',
    '.dl-result .dxm-list{max-height:22vh;}'
  ].join('\n');
  const st=document.createElement('style');st.id='dl-styles';st.textContent=css;document.head.appendChild(st);
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="deckListModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)" id="deckListTitle">DECKLISTE</span>
      <button class="modal-close" onclick="closeModal('deckListModal')">✕</button>
    </div>
    <div class="modal-detail" id="deckListBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

const DL_IMPORT_HINT='Eine Karte pro Zeile, z.B. „1 Sol Ring“ oder „1x Sol Ring (C21) 263“. Überschriften wie „// Ramp“ oder „Commander“ werden zu Kategorien. Listen aus Moxfield, Archidekt, MTG Arena und MTGO funktionieren.';

async function openDeckListModal(deckId){
  deckListDeckId=deckId||null;
  const body=document.getElementById('deckListBody');
  const title=document.getElementById('deckListTitle');
  if(deckListDeckId){
    const deck=allDecks.find(d=>d.id===deckListDeckId);
    title.textContent='DECKLISTE · '+((deck&&deck.name)||'Deck').toUpperCase();
    body.innerHTML=`
      <div class="dl-section">
        <h4>EXPORTIEREN</h4>
        <div class="dl-opts">
          <select id="dlFormat" onchange="refreshDeckListExport()">
            <option value="categories">Mit Kategorien (MTG Vault)</option>
            <option value="plain">Einfach (Moxfield, Archidekt …)</option>
            <option value="arena">MTG Arena</option>
          </select>
          <label><input type="checkbox" id="dlWithSet" onchange="refreshDeckListExport()"> Set + Nummer</label>
        </div>
        <textarea class="dxm-text" id="dlExportText" readonly></textarea>
        <div class="btn-row">
          <button class="btn btn-primary" type="button" onclick="copyDeckListExport()">In Zwischenablage kopieren</button>
          <button class="btn" type="button" onclick="downloadDeckListExport()">Als .txt herunterladen</button>
        </div>
      </div>
      <div class="dl-section">
        <h4>KARTEN AUS LISTE HINZUFÜGEN</h4>
        <p class="dl-hint">${esc(DL_IMPORT_HINT)}</p>
        <textarea class="dxm-text" id="dlImportText" placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;// Lands&#10;30 Island"></textarea>
        <div class="btn-row"><button class="btn btn-primary" type="button" id="dlImportBtn" onclick="runDeckListImport(this)">Zum Deck hinzufügen</button></div>
        <div class="dl-result" id="dlResult"></div>
      </div>`;
    document.getElementById('deckListModal').classList.add('open');
    await refreshDeckListExport();
  }else{
    title.textContent='DECKLISTE IMPORTIEREN';
    body.innerHTML=`
      <div class="form-field"><label>DECK NAME *</label><input id="dlDeckName" placeholder="z.B. Locust God"></div>
      <div class="form-field"><label>FORMAT</label><select id="dlDeckFormat">${document.getElementById('deckFormat').innerHTML}</select></div>
      <div class="form-field"><label>KARTENLISTE</label>
        <p class="dl-hint">${esc(DL_IMPORT_HINT)}</p>
        <textarea class="dxm-text" id="dlImportText" style="min-height:200px" placeholder="Commander&#10;1 The Locust God&#10;&#10;Deck&#10;1 Sol Ring&#10;1 Arcane Signet"></textarea>
      </div>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="dlImportBtn" onclick="runDeckListImport(this)">Deck anlegen</button></div>
      <div class="dl-result" id="dlResult"></div>`;
    document.getElementById('dlDeckFormat').value='Commander';
    document.getElementById('deckListModal').classList.add('open');
  }
}

async function refreshDeckListExport(){
  const deck=allDecks.find(d=>d.id===deckListDeckId);
  if(!deck)return;
  const dcs=(deckListDeckId===activeDeckId&&currentDeckCards.length)?currentDeckCards:await loadDeckCards(deckListDeckId);
  document.getElementById('dlExportText').value=deckListText(deck,dcs,
    document.getElementById('dlFormat').value,document.getElementById('dlWithSet').checked);
}

function copyDeckListExport(){
  const t=document.getElementById('dlExportText');
  if(!t.value){toastError('Das Deck ist leer.');return;}
  t.select();
  try{navigator.clipboard.writeText(t.value);}catch(e){try{document.execCommand('copy');}catch(_){}}
  toastSuccess('Deckliste kopiert');
}

function downloadDeckListExport(){
  const t=document.getElementById('dlExportText');
  if(!t.value){toastError('Das Deck ist leer.');return;}
  const deck=allDecks.find(d=>d.id===deckListDeckId);
  const base=((deck&&deck.name)||'deck').replace(/[^\wäöüÄÖÜß\- ]+/g,'').trim().replace(/\s+/g,'-')||'deck';
  triggerDownload(new Blob([t.value],{type:'text/plain;charset=utf-8'}),base+'.txt');
}

async function runDeckListImport(btn){
  const resultEl=document.getElementById('dlResult');
  resultEl.innerHTML='';
  const items=parseDeckList(document.getElementById('dlImportText').value);
  if(!items.length){toastError('In der Liste wurden keine Karten erkannt.');return;}
  const isNew=!deckListDeckId;
  let name='',format='';
  if(isNew){
    name=document.getElementById('dlDeckName').value.trim();
    format=document.getElementById('dlDeckFormat').value;
    if(!name){toastError('Bitte einen Deck-Namen eingeben.');return;}
  }

  setBusy(btn,true,'Suche Karten…');
  let resolved;
  try{
    resolved=await lookupDeckListCards(items,(d,t)=>{resultEl.textContent=`Suche Karten bei Scryfall… ${d}/${t}`;});
  }catch(e){
    setBusy(btn,false);resultEl.textContent='';
    toastError('Scryfall nicht erreichbar. Bitte später erneut versuchen.');return;
  }
  const ok=resolved.filter(r=>r.card);
  const missing=resolved.filter(r=>!r.card);
  if(!ok.length){
    setBusy(btn,false);
    resultEl.innerHTML=dlMissingHtml(missing,'Keine der Karten wurde gefunden:');
    return;
  }
  resultEl.textContent='Speichere…';

  // Kategorien in Listen-Reihenfolge; Commander in Commander-Decks zuerst
  const listCats=[...new Set(ok.map(r=>r.category).filter(Boolean))];
  let deck;
  if(deckListDeckId){
    deck=allDecks.find(d=>d.id===deckListDeckId);
    const saved=Array.isArray(deck.category_order)?deck.category_order:[];
    const extra=listCats.filter(c=>!saved.includes(c));
    if(saved.length&&extra.length){
      const order=[...saved,...extra];
      if(await updateDeckDB(deck.id,{category_order:order}))deck.category_order=order;
    }
  }else{
    const order=[...new Set([...(format==='Commander'?['Commander']:[]),...listCats])];
    deck=await createDeckDB({name,description:'',format,category_order:order});
    if(!deck){setBusy(btn,false);resultEl.textContent='';return;}
    allDecks.unshift(deck);
    deckListDeckId=deck.id;
  }

  const added=await addDeckListToDeck(deck.id,ok);
  setBusy(btn,false);
  if(added<0){resultEl.textContent='';return;}

  // Ansicht aktualisieren: neues Deck direkt öffnen, sonst Detail neu zeichnen
  if(activeDeckId===deck.id){
    currentDeckCards=await loadDeckCards(deck.id);
    renderDeckDetail(deck);
  }else{
    await openDeckDetail(deck.id);
  }
  const msg=`${added} Karte${added===1?'':'n'} ${isNew?'importiert':'hinzugefügt'}`;
  if(missing.length){
    resultEl.innerHTML=`<div style="color:var(--green);margin-bottom:0.4rem">✓ ${esc(msg)}</div>`+dlMissingHtml(missing,'Nicht gefunden – Namen korrigieren und erneut hinzufügen:')
      +(typeof openDeckToCollection==='function'?`<button class="btn" type="button" style="margin-top:0.6rem" onclick="closeModal('deckListModal');openDeckToCollection('${deck.id}')">⇩ Karten auch in die Sammlung übernehmen</button>`:'');
    // Nur die fehlenden Zeilen stehen lassen, damit man sie korrigieren kann.
    // Nach dem Anlegen gilt das Fenster ab jetzt für das neue Deck.
    const rest=[];let last;
    for(const m of missing){
      const c=m.category||'';
      if(c!==last){if(c)rest.push('// '+c);else if(last!==undefined)rest.push('Deck');last=c;}
      rest.push(m.qty+' '+m.name);
    }
    document.getElementById('dlImportText').value=rest.join('\n');
    if(isNew){
      btn.textContent='Zum Deck hinzufügen';
      const nameEl=document.getElementById('dlDeckName');nameEl.disabled=true;
      document.getElementById('dlDeckFormat').disabled=true;
      document.getElementById('deckListTitle').textContent='DECKLISTE · '+deck.name.toUpperCase();
    }
  }else{
    closeModal('deckListModal');
    toastSuccess(msg);
    // Neues Deck: gleich anbieten, die Karten mit Versionsauswahl in die Sammlung zu holen
    if(isNew&&typeof openDeckToCollection==='function'&&await confirmAction(
      `Sollen die Karten aus „${deck.name}" auch in deine Sammlung? Du wählst dabei pro Karte die genaue Version (Set, Normal/Foil), damit die Preise stimmen. Standardländer werden übersprungen.`,
      {title:'IN SAMMLUNG ÜBERNEHMEN',confirmLabel:'Ja, Versionen wählen',cancelLabel:'Nein, nur Deck'}
    ))openDeckToCollection(deck.id);
  }
}

function dlMissingHtml(missing,label){
  const rows=missing.map(m=>`<div class="dxm-row"><span>${esc(m.name)}${m.set?` <span style="color:var(--text3)">(${esc(m.set.toUpperCase())}${m.number?' '+esc(m.number):''})</span>`:''}</span><span class="dxm-qty">×${m.qty}</span></div>`).join('');
  return`<div>${esc(label)}</div><div class="dxm-list">${rows}</div>`;
}
