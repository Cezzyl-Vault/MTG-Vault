// ══════════════════════════════════════════════════════════
//  DECK-STATS  ·  Statistik-Berechnung pro Deck
// ══════════════════════════════════════════════════════════
//
//  Wird aus decks.js renderDeckDetail aufgerufen und schreibt in den
//  Container <div id="deck-stats-panel"> oben im Deck-Detail-View.
//
//  Berechnete Kennzahlen:
//    KPIs:
//      - Karten gesamt (Summe der quantities)
//      - Durchschn. Manawert (ohne Länder, MTG-Convention)
//      - Deckwert (Summe purchase_price × quantity)
//    Charts:
//      - Mana-Kurve (0..7+, ohne Länder)
//      - Farbverteilung (jede Farbe einer multicolor Karte zählt 1×)
//      - Typenverteilung (Hauptkategorie pro Karte)

// Hilfsfunktion: Findet die "Karte" zu einem deck_card Eintrag.
// Im currentDeckCards-Array sind Einträge der Form { card_id, quantity, ... } —
// die eigentlichen Karten-Daten (mana_value, colors, type_line) stehen in allCards.
function dcCard(dc){return allCards.find(c=>c.id===dc.card_id);}

// Hilfsfunktion: Hauptkategorie aus type_line ermitteln.
// Hat Vorrang: Land > Creature > Planeswalker > Battle > Artifact > Enchantment > Instant > Sorcery > Andere.
// (Hintergrund: "Artifact Creature" ist primär Creature, wird aber bei deckbaurelevanten
// Charts üblicherweise zu Creatures gezählt. "Land Creature" gibt's praktisch nicht;
// Land hat trotzdem Vorrang, weil reine Länder so erkannt werden.)
function mainType(typeLine){
  const tl=(typeLine||'').toLowerCase();
  if(!tl)return 'Unbekannt';
  if(tl.includes('land'))return 'Land';
  if(tl.includes('creature'))return 'Creature';
  if(tl.includes('planeswalker'))return 'Planeswalker';
  if(tl.includes('battle'))return 'Battle';
  if(tl.includes('artifact'))return 'Artifact';
  if(tl.includes('enchantment'))return 'Enchantment';
  if(tl.includes('instant'))return 'Instant';
  if(tl.includes('sorcery'))return 'Sorcery';
  return 'Andere';
}

// Berechnet alle Kennzahlen aus den Karten eines Decks.
// Rückgabe enthält Zahlen + bereits aufbereitete Daten für die Charts.
function computeDeckStats(deckCards){
  let totalCards=0;
  let totalValue=0;
  let nonLandCount=0;        // für Avg-CMC-Berechnung
  let nonLandManaSum=0;      // Summe Manawerte aller Nicht-Land-Karten

  const manaCurve={'0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7+':0};
  const colorDist={W:0,U:0,B:0,R:0,G:0,Farblos:0};
  const typeDist={};
  let unenrichedCount=0;

  for(const dc of deckCards){
    const card=dcCard(dc);if(!card)continue;
    const qty=dc.quantity||1;
    totalCards+=qty;
    totalValue+=(parseFloat(card.purchase_price)||0)*qty;

    // Wenn wichtige Daten fehlen, separat zählen — Hinweis im UI
    if(card.type_line==null||card.mana_value==null){
      unenrichedCount+=qty;
      continue;
    }

    const isLand=mainType(card.type_line)==='Land';

    // Mana-Kurve nur für Nicht-Länder (Standard in jedem Deckbuilder)
    if(!isLand){
      nonLandCount+=qty;
      nonLandManaSum+=card.mana_value*qty;
      const bucket=card.mana_value>=7?'7+':String(card.mana_value);
      manaCurve[bucket]=(manaCurve[bucket]||0)+qty;
    }

    // Farbverteilung: jede Farbe der Karte zählt mit qty.
    // Länder werden ausgeschlossen — sonst würden alle Basic Lands als "Farblos"
    // zählen und die Farbverteilung dominieren.
    if(!isLand){
      const colors=Array.isArray(card.colors)?card.colors:[];
      if(colors.length===0){
        colorDist.Farblos+=qty;
      }else{
        for(const c of colors){
          if(colorDist[c]!=null)colorDist[c]+=qty;
        }
      }
    }

    // Typenverteilung
    const t=mainType(card.type_line);
    typeDist[t]=(typeDist[t]||0)+qty;
  }

  const avgMv=nonLandCount>0?(nonLandManaSum/nonLandCount):0;

  return{totalCards,totalValue,avgMv,nonLandCount,manaCurve,colorDist,typeDist,unenrichedCount};
}

