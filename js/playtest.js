// ══════════════════════════════════════════════════════════
//  PROBEHAND  ·  Starthand ziehen, Mulligan, Karten nachziehen
// ══════════════════════════════════════════════════════════
//
//  „🎲 Probehand" im Deck öffnet dieses Fenster:
//    - Bibliothek = Deck ohne Commander und ohne Maybeboard/Sideboard
//      (mainDeckCards in decks.js), jede Karte so oft wie ihre Anzahl
//    - Mischen (Fisher-Yates), 7 Karten auf die Hand
//    - Mulligan nach London-Regel: neu mischen, wieder 7 ziehen, danach
//      N Karten unter die Bibliothek legen. Im Commander ist der erste
//      Mulligan frei (N = Mulligans − 1)
//    - „Karte ziehen" = nächster Zug (im Commander zieht jeder ab Zug 1)
//    - Statistik: Länder auf der Hand und Wahrscheinlichkeiten für die
//      Starthand (hypergeometrische Verteilung)
//  Es wird nichts gespeichert — alles nur im Browser.

const PT_HAND_SIZE=7;
let pt=null;   // {cards, commanders, library, hand, mulligans, toBottom, turn, lands, total}

// ── Mathe ──
// Binomialkoeffizient als Kommazahl (reicht für Decks bis ~250 Karten genau genug)
function ptChoose(n,k){
  if(k<0||k>n)return 0;
  k=Math.min(k,n-k);
  let r=1;
  for(let i=1;i<=k;i++)r=r*(n-k+i)/i;
  return r;
}
// Wahrscheinlichkeit, genau k Treffer zu ziehen: N Karten, K Treffer, n gezogen
function ptHyper(N,K,n,k){
  const all=ptChoose(N,n);
  return all?ptChoose(K,k)*ptChoose(N-K,n-k)/all:0;
}
// Wahrscheinlichkeit für min..max Treffer
function ptHyperRange(N,K,n,min,max){
  let p=0;
  for(let k=min;k<=max;k++)p+=ptHyper(N,K,n,k);
  return p;
}

function ptShuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

// ── Bibliothek aus dem Deck bauen ──
function ptBuildCards(dcs){
  const idx=buildOwnedIndex();
  const cards=[],commanders=[];
  let uid=0;
  for(const dc of mainDeckCards(dcs)){
    const c=resolveDeckCard(dc,idx);
    const entry={name:c.name,img:iUrl(c),isLand:mainType(c.type_line)==='Land'};
    if((dc.category||'').trim().toLowerCase()==='commander'){commanders.push(entry);continue;}
    const qty=Math.max(1,parseInt(dc.quantity,10)||1);
    for(let i=0;i<qty;i++)cards.push({...entry,uid:++uid});
  }
  return{cards,commanders};
}

