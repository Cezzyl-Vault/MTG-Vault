// ══════════════════════════════════════════════════════════
//  SETS  ·  Lookup-Tabelle aller MTG-Sets von Scryfall
// ══════════════════════════════════════════════════════════
//
//  Beim ersten App-Start wird die Sets-Liste von Scryfall geladen
//  (~700 Einträge, ~150 KB) und im localStorage gecacht.
//  Danach steht sie offline zur Verfügung und wird nur alle 7 Tage
//  aktualisiert (neue Sets erscheinen ja nicht täglich).
//
//  Aufbau der Map:
//    setMap = { "lea": {name:"Limited Edition Alpha", released_at:"1993-08-05"}, ... }
//
//  Verwendet wird das in:
//    - collection.js: "älteste Edition" zuerst zeigen bei zusammengefassten Karten
//    - csv-import.js: Set-Namen automatisch ergänzen, falls in CSV fehlt

const SETS_CACHE_KEY = 'mtgvault_sets_v1';
const SETS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

let setMap = {};  // wird zur Laufzeit gefüllt

async function loadSets(){
  // Erst Cache prüfen
  try{
    const cached=JSON.parse(localStorage.getItem(SETS_CACHE_KEY));
    if(cached&&cached.timestamp&&(Date.now()-cached.timestamp<SETS_CACHE_MAX_AGE_MS)){
      setMap=cached.data;
      return;
    }
  }catch(e){/* ignorieren, dann eben frisch laden */}

  // Frisch von Scryfall laden
  try{
    const res=await fetch('https://api.scryfall.com/sets');
    if(!res.ok)throw new Error('HTTP '+res.status);
    const json=await res.json();
    const map={};
    for(const set of json.data||[]){
      map[set.code.toLowerCase()]={name:set.name,released_at:set.released_at||null};
    }
    setMap=map;
    localStorage.setItem(SETS_CACHE_KEY,JSON.stringify({timestamp:Date.now(),data:map}));
  }catch(e){
    console.warn('Konnte Set-Liste nicht laden:',e);
    // Nicht-fatal: setMap bleibt leer, "älteste Edition" fällt auf alphabetisch zurück
  }
}

// Veröffentlichungsdatum für einen Set-Code holen, oder einen leeren String falls unbekannt
function setReleasedAt(setCode){
  if(!setCode)return '';
  const entry=setMap[setCode.toLowerCase()];
  return entry?.released_at||'';
}
