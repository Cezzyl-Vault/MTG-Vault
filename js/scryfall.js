// ══════════════════════════════════════════════════════════
//  SCRYFALL  ·  Karten-Daten von Scryfall nachladen
// ══════════════════════════════════════════════════════════
//
//  Dieses Modul ist verantwortlich für:
//  - "Anreichern" von Karten mit Manawert / Farben / Typ
//    (kommt nicht aus ManaBox-CSV, muss live geholt werden)
//  - Erkennen, ob Karten in der Sammlung noch nicht angereichert sind
//  - Einmal-Migration alter Karten via UI-Banner + Modal
//  - Wird beim CSV-Import automatisch für neue Karten aufgerufen
//
//  Scryfall-API: POST /cards/collection nimmt bis zu 75 Karten pro Request,
//  was deutlich schneller ist als Karten einzeln abzufragen.

const SCRYFALL_BATCH_SIZE = 75;        // API-Limit pro Request
const SCRYFALL_BATCH_DELAY_MS = 100;   // höflicher Abstand zwischen Requests

// ── Anreicherung: Schreibt Felder direkt in die übergebenen Karten-Objekte ──
//
// Befüllt: card.mana_value (number), card.colors (string[]), card.type_line (string)
// Karten ohne scryfall_id werden übersprungen (kommen z.B. aus älteren CSVs).
// Schreibt NICHT in die DB — das macht der Aufrufer nach Bedarf.
async function enrichCards(cards, onProgress){
  const valid=cards.filter(c=>c.scryfall_id);
  if(!valid.length)return;

  let processed=0;
  for(let i=0;i<valid.length;i+=SCRYFALL_BATCH_SIZE){
    const batch=valid.slice(i,i+SCRYFALL_BATCH_SIZE);

    try{
      const res=await fetch('https://api.scryfall.com/cards/collection',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({identifiers:batch.map(c=>({id:c.scryfall_id}))})
      });
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();

      // Zuordnung der Antworten zu Karten via scryfall_id
      const byId={};
      for(const r of(data.data||[])){byId[r.id]=r;}

      for(const card of batch){
        const sf=byId[card.scryfall_id];
        if(sf){
          card.mana_value=sf.cmc!=null?Math.floor(sf.cmc):null;
          card.colors=sf.colors||[];
          card.type_line=sf.type_line||null;
        }
      }
    }catch(e){
      console.warn('Scryfall-Batch fehlgeschlagen:',e);
      // Weitermachen mit nächstem Batch — partielle Daten sind OK
    }

    processed+=batch.length;
    if(onProgress)onProgress(processed,valid.length);

    // Höfliche Pause zwischen Requests (nur wenn weitere Batches folgen)
    if(i+SCRYFALL_BATCH_SIZE<valid.length){
      await new Promise(r=>setTimeout(r,SCRYFALL_BATCH_DELAY_MS));
    }
  }
}

// ── Schema-Check: Existieren die neuen Spalten überhaupt? ──
// Wenn allCards leer ist, können wir's nicht prüfen → annehmen, dass Schema OK ist.
// Falls die SQL-Migration noch nicht gelaufen ist, fehlt mana_value komplett aus dem Objekt.
function isSchemaMigrated(){
  if(!allCards.length)return true;
  // Ist das Property überhaupt definiert (auch wenn null)? Wenn ja: Schema ist da.
  return 'mana_value' in allCards[0];
}

// ── Findet Karten in der Sammlung, die noch keine angereicherten Daten haben ──
function findUnenrichedCards(){
  return allCards.filter(c=>
    c.scryfall_id&&(c.type_line==null||c.mana_value==null)
  );
}

// ── Banner-Sichtbarkeit anhand des Sammlungs-Zustands aktualisieren ──
function checkAndShowMigrationBanner(){
  const banner=document.getElementById('migrationBanner');
  if(!banner)return;

  // Schema fehlt komplett? Banner mit Hinweis auf SQL.
  if(!isSchemaMigrated()){
    banner.style.display='';
    document.getElementById('migrationCount').textContent='0';
    document.getElementById('migrationLabel').textContent=
      'Datenbank-Schema muss erweitert werden. Klick zum Anzeigen der Anweisung.';
    document.getElementById('migrationButton').textContent='SQL anzeigen';
    return;
  }

  // Schema da, aber nicht alle Karten haben Daten?
  const todo=findUnenrichedCards();
  if(todo.length>0){
    banner.style.display='';
    document.getElementById('migrationCount').textContent=todo.length;
    document.getElementById('migrationLabel').textContent=
      'Karten können mit Manawert, Farben und Kartentyp angereichert werden (für erweiterte Filter).';
    document.getElementById('migrationButton').textContent='Jetzt anreichern';
  }else{
    banner.style.display='none';
  }
}

// ── Klick auf den Banner-Button: dispatch je nach Zustand ──
function startMigration(){
  if(!isSchemaMigrated()){
    document.getElementById('schemaSqlModal').classList.add('open');
    return;
  }
  runEnrichmentMigration();
}

// ── Eigentliche Migration: angereicherte Daten holen + in DB speichern ──
async function runEnrichmentMigration(){
  const todo=findUnenrichedCards();
  if(!todo.length){
    showToast('Alle Karten sind bereits angereichert.');
    return;
  }

  const modal=document.getElementById('migrationModal');
  const bar=document.getElementById('migrationProgressBar');
  const lbl=document.getElementById('migrationProgressLabel');
  modal.classList.add('open');
  bar.style.width='0%';
  lbl.textContent=`Lade Daten von Scryfall (0 / ${todo.length})…`;

  // Schritt 1: Daten holen
  await enrichCards(todo,(done,total)=>{
    const pct=(done/total*100).toFixed(1);
    bar.style.width=pct+'%';
    lbl.textContent=`Lade Daten von Scryfall (${done} / ${total})…`;
  });

  // Schritt 2: In DB speichern (in Batches, sonst hängt der Browser)
  lbl.textContent='Speichere in Datenbank…';
  const UPSERT_BATCH=200;
  let saved=0;
  for(let i=0;i<todo.length;i+=UPSERT_BATCH){
    const batch=todo.slice(i,i+UPSERT_BATCH);
    if(await upsertCards(batch))saved+=batch.length;
    bar.style.width=((i+batch.length)/todo.length*100).toFixed(1)+'%';
  }

  lbl.textContent=`✓ ${saved} Karten gespeichert.`;
  setTimeout(()=>{
    modal.classList.remove('open');
    checkAndShowMigrationBanner();
    renderAll();
    showToast(`✓ ${saved} Karten erfolgreich angereichert`);
  },800);
}

// SQL-Snippet kopieren (vom Schema-Modal)
function copySchemaSQL(){
  const txt=document.getElementById('schemaSqlCode').textContent;
  navigator.clipboard.writeText(txt).then(()=>showToast('✓ SQL kopiert'));
}

// Banner manuell schließen (nur Session, kommt beim Reload zurück)
function dismissMigrationBanner(){
  document.getElementById('migrationBanner').style.display='none';
}
