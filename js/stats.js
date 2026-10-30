// ══════════════════════════════════════════════════════════
//  STATS  ·  Statistik-Berechnung und -Darstellung
// ══════════════════════════════════════════════════════════
async function renderStats(){
  const sc=document.getElementById('stats-content');
  if(!allCards.length){sc.style.display='none';return;}sc.style.display='';
  const total=allCards.reduce((s,c)=>s+c.quantity,0);
  // Einträge = unique Kartennamen (entspricht der Group-Logik in der Sammlung)
  const uniqueNames=new Set(allCards.map(c=>(c.name||'').toLowerCase())).size;
  const totalVal=allCards.reduce((s,c)=>s+parsePrice(c.purchase_price)*(c.quantity||1),0);
  const foilC=allCards.filter(c=>c.foil==='foil').reduce((s,c)=>s+c.quantity,0);
  const sets=new Set(allCards.map(c=>c.set_code)).size;
  const rC={};allCards.forEach(c=>{rC[c.rarity]=(rC[c.rarity]||0)+c.quantity;});
  const rCol={mythic:'var(--mythic)',rare:'var(--gold)',uncommon:'var(--uncommon)',common:'var(--text3)'};
  const maxR=Math.max(...Object.values(rC),1);
  const sC={};allCards.forEach(c=>{sC[c.set_code]=(sC[c.set_code]||0)+c.quantity;});
  const topS=Object.entries(sC).sort((a,b)=>b[1]-a[1]).slice(0,10);const maxS=Math.max(...topS.map(s=>s[1]),1);
  const lC={};allCards.forEach(c=>{const l=c.language||'Unbekannt';lC[l]=(lC[l]||0)+c.quantity;});
  const topL=Object.entries(lC).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxL=Math.max(...topL.map(l=>l[1]),1);
  const cC={};allCards.forEach(c=>{const l=c.condition||'Unbekannt';cC[l]=(cC[l]||0)+c.quantity;});

  // Preis-Snapshots laden — wenn das Feature noch nicht migriert ist (Tabelle fehlt),
  // schweigend mit leerem Chart fortfahren
  let priceChartHTML='';
  try{
    if(typeof getAllSnapshots==='function'){
      const snapshots=await getAllSnapshots();
      priceChartHTML=`
      <div class="stats-section">
        <h2 style="display:flex;align-items:center;gap:0.7rem;flex-wrap:wrap">
          ◈ WERTENTWICKLUNG
          <button class="btn-mini" onclick="createManualSnapshot(this)" title="Jetzt manuellen Snapshot erstellen">📸 Snapshot</button>
        </h2>
        <div class="price-chart-container">${renderPriceChart(snapshots)}</div>
      </div>`;
    }
  }catch(e){
    console.warn('Preis-Tracking nicht verfügbar:',e);
  }

  const market=renderMarketSection();

  sc.innerHTML=`
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-val">${total.toLocaleString('de')}</div><div class="kpi-label">Karten gesamt</div></div>
    <div class="kpi"><div class="kpi-val">${uniqueNames.toLocaleString('de')}</div><div class="kpi-label">Einträge</div></div>
    <div class="kpi"><div class="kpi-val">${sets}</div><div class="kpi-label">Sets</div></div>
    <div class="kpi"><div class="kpi-val">${foilC.toLocaleString('de')}</div><div class="kpi-label">Foil-Karten</div></div>
    <div class="kpi"><div class="kpi-val">${allDecks.length}</div><div class="kpi-label">Decks</div></div>
    <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${totalVal.toFixed(2)} €</div><div class="kpi-label">Kaufwert</div></div>
    ${market.kpi}
  </div>
  ${market.html}
  ${priceChartHTML}
  <div class="stats-section"><h2>◈ SELTENHEIT</h2><div class="bar-chart">${['mythic','rare','uncommon','common'].filter(r=>rC[r]).map(r=>`<div class="bar-row"><span class="bar-label" style="text-transform:capitalize;color:${rCol[r]}">${r}</span><div class="bar-track"><div class="bar-fill" style="width:${(rC[r]/maxR*100).toFixed(1)}%;background:${rCol[r]}">${rC[r]}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ TOP SETS</h2><div class="bar-chart">${topS.map(([c,n])=>`<div class="bar-row"><span class="bar-label">${c}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxS*100).toFixed(1)}%;background:var(--purple)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ SPRACHEN</h2><div class="bar-chart">${topL.map(([l,n])=>`<div class="bar-row"><span class="bar-label">${l}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxL*100).toFixed(1)}%;background:var(--teal)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ ZUSTAND</h2><div class="bar-chart">${Object.entries(cC).sort((a,b)=>b[1]-a[1]).map(([cond,n])=>`<div class="bar-row"><span class="bar-label">${cl(cond)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/total*100).toFixed(1)}%;background:var(--green)">${n} (${(n/total*100).toFixed(0)}%)</div></div></div>`).join('')}</div></div>`;
}

// ── Marktwert, Gewinn/Verlust, wertvollste Karten ──
// Nutzt die aktuellen Scryfall-Preise pro Karte (livePrices, price-tracking.js).
// Gewinn/Verlust zählt nur Karten mit Kaufpreis — sonst wäre jede geschenkte
// oder ohne Preis importierte Karte ein „Gewinn".
function renderMarketSection(){
  if(typeof livePriceOf!=='function')return{kpi:'',html:''};
  const refreshBtn=`<button class="btn-mini" onclick="forceRefreshLivePrices(this)" title="Aktuelle Preise jetzt neu von Scryfall laden">↻ Preise</button>`;
  const head=`<h2 style="display:flex;align-items:center;gap:0.7rem;flex-wrap:wrap">◈ MARKTWERT ${refreshBtn}</h2>`;
  const priced=allCards.filter(c=>livePriceOf(c)!=null);
  if(!priced.length){
    return{kpi:'',html:`<div class="stats-section">${head}<p class="mv-hint">Aktuelle Preise werden von Scryfall geladen…</p></div>`};
  }
  const qty=c=>c.quantity||1;
  const marketTotal=priced.reduce((s,c)=>s+livePriceOf(c)*qty(c),0);
  const withPaid=priced.filter(c=>parsePrice(c.purchase_price)>0);
  const paid=withPaid.reduce((s,c)=>s+parsePrice(c.purchase_price)*qty(c),0);
  const now=withPaid.reduce((s,c)=>s+livePriceOf(c)*qty(c),0);
  const delta=priceDelta(now,paid);
  const stand=livePricesAt?new Date(livePricesAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';

  const row=(c,valHtml)=>`<div class="mv-row" onclick="openCardModal('${escJs(c.name)}')" title="Karte öffnen">
      <span class="mv-name">${esc(c.name)} <span class="mv-set">${esc(c.set_code||'')}${c.foil==='foil'?' ✦':''}${qty(c)>1?' · ×'+qty(c):''}</span></span>
      <span class="mv-val">${valHtml}</span>
    </div>`;
  const list=(title,items,empty)=>`<div class="mv-list"><h3>${title}</h3>${items.length?items.join(''):`<p class="mv-hint">${empty}</p>`}</div>`;

  const top=[...priced].sort((a,b)=>livePriceOf(b)-livePriceOf(a)).slice(0,10)
    .map(c=>row(c,`${livePriceOf(c).toFixed(2)} €`));
  const moves=withPaid.map(c=>({c,d:(livePriceOf(c)-parsePrice(c.purchase_price))*qty(c)}));
  const fmt=m=>{const pd=priceDelta(livePriceOf(m.c),parsePrice(m.c.purchase_price));return`<span class="price-delta ${pd.cls}">${m.d>0?'+':'−'}${Math.abs(m.d).toFixed(2)} €</span>`;};
  const winners=moves.filter(m=>m.d>0.005).sort((a,b)=>b.d-a.d).slice(0,5).map(m=>row(m.c,fmt(m)));
  const losers=moves.filter(m=>m.d<-0.005).sort((a,b)=>a.d-b.d).slice(0,5).map(m=>row(m.c,fmt(m)));

  const summary=`<div class="mv-summary">
      ${delta?`<span>Gewinn/Verlust: <strong class="price-delta ${delta.cls}">${delta.text}</strong> <span class="mv-sub">(${withPaid.length} Einträge mit Kaufpreis: ${paid.toFixed(2)} € → ${now.toFixed(2)} €)</span></span>`:'<span class="mv-sub">Für Gewinn/Verlust fehlen Kaufpreise.</span>'}
      ${stand?`<span class="mv-sub">Preise: Scryfall (Cardmarket), Stand ${stand}</span>`:''}
    </div>`;

  return{
    kpi:`<div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${marketTotal.toFixed(2)} €</div><div class="kpi-label">Marktwert</div></div>`,
    html:`<div class="stats-section">${head}${summary}
      <div class="mv-grid">
        ${list('WERTVOLLSTE KARTEN',top,'')}
        ${list('GRÖSSTE GEWINNER',winners,'Noch keine Karte über dem Kaufpreis.')}
        ${list('GRÖSSTE VERLIERER',losers,'Keine Karte unter dem Kaufpreis.')}
      </div></div>`
  };
}
