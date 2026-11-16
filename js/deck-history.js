// ══════════════════════════════════════════════════════════
//  DECK-VERLAUF  ·  Automatische Versionen + Wiederherstellen
// ══════════════════════════════════════════════════════════
//
//  Tabelle deck_history (supabase/deck_history.sql): jede Zeile ist ein Stand
//  eines Decks mit allen Deck-Karten als JSON.
//
//  Erfassen: renderDeckDetail ruft scheduleDeckVersion auf. 3 Sekunden nach der
//  letzten Änderung wird der Fingerabdruck der Liste (Name|Set|Nummer|Anzahl|
//  Kategorie) mit dem letzten Stand verglichen. So landet jede Änderung im
//  Verlauf, ohne dass jede Speicherstelle einzeln angefasst werden muss.
//    - Erstes Öffnen eines Decks → „Ausgangsstand"
//    - Letzter Stand jünger als 30 Minuten → wird überschrieben (eine
//      Bastel-Sitzung = ein Eintrag), sonst kommt ein neuer Eintrag dazu
//    - Höchstens DH_MAX Einträge pro Deck, die ältesten fliegen raus
//
//  Wiederherstellen: aktueller Stand wird vorher gesichert, dann kommen die
//  Zeilen des alten Stands ins Deck und erst danach werden die bisherigen
//  gelöscht. Schlägt das Einfügen fehl, bleibt das Deck unverändert.

const DH_DELAY_MS=3000;
const DH_MERGE_MS=30*60*1000;
const DH_MAX=60;
const DH_SKIP_FIELDS=['id','user_id','deck_id','created_at','updated_at'];

let dhMissing=false;          // Tabelle noch nicht angelegt
const dhLast={};              // deckId → {id,fp,created_at,note} | null (kein Eintrag)
const dhTimers={};            // deckId → Timer
const dhPending={};           // deckId → Zeilen, die noch gespeichert werden sollen
let dhQueue=Promise.resolve();// Speichervorgänge nacheinander
let dhEntries=[];             // Einträge im offenen Verlauf-Fenster
let dhDeckId=null;

// ── Zeilen für den Verlauf aufbereiten ──
// Ohne id/user_id/deck_id; alte Zeilen (nur card_id-Verweis) bekommen ihre
// Kartendaten, damit sie sich später auch ohne die Sammlungskarte wiederherstellen lassen.
function dhRowsFromDeckCards(dcs){
  return(dcs||[]).map(dc=>{
    let r={};
    Object.keys(dc).forEach(k=>{if(!DH_SKIP_FIELDS.includes(k))r[k]=dc[k];});
    if(!r.card_name&&dc.card_id&&typeof resolveDeckCard==='function'){
      const c=resolveDeckCard(dc);
      if(c&&c.name)r=Object.assign(r,deckCardFieldsFromCard(c));
    }
    r.card_id=null;
    return r;
  }).sort((a,b)=>(a.card_name||'').localeCompare(b.card_name||'')||(a.category||'').localeCompare(b.category||''));
}

function dhRowKey(r){
  return[(r.card_name||'').toLowerCase().trim(),(r.set_code||'').toLowerCase(),r.collector_number||'',r.quantity||0,(r.category||'').trim()].join('|');
}
function dhFingerprint(rows){
  return(rows||[]).map(dhRowKey).sort().join('\n');
}

function dhActive(){
  return !dhMissing&&!!currentUser&&!(typeof offlineMode!=='undefined'&&offlineMode);
}

// ── Von renderDeckDetail aufgerufen ──
function scheduleDeckVersion(deckId){
  if(!dhActive()||!deckId||deckId!==activeDeckId)return;
  dhPending[deckId]=dhRowsFromDeckCards(currentDeckCards);
  clearTimeout(dhTimers[deckId]);
  dhTimers[deckId]=setTimeout(()=>dhFlush(deckId),DH_DELAY_MS);
}

// Wartenden Stand sofort speichern (z.B. App geht in den Hintergrund)
function dhFlush(deckId,opts){
  clearTimeout(dhTimers[deckId]);delete dhTimers[deckId];
  const rows=dhPending[deckId];delete dhPending[deckId];
  if(!rows)return dhQueue;
  return dhSave(deckId,rows,opts);
}
function dhFlushAll(){Object.keys(dhPending).forEach(id=>dhFlush(id));}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')dhFlushAll();});

