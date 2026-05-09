// ══════════════════════════════════════════════════════════
//  SETTINGS  ·  Nutzer-Einstellungen (in localStorage)
// ══════════════════════════════════════════════════════════
//
//  Ein einfacher Settings-Container, der im localStorage gespeichert wird.
//  Aktuell verwaltet:
//    - startTab: Welcher Reiter wird beim App-Start angezeigt
//
//  Erweiterbar: Neue Felder einfach in DEFAULT_SETTINGS und im Modal ergänzen.

const SETTINGS_KEY='mtgvault_settings_v1';
const DEFAULT_SETTINGS={
  startTab:'collection',
  deckCardSize:'medium'  // 'small' | 'medium' | 'large' für die Karten-Ansicht in Decks
};

// Settings laden — fällt auf Defaults zurück, falls Feld fehlt oder Daten kaputt
function loadSettings(){
  try{
    const raw=localStorage.getItem(SETTINGS_KEY);
    if(!raw)return{...DEFAULT_SETTINGS};
    return{...DEFAULT_SETTINGS,...JSON.parse(raw)};
  }catch(e){
    return{...DEFAULT_SETTINGS};
  }
}

function saveSettingsToStorage(settings){
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
}

// Modal öffnen + aktuelle Werte einlesen
function openSettingsModal(){
  const s=loadSettings();
  document.getElementById('settingStartTab').value=s.startTab;
  const sizeSel=document.getElementById('settingDeckCardSize');
  if(sizeSel)sizeSel.value=s.deckCardSize||'medium';
  document.getElementById('settingsModal').classList.add('open');
}

// Speichern-Button: Werte aus dem Modal lesen + persistieren
function saveSettings(){
  const settings=loadSettings();
  settings.startTab=document.getElementById('settingStartTab').value;
  const sizeSel=document.getElementById('settingDeckCardSize');
  if(sizeSel)settings.deckCardSize=sizeSel.value;
  saveSettingsToStorage(settings);
  closeModal('settingsModal');
  toastSuccess('Einstellungen gespeichert');
  // Falls aktuell ein Deck offen ist, neu rendern, damit die Karten-Größe sofort wirkt
  if(typeof activeDeckId!=='undefined'&&activeDeckId){
    const deck=allDecks.find(d=>d.id===activeDeckId);
    if(deck&&typeof renderDeckDetail==='function')renderDeckDetail(deck);
  }
}
