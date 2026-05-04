// ══════════════════════════════════════════════════════════
//  STATS  ·  Statistik-Berechnung und -Darstellung
// ══════════════════════════════════════════════════════════
function renderStats(){
  const sc=document.getElementById('stats-content');
  if(!allCards.length){sc.style.display='none';return;}sc.style.display='';
  const total=allCards.reduce((s,c)=>s+c.quantity,0);
  const totalVal=allCards.reduce((s,c)=>s+(parseFloat(c.purchase_price)||0)*c.quantity,0);
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

  sc.innerHTML=`
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-val">${total.toLocaleString('de')}</div><div class="kpi-label">Karten gesamt</div></div>
    <div class="kpi"><div class="kpi-val">${allCards.length.toLocaleString('de')}</div><div class="kpi-label">Einträge</div></div>
    <div class="kpi"><div class="kpi-val">${sets}</div><div class="kpi-label">Sets</div></div>
    <div class="kpi"><div class="kpi-val">${foilC.toLocaleString('de')}</div><div class="kpi-label">Foil-Karten</div></div>
    <div class="kpi"><div class="kpi-val">${allDecks.length}</div><div class="kpi-label">Decks</div></div>
    <div class="kpi"><div class="kpi-val" style="font-size:1.2rem">${totalVal.toFixed(2)} €</div><div class="kpi-label">Gesamtwert</div></div>
  </div>
  <div class="stats-section"><h2>◈ SELTENHEIT</h2><div class="bar-chart">${['mythic','rare','uncommon','common'].filter(r=>rC[r]).map(r=>`<div class="bar-row"><span class="bar-label" style="text-transform:capitalize;color:${rCol[r]}">${r}</span><div class="bar-track"><div class="bar-fill" style="width:${(rC[r]/maxR*100).toFixed(1)}%;background:${rCol[r]}">${rC[r]}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ TOP SETS</h2><div class="bar-chart">${topS.map(([c,n])=>`<div class="bar-row"><span class="bar-label">${c}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxS*100).toFixed(1)}%;background:var(--purple)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ SPRACHEN</h2><div class="bar-chart">${topL.map(([l,n])=>`<div class="bar-row"><span class="bar-label">${l}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/maxL*100).toFixed(1)}%;background:var(--teal)">${n}</div></div></div>`).join('')}</div></div>
  <div class="stats-section"><h2>◈ ZUSTAND</h2><div class="bar-chart">${Object.entries(cC).sort((a,b)=>b[1]-a[1]).map(([cond,n])=>`<div class="bar-row"><span class="bar-label">${cl(cond)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n/total*100).toFixed(1)}%;background:var(--green)">${n} (${(n/total*100).toFixed(0)}%)</div></div></div>`).join('')}</div></div>`;
}

