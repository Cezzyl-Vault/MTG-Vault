// ══════════════════════════════════════════════════════════
//  KARTE PER SUCHE HINZUFÜGEN  ·  Manueller Import über Scryfall
// ══════════════════════════════════════════════════════════
//
//  Ergänzt den CSV-Import um einen zweiten, eigenständigen Weg,
//  Karten in die Sammlung zu bekommen — ganz ohne ManaBox:
//
//   1. Kartenname tippen  → Vorschläge via Scryfall-Autocomplete
//   2. Name wählen        → alle Druckungen (Sets) werden gelistet
//   3. Druckung wählen    → Ausführung (Foil/Normal), Zustand,
//                           Sprache, Menge und optional Kaufpreis
//   4. Hinzufügen         → gleiche Karte schon vorhanden? Menge wird
//                           erhöht, sonst neu eingefügt (identische
//                           Duplikat-Logik wie der CSV-Import). Das
//                           Fenster bleibt offen für die nächste Karte.
//
//  Freitext und Sprache: Enter im Suchfeld oder der 🎤-Knopf werten
//  ganze Sätze aus („2 Sol Ring from Commander 2021 foil“) — Name per
//  Scryfall-Fuzzy-Suche, Edition/Nummer grenzen die Druckungen ein,
//  Anzahl und Foil werden übernommen (parseCardPhrase, smartSearch).
//
//  Diese Datei ist absichtlich in sich geschlossen: Sie fügt ihr
//  Modal, ihre Buttons und ihr CSS per JavaScript selbst ein. In der
//  index.html muss daher nur diese eine Datei eingebunden werden.
//
//  Nutzt die bestehenden Bausteine der App:
//   - currentUser, allCards, loadAll(), renderAll(), switchView()
//   - upsertCards()  (schreibt in die DB, behandelt Sync-Status/Fehler)
//   - closeModal(), toastSuccess()/toastError(), setBusy()
//
//  Scryfall fair genutzt: Autocomplete ist entprellt (300 ms) und
//  feuert erst ab 2 Zeichen; pro Karten-Auswahl genau 1 Anfrage.

