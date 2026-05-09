# MTG Vault

Magic: The Gathering Sammlungs-Manager mit Supabase-Backend.

Hostet auf GitHub Pages, alle App-Logik im Browser, Daten in Supabase.

## Features

**Sammlung**
- CSV-Import (ManaBox-Format), dedupliziert intelligent (Set+Sammlernr+Foil+Sprache)
- Erweiterte Filter: Manawert (Pills 0–5+), Farben (Mana-Symbole WUBRG + ◇), Kartentyp, Foil, Set, Zustand, Seltenheit
- Karten-Gruppierung: gleiche Namen werden zu einem Tile zusammengefasst
- Stats-Bar mit Einträge/Karten/Wert
- Klick auf Karte → Modal mit allen Varianten als Tabelle (Bearbeiten + Löschen direkt zugänglich)
- Export als CSV oder druckbares PDF (respektiert aktive Filter)

**Decks**
- Übersicht mit Karten-Anzahl, Wert €, Ø Manawert, Farb-Punkten pro Deck
- Karten-Detail mit zwei Ansichten:
  - **Karten-Ansicht** (Standard): Bilder als Grid, klickbar für Detail-Modal
  - **Listen-Ansicht**: kompakte Zeilen
- **Karten-Größe konfigurierbar** (Klein/Mittel/Groß) — siehe Settings
- **Karten gleichen Namens werden zusammengefasst** dargestellt (z.B. 4× Insel aus 3 Sets = ein Tile mit ×4)
- **Anzahl-Pille** auf jeder Karte immer sichtbar (×N)
- **Bearbeiten-Modus** mit Multi-Select für Verschieben/Entfernen mehrerer Karten gleichzeitig
- **Klick auf Karte** öffnet immer das Karten-Modal (auch im Edit-Modus). Auswahl im Edit-Modus erfolgt nur über die Checkbox-Overlay
- **"Alle markieren"-Button** pro Kategorie im Edit-Modus (Toggle)
- Kategorien sortierbar via ▲▼-Pfeile (nur im Edit-Modus sichtbar)
- Kategorien einklappbar via Klick auf Header
- Karten ohne Kategorie landen in "Ohne Kategorie"-Sektion oben
- **Visueller Move-Picker**: Karten verschieben über klickbare Kategorien-Liste (statt Texteingabe)
- **Karten-Modal mit Deck-Kontext**: Bei Klick auf Karte aus dem Deck zeigt das Modal "📂 Verschieben" und "🗑 Aus Deck entfernen" statt "Zu Deck hinzufügen"

**Statistik pro Deck** (einklappbar)
- KPIs: Karten / Ø Manawert / Deckwert
- Mana-Kurve (ohne Länder)
- Farbverteilung (ohne Länder)
- Typenverteilung

**Commander-Validierung** (nur bei Format = Commander)
- Karten-Anzahl: 100 Hauptdeck + Sideboard separat
- Singleton-Regel (außer Basic Lands, gilt über Hauptdeck + Sideboard)
- Format-Legalität pro Karte (Scryfall)
- Banlist (Scryfall)
- Farbidentität (Karten in Kategorie "Commander" definieren erlaubte Farben)
- Geschützte "Commander"-Kategorie mit 👑

**Statistik global**
- Karten/Einträge/Sets/Foils/Decks/Gesamtwert
- Wertentwicklung als Linechart (wöchentliche Snapshots, Live-Preise von Scryfall)
- Seltenheit, Top Sets, Sprachen, Zustände als Bar-Charts

**UX**
- Bottom-Navigation auf Mobile
- Karten-Modal mit Sticky-"Schließen"-Button unten
- Bestätigungs-Modals im App-Stil
- Lade-Indikatoren auf Buttons
- Semantische Toasts (✓/⚠/ℹ)
- Hardcoded Supabase-Config in `js/defaults.js`
- Auto-Cache-Busting bei jedem Release
- Settings-Modal: Start-Reiter und Karten-Größe im Deck konfigurierbar

## Projektstruktur

```
MTG-Vault/
├── index.html                    HTML-Skelett + Datei-Referenzen
├── README.md                     diese Datei
├── .github/workflows/
│   └── version-bump.yml          Auto-Versionierung + Cache-Busting
├── styles/
│   ├── base.css                  Variablen, Body, Hintergrund, Scrollbar
│   ├── auth.css                  Setup-Screen + Login/Registrierung
│   ├── header.css                Header, Desktop-Nav, Mobile-Drawer, Bottom-Nav
│   ├── collection.css            Filter, Karten-Grid, Listen-Ansicht, Export-Buttons
│   ├── stats.css                 KPIs, Bar-Charts, Preis-Linechart
│   ├── decks.css                 Decks-Übersicht + Detail (incl. Karten-Grid, Edit-Mode)
│   └── modals.css                Modals + Toast + Spinner
└── js/
    ├── state.js                  Globale Variablen
    ├── defaults.js               Hardcoded Supabase-URL + Anon-Key
    ├── utils.js                  Hilfsfunktionen (esc, escJs, Toast, Bild-URLs, Modal)
    ├── ui.js                     confirmAction, setBusy, toast{Success,Error,Info}
    ├── settings.js               Nutzer-Einstellungen im LocalStorage
    ├── sets.js                   Scryfall-Sets-Cache
    ├── db.js                     Alle Supabase-Aufrufe
    ├── scryfall.js               Karten-Anreicherung
    ├── config.js                 Supabase-Setup-Screen, Screen-Wechsel
    ├── auth.js                   Login, Registrierung, Logout
    ├── csv-import.js             ManaBox-CSV Parser (mit Auto-Anreicherung)
    ├── collection.js             Sammlung: Filter, Grid/Liste, Karten-Modal
    ├── export.js                 CSV-Export + PDF-Druckansicht
    ├── deck-stats.js             Stats-Panel pro Deck
    ├── deck-validation.js        Commander-Validierung (alle 5 Regeln)
    ├── decks.js                  Decks-Übersicht, Detail, Karten-/Listen-Modus, Edit-Mode
    ├── price-tracking.js         Wöchentliche Snapshots, Scryfall-Live-Preise
    ├── stats.js                  Globale Statistik + Wertverlaufs-Chart
    └── app.js                    Orchestrierung: View-Wechsel, Mobile-Nav, Startup
```

