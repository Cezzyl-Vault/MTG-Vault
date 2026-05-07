// ══════════════════════════════════════════════════════════
//  DECK-VALIDATION  ·  Commander-Format-Prüfung
// ══════════════════════════════════════════════════════════
//
//  Prüft alle 5 Commander-Regeln:
//    1. Karten-Anzahl: Genau 100 Karten (Commander + 99)
//    2. Singleton: Pro Karte max. 1 Stück, außer Basic Lands
//    3. Format-Legalität: Karte muss in Commander erlaubt sein
//    4. Banlist: Karte darf nicht auf der Commander-Banlist stehen
//    5. Farbidentität: Alle Karten müssen in der Farbidentität
//       des Commanders liegen (Commander = Karte(n) in Kategorie "Commander")
//
//  Daten-Quellen:
//    - card.legal_commander: 'legal' | 'not_legal' | 'banned' | 'restricted' (von Scryfall)
//    - card.color_identity: ['W','U','B','R','G'] Subset (von Scryfall)
//    - card.type_line: für Basic-Land-Erkennung
//
//  Wird nur ausgeführt, wenn deck.format === 'Commander'.
//  Wird automatisch beim Öffnen des Deck-Details aufgerufen und nach
//  jeder Karten-Änderung neu gerendert.

// ── Helfer ──
function dvCard(dc){return allCards.find(c=>c.id===dc.card_id);}

// ── Hauptvalidierung ── Gibt Array von Issues zurück
function validateCommanderDeck(deckCards){
  const issues=[];

  // Vorab: Commander identifizieren (Karten in Kategorie "Commander")
  const commanderEntries=deckCards.filter(dc=>(dc.category||'').toLowerCase()==='commander');
  const commanders=commanderEntries.map(dvCard).filter(Boolean);

  // Hilfsdaten sammeln
  let totalCards=0;
  let unenriched=0;
  const cardCounts={};       // Kartenname → Gesamtanzahl (für Singleton)
  const illegalCards=[];     // Karten mit legal_commander = 'not_legal'
  const bannedCards=[];      // Karten mit legal_commander = 'banned'
  const colorViolators=[];   // Karten außerhalb der Farbidentität

  // Farbidentität des/der Commander zusammenfassen (wenn vorhanden)
  const commanderColors=new Set();
  for(const cmd of commanders){
    const ci=Array.isArray(cmd.color_identity)?cmd.color_identity:[];
    for(const c of ci)commanderColors.add(c);
  }

  for(const dc of deckCards){
    const card=dvCard(dc);if(!card)continue;
    const qty=dc.quantity||1;
    totalCards+=qty;

    // Kann diese Karte überhaupt validiert werden?
    if(card.legal_commander==null||card.color_identity==null){
      unenriched+=qty;
      continue;
    }

    // Singleton-Vorbereitung
    const isBasicLand=(card.type_line||'').toLowerCase().includes('basic land');
    if(!isBasicLand){
      cardCounts[card.name]=(cardCounts[card.name]||0)+qty;
    }

    // Legalität / Banlist
    if(card.legal_commander==='not_legal'&&!illegalCards.includes(card.name)){
      illegalCards.push(card.name);
    }
    if(card.legal_commander==='banned'&&!bannedCards.includes(card.name)){
      bannedCards.push(card.name);
    }

    // Farbidentität — Commander selbst überspringen
    if(commanders.length>0&&!commanders.some(cmd=>cmd.id===card.id)){
      const ci=Array.isArray(card.color_identity)?card.color_identity:[];
      for(const c of ci){
        if(!commanderColors.has(c)){
          if(!colorViolators.includes(card.name))colorViolators.push(card.name);
          break;
        }
      }
    }
  }

  // ── Regel 1: Karten-Anzahl ──
  issues.push({
    rule:'count',
    label:'Karten-Anzahl',
    ok:totalCards===100,
    detail:totalCards===100
      ?`100 Karten ✓`
      :`${totalCards} Karten — sollten 100 sein (Commander + 99)`
  });

  // ── Regel 2: Singleton ──
  const duplicates=Object.entries(cardCounts).filter(([_,n])=>n>1);
  issues.push({
    rule:'singleton',
    label:'Singleton-Regel',
    ok:duplicates.length===0,
    detail:duplicates.length===0
      ?'Jede Nicht-Land-Karte nur 1× ✓'
      :`${duplicates.length} Karte${duplicates.length===1?'':'n'} mehrfach: `+
        duplicates.slice(0,5).map(([n,q])=>`${n} (${q}×)`).join(', ')+
        (duplicates.length>5?`, …+${duplicates.length-5} weitere`:'')
  });

  // ── Regel 3: Format-Legalität ──
  issues.push({
    rule:'legality',
    label:'Format-Legalität',
    ok:illegalCards.length===0,
    detail:illegalCards.length===0
      ?'Alle Karten Commander-legal ✓'
      :`${illegalCards.length} Karte${illegalCards.length===1?'':'n'} nicht legal: `+
        illegalCards.slice(0,5).join(', ')+
        (illegalCards.length>5?`, …+${illegalCards.length-5} weitere`:'')
  });

  // ── Regel 4: Banlist ──
  issues.push({
    rule:'banlist',
    label:'Banlist',
    ok:bannedCards.length===0,
    detail:bannedCards.length===0
      ?'Keine gebannten Karten ✓'
      :`${bannedCards.length} gebannt: `+bannedCards.slice(0,5).join(', ')+
        (bannedCards.length>5?`, …+${bannedCards.length-5} weitere`:'')
  });

  // ── Regel 5: Farbidentität ──
  if(commanders.length===0){
    issues.push({
      rule:'identity',
      label:'Farbidentität',
      ok:false,
      warning:true,
      detail:'Kein Commander zugeordnet — Karte in Kategorie "Commander" packen, damit die Farbidentität geprüft werden kann'
    });
  }else{
    const colorList=[...commanderColors].sort().join('') || 'Farblos';
    issues.push({
      rule:'identity',
      label:'Farbidentität',
      ok:colorViolators.length===0,
      detail:colorViolators.length===0
        ?`Alle Karten in ${colorList} ✓ (${commanders.length===1?commanders[0].name:commanders.length+' Commander'})`
        :`${colorViolators.length} außerhalb von ${colorList}: `+
          colorViolators.slice(0,5).join(', ')+
          (colorViolators.length>5?`, …+${colorViolators.length-5} weitere`:'')
    });
  }

  return{issues,unenriched,totalCards};
}

