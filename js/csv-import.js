// ══════════════════════════════════════════════════════════
//  CSV-IMPORT  ·  Parser für ManaBox-Export (mit Duplikat-Erkennung)
// ══════════════════════════════════════════════════════════
//
//  Logik beim Import:
//
//  1. CSV einlesen und in Karten-Objekte parsen
//  2. Innerhalb der CSV deduplizieren: gleiche physische Karten
//     (Set + Nr + Foil + Sprache) werden zu einer Zeile aufaddiert
//  3. Mit aktuellem DB-Bestand abgleichen:
//     - schon vorhanden  → quantity wird erhöht (Batch-Update)
//     - neu              → wird eingefügt (Batch-Insert)
//  4. Karten, die in der DB sind aber nicht in der CSV, bleiben
//     unangetastet (CSV ist additiv, kein Master-Bestand)
//
//  Duplikat-Schlüssel: set_code + collector_number + foil + language
//  (Zustand wird BEWUSST ignoriert — der User möchte nur Mengen pflegen)

document.addEventListener('change',e=>{
  if(e.target.id!=='fileInput')return;
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>parseCSV(ev.target.result);
  reader.readAsText(file,'UTF-8');
  e.target.value='';
});

// Schlüssel für die Duplikat-Erkennung: identifiziert eine "physische" Karte.
// Wir normalisieren alle Felder (lowercase + trim), damit Tippfehler/Inkonsistenzen
// in der CSV nicht zu falschen "neuen" Einträgen führen.
function dedupKey(c){
  const norm=v=>(v||'').toString().toLowerCase().trim();
  return`${norm(c.set_code)}|${norm(c.collector_number)}|${norm(c.foil)}|${norm(c.language)}`;
}

async function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2){showToast('CSV ist leer.');return;}
  const headers=csvLine(lines[0]).map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
  const ci=name=>{
    const a={name:['name','kartenname'],set_code:['set_code','set','setcode','edition'],set_name:['set_name','setname'],collector_number:['collector_number','number'],foil:['foil'],rarity:['rarity','seltenheit'],quantity:['quantity','qty','anzahl'],manabox_id:['manabox_id'],scryfall_id:['scryfall_id','uuid'],purchase_price:['purchase_price','price','preis'],misprint:['misprint'],altered:['altered'],condition:['condition','zustand'],language:['language','lang','sprache'],currency:['purchase_price_currency','currency']};
    for(const k of(a[name]||[name])){const i=headers.indexOf(k);if(i!==-1)return i;}return -1;
  };

  // Phase 1 — CSV-Zeilen parsen
  const csvCards=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const cells=csvLine(lines[i]);
    const g=k=>{const idx=ci(k);return idx>=0?(cells[idx]||'').trim():'';};
    csvCards.push({id:crypto.randomUUID(),user_id:currentUser.id,name:g('name'),set_code:g('set_code').toUpperCase(),set_name:g('set_name'),collector_number:g('collector_number'),foil:g('foil').toLowerCase(),rarity:g('rarity').toLowerCase(),quantity:parseInt(g('quantity'))||1,manabox_id:g('manabox_id'),scryfall_id:g('scryfall_id'),purchase_price:g('purchase_price'),currency:g('currency')||'EUR',misprint:g('misprint').toLowerCase()==='true',altered:g('altered').toLowerCase()==='true',condition:g('condition').toLowerCase(),language:g('language')});
  }
  if(!csvCards.length){showToast('Keine Karten in der CSV gefunden.');return;}

  // Phase 1b — Set-Namen aus Lookup ergänzen, falls in CSV nicht gesetzt
  for(const c of csvCards){
    if(!c.set_name&&c.set_code){
      const fromLookup=setMap[c.set_code.toLowerCase()];
      if(fromLookup?.name)c.set_name=fromLookup.name;
    }
  }

  // Phase 2 — innerhalb der CSV deduplizieren
  const csvDedup=new Map();
  for(const c of csvCards){
    const k=dedupKey(c);
    if(csvDedup.has(k)){
      csvDedup.get(k).quantity+=c.quantity;
    }else{
      csvDedup.set(k,c);
    }
  }
  const dedupedCount=csvCards.length-csvDedup.size;

  showToast(`⬆ Verarbeite ${csvDedup.size} Karten…`);
  setSyncing('syncing');

  // Phase 3 — frischen DB-Stand holen, damit der Diff stimmt (z.B. wenn auf
  // einem zweiten Gerät etwas geändert wurde)
  await loadAll();

  // Index der existierenden Sammlung aufbauen, damit der Diff in O(n) statt O(n²) läuft
  const existingByKey=new Map();
  for(const c of allCards){
    existingByKey.set(dedupKey(c),c);
  }

  // Phase 4 — Diff: was ist neu, was ist Quantity-Update?
  const toInsert=[];
  const toUpdate=[];   // Form: {id, newQuantity}
  for(const c of csvDedup.values()){
    const existing=existingByKey.get(dedupKey(c));
    if(existing){
      toUpdate.push({id:existing.id,newQuantity:(existing.quantity||0)+c.quantity});
    }else{
      toInsert.push(c);
    }
  }

  // Phase 5 — Batch-Operationen
  let added=0,updated=0,failed=false;

  if(toInsert.length){
    if(await upsertCards(toInsert)){
      added=toInsert.length;
    }else{
      failed=true;
    }
  }

  if(toUpdate.length&&!failed){
    // Für upsert mit Quantity-Update brauchen wir die kompletten Karten-Objekte
    const updatePayload=toUpdate.map(u=>{
      const existing=allCards.find(c=>c.id===u.id);
      return{...existing,quantity:u.newQuantity};
    });
    if(await upsertCards(updatePayload)){
      updated=toUpdate.length;
    }else{
      failed=true;
    }
  }

  setSyncing('synced');

  if(failed){
    showToast('⚠ Fehler beim Import. Sammlung neu laden.');
    return;
  }

  // Phase 6 — lokalen State updaten und neu rendern
  await loadAll();
  renderAll();

  // Aussagekräftiger Toast mit allen relevanten Zahlen
  const parts=[];
  if(added)parts.push(`${added} neu`);
  if(updated)parts.push(`${updated} aktualisiert`);
  if(dedupedCount)parts.push(`${dedupedCount} CSV-Duplikate zusammengefasst`);
  showToast(parts.length?`✓ Import: ${parts.join(', ')}`:'ℹ Keine Änderungen — alles war schon in der Sammlung');
}

function csvLine(line){
  const r=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}else if(c===','&&!inQ){r.push(cur);cur='';}else cur+=c;}
  r.push(cur);return r;
}