## Wichtig: Reihenfolge der JS-Dateien

`index.html` lädt die JS-Dateien in einer bestimmten Reihenfolge.
Diese Reihenfolge nicht ändern, sonst funktioniert die App nicht:

1. `state.js` — globale Variablen müssen zuerst existieren
2. `defaults.js` — Hardcoded-Config wird in config.js gelesen
3. `utils.js` — Hilfsfunktionen (esc, escJs) werden überall genutzt
4. `ui.js` — confirmAction, setBusy, Toast-Varianten
5. `settings.js` — Nutzer-Einstellungen
6. `sets.js`, `db.js`, `scryfall.js`
7. `config.js`, `auth.js`, `csv-import.js`, `collection.js`, `export.js`, `deck-stats.js`, `deck-validation.js`, `decks.js`, `price-tracking.js`, `stats.js`
8. `app.js` — als Letztes, weil hier der Startup-Code läuft

## Wo ändere ich was?

| Möchtest du… | Bearbeite… |
|---|---|
| Farben, Schriften, Layout | Datei in `styles/` |
| Login-Verhalten | `js/auth.js` |
| CSV-Import-Logik | `js/csv-import.js` |
| Karten-Anreicherung (Scryfall) | `js/scryfall.js` |
| Filter/Anzeige der Sammlung | `js/collection.js` |
| Decks-Logik, Edit-Mode | `js/decks.js` |
| Pro-Deck-Statistik | `js/deck-stats.js` |
| Commander-Validierung | `js/deck-validation.js` |
| Globale Statistik + Wertverlauf | `js/stats.js` |
| Preis-Snapshots | `js/price-tracking.js` |
| CSV/PDF-Export | `js/export.js` |
| Bestätigungs-Modals, Toasts | `js/ui.js` |
| Texte/Buttons im HTML | `index.html` |
| Supabase-URL/Key | `js/defaults.js` |
| Auto-Versionierung | `.github/workflows/version-bump.yml` |

## Auto-Versionierung + Cache-Busting

Bei jedem Push auf `main` läuft eine GitHub Action, die:

1. Die Versionsnummer im Header (`v0.X`) auf die Anzahl der "echten" Commits setzt
2. An alle CSS- und JS-Imports einen `?v=X`-Query-Parameter anhängt

Damit lädt der Browser bei jedem Release frische Dateien — kein manuelles Strg+F5 mehr nötig.

Die Action ignoriert ihre eigenen Commits (markiert mit `[skip ci]`), damit sie keine Endlosschleife produziert.

## Datenbank-Schema

Beim ersten Setup oder wenn neue Spalten dazukommen, erscheint im UI ein Migrations-Banner mit dem benötigten SQL. Aktuelle Tabellen:

```
cards          standardfelder + mana_value, colors[], type_line,
                color_identity[], legal_commander
decks          standardfelder + category_order[]
deck_cards     deck_id, card_id, category, quantity
price_snapshots user_id, snapshot_date, total_value, card_count
                (unique pro user_id+snapshot_date)
```

Alle Tabellen haben Row Level Security (RLS) Policies — jeder Nutzer sieht nur eigene Daten.

## Lokale Entwicklung

GitHub Pages liefert die Dateien direkt aus — kein Build-Step nötig.

Für lokales Testen einen einfachen HTTP-Server starten (nicht via `file://` öffnen,
sonst werden die externen Dateien nicht geladen):

```bash
python3 -m http.server 8000
# oder
npx serve
```

Dann im Browser `http://localhost:8000` öffnen.

## Tipps für die Bearbeitung

**Inline-Eventhandler & Apostrophen**: Wenn du in einem Template-String einen `onclick="foo('${name}')"` einbaust und der Inhalt von `name` einen Apostroph enthalten kann (z.B. Karten-Namen wie *Morningtide's Light*), nutze `escJs(name)` statt `esc(name)`. `esc()` ist HTML-Escape und produziert `&#39;`, was beim Browser-Parsen wieder zu `'` wird und das JS-String-Literal beendet. `escJs()` macht die richtige Maskierung mit Backslash für JS.

**State im Deck-Detail**: Edit-Modus, View-Modus und eingeklappte Kategorien sind in `state.js` verwaltet (`deckEditMode`, `deckViewMode`, `deckCollapsedCategories`, `deckEditSelected`). Beim Schließen des Decks werden diese Werte zurückgesetzt — beim Wechsel zwischen Decks bleibt aber der View-Modus bestehen.
