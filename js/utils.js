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

// Kaufpreis als Zahl lesen. Akzeptiert "2.50", "2,50" und Zahlen — ein
// deutsches Komma wurde früher ungeprüft gespeichert und von parseFloat
// zu 2 abgeschnitten. Leer/ungültig → 0.
function parsePrice(v){
  if(v==null||v==='')return 0;
  const n=parseFloat(String(v).trim().replace(',','.'));
  return isNaN(n)?0:n;
}
// Kaufpreis vor dem Speichern vereinheitlichen: "2,50" → "2.50", leer bleibt leer
function normalizePrice(v){return String(v==null?'':v).trim().replace(',','.');}

// Lokales Datum als YYYY-MM-DD. toISOString() rechnet in UTC um und
// liefert in Deutschland kurz nach Mitternacht noch den Vortag.
function localDateStr(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// HTML-Escape, um XSS bei Karten-Namen etc. zu verhindern
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// JavaScript-String-Escape für Inhalte, die in inline onclick-Attributen
// in JS-String-Literalen landen. esc() reicht dafür nicht: ein HTML-Escape
// (&#39;) wird vom Browser beim Parsen wieder zu '. Wenn der Karten-Name
// einen Apostroph enthält (z.B. "Morningtide's Light"), beendet das den
// String und der Klick passiert nichts. escJs maskiert für JS direkt.
// Zusätzlich: " beendet sonst das onclick="…"-Attribut (z.B. bei
// Kongming, "Sleeping Dragon") → als &quot; maskieren, der Browser macht
// beim Parsen des Attributs wieder ein " daraus. & und < ebenso für HTML.
function escJs(s){
  if(s==null)return'';
  return String(s)
    .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/\r?\n/g,'\\n')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// Modal anhand seiner ID schließen
function closeModal(id){document.getElementById(id).classList.remove('open');}

// Neutrale Toast-Meldung unten rechts (verschwindet nach 3 Sekunden).
// Läuft über showToastTyped (ui.js), damit Farbe/Icon einer vorherigen
// Fehler-Meldung zurückgesetzt und ihr Ausblend-Timer abgebrochen wird.
// Für Erfolg/Fehler besser toastSuccess/toastError nehmen.
function showToast(msg){showToastTyped(msg,'plain',3000);}
