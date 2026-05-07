// ══════════════════════════════════════════════════════════
//  PRICE-TRACKING  ·  Wertentwicklung über Zeit
// ══════════════════════════════════════════════════════════
//
//  Verantwortlich für:
//  - Live-Preise von Scryfall holen (eur-Feld) für die Sammlung
//  - Wöchentliche Snapshots des Gesamtwerts in der DB speichern
//  - Den Verlauf als Linechart in der Statistik-View rendern
//
//  Aufruf-Flow:
//    1. App-Start (in app.js nach loadAll) ruft `maybeCreateWeeklySnapshot()` auf
//    2. Diese Funktion prüft, wann der letzte Snapshot war
//    3. Wenn >7 Tage alt (oder noch keiner existiert):
//       a. Live-Preise von Scryfall holen
//       b. Gesamtwert berechnen
//       c. Neuen Snapshot in DB speichern
//
//  Datenquelle: Scryfall liefert pro Karte u.a. prices.eur (kann null sein,
//  wenn der Markt keinen Preis kennt). Foil-Karten haben prices.eur_foil.
//  Wir nehmen für jede Karte den passenden Preis.

const SNAPSHOT_INTERVAL_DAYS = 7;

// ── Live-Preise für die ganze Sammlung holen ──
//
// Holt für alle Karten mit scryfall_id den aktuellen EUR-Preis von Scryfall.
// Verwendet die gleiche Batch-API wie die Anreicherung, aber mit anderem
// Output-Mapping. Foil-Karten bekommen den Foil-Preis, sonst Normal-Preis.
async function fetchLivePrices(cards, onProgress){
  const valid=cards.filter(c=>c.scryfall_id);
  const prices={};  // {scryfall_id: euroBetrag}
  if(!valid.length)return prices;

  const BATCH=75;
  let processed=0;
  for(let i=0;i<valid.length;i+=BATCH){
    const batch=valid.slice(i,i+BATCH);
    try{
      const res=await fetch('https://api.scryfall.com/cards/collection',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({identifiers:batch.map(c=>({id:c.scryfall_id}))})
      });
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      const byId={};
      for(const r of(data.data||[]))byId[r.id]=r;

      for(const card of batch){
        const sf=byId[card.scryfall_id];
        if(!sf||!sf.prices)continue;
        // Foil-Karten preferieren den Foil-Preis, fallen aber auf normalen Preis zurück
        // wenn nichts da ist (manche Karten haben nur eine Variante mit Preis).
        let eurPrice=null;
        if(card.foil==='foil'){
          eurPrice=parseFloat(sf.prices.eur_foil)||parseFloat(sf.prices.eur)||null;
        }else{
          eurPrice=parseFloat(sf.prices.eur)||parseFloat(sf.prices.eur_foil)||null;
        }
        if(eurPrice!=null)prices[card.scryfall_id]=eurPrice;
      }
    }catch(e){
      console.warn('Scryfall-Preis-Batch fehlgeschlagen:',e);
    }

    processed+=batch.length;
    if(onProgress)onProgress(processed,valid.length);

    // Höfliche Pause zwischen Requests
    if(i+BATCH<valid.length){
      await new Promise(r=>setTimeout(r,100));
    }
  }
  return prices;
}

// ── Aktuellen Sammlungswert berechnen (Live von Scryfall) ──
async function calculateCurrentValue(){
  const prices=await fetchLivePrices(allCards);
  let total=0;
  let cardCount=0;
  for(const card of allCards){
    const qty=card.quantity||1;
    cardCount+=qty;
    const p=prices[card.scryfall_id];
    if(p!=null)total+=p*qty;
  }
  return{total,cardCount,prices};
}

// ── Letzten Snapshot aus DB lesen ──
async function getLatestSnapshot(){
  const{data,error}=await _sb
    .from('price_snapshots')
    .select('*')
    .order('snapshot_date',{ascending:false})
    .limit(1);
  if(error||!data||!data.length)return null;
  return data[0];
}