async function dhLoadLast(deckId){
  if(dhLast[deckId]!==undefined)return dhLast[deckId];
  const{data,error}=await _sb.from('deck_history').select('*').eq('deck_id',deckId)
    .order('created_at',{ascending:false}).limit(1);
  if(error){
    if(typeof isMissingTableError==='function'&&isMissingTableError(error))dhMissing=true;
    throw error;
  }
  const e=(data||[])[0];
  dhLast[deckId]=e?{id:e.id,fp:dhFingerprint(e.cards),created_at:e.created_at,note:e.note||null}:null;
  return dhLast[deckId];
}

// Stand speichern (in der Warteschlange, damit sich zwei Aufrufe nicht überholen).
// opts.note: Notiz für einen neuen Eintrag; opts.forceNew: nie überschreiben.
function dhSave(deckId,rows,opts={}){
  dhQueue=dhQueue.then(()=>dhSaveNow(deckId,rows,opts)).catch(e=>{
    if(!dhMissing)console.warn('Deck-Verlauf nicht gespeichert:',e);
  });
  return dhQueue;
}
async function dhSaveNow(deckId,rows,opts){
  if(!dhActive())return;
  const fp=dhFingerprint(rows);
  const last=await dhLoadLast(deckId);
  if(last&&last.fp===fp)return;                       // nichts geändert
  const now=new Date().toISOString();
  const young=last&&(Date.now()-new Date(last.created_at).getTime())<DH_MERGE_MS;
  if(last&&young&&!last.note&&!opts.forceNew&&!opts.note){
    const{error}=await _sb.from('deck_history').update({cards:rows,updated_at:now}).eq('id',last.id);
    if(error)throw error;
    last.fp=fp;
    return;
  }
  const note=opts.note||(last?null:'Ausgangsstand');
  const{data,error}=await _sb.from('deck_history')
    .insert({deck_id:deckId,user_id:currentUser.id,cards:rows,note}).select().single();
  if(error)throw error;
  dhLast[deckId]={id:data.id,fp,created_at:data.created_at||now,note};
  await dhTrim(deckId);
}

// Älteste Einträge über DH_MAX entfernen
async function dhTrim(deckId){
  const{data}=await _sb.from('deck_history').select('id').eq('deck_id',deckId)
    .order('created_at',{ascending:false}).range(DH_MAX,DH_MAX+99);
  const ids=(data||[]).map(r=>r.id);
  if(ids.length)await _sb.from('deck_history').delete().in('id',ids);
}

// ── Unterschiede zwischen zwei Ständen ──
// Ergebnis: {added:[{name,qty}], removed:[{name,qty}], moved:[{name,to}], printed:[name]}
function dhDiff(oldRows,newRows){
  const group=rows=>{
    const m=new Map();
    (rows||[]).forEach(r=>{
      const key=(r.card_name||'').toLowerCase().trim();
      if(!key)return;
      if(!m.has(key))m.set(key,{name:r.card_name,cats:new Map(),prints:new Set()});
      const g=m.get(key);
      const cat=(r.category||'').trim()||'Ohne Kategorie';
      g.cats.set(cat,(g.cats.get(cat)||0)+(r.quantity||0));
      g.prints.add((r.set_code||'').toLowerCase()+'#'+(r.collector_number||''));
    });
    return m;
  };
  const a=group(oldRows),b=group(newRows);
  const out={added:[],removed:[],moved:[],printed:[]};
  new Set([...a.keys(),...b.keys()]).forEach(key=>{
    const o=a.get(key),n=b.get(key);
    const name=(n||o).name;
    const cats=new Set([...(o?o.cats.keys():[]),...(n?n.cats.keys():[])]);
    let plus=0,minus=0,target=null;
    cats.forEach(c=>{
      const d=((n&&n.cats.get(c))||0)-((o&&o.cats.get(c))||0);
      if(d>0){plus+=d;target=c;}else if(d<0)minus-=d;
    });
    const moved=Math.min(plus,minus);
    if(moved>0)out.moved.push({name,to:target});
    if(plus>moved)out.added.push({name,qty:plus-moved});
    if(minus>moved)out.removed.push({name,qty:minus-moved});
    if(!plus&&!minus&&o&&n&&[...o.prints].sort().join()!==[...n.prints].sort().join())out.printed.push(name);
  });
  const byName=(x,y)=>x.name.localeCompare(y.name);
  out.added.sort(byName);out.removed.sort(byName);out.moved.sort(byName);out.printed.sort();
  return out;
}

