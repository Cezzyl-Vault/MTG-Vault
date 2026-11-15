// ══════════════════════════════════════════════════════════
//  KARTENSUCHE IM DECK  ·  Filter + Scryfall-Suche, Treffer ins Deck legen
// ══════════════════════════════════════════════════════════
//
//  „🔍 Suchen" im Deck öffnet dieses Fenster:
//    - Filter: Kartentext, Typ, Manawert von/bis, Höchstpreis,
//      Farbidentität (vorbelegt mit der des Commanders)
//    - Online: Scryfall /cards/search, immer Commander-legal, sortiert nach
//      Beliebtheit (EDHREC-Rang). Die Druckungs-Filter im Suchtext sorgen
//      dafür, dass Scryfall pro Karte eine legal spielbare Druckung liefert
//      (siehe CLAUDE.md: kein Goldrand, keine Sammler-/Fun-Sets usw.)
//    - „Nur aus meiner Sammlung": dieselben Filter lokal auf allCards
//    - Optionales Feld für eigene Scryfall-Syntax (nur online)
//    - Treffer: Bild antippen = groß, „＋" legt die Karte in die gewählte
//      Kategorie (Standard: Maybeboard). Karten im Deck sind markiert.

const DS_TARGET_KEY='mtgvault_ds_target';
// Hält Scryfall bei der automatischen Druckungswahl auf legal spielbaren Karten
const DS_PRINT_FILTER='game:paper -border:gold -border:silver -is:oversized -st:memorabilia -st:funny -st:token';
const DS_COLORS=['W','U','B','R','G'];

let ds={results:[],nextPage:null,loading:false,colors:new Set(),local:false};

(function injectDeckSearchModal(){
  if(document.getElementById('deckSearchModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="deckSearchModal">
  <div class="modal ds-modal">
    <div class="modal-header">
      <span class="pt-title" id="deckSearchTitle">KARTEN SUCHEN</span>
      <button class="modal-close" onclick="closeModal('deckSearchModal')">✕</button>
    </div>
    <div class="modal-detail">
      <div class="ds-form">
        <div class="ds-row">
          <input id="dsText" type="text" placeholder="Kartentext enthält… (z.B. draw a card)" autocomplete="off">
        </div>
        <div class="ds-row ds-row-wrap">
          <select id="dsType">
            <option value="">Alle Typen</option>
            <option value="creature">Kreatur</option>
            <option value="instant">Spontanzauber</option>
            <option value="sorcery">Hexerei</option>
            <option value="artifact">Artefakt</option>
            <option value="enchantment">Verzauberung</option>
            <option value="planeswalker">Planeswalker</option>
            <option value="land">Land</option>
            <option value="battle">Battle</option>
          </select>
          <label class="ds-inline">MV <input id="dsMvMin" type="number" min="0" max="20" placeholder="von"> – <input id="dsMvMax" type="number" min="0" max="20" placeholder="bis"></label>
          <label class="ds-inline">max. <input id="dsPrice" type="text" inputmode="decimal" placeholder="€"> €</label>
        </div>
        <div class="ds-row ds-row-wrap">
          <span class="ds-label">Farbidentität</span>
          <div class="ds-colors" id="dsColors"></div>
        </div>
        <div class="ds-row">
          <input id="dsRaw" type="text" placeholder="Eigene Scryfall-Suche (optional), z.B. kw:flying pow>=4" autocomplete="off">
        </div>
        <div class="ds-row ds-row-wrap">
          <label class="ds-check"><input type="checkbox" id="dsLocal"> nur Karten aus meiner Sammlung</label>
          <label class="ds-inline">＋ nach <select id="dsTarget"></select></label>
          <button class="btn btn-primary ds-go" onclick="runDeckSearch()">🔍 Suchen</button>
        </div>
      </div>
      <div class="ds-status" id="dsStatus"></div>
      <div class="ds-grid" id="dsGrid"></div>
      <div class="ds-more" id="dsMore"></div>
    </div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
  ['dsText','dsRaw','dsPrice','dsMvMin','dsMvMax'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runDeckSearch();}});
  });
  document.getElementById('dsTarget').addEventListener('change',e=>{
    try{localStorage.setItem(DS_TARGET_KEY,e.target.value);}catch(_){}
  });
})();

// Farbidentität des/der Commander im aktuellen Deck
function dsCommanderColors(){
  const set=new Set();
  let found=false;
  for(const dc of currentDeckCards){
    if((dc.category||'').trim().toLowerCase()!=='commander')continue;
    found=true;
    for(const c of(resolveDeckCard(dc).color_identity||[]))set.add(c);
  }
  return found?set:new Set(DS_COLORS);
}

