// ══════════════════════════════════════════════════════════
//  EDHREC-VORSCHLÄGE  ·  Beliebte Karten für den Commander des Decks
// ══════════════════════════════════════════════════════════
//
//  Quelle: https://json.edhrec.com/pages/commanders/<slug>.json (CORS offen).
//  Slug = Commander-Name klein, ohne Akzente/Apostrophe, alles andere „-",
//  bei doppelseitigen Karten nur die Vorderseite. Bei zwei Commandern
//  (Partner) zuerst das Paar, sonst der erste allein.
//
//  Angezeigt werden die Listen von EDHREC (Hohe Synergie, Top-Karten,
//  Kreaturen …). Karten, die schon im Deck sind, werden ausgeblendet,
//  besessene markiert. „＋" legt die Karte nach Kartentyp ins Deck, „💭" ins
//  Maybeboard – immer in einer legal spielbaren Druckung (isPlayablePrint).
//  Antworten werden 24 Stunden im localStorage gemerkt.

const EDH_CACHE_KEY='mtgvault_edhrec_v1';
const EDH_MAX_AGE_MS=24*60*60*1000;
const EDH_CACHE_MAX=12;
const EDH_HEADERS={
  'High Synergy Cards':'Hohe Synergie','Top Cards':'Top-Karten','New Cards':'Neue Karten',
  'Game Changers':'Game Changer','Creatures':'Kreaturen','Instants':'Spontanzauber',
  'Sorceries':'Hexereien','Utility Artifacts':'Artefakte','Mana Artifacts':'Mana-Artefakte',
  'Enchantments':'Verzauberungen','Planeswalkers':'Planeswalker','Battles':'Schlachten',
  'Utility Lands':'Besondere Länder','Lands':'Länder'
};

let edh={deckId:null,slug:null,lists:[],section:0,ownedOnly:false,busy:new Set()};