// ── Alle Snapshots laden (für Linechart) ──
async function getAllSnapshots(){
  const{data,error}=await _sb
    .from('price_snapshots')
    .select('snapshot_date,total_value,card_count')
    .order('snapshot_date',{ascending:true});
  if(error)return[];
  return data||[];
}

// ── Snapshot-Trigger beim App-Start ──
//
// Prüft, wann der letzte Snapshot war. Wenn >7 Tage alt oder noch keiner
// existiert, wird ein neuer angelegt. Läuft im Hintergrund — der User
// merkt davon nichts (außer dass die App-Seite mal kurz Daten lädt).
async function maybeCreateWeeklySnapshot(){
  // Nur prüfen, wenn Karten vorhanden — leere Sammlung braucht keine Snapshots
  if(!allCards.length)return;

  try{
    const latest=await getLatestSnapshot();
    const today=new Date();
    today.setHours(0,0,0,0);

    if(latest){
      const lastDate=new Date(latest.snapshot_date);
      const daysSince=Math.floor((today-lastDate)/(1000*60*60*24));
      if(daysSince<SNAPSHOT_INTERVAL_DAYS){
        // Noch nicht eine Woche her, nichts tun
        return;
      }
    }

    // Wir machen einen neuen Snapshot
    console.log('[Price-Tracking] Erstelle wöchentlichen Snapshot…');
    const{total,cardCount}=await calculateCurrentValue();
    if(total<=0){
      // Keine Preise gefunden — keinen sinnlosen Snapshot speichern
      console.warn('[Price-Tracking] Keine Preise gefunden, Snapshot übersprungen');
      return;
    }

    const todayIso=today.toISOString().split('T')[0];
    const{error}=await _sb.from('price_snapshots').insert({
      user_id:currentUser.id,
      snapshot_date:todayIso,
      total_value:total.toFixed(2),
      card_count:cardCount
    });

    if(error){
      // unique-Constraint-Fehler (Snapshot für heute existiert schon) ignorieren wir
      if(!error.message.includes('duplicate'))console.warn('[Price-Tracking] Snapshot-Fehler:',error);
      return;
    }
    console.log(`[Price-Tracking] ✓ Snapshot gespeichert: ${total.toFixed(2)} € (${cardCount} Karten)`);
  }catch(e){
    // Snapshot-Erzeugung darf den App-Start nicht blockieren
    console.warn('[Price-Tracking] Fehler:',e);
  }
}

