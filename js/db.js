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

async function loadAll(){
  setSyncing('syncing');
  const[{data:cards,error:e1},{data:decks,error:e2}]=await Promise.all([
    _sb.from('cards').select('*').order('created_at',{ascending:false}),
    _sb.from('decks').select('*').order('created_at',{ascending:false}),
  ]);
  if(e1||e2){setSyncing('error');showToast('Ladefehler');return;}
  allCards=cards||[];allDecks=decks||[];
  setSyncing('ok');renderAll();
}

async function upsertCards(cards){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').upsert(cards.map(c=>({...c,user_id:currentUser.id})),{onConflict:'id'});
  if(error){setSyncing('error');showToast('Sync-Fehler: '+error.message);return false;}
  setSyncing('ok');return true;
}
async function updateCard(card){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').update(card).eq('id',card.id);
  if(error){setSyncing('error');showToast('Speicherfehler');return false;}
  setSyncing('ok');return true;
}
async function deleteCardDB(id){
  setSyncing('syncing');
  const{error}=await _sb.from('cards').delete().eq('id',id);
  if(error){setSyncing('error');showToast('Löschfehler');return false;}
  setSyncing('ok');return true;
}

// DECK DB
async function createDeckDB(deck){
  const{data,error}=await _sb.from('decks').insert({...deck,user_id:currentUser.id}).select().single();
  if(error){showToast('Fehler: '+error.message);return null;}
  return data;
}
async function updateDeckDB(id,fields){
  const{error}=await _sb.from('decks').update(fields).eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}
async function deleteDeckDB(id){
  const{error}=await _sb.from('decks').delete().eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}

// DECK CARDS DB
async function loadDeckCards(deckId){
  const{data,error}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId);
  if(error){showToast('Fehler: '+error.message);return[];}
  return data||[];
}
async function addToDeckDB(deckId,cardId,category,quantity){
  // Check if already exists in same category
  const{data:existing}=await _sb.from('deck_cards').select('*').eq('deck_id',deckId).eq('card_id',cardId).eq('category',category);
  if(existing&&existing.length>0){
    const{error}=await _sb.from('deck_cards').update({quantity:existing[0].quantity+quantity}).eq('id',existing[0].id);
    if(error){showToast('Fehler: '+error.message);return false;}
  }else{
    const{error}=await _sb.from('deck_cards').insert({deck_id:deckId,card_id:cardId,category,quantity,user_id:currentUser.id});
    if(error){showToast('Fehler: '+error.message);return false;}
  }
  return true;
}
async function removeDeckCardDB(id){
  const{error}=await _sb.from('deck_cards').delete().eq('id',id);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}
async function removeCategoryDB(deckId,category){
  const{error}=await _sb.from('deck_cards').delete().eq('deck_id',deckId).eq('category',category);
  if(error){showToast('Fehler: '+error.message);return false;}
  return true;
}

