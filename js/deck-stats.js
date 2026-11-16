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

// Hilfsfunktion: Findet die "Karte" zu einem deck_card Eintrag — besessene
// Sammlungskarte oder die am Eintrag gespeicherten Daten (resolveDeckCard in decks.js).
function dcCard(dc){return resolveDeckCard(dc);}

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

  // Marktwert (aktueller Preis) und was die fehlenden Karten noch kosten
  let marketValue=0,missingValue=0,noPrice=0,landCount=0,enrichedCount=0;
  const ownedIdx=typeof buildOwnedNameMap==='function'?buildOwnedNameMap():new Map();

  for(const dc of deckCards){
    const card=dcCard(dc);if(!card)continue;
    const qty=dc.quantity||1;
    totalCards+=qty;
    totalValue+=parsePrice(card.purchase_price)*qty;
    const mp=deckCardMarketPrice(card,dc);
    // Standardländer haben oft keinen Preis — die zählen einfach als 0 €
    if(mp==null){if(!/basic land/i.test(card.type_line||''))noPrice+=qty;}
    else{
      marketValue+=mp*qty;
      if(!((ownedIdx.get((card.name||'').toLowerCase().trim())||0)>0))missingValue+=mp*qty;
    }

    // Wenn wichtige Daten fehlen, separat zählen — Hinweis im UI
    if(card.type_line==null||card.mana_value==null){
      unenrichedCount+=qty;
      continue;
    }

    const isLand=mainType(card.type_line)==='Land';
    enrichedCount+=qty;
    if(isLand)landCount+=qty;

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
  // Ø mit Ländern (Länder zählen mit Manawert 0)
  const avgMvAll=enrichedCount>0?(nonLandManaSum/enrichedCount):0;

  return{totalCards,totalValue,avgMv,avgMvAll,nonLandCount,landCount,manaCurve,colorDist,typeDist,unenrichedCount,
         marketValue,missingValue,noPrice};
}

// ══════════════════════════════════════════════════════════
//  SCRYFALL-DATEN PRO DECK-KARTE  ·  Preis, Manakosten, erzeugtes Mana
// ══════════════════════════════════════════════════════════
//  Deck-Zeilen speichern weder Preis noch Manakosten. Die holt die App beim
//  Öffnen des Decks gebündelt von Scryfall (/cards/collection, 75 pro Anfrage)
//  und merkt sie sich 24 Stunden im localStorage — pro Druckung (scryfall_id).
const DECK_SF_KEY='mtgvault_deck_sf_v1';
const DECK_SF_MAX_AGE_MS=24*60*60*1000;
let deckSf=null;              // {scryfall_id: {e, f, m, p, t}}
let deckSfLoading=null;
let deckStatsExpanded=false;  // Auf-/Zugeklappt bleibt beim Neu-Rendern erhalten

function deckSfStore(){
  if(!deckSf){
    try{deckSf=JSON.parse(localStorage.getItem(DECK_SF_KEY)||'{}')||{};}catch(e){deckSf={};}
  }
  return deckSf;
}
function deckSfSave(){
  try{localStorage.setItem(DECK_SF_KEY,JSON.stringify(deckSf));}
  catch(e){deckSf={};try{localStorage.removeItem(DECK_SF_KEY);}catch(_){}}   // voll → neu anfangen
}
function deckSfOf(scryfallId){
  const e=scryfallId&&deckSfStore()[scryfallId];
  return e||null;
}

