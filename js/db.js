// ══════════════════════════════════════════════════════════
//  DB  ·  Alle Supabase-Aufrufe (Karten, Decks, Deck-Karten)
// ══════════════════════════════════════════════════════════
function setSyncing(state){
  const dot=document.getElementById('syncDot');
  const lbl=document.getElementById('syncLabel');
  if(!dot)return;
  dot.className='sync-dot'+(state==='syncing'?' syncing':state==='error'?' error':'');
  lbl.textContent=state==='syncing'?'Synchronisiert…':state==='error'?'Fehler':'Verbunden';
}

// ── Erreichbarkeit prüfen (z.B. kostenloses Projekt pausiert) ──
// Direkter fetch statt _sb, damit ein Timeout greift. Jede HTTP-Antwort
// unter 500 heißt "Datenbank läuft" (RLS liefert ohne Login einfach []).
// Netzwerkfehler, Timeout oder 5xx → nicht erreichbar.
async function checkDbReachable(cfg,timeoutMs=8000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const res=await fetch(cfg.url+'/rest/v1/cards?select=id&limit=1',{
      headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key},
      signal:ctrl.signal,cache:'no-store'
    });
    return res.status<500;
  }catch(e){
    return false;
  }finally{
    clearTimeout(timer);
  }
}

// ── Alle Zeilen einer Tabelle laden ──
// Supabase liefert pro Anfrage höchstens 1000 Zeilen. Ohne Seitenweises Laden
// würde z.B. eine Sammlung mit 1500 Einträgen nur zu zwei Dritteln erscheinen.
// Sortierung nach created_at (neueste zuerst) + id, damit die Seiten stabil sind.
// Rückgabe im selben Format wie ein Supabase-Aufruf: {data, error}.
async function fetchAllRows(table){
  const PAGE=1000;
  const rows=[];
  for(let from=0;;from+=PAGE){
    const{data,error}=await _sb.from(table).select('*')
      .order('created_at',{ascending:false}).order('id')
      .range(from,from+PAGE-1);
    if(error)return{data:null,error};
    rows.push(...(data||[]));
    if(!data||data.length<PAGE)break;
  }
  return{data:rows,error:null};
}

async function loadAll(){
  setSyncing('syncing');
  const[{data:cards,error:e1},{data:decks,error:e2}]=await Promise.all([
    fetchAllRows('cards'),
    fetchAllRows('decks'),
  ]);
  if(e1||e2){
    setSyncing('error');
    // Datenbank pausiert? → Status-Bildschirm statt leerer Sammlung
    const cfg=loadCfg();
    if(cfg&&!await checkDbReachable(cfg)){showDbPaused(cfg);return;}
    toastError('Konnte Daten nicht laden. Internet-Verbindung prüfen.');return;
  }
  allCards=cards||[];allDecks=decks||[];
  setSyncing('ok');renderAll();
  // Nach jedem vollständigen Laden prüfen, ob die Anreicherungs-Aufforderung sichtbar sein soll
  if(typeof checkAndShowMigrationBanner==='function')checkAndShowMigrationBanner();
  // Im Hintergrund den wöchentlichen Preis-Snapshot prüfen — blockiert das Rendern nicht
  if(typeof maybeCreateWeeklySnapshot==='function')maybeCreateWeeklySnapshot();
  // Alte Deck-Zeilen (nur card_id-Verweis) auf das neue Format umstellen — fragt vorher nach
  if(typeof migrateLegacyDeckCards==='function')migrateLegacyDeckCards();
}

async function upsertCards(cards){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').upsert(cards.map(c=>({...c,user_id:currentUser.id})),{onConflict:'id'});
  if(error){setSyncing('error');toastError('Speichern fehlgeschlagen: '+error.message);return false;}
  setSyncing('ok');return true;
}
async function updateCard(card){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').update(card).eq('id',card.id);
  if(error){setSyncing('error');toastError('Konnte Karte nicht speichern.');return false;}
  setSyncing('ok');return true;
}
async function deleteCardDB(id){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').delete().eq('id',id);
  if(error){setSyncing('error');toastError('Konnte Karte nicht löschen.');return false;}
  setSyncing('ok');return true;
}

// DECK DB
async function createDeckDB(deck){
  const{data,error}=await _sb.from('decks').insert({...deck,user_id:currentUser.id}).select().single();
  if(error){toastError('Fehler: '+error.message);return null;}
  return data;
}
async function updateDeckDB(id,fields){
  const{error}=await _sb.from('decks').update(fields).eq('id',id);
  if(error){toastError('Fehler: '+error.message);return false;}
  return true;
}
async function deleteDeckDB(id){
  const{error}=await _sb.from('decks').delete().eq('id',id);
  if(error){toastError('Fehler: '+error.message);return false;}
  return true;
}

// DECK CARDS DB
// Karten hinzufügen läuft über addToDeckDenorm in decks.js (Zeile trägt ihre
// Kartendaten selbst, card_id bleibt null).
async function loadDeckCards(deckId){
  const{data,error}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  if(error){toastError('Fehler: '+error.message);return[];}
  return data||[];
}
async function removeDeckCardDB(id){
  const{error}=await _sb.from('deck_cards').delete().eq('id',id);
  if(error){toastError('Fehler: '+error.message);return false;}
  return true;
}
async function removeCategoryDB(deckId,category){
  const{error}=await _sb.from('deck_cards').delete().eq('deck_id',deckId).eq('category',category);
  if(error){toastError('Fehler: '+error.message);return false;}
  return true;
}