// ── Slug ──
function edhSlug(name){
  return String(name||'').split(' // ')[0]
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().replace(/['’]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function edhCommanderNames(){
  const names=[];
  (currentDeckCards||[]).forEach(dc=>{
    if(!/^commander$/i.test((dc.category||'').trim()))return;
    const n=dc.card_name||(resolveDeckCard(dc)||{}).name;
    if(n&&!names.includes(n))names.push(n);
  });
  return names;
}

// ── Cache ──
function edhCacheAll(){
  try{return JSON.parse(localStorage.getItem(EDH_CACHE_KEY)||'{}')||{};}catch(e){return{};}
}
function edhCacheGet(slug){
  const e=edhCacheAll()[slug];
  return e&&Date.now()-e.t<EDH_MAX_AGE_MS?e:null;
}
function edhCachePut(slug,lists){
  const all=edhCacheAll();
  all[slug]={t:Date.now(),lists};
  const keys=Object.keys(all).sort((a,b)=>all[b].t-all[a].t);
  keys.slice(EDH_CACHE_MAX).forEach(k=>delete all[k]);
  try{localStorage.setItem(EDH_CACHE_KEY,JSON.stringify(all));}
  catch(e){try{localStorage.removeItem(EDH_CACHE_KEY);}catch(_){}}
}

// Nur die Felder, die wir brauchen (die Antwort ist sonst > 100 KB)
function edhReduce(json){
  const lists=((json&&json.container&&json.container.json_dict&&json.container.json_dict.cardlists)||[])
    .map(l=>({
      header:l.header||'',
      cards:(l.cardviews||[]).map(v=>({id:v.id,name:v.name,syn:v.synergy||0,n:v.num_decks||0,p:v.potential_decks||0}))
    }))
    .filter(l=>l.cards.length);
  return lists;
}

async function edhFetch(slug){
  const cached=edhCacheGet(slug);
  if(cached)return cached.lists;
  const res=await fetch('https://json.edhrec.com/pages/commanders/'+slug+'.json');
  if(!res.ok)return null;           // unbekannter Commander → 403
  const lists=edhReduce(await res.json());
  if(lists.length)edhCachePut(slug,lists);
  return lists;
}

// ── Fenster ──
(function injectEdhrecModal(){
  if(document.getElementById('edhrecModal'))return;
  const w=document.createElement('div');
  w.innerHTML=`
<div class="modal-overlay" id="edhrecModal">
  <div class="modal edh-modal">
    <div class="modal-header">
      <span class="pt-title" id="edhrecTitle">VORSCHLÄGE</span>
      <button class="modal-close" onclick="closeModal('edhrecModal')">✕</button>
    </div>
    <div class="modal-detail" id="edhrecBody"></div>
  </div>
</div>`;
  while(w.firstElementChild)document.body.appendChild(w.firstElementChild);
})();

async function openEdhrec(){
  const deck=allDecks.find(d=>d.id===activeDeckId);
  const body=document.getElementById('edhrecBody');
  document.getElementById('edhrecTitle').textContent='VORSCHLÄGE · '+((deck&&deck.name)||'Deck').toUpperCase();
  document.getElementById('edhrecModal').classList.add('open');
  const names=edhCommanderNames();
  if(!names.length){
    body.innerHTML=`<div class="dxm-empty">Für Vorschläge braucht das Deck einen Commander –
      lege ihn in die Kategorie <b>Commander</b>.</div>`;
    return;
  }
  // Schon geladen für dasselbe Deck → nur neu zeichnen (Auswahl bleibt)
  if(edh.deckId===activeDeckId&&edh.lists.length&&edh.names===names.join('|')){renderEdhrec();return;}
  body.innerHTML='<div class="dxm-empty">Lade Vorschläge von EDHREC…</div>';
  const slugs=names.length>1
    ?[edhSlug(names[0])+'-'+edhSlug(names[1]),edhSlug(names[1])+'-'+edhSlug(names[0]),edhSlug(names[0])]
    :[edhSlug(names[0])];
  let lists=null,slug=null;
  try{
    for(const s of slugs){
      lists=await edhFetch(s);
      if(lists&&lists.length){slug=s;break;}
    }
  }catch(e){
    body.innerHTML=`<div class="dxm-empty">EDHREC ist gerade nicht erreichbar. Bitte später noch einmal versuchen.</div>`;
    return;
  }
  if(!slug){
    body.innerHTML=`<div class="dxm-empty">Für „${esc(names.join(' + '))}" hat EDHREC keine Daten.<br>
      <a href="https://edhrec.com/commanders/${esc(slugs[0])}" target="_blank" rel="noopener">Auf EDHREC suchen ↗</a></div>`;
    return;
  }
  const preferred=['High Synergy Cards','Top Cards'];
  const start=lists.findIndex(l=>preferred.includes(l.header));
  edh={deckId:activeDeckId,names:names.join('|'),slug,lists,section:start>=0?start:0,ownedOnly:edh.ownedOnly,busy:new Set()};
  renderEdhrec();
}

function edhSetSection(i){edh.section=i;renderEdhrec();document.getElementById('edhrecBody').scrollTop=0;}
function edhToggleOwned(cb){edh.ownedOnly=cb.checked;renderEdhrec();}

// Namen im Deck (auch Vorderseite doppelseitiger Karten), klein geschrieben
function edhDeckNameSet(){
  const s=new Set();
  (currentDeckCards||[]).forEach(dc=>{
    const n=(dc.card_name||(resolveDeckCard(dc)||{}).name||'').toLowerCase().trim();
    if(!n)return;
    s.add(n);s.add(n.split(' // ')[0]);
  });
  return s;
}

function edhPct(c){return c.p?Math.round(c.n/c.p*100):0;}

function renderEdhrec(){
  const body=document.getElementById('edhrecBody');
  if(!edh.lists.length)return;
  const inDeck=edhDeckNameSet();
  const owned=buildOwnedNameMap();
  const list=edh.lists[edh.section]||edh.lists[0];
  let hidden=0;
  const cards=list.cards.filter(c=>{
    const k=c.name.toLowerCase();
    if(inDeck.has(k)||inDeck.has(k.split(' // ')[0])){hidden++;return false;}
    if(edh.ownedOnly&&!(owned.get(k)>0))return false;
    return true;
  });
  body.innerHTML=`
    <div class="edh-bar">
      <div class="edh-pills">${edh.lists.map((l,i)=>
        `<button class="edh-pill${i===edh.section?' active':''}" onclick="edhSetSection(${i})">${esc(EDH_HEADERS[l.header]||l.header)}</button>`).join('')}</div>
      <div class="edh-opts">
        <label><input type="checkbox" ${edh.ownedOnly?'checked':''} onchange="edhToggleOwned(this)"> nur aus meiner Sammlung</label>
        <a href="https://edhrec.com/commanders/${esc(edh.slug)}" target="_blank" rel="noopener">Auf EDHREC ↗</a>
      </div>
      <div class="edh-note">${cards.length} Vorschläge${hidden?` · ${hidden} schon im Deck ausgeblendet`:''} ·
        Prozent = Anteil der Decks mit diesem Commander, die die Karte spielen</div>
    </div>
    ${cards.length?`<div class="edh-grid">${cards.map(c=>{
      const img=iUrl({scryfall_id:c.id});
      const have=owned.get(c.name.toLowerCase())>0;
      const busy=edh.busy.has(c.id);
      const syn=Math.round(c.syn*100);
      return`<div class="edh-card">
        <div class="edh-img" onclick="ptZoom('${img}')" title="${esc(c.name)}">
          <img src="${img}" alt="${esc(c.name)}" loading="lazy">
          ${have?'<span class="edh-owned">✓ Sammlung</span>':''}
        </div>
        <div class="edh-name" title="${esc(c.name)}">${esc(c.name)}</div>
        <div class="edh-stats"><b>${edhPct(c)} %</b> der Decks${syn?` · <span class="${syn>0?'edh-syn-pos':'edh-syn-neg'}">${syn>0?'+':''}${syn} % Synergie</span>`:''}</div>
        <div class="edh-act">
          <button class="back-btn" ${busy?'disabled':''} onclick="edhAdd('${c.id}',false,this)" title="Ins Deck (Kategorie nach Kartentyp)">＋ Deck</button>
          <button class="back-btn" ${busy?'disabled':''} onclick="edhAdd('${c.id}',true,this)" title="Ins Maybeboard">💭 Maybe</button>
        </div>
      </div>`;}).join('')}</div>`
    :`<div class="dxm-empty">${edh.ownedOnly?'Keine Karte dieser Liste ist in deiner Sammlung (oder sie sind schon im Deck).':'Alle Karten dieser Liste sind schon im Deck. 🎉'}</div>`}`;
}

// Kategorie nach Kartentyp (Länder zuerst – „Artifact Land" ist ein Land)
function edhCategoryFor(typeLine){
  const t=String(typeLine||'').split(' // ')[0];
  if(/\bLand\b/.test(t))return'Lands';
  if(/\bCreature\b/.test(t))return'Creatures';
  if(/\bPlaneswalker\b/.test(t))return'Planeswalkers';
  if(/\bInstant\b/.test(t))return'Instants';
  if(/\bSorcery\b/.test(t))return'Sorceries';
  if(/\bArtifact\b/.test(t))return'Artifacts';
  if(/\bEnchantment\b/.test(t))return'Enchantments';
  return'Sonstige';
}

// Scryfall-Karte in legal spielbarer Druckung (CLAUDE.md: isPlayablePrint)
async function edhPlayableCard(id){
  const res=await fetch('https://api.scryfall.com/cards/'+id);
  if(!res.ok)throw new Error('Scryfall '+res.status);
  const c=await res.json();
  if(typeof isPlayablePrint!=='function'||isPlayablePrint(c))return c;
  let url=c.prints_search_uri;
  while(url){
    const r=await fetch(url);
    if(!r.ok)break;
    const page=await r.json();
    const hit=(page.data||[]).find(isPlayablePrint);
    if(hit)return hit;
    url=page.has_more?page.next_page:null;
  }
  return c;   // keine spielbare Druckung gefunden – trotzdem die Karte nehmen
}

async function edhAdd(id,toMaybe,btn){
  if(!activeDeckId||edh.busy.has(id))return;
  edh.busy.add(id);
  if(btn)btn.disabled=true;
  try{
    const c=await edhPlayableCard(id);
    const cat=toMaybe?MAYBEBOARD:edhCategoryFor(c.type_line||(c.card_faces&&c.card_faces[0]&&c.card_faces[0].type_line));
    const ok=await addToDeckDenorm(activeDeckId,deckCardFieldsFromScryfall(c),cat,1);
    if(!ok)return;
    currentDeckCards=await loadDeckCards(activeDeckId);
    renderDeckDetail(allDecks.find(d=>d.id===activeDeckId));
    toastSuccess(c.name+' → '+(toMaybe?'Maybeboard':cat));
  }catch(e){
    toastError('Karte konnte nicht hinzugefügt werden: '+(e.message||e));
  }finally{
    edh.busy.delete(id);
    if(document.getElementById('edhrecModal').classList.contains('open'))renderEdhrec();
  }
}