// Fehlende/veraltete Einträge nachladen. true = es kam etwas Neues dazu.
async function ensureDeckSfData(dcs){
  if(deckSfLoading)return deckSfLoading;
  const store=deckSfStore();
  const now=Date.now();
  const ids=[...new Set(dcs.map(dc=>resolveDeckCard(dc).scryfall_id||dc.scryfall_id).filter(Boolean))]
    .filter(id=>!store[id]||now-store[id].t>DECK_SF_MAX_AGE_MS);
  if(!ids.length)return false;
  deckSfLoading=(async()=>{
    let changed=false;
    for(let i=0;i<ids.length;i+=75){
      const batch=ids.slice(i,i+75);
      try{
        const res=await fetch('https://api.scryfall.com/cards/collection',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({identifiers:batch.map(id=>({id}))})
        });
        if(!res.ok)throw new Error('HTTP '+res.status);
        const data=await res.json();
        for(const sf of data.data||[]){
          const face=Array.isArray(sf.card_faces)?sf.card_faces[0]:null;
          store[sf.id]={
            e:parseFloat(sf.prices&&sf.prices.eur)||null,
            f:parseFloat(sf.prices&&sf.prices.eur_foil)||null,
            m:sf.mana_cost!=null&&sf.mana_cost!==''?sf.mana_cost:((face&&face.mana_cost)||''),
            p:sf.produced_mana||[],
            t:now
          };
          changed=true;
        }
      }catch(e){console.warn('Deck-Daten von Scryfall fehlgeschlagen:',e);}
      if(i+75<ids.length)await new Promise(r=>setTimeout(r,100));
    }
    if(changed)deckSfSave();
    return changed;
  })();
  try{return await deckSfLoading;}finally{deckSfLoading=null;}
}

// Marktpreis einer Deck-Karte: besessene Karte → Live-Preis der Sammlung
// (berücksichtigt Foil), sonst Scryfall-Preis der Druckung im Deck.
function deckCardMarketPrice(card,dc){
  if(card&&card.id&&!String(card.id).startsWith('dc:')&&typeof livePriceOf==='function'){
    const p=livePriceOf(card);
    if(p!=null)return p;
  }
  const sf=deckSfOf((card&&card.scryfall_id)||dc.scryfall_id);
  if(!sf)return null;
  return sf.e!=null?sf.e:sf.f;
}

// Farbige Mana-Symbole in Manakosten zählen: {W}{W}{U} → W:2, U:1.
// Hybrid ({W/U}) zählt für beide Farben, Phyrexisch ({W/P}) für die Farbe.
// Bei Abenteuer-/Split-Karten („{1}{B}{B} // {2}{B}") zählt nur die Vorderseite.
function countPips(manaCost,out){
  const re=/\{([^}]+)\}/g;let m;
  const front=String(manaCost||'').split(' // ')[0];
  while((m=re.exec(front))){
    for(const part of m[1].split('/')){
      if('WUBRG'.includes(part))out[part]=(out[part]||0)+1;
    }
  }
  return out;
}

// Farbbedarf (Symbole der Nicht-Länder) gegen Farbquellen (Länder + günstige
// Mana-Steine/-Kreaturen bis Manawert 3, laut Scryfall „produced_mana")
function computeColorSources(deckCards){
  const pips={},lands={},ramp={};
  let landTotal=0,missingData=0;
  for(const dc of deckCards){
    const card=dcCard(dc);if(!card)continue;
    const qty=dc.quantity||1;
    const sf=deckSfOf(card.scryfall_id||dc.scryfall_id);
    if(!sf){missingData+=qty;continue;}
    const isLand=mainType(card.type_line)==='Land';
    if(isLand)landTotal+=qty;
    else for(let i=0;i<qty;i++)countPips(sf.m,pips);
    const produced=(sf.p||[]).filter(c=>'WUBRG'.includes(c));
    if(!produced.length)continue;
    if(isLand)produced.forEach(c=>lands[c]=(lands[c]||0)+qty);
    else if(card.mana_value!=null&&card.mana_value<=3)produced.forEach(c=>ramp[c]=(ramp[c]||0)+qty);
  }
  const pipTotal=Object.values(pips).reduce((a,b)=>a+b,0);
  const rows=['W','U','B','R','G'].map(c=>{
    const need=pips[c]||0,src=(lands[c]||0)+(ramp[c]||0);
    return{c,need,lands:lands[c]||0,ramp:ramp[c]||0,src};
  // Farben nur aus Ramp (z.B. Arcane Signet „erzeugt" laut Scryfall alle Farben) ausblenden
  }).filter(r=>r.need>0||r.lands>0);
  const srcTotal=rows.reduce((a,r)=>a+r.src,0);
  // Warnung: Anteil an den Quellen deutlich kleiner als Anteil am Bedarf
  for(const r of rows){
    const needShare=pipTotal?r.need/pipTotal:0;
    const srcShare=srcTotal?r.src/srcTotal:0;
    r.low=r.need>0&&(r.src===0||srcShare<needShare*0.7);
  }
  return{rows,pipTotal,missingData,landTotal};
}

