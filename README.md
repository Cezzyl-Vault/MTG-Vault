# MTG Vault

Magic: The Gathering Sammlungs-Manager mit Supabase-Backend.

## Projektstruktur

```
MTG-Vault/
├── index.html              ← HTML-Skelett (Markup + externe Datei-Referenzen)
├── styles/
│   ├── base.css            Variablen, Body, Hintergrund-Texturen, Scrollbar
│   ├── auth.css            Setup-Screen + Login/Registrierung
│   ├── header.css          Header, Desktop-Navigation, Mobile-Drawer
│   ├── collection.css      Filter, Karten-Grid, Listen-Ansicht
│   ├── stats.css           KPIs, Bar-Charts, Zustands-Badges
│   ├── decks.css           Decks-Übersicht + Deck-Detailansicht
│   └── modals.css          Modals, Toast, kleine Dialog-Variante
└── js/
    └── app.js              Komplette App-Logik (wird in nächstem Schritt gesplittet)
```

## Lokale Entwicklung

GitHub Pages liefert die Dateien direkt aus – kein Build-Step nötig.

Für lokales Testen einen einfachen HTTP-Server starten (nicht via `file://` öffnen,
sonst funktionieren die externen Datei-Referenzen nicht):

```bash
# Mit Python
python3 -m http.server 8000

# Oder mit Node
npx serve
```

Dann im Browser `http://localhost:8000` öffnen.

## Geplante Module (folgender Refactor-Schritt)

`js/app.js` wird in folgende Module aufgeteilt:

- `state.js`           globaler App-State
- `config.js`          Supabase-Config + Screen-Switching
- `auth.js`            Login, Signup, Logout
- `db.js`              alle Supabase-Calls (CRUD)
- `csv-import.js`      CSV-Parser (ManaBox-Format)
- `collection.js`      Filter + Render der Sammlung
- `card-modal.js`      Karten-Detail-Modal + Bearbeiten
- `decks.js`           Decks-Übersicht + Deck-Detail + Kategorien
- `stats.js`           Statistik-Berechnung + Render
- `ui.js`              Toast, Modal-Helpers, View-Switching, Mobile-Nav