// Rendert das Stats-Panel ins entsprechende DOM-Element.
// `deck` und `deckCards` werden vom Aufrufer (renderDeckDetail) bereitgestellt.
function renderDeckStats(deck,deckCards){
  const target=document.getElementById('deck-stats-panel');
  if(!target)return;

  if(!deckCards.length){
    target.innerHTML=`<div class="deck-stats-empty">Statistik erscheint, sobald Karten im Deck sind.</div>`;
    return;
  }

  const s=computeDeckStats(deckCards);

  // Falls nichts angereichert ist, Hinweis zeigen statt leerer Charts
  if(s.totalCards>0&&s.unenrichedCount===s.totalCards){
    target.innerHTML=`
      <div class="deck-stats-header">
        <h3>◈ DECK-STATISTIK</h3>
      </div>
      <div class="deck-stats-empty">
        Keine angereicherten Daten verfügbar. Klick auf "Jetzt anreichern" im Banner oben.
      </div>`;
    return;
  }

  // ── Mana-Kurve ──
  const mcMax=Math.max(...Object.values(s.manaCurve),1);
  const mcHTML=Object.entries(s.manaCurve).map(([k,n])=>{
    const pct=(n/mcMax*100).toFixed(1);
    return`<div class="curve-col">
      <div class="curve-bar-track"><div class="curve-bar" style="height:${pct}%" title="${n} Karten"></div></div>
      <div class="curve-count">${n||''}</div>
      <div class="curve-label">${k}</div>
    </div>`;
  }).join('');

  // ── Farben ──
  const colorMeta={
    W:{name:'Weiß',cls:'mana-w'},
    U:{name:'Blau',cls:'mana-u'},
    B:{name:'Schwarz',cls:'mana-b'},
    R:{name:'Rot',cls:'mana-r'},
    G:{name:'Grün',cls:'mana-g'},
    Farblos:{name:'Farblos',cls:'mana-c'}
  };
  const colorEntries=Object.entries(s.colorDist).filter(([,n])=>n>0);
  const colorMax=Math.max(...colorEntries.map(([,n])=>n),1);
  const colorHTML=colorEntries.map(([k,n])=>{
    const m=colorMeta[k];
    const pct=(n/colorMax*100).toFixed(1);
    return`<div class="bar-row">
      <span class="bar-label color-label"><span class="mana-pill-mini ${m.cls}">${k==='Farblos'?'◇':k}</span>${m.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--purple)">${n}</div></div>
    </div>`;
  }).join('')||'<div class="deck-stats-empty">—</div>';

  // ── Typen ──
  const typeOrder=['Creature','Planeswalker','Instant','Sorcery','Enchantment','Artifact','Land','Battle','Andere','Unbekannt'];
  const typeEntries=typeOrder.map(t=>[t,s.typeDist[t]||0]).filter(([,n])=>n>0);
  const typeMax=Math.max(...typeEntries.map(([,n])=>n),1);
  const typeHTML=typeEntries.map(([k,n])=>{
    const pct=(n/typeMax*100).toFixed(1);
    return`<div class="bar-row">
      <span class="bar-label">${k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--teal)">${n}</div></div>
    </div>`;
  }).join('');

  const unenrichedHint=s.unenrichedCount>0
    ?`<div class="deck-stats-warning">⚠ ${s.unenrichedCount} Karten ohne angereicherte Daten — werden in den Charts ignoriert.</div>`
    :'';

  target.innerHTML=`
    <div class="deck-stats-header">
      <h3>◈ DECK-STATISTIK</h3>
      <button class="deck-stats-toggle" onclick="toggleDeckStats(this)" data-collapsed="false">Einklappen ▴</button>
    </div>
    <div class="deck-stats-body">
      ${unenrichedHint}
      <div class="deck-kpi-row">
        <div class="kpi"><div class="kpi-val">${s.totalCards}</div><div class="kpi-label">Karten</div></div>
        <div class="kpi"><div class="kpi-val">${s.avgMv.toFixed(2)}</div><div class="kpi-label">Ø Manawert</div></div>
        <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${s.totalValue.toFixed(2)} €</div><div class="kpi-label">Deckwert</div></div>
      </div>
      <div class="deck-stats-grid">
        <div class="deck-stats-section">
          <h4>MANA-KURVE <span class="hint">(ohne Länder)</span></h4>
          <div class="mana-curve">${mcHTML}</div>
        </div>
        <div class="deck-stats-section">
          <h4>FARBEN <span class="hint">(ohne Länder)</span></h4>
          <div class="bar-chart">${colorHTML}</div>
        </div>
        <div class="deck-stats-section">
          <h4>TYPEN</h4>
          <div class="bar-chart">${typeHTML}</div>
        </div>
      </div>
    </div>`;
}

// Stats-Panel ein-/ausklappen (Reine UI-Funktion, keine Neuberechnung)
function toggleDeckStats(btn){
  const body=btn.closest('.deck-stats-panel').querySelector('.deck-stats-body');
  const collapsed=btn.dataset.collapsed==='true';
  body.style.display=collapsed?'':'none';
  btn.dataset.collapsed=collapsed?'false':'true';
  btn.textContent=collapsed?'Einklappen ▴':'Ausklappen ▾';
}