function dsRenderColors(){
  const box=document.getElementById('dsColors');
  box.innerHTML=DS_COLORS.map(c=>
    // Eigene Klasse ds-pill statt mana-pill: applyFilters (Sammlung) liest alle .mana-pill.active
    `<button type="button" class="ds-pill mana-${c.toLowerCase()}${ds.colors.has(c)?' active':''}" onclick="dsToggleColor('${c}')">${c}</button>`
  ).join('')+`<span class="ds-colors-hint">${ds.colors.size?'':'nur farblos'}</span>`;
}
function dsToggleColor(c){
  if(ds.colors.has(c))ds.colors.delete(c);else ds.colors.add(c);
  dsRenderColors();
}

// Kategorien für „＋ nach": Deck-Kategorien, Ohne Kategorie, Maybeboard
function dsRenderTargets(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  const cats={};
  currentDeckCards.forEach(dc=>{const c=(dc.category||'').trim();if(c)cats[c]=true;});
  const order=orderedDeckCategories(deck,cats).filter(c=>c.toLowerCase()!=='commander');
  let saved=MAYBEBOARD;
  try{saved=localStorage.getItem(DS_TARGET_KEY)||MAYBEBOARD;}catch(_){}
  const opts=[[MAYBEBOARD,'💭 Maybeboard'],['','Ohne Kategorie'],...order.map(c=>[c,c])];
  if(!opts.some(o=>o[0]===saved))saved=MAYBEBOARD;
  document.getElementById('dsTarget').innerHTML=opts.map(([v,l])=>
    `<option value="${esc(v)}"${v===saved?' selected':''}>${esc(l)}</option>`).join('');
}

function openDeckSearch(){
  if(!activeDeckId)return;
  const deck=allDecks.find(d=>d.id===activeDeckId);
  document.getElementById('deckSearchTitle').textContent='KARTEN SUCHEN · '+((deck&&deck.name)||'Deck').toUpperCase();
  // Anderes Deck als beim letzten Mal → alte Treffer weg
  if(ds.deckId!==activeDeckId){
    ds.results=[];ds.nextPage=null;ds.deckId=activeDeckId;
    document.getElementById('dsGrid').innerHTML='';document.getElementById('dsMore').innerHTML='';
  }
  ds.colors=dsCommanderColors();
  dsRenderColors();
  dsRenderTargets();
  document.getElementById('deckSearchModal').classList.add('open');
  if(!ds.results.length){
    document.getElementById('dsStatus').textContent='Filter setzen und „Suchen" tippen. Farbidentität ist mit der deines Commanders vorbelegt.';
  }else{
    dsRenderResults();   // Namen im Deck neu markieren
  }
  setTimeout(()=>document.getElementById('dsText').focus(),50);
}

// ── Filter einsammeln ──
function dsFilters(){
  const v=id=>document.getElementById(id).value.trim();
  const num=s=>{if(s==='')return null;const n=parseFloat(s.replace(',','.'));return isNaN(n)?null:n;};
  return{
    text:v('dsText'),type:v('dsType'),
    mvMin:num(v('dsMvMin')),mvMax:num(v('dsMvMax')),price:num(v('dsPrice')),
    raw:v('dsRaw'),colors:new Set(ds.colors),local:document.getElementById('dsLocal').checked
  };
}