(function(){
  'use strict';

  // ── Modul-Status ──
  let acsPrintings = [];   // aktuell geladene Druckungen (Scryfall-Objekte)
  let acsSelected  = null;  // gewählte Druckung
  let acsDebounce  = null;  // Timer für die entprellte Suche
  let acsActiveSug = -1;    // Tastatur-Navigation in den Vorschlägen
  let acsPhrase    = null;  // ausgewerteter Freitext/Sprachsatz (parseCardPhrase)
  let acsMatchCount= 0;     // so viele Druckungen oben passen zur genannten Edition
  let acsShowAll   = true;  // alle Druckungen zeigen oder nur die passenden
  let acsAddedCount= 0;     // seit dem Öffnen aufgenommene Karten
  let acsRecog     = null;  // laufende Spracherkennung

  const el = id => document.getElementById(id);

  // ── Kleine Helfer ──
  const cap = s => { s=(s||'').toString(); return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; };

  // Bild-URL einer Karte (auch doppelseitige Karten berücksichtigen)
  function imgSmall(c){ return (c.image_uris&&c.image_uris.small) || (c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.small) || ''; }
  function imgNormal(c){ return (c.image_uris&&c.image_uris.normal) || (c.card_faces&&c.card_faces[0]&&c.card_faces[0].image_uris&&c.card_faces[0].image_uris.normal) || imgSmall(c); }

  // Preis (EUR) als Text, oder „–“
  function eurText(c){
    const p=c.prices||{};
    if(p.eur)      return '€'+p.eur;
    if(p.eur_foil) return '€'+p.eur_foil+' (Foil)';
    return '–';
  }

  // Verfügbare Ausführungen
  function foilAvail(c){ const f=c.finishes||[]; return f.indexOf('foil')!==-1 || f.indexOf('etched')!==-1; }
  function nonfoilAvail(c){ const f=c.finishes||[]; return f.length ? f.indexOf('nonfoil')!==-1 : true; }

  // Farbpunkt nach Seltenheit
  function rarColor(r){
    r=(r||'').toLowerCase();
    return r==='mythic' ? 'var(--mythic)'
         : r==='rare'   ? 'var(--gold)'
         : r==='uncommon'? 'var(--uncommon)'
         : 'var(--text3)';
  }

  // Duplikat-Schlüssel — IDENTISCH zur Logik im CSV-Import, damit sich
  // manuell und per CSV hinzugefügte Karten konsistent zusammenfassen.
  function dupKey(c){
    const n=v=>(v||'').toString().toLowerCase().trim();
    return n(c.set_code)+'|'+n(c.collector_number)+'|'+n(c.foil)+'|'+n(c.language);
  }

  // ══════════════════════════════════════════════════════════
  //  FREITEXT / SPRACHE  ·  „zwei Sol Ring from Commander 2021 foil"
  // ══════════════════════════════════════════════════════════
  //  Gleiche Auswertung für den 🎤-Knopf (Web-Spracherkennung, z.B. Chrome)
  //  und für Text, den die Handy-Tastatur diktiert hat (Enter im Suchfeld).

  const NUM_WORDS={ein:1,eine:1,einen:1,zwei:2,drei:3,vier:4,'fünf':5,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,
    one:1,a:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const SET_SEPARATORS=['from','aus','von','edition','set'];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // Satz → {qty, foil, number, nameText, setText}
  function parseCardPhrase(text){
    let t=' '+(text||'').toLowerCase().replace(/[.,;:!?"„“”']/g,' ').replace(/\s+/g,' ').trim()+' ';
    const out={qty:null,foil:false,number:'',nameText:'',setText:''};
    // Sammlernummer: „number 263", „nummer 263", „#263", „nr 263"
    t=t.replace(/\s(?:number|nummer|nr|no|#)\s*([0-9]+[a-z★]?)\s/,(m,n)=>{out.number=n;return' ';});
    t=t.replace(/\s#([0-9]+[a-z★]?)\s/,(m,n)=>{out.number=n;return' ';});
    // Foil
    t=t.replace(/\s(?:foil|foiled|folie|foils)\s/g,()=>{out.foil=true;return' ';});
    // Anzahl am Anfang: „2", „2x", „2 x", „2 mal", „zwei"
    t=t.replace(/^\s(\d{1,3})\s*(?:x|mal|times)?\s/,(m,n)=>{out.qty=parseInt(n,10);return' ';});
    if(out.qty==null)t=t.replace(/^\s([a-zäöüß]+)\s(?:x\s|mal\s)?/,(m,w)=>{
      if(NUM_WORDS[w]&&!(w==='a'||w==='one')){out.qty=NUM_WORDS[w];return' ';}
      return m;
    });
    // Edition nach dem LETZTEN Trennwort („… from Commander 2021")
    const words=t.trim().split(' ').filter(Boolean);
    let cut=-1;
    for(let i=words.length-2;i>=1;i--){ if(SET_SEPARATORS.includes(words[i])){cut=i;break;} }
    if(cut>0){out.nameText=words.slice(0,cut).join(' ');out.setText=words.slice(cut+1).join(' ');}
    else out.nameText=words.join(' ');
    return out;
  }

  // Ähnlichkeit 0..1 (Levenshtein), um Fuzzy-Treffer beim Wörter-Abschneiden zu prüfen
  function similarity(a,b){
    a=a.toLowerCase();b=b.toLowerCase();
    if(a===b)return 1;
    const m=a.length,n=b.length;if(!m||!n)return 0;
    let prev=Array.from({length:n+1},(_,j)=>j);
    for(let i=1;i<=m;i++){
      const cur=[i];
      for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      prev=cur;
    }
    return 1-prev[n]/Math.max(m,n);
  }

  async function fuzzyCard(q){
    if(!q)return null;
    try{
      const res=await fetch('https://api.scryfall.com/cards/named?fuzzy='+encodeURIComponent(q));
      return res.ok?await res.json():null;
    }catch(e){return null;}
  }

  // Freitext (getippt, diktiert oder gesprochen) → Karte finden, Versionen eingrenzen.
  // alternatives: weitere Erkennungs-Varianten der Spracherkennung.
  async function smartSearch(text,alternatives){
    const candidates=[text].concat(alternatives||[]).filter(Boolean);
    el('acsSuggestions').innerHTML='';
    el('acsDetail').style.display='none';
    acsSelected=null;
    el('acsQty').value=1;
    el('acsPrintings').innerHTML='<div class="acs-msg">Suche „'+escapeHtml(text)+'"…</div>';
    for(const cand of candidates){
      const p=parseCardPhrase(cand);
      // 1. Name direkt (Fuzzy verzeiht Aussprache- und Tippfehler)
      let card=await fuzzyCard(p.nameText);
      // 2. Ohne Trennwort: Wörter am Ende als Edition abschneiden
      if(!card&&!p.setText){
        const words=p.nameText.split(' ');
        for(let k=1;k<=4&&words.length-k>=1;k++){
          await sleep(100);
          const name=words.slice(0,words.length-k).join(' ');
          const hit=await fuzzyCard(name);
          // Streng prüfen: „lightning bolt magic" darf nicht schon als Lightning Bolt
          // durchgehen, sonst fehlt „magic" in der Edition (Magic 2010)
          if(hit&&similarity(hit.name.split(' // ')[0],name)>=0.85){card=hit;p.setText=words.slice(words.length-k).join(' ');p.nameText=name;break;}
        }
      }
      if(card){
        acsPhrase=p;
        el('acsSearch').value=card.name;
        await loadPrintings(card.name);
        return;
      }
      await sleep(100);
    }
    // 3. Nichts sicher erkannt → Vorschläge zeigen
    acsPhrase=null;
    el('acsPrintings').innerHTML='<div class="acs-msg">Nicht sicher erkannt – bitte einen Vorschlag auswählen oder genauer eingeben.</div>';
    fetchSuggestions(parseCardPhrase(text).nameText||text);
  }

  // Druckungen nach Übereinstimmung mit der genannten Edition / Nummer bewerten
  function printScore(c,setText,number){
    let s=0;
    if(setText){
      const st=setText.toLowerCase().trim();
      const compact=st.replace(/\s+/g,'');
      const code=(c.set||'').toLowerCase();
      const name=(c.set_name||'').toLowerCase();
      if(compact===code)s+=100;
      if(st===name)s+=80;
      else{
        const words=st.split(' ').filter(w=>w.length>1);
        if(words.length&&words.every(w=>name.includes(w)))s+=50;
        else if(words.some(w=>w.length>3&&name.includes(w)))s+=15;
      }
      const year=(st.match(/\b(19|20)\d\d\b/)||[])[0];
      if(year&&(c.released_at||'').startsWith(year))s+=10;
    }
    if(number&&String(c.collector_number||'').toLowerCase()===number.toLowerCase())s+=40;
    return s;
  }

  // ── CSS einfügen (nur einmal) ──
  function injectStyles(){
    if(el('acs-styles')) return;
    const css = `
#addCardModal .modal{max-width:560px;width:100%;}
.acs-search-wrap{position:relative;}
.acs-suggestions{position:absolute;left:0;right:0;top:100%;z-index:30;background:var(--surface2);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;max-height:240px;overflow-y:auto;box-shadow:0 12px 30px rgba(0,0,0,0.5);}
.acs-suggestions:empty{display:none;}
.acs-suggestion{padding:0.6rem 0.85rem;cursor:pointer;font-family:'EB Garamond',serif;font-size:1rem;color:var(--text);border-bottom:1px solid var(--border);}
.acs-suggestion:last-child{border-bottom:none;}
.acs-suggestion:hover,.acs-suggestion.active{background:var(--surface3);color:var(--gold2);}
.acs-printings{margin-top:0.9rem;max-height:42vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px;}
.acs-printings:empty{display:none;border:none;}
.acs-print-row{display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.7rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s;}
.acs-print-row:last-child{border-bottom:none;}
.acs-print-row:hover{background:var(--surface2);}
.acs-print-row.selected{background:var(--surface3);box-shadow:inset 3px 0 0 var(--gold);}
.acs-thumb{width:42px;height:59px;flex-shrink:0;border-radius:4px;object-fit:cover;background:var(--surface3);border:1px solid var(--border);}
.acs-print-info{flex:1;min-width:0;}
.acs-print-name{font-family:'EB Garamond',serif;font-size:1rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.acs-print-meta{font-size:0.78rem;color:var(--text2);margin-top:0.1rem;}
.acs-print-price{font-family:'Cinzel',serif;font-size:0.85rem;color:var(--gold2);flex-shrink:0;white-space:nowrap;}
.acs-msg{padding:0.9rem;text-align:center;color:var(--text2);font-size:0.9rem;}
.acs-detail{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:1rem;flex-wrap:wrap;}
.acs-detail-img{width:128px;flex-shrink:0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.55);align-self:flex-start;}
.acs-detail-controls{flex:1;min-width:210px;}
.acs-detail-controls .form-field{margin-bottom:0.6rem;}
.acs-row2{display:flex;gap:0.5rem;}
.acs-row2 .form-field{flex:1;min-width:0;}
.acs-foil-note{font-size:0.72rem;color:var(--text3);margin:-0.25rem 0 0.5rem;min-height:0.9rem;}
@media(max-width:480px){.acs-detail-img{width:104px;margin:0 auto;}}
#acsSearch{padding-right:3rem;}
.acs-mic{position:absolute;right:0.35rem;bottom:0.3rem;width:2.3rem;height:2.1rem;border-radius:6px;border:1px solid var(--border);background:var(--surface3);cursor:pointer;font-size:1rem;line-height:1;}
.acs-mic:hover{border-color:var(--gold-dim);}
.acs-mic.listening{background:var(--red);border-color:var(--red);animation:acsPulse 1s infinite;}
@keyframes acsPulse{0%,100%{box-shadow:0 0 0 0 rgba(224,82,82,0.6)}50%{box-shadow:0 0 0 6px rgba(224,82,82,0)}}
.acs-last{font-size:0.8rem;color:var(--green);min-height:0;margin-top:0.3rem;}
.acs-last:empty{display:none;}
.acs-match-head{padding:0.5rem 0.7rem;font-size:0.8rem;color:var(--text2);border-bottom:1px solid var(--border);background:var(--bg2);}
.acs-match-head a{color:var(--gold2);}
.acs-print-row.acs-match{box-shadow:inset 3px 0 0 var(--green);}
.acs-print-row.acs-match.selected{box-shadow:inset 3px 0 0 var(--gold);}
`;
    const style=document.createElement('style');
    style.id='acs-styles';
    style.textContent=css;
    document.head.appendChild(style);
  }

  // ── Modal einfügen (nur einmal) ──
  function injectModal(){
    if(el('addCardModal')) return;
    const wrap=document.createElement('div');
    wrap.innerHTML = `
<div class="modal-overlay" id="addCardModal">
  <div class="modal">
    <div class="modal-header">
      <span style="font-family:'Cinzel',serif;font-size:0.75rem;letter-spacing:0.15em;color:var(--text3)">KARTE HINZUFÜGEN</span>
      <button class="modal-close" id="acsClose" title="Schließen">✕</button>
    </div>
    <div class="modal-detail">
      <div class="form-field acs-search-wrap">
        <label>KARTE SUCHEN <span style="color:var(--text3);font-weight:400;font-size:0.7rem;letter-spacing:0">– tippen oder sprechen, z.B. „2 Sol Ring from Commander 2021 foil“</span></label>
        <input id="acsSearch" placeholder="Kartenname (+ Edition) … Enter" autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button class="acs-mic" id="acsMic" type="button" title="Karte per Sprache suchen">🎤</button>
        <div class="acs-suggestions" id="acsSuggestions"></div>
      </div>
      <div class="acs-last" id="acsLast"></div>
      <div class="acs-printings" id="acsPrintings"></div>
      <div class="acs-detail" id="acsDetail" style="display:none">
        <img class="acs-detail-img" id="acsDetailImg" alt="">
        <div class="acs-detail-controls">
          <div id="acsDetailTitle" style="font-family:'EB Garamond',serif;font-size:1.05rem;color:var(--text);margin-bottom:0.1rem;"></div>
          <div id="acsDetailSub" style="font-size:0.8rem;color:var(--text2);margin-bottom:0.7rem;"></div>
          <div class="acs-row2">
            <div class="form-field"><label>ANZAHL</label><input type="number" id="acsQty" min="1" max="999" value="1"></div>
            <div class="form-field"><label>AUSFÜHRUNG</label><select id="acsFoil"><option value="normal">Normal</option></select></div>
          </div>
          <div class="acs-foil-note" id="acsFoilNote"></div>
          <div class="acs-row2">
            <div class="form-field"><label>ZUSTAND</label><select id="acsCond">
              <option value="near_mint">Near Mint</option>
              <option value="lightly_played">Lightly Played</option>
              <option value="moderately_played">Moderately Played</option>
              <option value="heavily_played">Heavily Played</option>
              <option value="damaged">Damaged</option>
            </select></div>
            <div class="form-field"><label>SPRACHE</label><select id="acsLang">
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
              <option value="it">Italiano</option>
              <option value="es">Español</option>
              <option value="pt">Português</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="ru">Русский</option>
              <option value="zhs">中文 (简)</option>
              <option value="zht">中文 (繁)</option>
            </select></div>
          </div>
          <div class="form-field"><label>KAUFPREIS <span style="color:var(--text3);font-weight:400;font-size:0.7rem;letter-spacing:0">(optional, €)</span></label><input id="acsPrice" placeholder="z.B. 2.50" inputmode="decimal" autocomplete="off"></div>
          <div class="btn-row">
            <button class="btn btn-primary" id="acsAdd">In Sammlung aufnehmen</button>
            <button class="btn" id="acsCancel">Fertig</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  // ── Entry-Buttons einfügen (Header, Mobile-Menü, Leerzustand) ──
  function injectButtons(){
    // Header — neben den CSV-Button
    const csvLabel = document.querySelector('.header-right .import-btn');
    if(csvLabel && !el('acsHeaderBtn')){
      const b=document.createElement('button');
      b.id='acsHeaderBtn'; b.className='import-btn'; b.type='button';
      b.textContent='＋ Karte';
      b.title='Karte per Suche hinzufügen';
      b.addEventListener('click', openModal);
      csvLabel.parentNode.insertBefore(b, csvLabel);
    }
    // Mobile-Menü — über dem CSV-Eintrag
    const mobCsv = document.querySelector('#mobileNav .mobile-import-btn');
    if(mobCsv && !el('acsMobBtn')){
      const b=document.createElement('button');
      b.id='acsMobBtn'; b.className='mobile-import-btn'; b.type='button';
      b.style.textAlign='left';
      b.textContent='＋ Karte hinzufügen';
      b.addEventListener('click', function(){ if(typeof closeMobileNav==='function') closeMobileNav(); openModal(); });
      mobCsv.parentNode.insertBefore(b, mobCsv);
    }
    // Leere Sammlung — zweite, dezente Aktion unter dem CSV-Knopf
    const emptyCta = document.querySelector('#collection-empty .empty-cta');
    if(emptyCta && !el('acsEmptyBtn')){
      const b=document.createElement('button');
      b.id='acsEmptyBtn'; b.type='button';
      b.textContent='… oder einzeln per Suche hinzufügen';
      b.style.cssText="display:block;margin:0.9rem auto 0;background:none;border:none;color:var(--gold2);font-family:'Cinzel',serif;font-size:0.72rem;letter-spacing:0.05em;cursor:pointer;text-decoration:underline;";
      b.addEventListener('click', openModal);
      emptyCta.parentNode.insertBefore(b, emptyCta.nextSibling);
    }
    // Prominent in der gefüllten Sammlung — oben über der Kartenliste,
    // im goldenen Stil der „+ Neues Deck“-Buttons, damit es klar sichtbar ist.
    const collContent = el('collection-content');
    if(collContent && !el('acsCollBtn')){
      const bar=document.createElement('div');
      bar.id='acsCollBar';
      bar.style.cssText='display:flex;justify-content:flex-end;align-items:center;margin:0 0 0.9rem;';
      const b=document.createElement('button');
      b.id='acsCollBtn'; b.className='btn-gold'; b.type='button';
      b.textContent='＋ Karte hinzufügen';
      b.title='Karte per Suche zur Sammlung hinzufügen';
      b.addEventListener('click', openModal);
      bar.appendChild(b);
      collContent.insertBefore(bar, collContent.firstChild);
    }
  }

  // ── Vorschläge (Autocomplete) ──
  async function fetchSuggestions(q){
    try{
      const res=await fetch('https://api.scryfall.com/cards/autocomplete?q='+encodeURIComponent(q));
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      renderSuggestions(data.data||[]);
    }catch(e){
      console.warn('[Add-Card] Autocomplete fehlgeschlagen:', e);
      el('acsSuggestions').innerHTML='<div class="acs-suggestion" style="cursor:default;color:var(--text2)">Suche momentan nicht erreichbar.</div>';
    }
  }

  function renderSuggestions(names){
    acsActiveSug=-1;
    const box=el('acsSuggestions');
    if(!names.length){ box.innerHTML=''; return; }
    box.innerHTML='';
    names.forEach(function(name){
      const d=document.createElement('div');
      d.className='acs-suggestion';
      d.textContent=name;
      d.addEventListener('mousedown', function(ev){ ev.preventDefault(); chooseName(name); });
      box.appendChild(d);
    });
  }

  // Name gewählt → Druckungen laden
  function chooseName(name){
    acsPhrase=null;   // manuelle Auswahl → keine Edition aus einem Satz
    el('acsSearch').value=name;
    el('acsSuggestions').innerHTML='';
    loadPrintings(name);
  }

  // ── Druckungen laden ──
  async function loadPrintings(name){
    acsSelected=null;
    el('acsDetail').style.display='none';
    const box=el('acsPrintings');
    box.innerHTML='<div class="acs-msg">Lade Druckungen…</div>';
    try{
      // !"…" = exakter Namens-Treffer, unique=prints = jede Druckung einzeln
      const q='!"'+name.replace(/"/g,'')+'"';
      const url='https://api.scryfall.com/cards/search?order=released&dir=asc&unique=prints&q='+encodeURIComponent(q);
      const res=await fetch(url);
      if(res.status===404){ box.innerHTML='<div class="acs-msg">Keine Karte mit diesem Namen gefunden.</div>'; return; }
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      acsPrintings=data.data||[];
      let hasMore=data.has_more, next=data.next_page, pages=1;
      // Edition/Nummer genannt → weitere Seiten holen, damit sie nicht fehlt
      const narrow=acsPhrase&&(acsPhrase.setText||acsPhrase.number);
      while(narrow&&hasMore&&next&&pages<4){
        await sleep(100);
        const r=await fetch(next); if(!r.ok) break;
        const d=await r.json();
        acsPrintings=acsPrintings.concat(d.data||[]);
        hasMore=d.has_more; next=d.next_page; pages++;
      }
      const scores=rankPrintings();
      renderPrintings(acsPrintings, hasMore);
      autoSelectFromPhrase(scores);
    }catch(e){
      console.warn('[Add-Card] Druckungen laden fehlgeschlagen:', e);
      box.innerHTML='<div class="acs-msg">Fehler beim Laden der Druckungen. Bitte erneut versuchen.</div>';
    }
  }

  // Passende Druckungen (Edition/Nummer aus dem Satz) nach oben sortieren.
  // Setzt acsMatchCount; gibt die Punktzahlen in der neuen Reihenfolge zurück.
  function rankPrintings(){
    acsMatchCount=0; acsShowAll=true;
    if(!acsPhrase||!(acsPhrase.setText||acsPhrase.number)) return [];
    const scored=acsPrintings.map(function(c,i){ return {c:c,s:printScore(c,acsPhrase.setText,acsPhrase.number),i:i}; });
    scored.sort(function(a,b){ return (b.s-a.s)||(a.i-b.i); });
    acsPrintings=scored.map(function(x){ return x.c; });
    // „Passend" = klarer Treffer (Code/Name/alle Wörter/Nummer); nur wenn es keinen
    // gibt, zählen die schwachen Treffer mit der besten Punktzahl
    const best=scored.length?scored[0].s:0;
    acsMatchCount=scored.filter(function(x){ return best>=40 ? x.s>=40 && x.s>=best-30 : (x.s>0 && x.s===best); }).length;
    acsShowAll=acsMatchCount===0;
    return scored.map(function(x){ return x.s; });
  }

  // Eindeutig bester Treffer → automatisch wählen (nur legal spielbare Druckungen,
  // siehe CLAUDE.md / isPlayablePrint in wishlist.js)
  function autoSelectFromPhrase(scores){
    if(!acsMatchCount||!scores.length) return;
    const unique=acsMatchCount===1||scores[0]>scores[1];
    const playable=typeof isPlayablePrint!=='function'||isPlayablePrint(acsPrintings[0]);
    if(unique&&playable) selectPrinting(0);
  }

  function renderPrintings(allList, hasMore){
    const box=el('acsPrintings');
    if(!allList.length){ box.innerHTML='<div class="acs-msg">Keine Druckungen gefunden.</div>'; return; }
    box.innerHTML='';
    // Nur die passenden zeigen, bis „alle anzeigen" geklickt wird (Indizes bleiben gleich)
    const list=acsShowAll?allList:allList.slice(0,acsMatchCount);
    if(acsMatchCount){
      const head=document.createElement('div');
      head.className='acs-match-head';
      head.innerHTML=acsMatchCount+' passende Version'+(acsMatchCount===1?'':'en')+' zu „'+escapeHtml(acsPhrase.setText||('#'+acsPhrase.number))+'"'+
        ' · <a href="#">'+(acsShowAll?'nur passende':'alle '+allList.length+' anzeigen')+'</a>';
      head.querySelector('a').addEventListener('click',function(ev){
        ev.preventDefault(); acsShowAll=!acsShowAll;
        const selIdx=acsSelected?acsPrintings.indexOf(acsSelected):-1;
        renderPrintings(acsPrintings, hasMore);
        if(selIdx>=0) markSelected(selIdx);
      });
      box.appendChild(head);
    }else if(acsPhrase&&acsPhrase.setText){
      const head=document.createElement('div');
      head.className='acs-match-head';
      head.textContent='Keine Version passt zu „'+acsPhrase.setText+'" – bitte aus allen wählen.';
      box.appendChild(head);
    }
    list.forEach(function(c, idx){
      const row=document.createElement('div');
      row.className='acs-print-row'+(idx<acsMatchCount?' acs-match':'');
      row.dataset.idx=idx;
      row.innerHTML =
        '<img class="acs-thumb" loading="lazy" alt="" src="'+imgSmall(c)+'">'+
        '<div class="acs-print-info">'+
          '<div class="acs-print-name">'+escapeHtml(c.name)+'</div>'+
          '<div class="acs-print-meta">'+
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:.35rem;vertical-align:middle;background:'+rarColor(c.rarity)+'"></span>'+
            escapeHtml(c.set_name||'')+' ('+(c.set||'').toUpperCase()+') · #'+escapeHtml(c.collector_number||'?')+
          '</div>'+
        '</div>'+
        '<div class="acs-print-price">'+eurText(c)+'</div>';
      row.addEventListener('click', function(){ selectPrinting(idx); });
      box.appendChild(row);
    });
    if(hasMore){
      const m=document.createElement('div');
      m.className='acs-msg';
      m.style.fontSize='0.8rem';
      m.textContent='Weitere Druckungen vorhanden — bei Bedarf den Namen genauer eingeben.';
      box.appendChild(m);
    }
  }

  function markSelected(idx){
    el('acsPrintings').querySelectorAll('.acs-print-row').forEach(function(r){ r.classList.toggle('selected', r.dataset.idx===String(idx)); });
  }

  // ── Druckung auswählen → Detail/Steuerung zeigen ──
  function selectPrinting(idx){
    acsSelected=acsPrintings[idx];
    const c=acsSelected;
    markSelected(idx);

    el('acsDetailImg').src=imgNormal(c);
    el('acsDetailTitle').textContent=c.name;
    el('acsDetailSub').textContent=(c.set_name||'')+' ('+(c.set||'').toUpperCase()+') · #'+(c.collector_number||'?')+' · '+cap(c.rarity);

    // Ausführungs-Optionen je nach Verfügbarkeit
    const foilSel=el('acsFoil'), note=el('acsFoilNote');
    const fA=foilAvail(c), nA=nonfoilAvail(c);
    foilSel.innerHTML='';
    if(nA) foilSel.add(new Option('Normal','normal'));
    if(fA) foilSel.add(new Option('Foil','foil'));
    if(!nA && fA){ foilSel.value='foil'; note.textContent='Diese Druckung gibt es nur als Foil.'; }
    else if(nA && !fA){ note.textContent='Diese Druckung gibt es nicht als Foil.'; }
    else note.textContent='';

    // Anzahl und Foil aus dem gesprochenen/getippten Satz übernehmen
    if(acsPhrase){
      if(acsPhrase.qty) el('acsQty').value=acsPhrase.qty;
      if(acsPhrase.foil&&fA){ foilSel.value='foil'; }
    }

    // Sprache vorbelegen (falls die Druckungs-Sprache in der Liste ist)
    const langSel=el('acsLang');
    if(c.lang){
      for(let i=0;i<langSel.options.length;i++){ if(langSel.options[i].value===c.lang){ langSel.value=c.lang; break; } }
    }

    el('acsDetail').style.display='flex';
    el('acsDetail').scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  // ── Hinzufügen ──
  async function addToCollection(){
    if(typeof currentUser==='undefined' || !currentUser){ if(typeof toastError==='function') toastError('Bitte zuerst anmelden.'); return; }
    if(!acsSelected){ if(typeof toastError==='function') toastError('Bitte zuerst eine Druckung auswählen.'); return; }

    const c=acsSelected;
    const qty=Math.max(1, parseInt(el('acsQty').value,10)||1);
    const isFoil=el('acsFoil').value==='foil';
    const condition=el('acsCond').value;
    const language=el('acsLang').value;
    const price=normalizePrice(el('acsPrice').value);

    const newCard={
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      name: c.name,
      set_code: (c.set||'').toUpperCase(),
      set_name: c.set_name||'',
      collector_number: c.collector_number||'',
      foil: isFoil?'foil':'normal',
      rarity: (c.rarity||'').toLowerCase(),
      quantity: qty,
      manabox_id: '',
      scryfall_id: c.id,
      purchase_price: price,
      currency: 'EUR',
      misprint: false,
      altered: false,
      condition: condition,
      language: language,
      // Anreicherung gleich mitliefern (haben wir aus Scryfall schon vorliegen):
      mana_value: (c.cmc!=null) ? Math.floor(c.cmc) : null,
      colors: c.colors||[],
      type_line: c.type_line||null,
      color_identity: c.color_identity||[],
      legal_commander: (c.legalities && c.legalities.commander) || null
    };

    // Schon vorhanden? → Menge erhöhen (gleiche Logik wie CSV-Import)
    const existing = (typeof allCards!=='undefined' && allCards)
      ? allCards.find(function(x){ return dupKey(x)===dupKey(newCard); })
      : null;

    const addBtn=el('acsAdd');
    if(typeof setBusy==='function') setBusy(addBtn,true); else addBtn.disabled=true;

    let ok, mergedQty=qty;
    if(existing){
      mergedQty=(existing.quantity||0)+qty;
      ok=await upsertCards([Object.assign({}, existing, {quantity:mergedQty})]);
    }else{
      ok=await upsertCards([newCard]);
    }

    if(typeof setBusy==='function') setBusy(addBtn,false); else addBtn.disabled=false;

    if(!ok) return; // upsertCards meldet den Fehler bereits per Toast

    const label=c.name+' · '+(c.set||'').toUpperCase()+' #'+(c.collector_number||'?')+(isFoil?' (Foil)':'');
    if(typeof toastSuccess==='function'){
      toastSuccess(existing ? ('Menge erhöht: '+label+' → '+mergedQty+'×') : ('Hinzugefügt: '+qty+'× '+label));
    }

    // Fenster bleibt offen für die nächste Karte; Sammlung lädt im Hintergrund neu
    acsAddedCount++;
    el('acsLast').textContent='✓ Zuletzt: '+qty+'× '+label+(acsAddedCount>1?' · '+acsAddedCount+' Karten in dieser Runde':'');
    resetForNext();
    loadAll().then(function(){ if(typeof renderAll==='function') renderAll(); });
  }

  // Suchbereich leeren, damit gleich die nächste Karte gesucht/gesprochen werden kann
  function resetForNext(){
    acsPrintings=[]; acsSelected=null; acsPhrase=null; acsMatchCount=0; acsShowAll=true; acsActiveSug=-1;
    el('acsSearch').value='';
    el('acsSuggestions').innerHTML='';
    el('acsPrintings').innerHTML='';
    el('acsDetail').style.display='none';
    el('acsQty').value=1;
    el('acsPrice').value='';
    setTimeout(function(){ el('acsSearch').focus(); }, 60);
  }

  // ── Spracherkennung (🎤) ──
  // Web Speech API gibt es z.B. in Chrome; Brave und Firefox unterstützen sie
  // nicht → Hinweis auf das Mikrofon der Handy-Tastatur (Text landet dann im
  // Suchfeld und wird per Enter genauso ausgewertet).
  function speechHint(){
    if(typeof toastInfo==='function') showToastTyped('Tippe auf das 🎤 deiner Tastatur und sprich z.B. „Sol Ring from Commander 2021“ – dann Enter.','info',6000);
    el('acsSearch').focus();
  }
  function toggleSpeech(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ speechHint(); return; }
    if(acsRecog){ acsRecog.stop(); return; }
    const rec=new SR();
    rec.lang='en-US';            // Kartennamen sind englisch
    rec.interimResults=true;
    rec.maxAlternatives=3;
    rec.continuous=false;
    const mic=el('acsMic');
    let finalDone=false;
    rec.onstart=function(){ acsRecog=rec; mic.classList.add('listening'); el('acsSearch').value=''; el('acsSearch').placeholder='Ich höre zu…'; };
    rec.onresult=function(ev){
      const res=ev.results[ev.results.length-1];
      el('acsSearch').value=res[0].transcript;
      if(res.isFinal&&!finalDone){
        finalDone=true;
        const alts=[]; for(let i=1;i<res.length;i++) alts.push(res[i].transcript);
        smartSearch(res[0].transcript, alts);
      }
    };
    rec.onerror=function(ev){
      if(ev.error==='no-speech'){ if(typeof toastInfo==='function') toastInfo('Nichts gehört – bitte nochmal.'); }
      else if(ev.error!=='aborted') speechHint();   // network / not-allowed / service-not-allowed
    };
    rec.onend=function(){ acsRecog=null; mic.classList.remove('listening'); el('acsSearch').placeholder='Kartenname (+ Edition) … Enter'; };
    try{ rec.start(); }catch(e){ speechHint(); }
  }

  // ── Öffnen / Zurücksetzen ──
  function openModal(){
    if(typeof currentUser==='undefined' || !currentUser){ if(typeof toastError==='function') toastError('Bitte zuerst anmelden.'); return; }
    acsAddedCount=0;
    el('acsLast').textContent='';
    el('acsCond').value='near_mint';
    document.getElementById('addCardModal').classList.add('open');
    resetForNext();
  }

  // ── Event-Verdrahtung ──
  function wire(){
    el('acsClose').addEventListener('click', function(){ closeModal('addCardModal'); });
    el('acsCancel').addEventListener('click', function(){ closeModal('addCardModal'); });
    el('acsAdd').addEventListener('click', addToCollection);
    el('acsMic').addEventListener('click', toggleSpeech);

    // Klick auf den dunklen Hintergrund schließt das Modal
    el('addCardModal').addEventListener('click', function(ev){
      if(ev.target===this) closeModal('addCardModal');
    });

    // Escape schließt das Modal
    document.addEventListener('keydown', function(ev){
      if(ev.key==='Escape' && el('addCardModal').classList.contains('open')) closeModal('addCardModal');
    });

    const search=el('acsSearch');

    // Tippen → entprellte Suche
    search.addEventListener('input', function(){
      clearTimeout(acsDebounce);
      const q=search.value.trim();
      acsSelected=null;
      el('acsDetail').style.display='none';
      if(q.length<2){ el('acsSuggestions').innerHTML=''; return; }
      acsDebounce=setTimeout(function(){ fetchSuggestions(q); }, 300);
    });

    // Tastatur-Navigation in der Vorschlagsliste
    search.addEventListener('keydown', function(ev){
      const items=Array.prototype.slice.call(el('acsSuggestions').querySelectorAll('.acs-suggestion'));
      if(ev.key==='ArrowDown' && items.length){ ev.preventDefault(); acsActiveSug=Math.min(items.length-1, acsActiveSug+1); highlightSug(items); }
      else if(ev.key==='ArrowUp' && items.length){ ev.preventDefault(); acsActiveSug=Math.max(0, acsActiveSug-1); highlightSug(items); }
      else if(ev.key==='Enter'){
        ev.preventDefault();
        if(acsActiveSug>=0 && items[acsActiveSug]) chooseName(items[acsActiveSug].textContent);
        // Freitext (auch von der Tastatur diktiert): Name + Edition/Anzahl/Foil auswerten
        else if(search.value.trim().length>=2){ clearTimeout(acsDebounce); smartSearch(search.value.trim()); }
      }
    });
  }

  function highlightSug(items){
    items.forEach(function(it,i){ it.classList.toggle('active', i===acsActiveSug); });
    if(items[acsActiveSug]) items[acsActiveSug].scrollIntoView({block:'nearest'});
  }

  // Minimaler HTML-Escape für eingefügte Texte (Kartennamen etc.)
  function escapeHtml(s){
    return (s||'').toString().replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  // ── Initialisierung ──
  function init(){
    injectStyles();
    injectModal();
    injectButtons();
    wire();
    // Optional: erlaubt, den Dialog von eigenen Buttons aus zu öffnen
    window.openAddCardModal = openModal;
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