// ── Fenster einmalig ins DOM hängen ──
(function injectPlaytestModal(){
  if(document.getElementById('playtestModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="playtestModal">
  <div class="modal pt-modal">
    <div class="modal-header">
      <span class="pt-title" id="playtestTitle">PROBEHAND</span>
      <button class="modal-close" onclick="closeModal('playtestModal')">✕</button>
    </div>
    <div class="modal-detail" id="playtestBody"></div>
  </div>
</div>
<div class="pt-zoom" id="ptZoom" onclick="this.classList.remove('open')"><img alt=""></div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

// ── Öffnen ──
function openPlaytest(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  const{cards,commanders}=ptBuildCards(currentDeckCards);
  document.getElementById('playtestTitle').textContent='PROBEHAND · '+((deck&&deck.name)||'Deck').toUpperCase();
  if(cards.length<PT_HAND_SIZE){
    document.getElementById('playtestBody').innerHTML=
      `<div class="dxm-empty">Für eine Probehand braucht das Deck mindestens ${PT_HAND_SIZE} Karten (ohne Commander und Maybeboard).</div>`;
    document.getElementById('playtestModal').classList.add('open');
    return;
  }
  pt={cards,commanders,library:[],hand:[],mulligans:0,toBottom:0,turn:0,
      total:cards.length,lands:cards.filter(c=>c.isLand).length};
  ptNewHand(false);
  document.getElementById('playtestModal').classList.add('open');
}

// Neu mischen und 7 ziehen. mulligan=true → Mulligan-Zähler hoch
function ptNewHand(mulligan){
  if(!pt)return;
  pt.mulligans=mulligan?pt.mulligans+1:0;
  // Erster Mulligan ist im Commander frei, danach je eine Karte mehr unter die Bibliothek
  pt.toBottom=Math.max(0,pt.mulligans-1);
  if(pt.toBottom>=PT_HAND_SIZE){pt.mulligans--;pt.toBottom=Math.max(0,pt.mulligans-1);toastInfo('Weiter geht der Mulligan nicht.');}
  pt.turn=0;
  pt.library=ptShuffle(pt.cards.slice());
  pt.hand=pt.library.splice(0,PT_HAND_SIZE);
  ptRender();
}

function ptDraw(){
  if(!pt||pt.toBottom>0)return;
  if(!pt.library.length){toastInfo('Die Bibliothek ist leer.');return;}
  pt.turn++;
  const c=pt.library.shift();
  c.drawnTurn=pt.turn;
  pt.hand.push(c);
  ptRender();
  // Neue Karte sichtbar machen (am Handy wird quer gescrollt)
  const row=document.getElementById('ptHand');
  if(row)row.scrollLeft=row.scrollWidth;
}

// Karte antippen: beim Mulligan unter die Bibliothek legen, sonst groß zeigen
function ptCardClick(uid){
  if(!pt)return;
  const i=pt.hand.findIndex(c=>c.uid===uid);
  if(i<0)return;
  if(pt.toBottom>0){
    const[c]=pt.hand.splice(i,1);
    pt.library.push(c);
    pt.toBottom--;
    ptRender();
    return;
  }
  ptZoom(pt.hand[i].img);
}

function ptZoom(img){
  if(!img)return;
  const z=document.getElementById('ptZoom');
  z.querySelector('img').src=img.replace('/normal/','/large/');
  z.classList.add('open');
}

function ptCardHtml(c,clickJs){
  const isNew=c.drawnTurn&&c.drawnTurn===pt.turn;
  return`<div class="pt-card${isNew?' pt-new':''}${pt.toBottom>0?' pt-pick':''}" onclick="${clickJs}" title="${esc(c.name)}">
    ${c.img?`<img src="${c.img}" alt="${esc(c.name)}" loading="lazy">`:`<div class="pt-noimg">${esc(c.name)}</div>`}
    ${c.drawnTurn?`<span class="pt-turn">Z${c.drawnTurn}</span>`:''}
  </div>`;
}

function ptPct(p){return Math.round(p*100)+' %';}

function ptRender(){
  const body=document.getElementById('playtestBody');
  if(!body||!pt)return;
  const N=pt.total,K=pt.lands;
  const handLands=pt.hand.filter(c=>c.isLand).length;
  const startSize=PT_HAND_SIZE;

  // Kennzahlen für die Starthand (unabhängig von der aktuellen Hand)
  const pGood=ptHyperRange(N,K,startSize,2,4);
  const pFew=ptHyperRange(N,K,startSize,0,1);
  const pMany=ptHyperRange(N,K,startSize,5,startSize);
  const avg=startSize*K/N;
  // Bis Zug 3 drei Länder gesehen: 7 + 3 gezogene Karten (Commander: jeder zieht ab Zug 1)
  const p3by3=ptHyperRange(N,K,Math.min(N,startSize+3),3,Math.min(K,startSize+3));

  const status=pt.toBottom>0
    ?`<div class="pt-banner">Mulligan ${pt.mulligans}: Tippe ${pt.toBottom===1?'eine Karte':pt.toBottom+' Karten'} an, die unter die Bibliothek ${pt.toBottom===1?'kommt':'kommen'}.</div>`
    :'';
  const mullInfo=pt.mulligans
    ?`Mulligan ${pt.mulligans}${pt.mulligans===1?' (frei)':''}`
    :'Starthand';

  body.innerHTML=`
    ${pt.commanders.length?`<div class="pt-cmd">${pt.commanders.map(c=>`<div class="pt-cmd-card" onclick="ptZoom('${escJs(c.img||'')}')" title="${esc(c.name)}">${c.img?`<img src="${c.img}" alt="${esc(c.name)}">`:esc(c.name)}</div>`).join('')}<span class="pt-cmd-label">Commander</span></div>`:''}
    <div class="pt-info">
      <span><strong>${pt.turn?'Zug '+pt.turn:mullInfo}</strong></span>
      <span>Hand: <strong>${pt.hand.length}</strong></span>
      <span>Länder auf der Hand: <strong>${handLands}</strong></span>
      <span>Bibliothek: <strong>${pt.library.length}</strong></span>
    </div>
    ${status}
    <div class="pt-hand" id="ptHand">${pt.hand.map(c=>ptCardHtml(c,`ptCardClick(${c.uid})`)).join('')}</div>
    <div class="pt-actions">
      <button class="btn btn-primary" onclick="ptDraw()" ${pt.toBottom>0||!pt.library.length?'disabled':''}>＋ Karte ziehen</button>
      <button class="btn" onclick="ptNewHand(true)" ${pt.turn>0?'disabled':''} title="Neu mischen und 7 ziehen, danach Karten unter die Bibliothek legen">↻ Mulligan</button>
      <button class="btn" onclick="ptNewHand(false)">🔀 Neu mischen</button>
    </div>
    <div class="pt-stats">
      <div class="pt-stats-title">STARTHAND-STATISTIK · ${K} Länder in ${N} Karten</div>
      <div class="pt-stat-row"><span>2–4 Länder auf der Starthand</span><strong>${ptPct(pGood)}</strong></div>
      <div class="pt-stat-row"><span>0–1 Länder (zu wenig)</span><strong>${ptPct(pFew)}</strong></div>
      <div class="pt-stat-row"><span>5 oder mehr Länder (zu viel)</span><strong>${ptPct(pMany)}</strong></div>
      <div class="pt-stat-row"><span>Ø Länder in 7 Karten</span><strong>${avg.toFixed(1).replace('.',',')}</strong></div>
      <div class="pt-stat-row"><span>Bis Zug 3 mindestens 3 Länder gesehen</span><strong>${ptPct(p3by3)}</strong></div>
    </div>`;
}