// Scryfall-Suchtext aus den Filtern
function dsBuildQuery(f){
  const q=['f:commander'];
  q.push(f.colors.size?'id<='+DS_COLORS.filter(c=>f.colors.has(c)).join('').toLowerCase():'id:c');
  if(f.text)q.push('o:"'+f.text.replace(/"/g,'')+'"');
  if(f.type)q.push('t:'+f.type);
  if(f.mvMin!=null)q.push('mv>='+f.mvMin);
  if(f.mvMax!=null)q.push('mv<='+f.mvMax);
  if(f.price!=null)q.push('eur<='+f.price);
  if(f.raw)q.push('('+f.raw+')');
  q.push(DS_PRINT_FILTER);
  return q.join(' ');
}

async function runDeckSearch(){
  const f=dsFilters();
  ds.local=f.local;
  ds.results=[];ds.nextPage=null;
  document.getElementById('dsGrid').innerHTML='';
  document.getElementById('dsMore').innerHTML='';
  if(f.local){dsSearchLocal(f);return;}
  const url='https://api.scryfall.com/cards/search?order=edhrec&q='+encodeURIComponent(dsBuildQuery(f));
  await dsFetchPage(url);
}

async function dsFetchPage(url){
  if(ds.loading)return;
  ds.loading=true;
  const status=document.getElementById('dsStatus');
  status.textContent='Suche bei Scryfall…';
  try{
    const res=await fetch(url);
    const data=await res.json();
    if(!res.ok){
      // 404 = keine Treffer; 400 = Suchtext ungültig (z.B. eigene Syntax)
      status.textContent=res.status===404?'Keine Karten gefunden.':'Suche nicht möglich: '+(data.details||('HTTP '+res.status));
      return;
    }
    ds.results.push(...(data.data||[]).map(dsFromScryfall));
    ds.nextPage=data.has_more?data.next_page:null;
    status.textContent=data.total_cards+' Karte'+(data.total_cards===1?'':'n')+' gefunden · sortiert nach Beliebtheit';
    dsRenderResults();
  }catch(e){
    status.textContent='Scryfall nicht erreichbar.';
  }finally{ds.loading=false;}
}

function dsLoadMore(){if(ds.nextPage)dsFetchPage(ds.nextPage);}

// ── Treffer vereinheitlichen ──
function dsImg(c){
  return(c.image_uris&&c.image_uris.normal)||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.normal)||'';
}
function dsFromScryfall(c){
  const eur=c.prices&&(c.prices.eur||c.prices.eur_foil);
  return{name:c.name,img:dsImg(c),price:eur?parseFloat(eur):null,fields:deckCardFieldsFromScryfall(c)};
}

// ── Lokale Suche in der eigenen Sammlung ──
function dsSearchLocal(f){
  const status=document.getElementById('dsStatus');
  const byName=new Map();
  for(const c of allCards){
    if(c.legal_commander==='not_legal'||c.legal_commander==='banned')continue;
    if(f.text&&!(c.oracle_text||'').toLowerCase().includes(f.text.toLowerCase()))continue;
    if(f.type&&!(c.type_line||'').toLowerCase().includes(f.type))continue;
    if(f.mvMin!=null&&!(c.mana_value!=null&&c.mana_value>=f.mvMin))continue;
    if(f.mvMax!=null&&!(c.mana_value!=null&&c.mana_value<=f.mvMax))continue;
    const ci=Array.isArray(c.color_identity)?c.color_identity:null;
    if(!ci||ci.some(x=>!f.colors.has(x)))continue;
    const price=(typeof livePriceOf==='function'?livePriceOf(c):null);
    if(f.price!=null&&!(price!=null&&price<=f.price))continue;
    const k=c.name.toLowerCase();
    if(!byName.has(k))byName.set(k,{name:c.name,img:iUrl(c),price,fields:deckCardFieldsFromCard(c)});
  }
  ds.results=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const hints=[];
  if(f.raw)hints.push('eigene Scryfall-Suche gilt nur online');
  if(allCards.length&&!allCards.some(c=>c.oracle_text))hints.push('Kartentext fehlt noch – „Jetzt anreichern" in der Sammlung');
  status.textContent=ds.results.length+' Karte'+(ds.results.length===1?'':'n')+' aus deiner Sammlung'+(hints.length?' · '+hints.join(' · '):'');
  dsRenderResults();
}

// ── Anzeige ──
function dsDeckNames(){
  const main=new Set(),maybe=new Set();
  for(const dc of currentDeckCards){
    const n=(dc.card_name||resolveDeckCard(dc).name||'').toLowerCase();
    (isMaybeCat(dc.category)?maybe:main).add(n);
  }
  return{main,maybe};
}

function dsRenderResults(){
  const grid=document.getElementById('dsGrid');
  const{main,maybe}=dsDeckNames();
  const owned=typeof buildOwnedNameMap==='function'?buildOwnedNameMap():new Map();
  grid.innerHTML=ds.results.map((r,i)=>{
    const k=r.name.toLowerCase();
    const badge=main.has(k)?'<span class="ds-badge ds-in">im Deck</span>'
      :maybe.has(k)?'<span class="ds-badge ds-maybe">Maybe</span>'
      :(owned.get(k)||0)>0?'<span class="ds-badge ds-own">✓ Sammlung</span>':'';
    return`<div class="ds-tile${main.has(k)?' ds-tile-in':''}">
      <div class="ds-img" onclick="ptZoom('${escJs(r.img||'')}')" title="${esc(r.name)}">
        ${r.img?`<img src="${r.img}" alt="${esc(r.name)}" loading="lazy">`:`<div class="pt-noimg">${esc(r.name)}</div>`}
        ${badge}
      </div>
      <div class="ds-foot">
        <span class="ds-price">${r.price!=null?r.price.toFixed(2).replace('.',',')+' €':'–'}</span>
        <button class="ds-add" onclick="dsAdd(${i},this)" title="In die gewählte Kategorie legen">＋</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('dsMore').innerHTML=ds.nextPage
    ?'<button class="btn" onclick="dsLoadMore()">Weitere Karten laden</button>':'';
}

async function dsAdd(i,btn){
  const r=ds.results[i];
  if(!r||!activeDeckId)return;
  const cat=document.getElementById('dsTarget').value||null;
  btn.disabled=true;
  const ok=await addToDeckDenorm(activeDeckId,r.fields,cat,1);
  btn.disabled=false;
  if(!ok)return;
  currentDeckCards=await loadDeckCards(activeDeckId);
  renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
  dsRenderResults();
  toastSuccess(r.name+' → '+(cat?(isMaybeCat(cat)?'Maybeboard':cat):'Ohne Kategorie'));
}
