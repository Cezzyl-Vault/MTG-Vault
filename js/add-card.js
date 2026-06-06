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
//                           Duplikat-Logik wie der CSV-Import)
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
        <label>KARTE SUCHEN</label>
        <input id="acsSearch" placeholder="Kartenname tippen… (z.B. Sol Ring)" autocomplete="off" spellcheck="false">
        <div class="acs-suggestions" id="acsSuggestions"></div>
      </div>
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
            <button class="btn" id="acsCancel">Abbrechen</button>
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
      renderPrintings(acsPrintings, data.has_more);
    }catch(e){
      console.warn('[Add-Card] Druckungen laden fehlgeschlagen:', e);
      box.innerHTML='<div class="acs-msg">Fehler beim Laden der Druckungen. Bitte erneut versuchen.</div>';
    }
  }

  function renderPrintings(list, hasMore){
    const box=el('acsPrintings');
    if(!list.length){ box.innerHTML='<div class="acs-msg">Keine Druckungen gefunden.</div>'; return; }
    box.innerHTML='';
    list.forEach(function(c, idx){
      const row=document.createElement('div');
      row.className='acs-print-row';
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

  // ── Druckung auswählen → Detail/Steuerung zeigen ──
  function selectPrinting(idx){
    acsSelected=acsPrintings[idx];
    const c=acsSelected;
    const rows=el('acsPrintings').querySelectorAll('.acs-print-row');
    rows.forEach(function(r,i){ r.classList.toggle('selected', i===idx); });

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
    const price=(el('acsPrice').value||'').trim();

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

    await loadAll();
    if(typeof renderAll==='function') renderAll();
    if(typeof switchView==='function') switchView('collection');
    closeModal('addCardModal');

    const label=c.name+' · '+(c.set||'').toUpperCase()+' #'+(c.collector_number||'?')+(isFoil?' (Foil)':'');
    if(typeof toastSuccess==='function'){
      toastSuccess(existing ? ('✓ Menge erhöht: '+label+' → '+mergedQty+'×') : ('✓ Hinzugefügt: '+label));
    }
  }

  // ── Öffnen / Zurücksetzen ──
  function openModal(){
    if(typeof currentUser==='undefined' || !currentUser){ if(typeof toastError==='function') toastError('Bitte zuerst anmelden.'); return; }
    acsPrintings=[]; acsSelected=null; acsActiveSug=-1;
    el('acsSearch').value='';
    el('acsSuggestions').innerHTML='';
    el('acsPrintings').innerHTML='';
    el('acsDetail').style.display='none';
    el('acsQty').value=1;
    el('acsPrice').value='';
    el('acsCond').value='near_mint';
    document.getElementById('addCardModal').classList.add('open');
    setTimeout(function(){ el('acsSearch').focus(); }, 60);
  }

  // ── Event-Verdrahtung ──
  function wire(){
    el('acsClose').addEventListener('click', function(){ closeModal('addCardModal'); });
    el('acsCancel').addEventListener('click', function(){ closeModal('addCardModal'); });
    el('acsAdd').addEventListener('click', addToCollection);

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
        else if(search.value.trim().length>=2) chooseName(search.value.trim());
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