// ── Linechart rendern ──
//
// Pures SVG, kein externes Charting-Lib nötig. Skaliert auf den Container,
// zeigt Punkte mit Tooltip beim Hover.
function renderPriceChart(snapshots){
  if(!snapshots.length){
    return`<div class="price-chart-empty">
      <p>Noch keine Snapshots vorhanden.</p>
      <p class="hint">Sobald du die App geöffnet hast und Karten in der Sammlung sind,
      wird wöchentlich ein Snapshot erstellt.</p>
    </div>`;
  }

  if(snapshots.length===1){
    const s=snapshots[0];
    return`<div class="price-chart-single">
      <div class="single-value">${parseFloat(s.total_value).toFixed(2)} €</div>
      <div class="single-date">am ${formatSnapshotDate(s.snapshot_date)}</div>
      <p class="hint">Erst nach dem zweiten Snapshot kann ein Verlauf gezeichnet werden.</p>
    </div>`;
  }

  // Auf 600×220 SVG-Koordinaten skalieren
  const W=600,H=220,padL=55,padR=12,padT=15,padB=35;
  const innerW=W-padL-padR,innerH=H-padT-padB;

  const values=snapshots.map(s=>parseFloat(s.total_value));
  const min=Math.min(...values);
  const max=Math.max(...values);
  // Etwas Luft nach oben/unten
  const range=max-min||1;
  const yMin=Math.max(0,min-range*0.1);
  const yMax=max+range*0.1;
  const yRange=yMax-yMin;

  // X-Achse: gleichmäßig verteilte Punkte (nicht nach Datum proportional, einfacher)
  const points=snapshots.map((s,i)=>{
    const x=padL+(snapshots.length===1?innerW/2:i*innerW/(snapshots.length-1));
    const y=padT+innerH-((parseFloat(s.total_value)-yMin)/yRange*innerH);
    return{x,y,date:s.snapshot_date,value:parseFloat(s.total_value),count:s.card_count};
  });

  // SVG-Pfad als Linie
  const pathD=points.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');

  // Y-Achsen-Beschriftungen (3 Linien: oben, mitte, unten)
  const yLabels=[yMax,yMin+yRange/2,yMin].map((v,i)=>{
    const y=padT+i*innerH/2;
    return`<text x="${padL-8}" y="${y+4}" text-anchor="end" class="chart-axis">${v.toFixed(0)} €</text>
           <line x1="${padL}" x2="${W-padR}" y1="${y}" y2="${y}" class="chart-grid"/>`;
  }).join('');

  // Punkte mit Hover-Titles
  const dots=points.map(p=>`
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="chart-dot">
      <title>${formatSnapshotDate(p.date)}: ${p.value.toFixed(2)} €${p.count?` · ${p.count} Karten`:''}</title>
    </circle>`).join('');

  // X-Achsen-Beschriftung — Erstes und letztes Datum, dazwischen abhängig von Anzahl
  const xLabels=[];
  const indicesToLabel=snapshots.length<=4
    ?points.map((_,i)=>i)
    :[0,Math.floor(points.length/3),Math.floor(2*points.length/3),points.length-1];
  for(const i of indicesToLabel){
    const p=points[i];
    xLabels.push(`<text x="${p.x.toFixed(1)}" y="${H-12}" text-anchor="middle" class="chart-axis">${formatSnapshotDate(p.date,true)}</text>`);
  }

  // Wertentwicklung: Veränderung erstes -> letztes
  const first=values[0];
  const last=values[values.length-1];
  const change=last-first;
  const changePct=first>0?(change/first*100):0;
  const changeClass=change>=0?'pos':'neg';
  const changeSign=change>=0?'+':'';

  return`
    <div class="price-chart-summary">
      <div class="pcs-item">
        <div class="pcs-val">${last.toFixed(2)} €</div>
        <div class="pcs-lbl">Aktuell</div>
      </div>
      <div class="pcs-item">
        <div class="pcs-val ${changeClass}">${changeSign}${change.toFixed(2)} € (${changeSign}${changePct.toFixed(1)}%)</div>
        <div class="pcs-lbl">Veränderung seit ${formatSnapshotDate(snapshots[0].snapshot_date)}</div>
      </div>
      <div class="pcs-item">
        <div class="pcs-val">${snapshots.length}</div>
        <div class="pcs-lbl">Snapshots</div>
      </div>
    </div>
    <svg class="price-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${yLabels}
      <path d="${pathD}" class="chart-line" fill="none"/>
      ${dots}
      ${xLabels.join('')}
    </svg>`;
}

// Datum für Anzeige formatieren — kompakt für Achsenbeschriftung, ausführlicher sonst
function formatSnapshotDate(isoDate,compact=false){
  const d=new Date(isoDate);
  if(compact){
    return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
  }
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
}

// ── Manueller Snapshot via Knopfdruck ──
async function createManualSnapshot(btn){
  if(btn)setBusy(btn,true,'Erfasse Werte…');
  try{
    const{total,cardCount}=await calculateCurrentValue();
    if(total<=0){
      toastError('Keine Live-Preise gefunden. Sammlung enthält keine bewerteten Karten.');
      return;
    }
    const today=new Date().toISOString().split('T')[0];
    const{error}=await _sb.from('price_snapshots').upsert({
      user_id:currentUser.id,
      snapshot_date:today,
      total_value:total.toFixed(2),
      card_count:cardCount
    },{onConflict:'user_id,snapshot_date'});

    if(error){toastError('Snapshot fehlgeschlagen: '+error.message);return;}
    toastSuccess(`Snapshot erstellt: ${total.toFixed(2)} €`);
    // Statistik-View neu laden falls aktiv
    if(typeof renderStats==='function')renderStats();
  }finally{
    if(btn)setBusy(btn,false);
  }
}