function dhCount(rows){
  let main=0,maybe=0;
  (rows||[]).forEach(r=>{
    if(typeof isMaybeCat==='function'&&isMaybeCat(r.category))maybe+=r.quantity||0;
    else if(!(typeof isOutsideDeck==='function'&&isOutsideDeck(r.category)))main+=r.quantity||0;
  });
  return{main,maybe};
}

// absolute=true: immer mit Datum (für gespeicherte Notizen, „Heute" würde veralten)
function dhWhen(iso,absolute){
  const d=new Date(iso);
  const time=d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  if(absolute)return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})+', '+time;
  const day=new Date(d);day.setHours(0,0,0,0);
  const today=new Date();today.setHours(0,0,0,0);
  const diffDays=Math.round((today-day)/86400000);
  if(diffDays===0)return'Heute, '+time;
  if(diffDays===1)return'Gestern, '+time;
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})+', '+time;
}

// ── Fenster „Verlauf" ──
(function injectHistoryModal(){
  if(document.getElementById('historyModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="historyModal">
  <div class="modal dh-modal">
    <div class="modal-header">
      <span class="pt-title" id="historyTitle">VERLAUF</span>
      <button class="modal-close" onclick="closeModal('historyModal')">✕</button>
    </div>
    <div class="modal-detail" id="historyBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

async function openDeckHistory(){
  const deckId=activeDeckId;
  const deck=allDecks.find(d=>d.id===deckId);
  dhDeckId=deckId;
  document.getElementById('historyTitle').textContent='VERLAUF · '+((deck&&deck.name)||'Deck').toUpperCase();
  const body=document.getElementById('historyBody');
  body.innerHTML='<div class="dxm-empty">Lädt…</div>';
  document.getElementById('historyModal').classList.add('open');
  // Wartende Änderung zuerst speichern, damit der Verlauf aktuell ist
  if(dhActive()){
    if(!dhPending[deckId])dhPending[deckId]=dhRowsFromDeckCards(currentDeckCards);
    await dhFlush(deckId);
  }
  const{data,error}=await _sb.from('deck_history').select('*').eq('deck_id',deckId)
    .order('created_at',{ascending:false}).limit(DH_MAX);
  if(error){
    if(typeof isMissingTableError==='function'&&isMissingTableError(error)){
      dhMissing=true;
      body.innerHTML=`<div class="dxm-empty">Der Verlauf ist noch nicht eingerichtet.<br>
        Bitte einmalig <b>supabase/deck_history.sql</b> im Supabase-SQL-Editor ausführen.</div>`;
    }else{
      body.innerHTML=`<div class="dxm-empty">Verlauf konnte nicht geladen werden: ${esc(error.message||'')}</div>`;
    }
    return;
  }
  dhEntries=data||[];
  renderDeckHistory();
}

function dhItemsHtml(diff){
  const items=[
    ...diff.added.map(x=>`<span class="dh-chip dh-add">+${x.qty} ${esc(x.name)}</span>`),
    ...diff.removed.map(x=>`<span class="dh-chip dh-del">−${x.qty} ${esc(x.name)}</span>`),
    ...diff.moved.map(x=>`<span class="dh-chip dh-move">${esc(x.name)} → ${esc(x.to)}</span>`),
    ...diff.printed.map(n=>`<span class="dh-chip dh-move">${esc(n)}: andere Druckung</span>`)
  ];
  if(!items.length)return'';
  const SHOW=10;
  if(items.length<=SHOW)return`<div class="dh-chips">${items.join('')}</div>`;
  return`<div class="dh-chips">${items.slice(0,SHOW).join('')}</div>
    <details class="dh-more"><summary>… und ${items.length-SHOW} weitere</summary>
    <div class="dh-chips">${items.slice(SHOW).join('')}</div></details>`;
}

function renderDeckHistory(){
  const body=document.getElementById('historyBody');
  if(!dhEntries.length){
    body.innerHTML='<div class="dxm-empty">Noch kein Verlauf. Änderungen am Deck werden ab jetzt automatisch gespeichert.</div>';
    return;
  }
  const currentFp=dhFingerprint(dhRowsFromDeckCards(currentDeckCards));
  body.innerHTML=`
    <p class="dh-intro">Änderungen werden automatisch gespeichert. Alles innerhalb von 30 Minuten
      ergibt einen Eintrag. Beim Wiederherstellen wird der jetzige Stand vorher gesichert.</p>
    <div class="dh-list">
    ${dhEntries.map((e,i)=>{
      const prev=dhEntries[i+1];
      const cnt=dhCount(e.cards);
      const isCurrent=dhFingerprint(e.cards)===currentFp;
      let diffHtml='';
      if(prev){
        const diff=dhDiff(prev.cards,e.cards);
        diffHtml=dhItemsHtml(diff)||'<div class="dh-none">Keine Unterschiede in der Kartenliste</div>';
      }else{
        diffHtml=`<div class="dh-none">${e.note?'':'Ältester gespeicherter Stand'}</div>`;
      }
      return`<div class="dh-entry${isCurrent?' dh-current':''}">
        <div class="dh-head">
          <span class="dh-when">${dhWhen(e.updated_at||e.created_at)}</span>
          ${e.note?`<span class="dh-note">${esc(e.note)}</span>`:''}
          <span class="dh-count">${cnt.main} Karten${cnt.maybe?` · ${cnt.maybe} Maybe`:''}</span>
          ${isCurrent
            ?'<span class="dh-badge">Aktueller Stand</span>'
            :`<button class="back-btn dh-restore" onclick="restoreDeckVersion('${e.id}')" title="Deck auf diesen Stand zurücksetzen">↺ Wiederherstellen</button>`}
        </div>
        ${diffHtml}
      </div>`;
    }).join('')}
    </div>`;
}

async function restoreDeckVersion(entryId){
  const e=dhEntries.find(x=>x.id===entryId);
  const deckId=dhDeckId;
  if(!e||!deckId||deckId!==activeDeckId)return;
  const cnt=dhCount(e.cards);
  const ok=await confirmAction(
    `Deck auf den Stand von „${dhWhen(e.updated_at||e.created_at)}" (${cnt.main} Karten) zurücksetzen? `+
    'Der jetzige Stand wird vorher im Verlauf gesichert, du kannst das also wieder rückgängig machen.',
    {title:'STAND WIEDERHERSTELLEN',confirmLabel:'Wiederherstellen'}
  );
  if(!ok)return;
  try{
    // 1. Jetzigen Stand sichern
    dhPending[deckId]=dhRowsFromDeckCards(currentDeckCards);
    await dhFlush(deckId,{note:'Vor dem Wiederherstellen',forceNew:true});
    // 2. Zeilen des alten Stands einfügen
    const oldIds=currentDeckCards.map(dc=>dc.id).filter(Boolean);
    const rows=(e.cards||[]).map(r=>Object.assign({},r,{deck_id:deckId,user_id:currentUser.id,card_id:null}));
    if(rows.length){
      const{error}=await _sb.from('deck_cards').insert(rows);
      if(error){toastError('Wiederherstellen fehlgeschlagen: '+error.message);return;}
    }
    // 3. Bisherige Zeilen löschen (in Paketen, damit die Adresse kurz bleibt)
    for(let i=0;i<oldIds.length;i+=100){
      const{error}=await _sb.from('deck_cards').delete().in('id',oldIds.slice(i,i+100));
      if(error){toastError('Alte Karten konnten nicht entfernt werden: '+error.message+' – bitte Deck prüfen.');break;}
    }
    // 4. Neu laden, als eigenen Eintrag vermerken, anzeigen
    currentDeckCards=await loadDeckCards(deckId);
    await dhSave(deckId,dhRowsFromDeckCards(currentDeckCards),
      {note:'Wiederhergestellt: Stand von '+dhWhen(e.updated_at||e.created_at,true),forceNew:true});
    const deck=allDecks.find(d=>d.id===deckId);
    if(deck&&activeDeckId===deckId)renderDeckDetail(deck);
    clearTimeout(dhTimers[deckId]);delete dhPending[deckId];   // ist schon gespeichert
    toastSuccess('Stand wiederhergestellt');
    await openDeckHistory();
  }catch(err){
    toastError('Wiederherstellen fehlgeschlagen: '+(err.message||err));
  }
}