// ── Rendering ──
function renderDeckValidation(deck,deckCards){
  const target=document.getElementById('deck-validation-panel');
  if(!target)return;

  // Nur für Commander-Decks anzeigen
  if(deck.format!=='Commander'){
    target.innerHTML='';
    target.style.display='none';
    return;
  }
  target.style.display='';

  // Leeres Deck: keine Validierung
  if(!deckCards.length){
    target.innerHTML='';
    return;
  }

  const{issues,unenriched,totalCards}=validateCommanderDeck(deckCards);
  const errors=issues.filter(i=>!i.ok);
  const allOk=errors.length===0;

  // Status-Pille rechts oben
  const statusHTML=allOk
    ?`<span class="dv-status ok">✓ LEGAL</span>`
    :`<span class="dv-status err">⚠ ${errors.length} ${errors.length===1?'PROBLEM':'PROBLEME'}</span>`;

  // Hinweis falls Karten ohne Daten
  const unenrichedHint=unenriched>0
    ?`<div class="dv-warning">⚠ ${unenriched} Karten ohne angereicherte Daten — Validierung ggf. unvollständig. "Jetzt anreichern" im Banner oben klicken.</div>`
    :'';

  // Issue-Liste — pro Regel eine Zeile mit ✓ oder ✗
  const issueRows=issues.map(i=>{
    const icon=i.ok?'✓':(i.warning?'?':'✗');
    const cls=i.ok?'ok':(i.warning?'warn':'err');
    return`<div class="dv-row ${cls}">
      <span class="dv-icon">${icon}</span>
      <div class="dv-text">
        <div class="dv-label">${i.label}</div>
        <div class="dv-detail">${esc(i.detail)}</div>
      </div>
    </div>`;
  }).join('');

  target.innerHTML=`
    <div class="dv-header">
      <h3>◈ COMMANDER-VALIDIERUNG</h3>
      ${statusHTML}
    </div>
    <div class="dv-body">
      ${unenrichedHint}
      ${issueRows}
    </div>`;
}
