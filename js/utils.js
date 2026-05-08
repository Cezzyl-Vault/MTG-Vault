// ══════════════════════════════════════════════════════════
//  UTILS  ·  Hilfsfunktionen, die überall in der App genutzt werden
// ══════════════════════════════════════════════════════════

// Bild-URL für eine Karte aus Scryfall (oder null falls keine ID)
function iUrl(c){return c.scryfall_id?`https://cards.scryfall.io/normal/front/${c.scryfall_id[0]}/${c.scryfall_id[1]}/${c.scryfall_id}.jpg`:null;}

// Seltenheit normalisieren (alles außer mythic/rare/uncommon wird zu 'common')
function rc(r){return['mythic','rare','uncommon'].includes(r)?r:'common';}

// Zustands-CSS-Klasse aus Zustands-Text ableiten
function cc(c=''){if(c.includes('near'))return'cond-nm';if(c.includes('light'))return'cond-lp';if(c.includes('moderate'))return'cond-mp';if(c.includes('heavy'))return'cond-hp';if(c.includes('damage'))return'cond-dm';return'';}

// Kurz-Label für Zustand: 'Near Mint' → 'NM' usw.
function cl(c=''){if(c.includes('near'))return'NM';if(c.includes('light'))return'LP';if(c.includes('moderate'))return'MP';if(c.includes('heavy'))return'HP';if(c.includes('damage'))return'DM';return c.toUpperCase().slice(0,3)||'–';}

// HTML-Escape, um XSS bei Karten-Namen etc. zu verhindern
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// JavaScript-String-Escape für Inhalte, die in inline onclick-Attributen
// in JS-String-Literalen landen. esc() reicht dafür nicht: ein HTML-Escape
// (&#39;) wird vom Browser beim Parsen wieder zu '. Wenn der Karten-Name
// einen Apostroph enthält (z.B. "Morningtide's Light"), beendet das den
// String und der Klick passiert nichts. escJs maskiert für JS direkt.
function escJs(s){
  if(s==null)return'';
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

// Modal anhand seiner ID schließen
function closeModal(id){document.getElementById(id).classList.remove('open');}

// Toast-Meldung unten rechts einblenden (verschwindet nach 3 Sekunden)
function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}