// Rendert das Stats-Panel ins entsprechende DOM-Element.
// `deck` und `deckCards` werden vom Aufrufer (renderDeckDetail) bereitgestellt.
function renderDeckStats(deck,deckCards){
  const target=document.getElementById('deck-stats-panel');
  if(!target)return;
  // Preise/Manakosten im Hintergrund nachladen und danach neu zeichnen
  ensureDeckSfData(deckCards).then(changed=>{
    if(changed&&deck&&activeDeckId===deck.id&&document.getElementById('deck-stats-panel'))
      renderDeckStats(deck,mainDeckCards(currentDeckCards));
  });

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

  // ── Farbquellen ──
  const cs=computeColorSources(deckCards);
  const csMax=Math.max(1,...cs.rows.map(r=>Math.max(r.need,r.src)));
  const csHTML=cs.rows.length?cs.rows.map(r=>{
    const m=colorMeta[r.c];
    return`<div class="cs-row${r.low?' cs-low':''}" title="${m.name}: ${r.need} Symbole in den Manakosten, ${r.src} Quellen (${r.lands} Länder + ${r.ramp} Ramp)">
      <span class="mana-pill-mini ${m.cls}">${r.c}</span>
      <div class="cs-bars">
        <div class="cs-bar cs-need" style="width:${(r.need/csMax*100).toFixed(1)}%"></div>
        <div class="cs-bar cs-src" style="width:${(r.src/csMax*100).toFixed(1)}%"></div>
      </div>
      <span class="cs-num">${r.need} / ${r.src}${r.low?' ⚠':''}</span>
    </div>`;
  }).join('')+`<div class="cs-legend"><span class="cs-dot cs-need"></span>Symbole (Bedarf) <span class="cs-dot cs-src"></span>Quellen (Länder + Ramp bis MV 3)</div>`
    +(cs.rows.some(r=>r.low)?`<div class="cs-hint">⚠ = deutlich weniger Quellen als der Anteil der Farbe an den Manakosten</div>`:'')
    :`<div class="deck-stats-empty">${cs.missingData?'Lade Manakosten von Scryfall…':'—'}</div>`;

  const eur=v=>v.toFixed(2).replace('.',',')+' €';
  const priceNote=s.noPrice?` · ${s.noPrice} ohne Preis`:'';

  target.innerHTML=`
    <div class="deck-stats-header">
      <h3>◈ DECK-STATISTIK</h3>
      <button class="deck-stats-toggle" onclick="toggleDeckStats(this)" data-collapsed="${deckStatsExpanded?'false':'true'}">${deckStatsExpanded?'Einklappen ▴':'Ausklappen ▾'}</button>
    </div>
    <div class="deck-stats-body" style="${deckStatsExpanded?'':'display:none'}">
      ${unenrichedHint}
      <div class="deck-kpi-row">
        <div class="kpi"><div class="kpi-val">${s.totalCards}</div><div class="kpi-label">Karten · ${s.landCount} Länder</div></div>
        <div class="kpi"><div class="kpi-val">${s.avgMv.toFixed(2).replace('.',',')}</div><div class="kpi-label">Ø Manawert · mit Ländern ${s.avgMvAll.toFixed(2).replace('.',',')}</div></div>
        <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${eur(s.marketValue)}</div><div class="kpi-label">Marktwert · Kaufpreis ${eur(s.totalValue)}${priceNote}</div></div>
        <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${eur(s.missingValue)}</div><div class="kpi-label">Fehlende Karten kosten</div></div>
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
        <div class="deck-stats-section">
          <h4>FARBQUELLEN <span class="hint">(Bedarf / Quellen)</span></h4>
          <div class="color-sources">${csHTML}</div>
        </div>
      </div>
    </div>`;
}

// Stats-Panel ein-/ausklappen (Reine UI-Funktion, keine Neuberechnung)
function toggleDeckStats(btn){
  const body=btn.closest('.deck-stats-panel').querySelector('.deck-stats-body');
  const collapsed=btn.dataset.collapsed==='true';
  body.style.display=collapsed?'':'none';
  deckStatsExpanded=collapsed;   // Zustand fürs nächste Neu-Rendern merken
  btn.dataset.collapsed=collapsed?'false':'true';
  btn.textContent=collapsed?'Einklappen ▴':'Ausklappen ▾';
}
