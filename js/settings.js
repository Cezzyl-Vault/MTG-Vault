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
const DEFAULT_SETTINGS={startTab:'collection'};

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
  document.getElementById('settingsModal').classList.add('open');
}

// Speichern-Button: Werte aus dem Modal lesen + persistieren
function saveSettings(){
  const settings=loadSettings();
  settings.startTab=document.getElementById('settingStartTab').value;
  saveSettingsToStorage(settings);
  closeModal('settingsModal');
  toastSuccess('Einstellungen gespeichert');
}
