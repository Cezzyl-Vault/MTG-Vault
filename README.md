# MTG Vault

Magic: The Gathering Sammlungs-Manager mit Supabase-Backend.

## Projektstruktur

```
MTG-Vault/
├── index.html              ← HTML-Skelett + Datei-Referenzen
├── styles/
│   ├── base.css            Variablen, Body, Hintergrund, Scrollbar
│   ├── auth.css            Setup-Screen + Login/Registrierung
│   ├── header.css          Header, Desktop-Nav, Mobile-Drawer
│   ├── collection.css      Filter, Karten-Grid, Listen-Ansicht
│   ├── stats.css           KPIs, Bar-Charts, Zustands-Badges
│   ├── decks.css           Decks-Übersicht + Deck-Detail
│   └── modals.css          Modals + Toast
└── js/
    ├── state.js            Globale Variablen (App-Zustand)
    ├── utils.js            Hilfsfunktionen (Toast, Escape, Bild-URLs, Modal)
    ├── db.js               Alle Supabase-Aufrufe
    ├── config.js           Supabase-Setup-Screen, Screen-Wechsel
    ├── auth.js             Login, Registrierung, Logout
    ├── csv-import.js       Parser für ManaBox-Export
    ├── collection.js       Sammlung: Filter, Grid/Liste, Karten-Modal
    ├── decks.js            Decks-Übersicht, Deck-Detail, Kategorien
    ├── stats.js            Statistik-Berechnung und -Darstellung
    └── app.js              Orchestrierung: View-Wechsel, Mobile-Nav, Startup
```

## Wichtig: Reihenfolge der JS-Dateien

`index.html` lädt die JS-Dateien in einer bestimmten Reihenfolge.
Diese Reihenfolge nicht ändern, sonst funktioniert die App nicht:

1. `state.js` — globale Variablen müssen zuerst existieren
2. `utils.js` — Hilfsfunktionen werden überall genutzt
3. `db.js` — DB-Calls werden von Features aufgerufen
4. `config.js`, `auth.js`, `csv-import.js`, `collection.js`, `decks.js`, `stats.js`
5. `app.js` — als Letztes, weil hier der Startup-Code läuft

## Wo ändere ich was?

| Möchtest du… | Bearbeite… |
|---|---|
| Farben, Schriften, Layout | Datei in `styles/` (siehe Tabelle oben) |
| Login-Verhalten | `js/auth.js` |
| Wie CSV importiert wird | `js/csv-import.js` |
| Filter/Anzeige der Sammlung | `js/collection.js` |
| Decks-Logik, Kategorien | `js/decks.js` |
| Statistik-Karten und Bars | `js/stats.js` |
| Datenbank-Aufrufe | `js/db.js` |
| Texte/Buttons im HTML | `index.html` |

## Lokale Entwicklung

GitHub Pages liefert die Dateien direkt aus – kein Build-Step nötig.

Für lokales Testen einen einfachen HTTP-Server starten (nicht via `file://` öffnen,
sonst werden die externen Dateien nicht geladen):

```bash
# Mit Python
python3 -m http.server 8000

# Oder mit Node
npx serve
```

Dann im Browser `http://localhost:8000` öffnen.
