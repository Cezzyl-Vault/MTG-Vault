# MTG Vault

## Todo

- [x] Beim Öffnen der App erkennen, ob Supabase pausiert ist, und einen Button zum Aktivieren
  anzeigen (Stufe 1: Link zum „Restore" im Dashboard, automatisches Neu-Prüfen alle 15 s)
- [ ] Stufe 2: Datenbank direkt aus der App per Klick aufwecken
  - Hinweis: Ein pausiertes Projekt lässt sich nur über die Supabase Management API mit
    einem Access Token wieder starten. Der darf nicht in den öffentlichen Browser-Code —
    braucht also einen Umweg, z.B. eine kleine Serverless-Funktion, die das Token geheim hält.
    Vorher prüfen, ob die API das Wiederherstellen kostenloser Projekte erlaubt

Magic: The Gathering Sammlungs-Manager mit Supabase-Backend.

Hostet auf GitHub Pages, alle App-Logik im Browser, Daten in Supabase.

## Features

**Karten in die Sammlung bringen** (zwei Wege)
- **CSV-Import** (ManaBox-Format): dedupliziert intelligent (Set+Sammlernr+Foil+Sprache), zeigt Live-Fortschritt bei der Anreicherung, lädt die Sammlung auch bei Teilfehlern korrekt neu
- **Manuell per Suche** („＋ Karte hinzufügen", prominent oben in der Sammlung + im Header): Scryfall-Autocomplete → Druckung wählen (mit Bild + EUR-Preis) → Foil/Zustand/Sprache/Anzahl/Kaufpreis setzen. Existiert die Variante schon, wird die Menge erhöht statt doppelt angelegt
- Beide Wege reichern automatisch an: Manawert, Farben, Kartentyp, Farbidentität, Commander-Legalität (von Scryfall)

**Sammlung**
- Erweiterte Filter: Manawert (Pills 0–5+), Farben (Mana-Symbole WUBRG + ◇), Kartentyp, Foil, Set, Zustand, Seltenheit
- Karten-Gruppierung: gleiche Namen werden zu einem Tile zusammengefasst
- Stats-Bar mit Einträge/Karten/Wert
- Klick auf Karte → Modal mit allen Varianten als Tabelle
- **Pro Variante einen "+ Deck"-Button**: jede einzelne Druckung kann gezielt zu einem Deck hinzugefügt werden (mit Mengen-Eingabe)
- Export als CSV oder druckbares PDF (respektiert aktive Filter)

**Decks**
- Übersicht mit Karten-Anzahl, Wert €, Ø Manawert, Farb-Punkten pro Deck
- **Karten hinzufügen wie bei deckstats.net**: In jeder Kategorie (und in „Ohne Kategorie") gibt es ein Tippfeld. Kartennamen tippen → Vorschläge (Scryfall-Autocomplete) → anklicken oder Enter → die Karte landet sofort in genau dieser Kategorie. Das Feld bleibt fokussiert, sodass man mehrere Karten zügig hintereinander eintippen kann; daneben ein Anzahl-Feld. Es lassen sich beliebige Karten hinzufügen — **auch solche, die man (noch) nicht besitzt**
- **„Fehlt"-Markierung**: Karten, die in keinem Sammlungs-Eintrag vorkommen, werden abgedunkelt mit rotem „fehlt"-Badge angezeigt (Listen-Ansicht: „fehlt"-Tag). Der Abgleich läuft live über den Kartennamen — wer die Karte später kauft und importiert, sieht die Markierung automatisch verschwinden
- **In welchen Decks steckt eine Karte?** Das Karten-Fenster der Sammlung zeigt unter „In Decks" alle Decks mit dieser Karte (Kategorie + Anzahl, Klick öffnet das Deck). Brauchen die Decks zusammen mehr Exemplare, als du besitzt, erscheint eine Warnung (Basic Lands ausgenommen)
- **Deckliste als Text**: „⇩ Liste importieren" in der Decks-Übersicht legt aus einer eingefügten Liste ein neues Deck an; „⇅ Liste" im Deck exportiert es als Text (mit Kategorien, einfach für Moxfield/Archidekt oder im MTG-Arena-Format, optional mit Set + Nummer) und fügt Karten aus einer Liste hinzu. Versteht „1 Sol Ring", „1x Sol Ring (C21) 263", Archidekt-Kategorien „[Ramp]", Überschriften wie „// Ramp" oder „Commander" sowie MTGO-„SB:"-Zeilen. Nicht gefundene Karten bleiben zum Korrigieren im Feld stehen
- **Fehlt-Liste**: „✦ Fehlende" im Deck (pro Deck) bzw. „✦ Fehlende Karten" in der Decks-Übersicht (über alle Decks) zeigt alle nicht besessenen Karten mit Mengen — kopierbar und als .txt herunterladbar (z.B. als Einkaufsliste)
- Karten-Detail mit zwei Ansichten:
  - **Karten-Ansicht** (Standard): Bilder als Grid, klickbar für Detail-Modal
  - **Listen-Ansicht**: kompakte Zeilen
- **Karten-Größe konfigurierbar** (Klein/Mittel/Groß) — siehe Settings
- **Karten gleichen Namens werden zusammengefasst** dargestellt (z.B. 4× Insel aus 3 Sets = ein Tile mit ×4)
- **Anzahl-Pille** auf jeder Karte immer sichtbar (×N)
- **Bearbeiten-Modus** mit Multi-Select für Verschieben/Entfernen mehrerer Karten gleichzeitig
- **Klick auf eine Deck-Karte** öffnet ein schlichtes Deck-Fenster: Bild, Anzahl (−/＋), Kategorie, „Speichern", „Entfernen", Scryfall-Link und ob die Karte in der Sammlung ist. Keine Sammlungs-Varianten-Tabelle mehr. Im Edit-Modus erfolgt die Mehrfach-Auswahl weiterhin über die Checkbox-Overlay
- **"Alle markieren"-Button** pro Kategorie im Edit-Modus (Toggle)
- Kategorien sortierbar via ▲▼-Pfeile (nur im Edit-Modus sichtbar)
- Kategorien einklappbar via Klick auf Header
- Karten ohne Kategorie landen in "Ohne Kategorie"-Sektion oben
- **Visueller Move-Picker**: Karten verschieben über klickbare Kategorien-Liste (statt Texteingabe)
- **Entkoppelt von der Sammlung**: Ein Deck ist eine reine Kartenliste (Name + Anzahl + Kategorie). Ob du eine Karte besitzt, ist nur eine Anzeige-Info (die „fehlt"-Markierung), kein Fundament — Karten verschwinden nicht aus Decks, wenn sich die Sammlung ändert. In der Sammlung gibt es zusätzlich pro Karte einen „+ Deck"-Knopf als Schnellweg

**Statistik pro Deck** (einklappbar)
- KPIs: Karten / Ø Manawert / Deckwert
- Mana-Kurve (ohne Länder)
- Farbverteilung (ohne Länder)
- Typenverteilung
- Zählt auch nicht besessene Karten mit (Deckwert nur für besessene, da Kaufpreis nur dort bekannt)

**Commander-Validierung** (nur bei Format = Commander)
- Karten-Anzahl: 100 Hauptdeck + Sideboard separat
- Singleton-Regel (außer Basic Lands, gilt über Hauptdeck + Sideboard)
- Format-Legalität pro Karte (Scryfall)
- Banlist (Scryfall)
- Farbidentität (Karten in Kategorie "Commander" definieren erlaubte Farben)
- Geschützte "Commander"-Kategorie mit 👑
- Prüft auch nicht besessene Karten (deren Legalitäts-Daten werden beim Hinzufügen mitgespeichert)
- Nur außerhalb des Bearbeiten-Modus sichtbar (im Edit-Modus ausgeblendet)

**Statistik global**
- Karten/Einträge/Sets/Foils/Decks, Kaufwert und aktueller **Marktwert**
- **Marktwert-Bereich**: Gewinn/Verlust gegenüber dem Kaufpreis (nur Karten mit Kaufpreis), Top 10 der wertvollsten Karten, größte Gewinner und Verlierer; „↻ Preise" lädt neu. Das Karten-Fenster zeigt pro Variante „jetzt X €" mit Gewinn/Verlust. Preise kommen von Scryfall (Cardmarket) und werden pro Gerät 24 Stunden zwischengespeichert
- Wertentwicklung als Linechart (wöchentliche Snapshots, Live-Preise von Scryfall; Foils nutzen den Foil-Preis)
- Seltenheit, Top Sets, Sprachen, Zustände als Bar-Charts

**Konto & Einstellungen**
- E-Mail/Passwort-Login und Registrierung (Supabase Auth), Logout
- **Anmeldelink per E-Mail** (Login ohne Passwort, siehe [Anmelden ohne Passwort](#anmelden-ohne-passwort))
- Angemeldet bleibt man pro Gerät dauerhaft, bis man sich abmeldet oder die Browserdaten löscht
- Settings-Modal: Start-Reiter beim App-Start und Karten-Größe im Deck konfigurierbar (gespeichert im LocalStorage des Browsers)
- **Backup herunterladen** (im Settings-Modal): Sammlung, Decks, Deck-Karten und Preisverlauf als JSON-Datei

**UX**
- **Als App installierbar** (PWA): eigenes Icon auf dem Startbildschirm, startet ohne Browserleiste, öffnet auch offline (siehe [Als App aufs Handy](#als-app-aufs-handy))
- Bottom-Navigation auf Mobile
- Karten-Modal mit Sticky-"Schließen"-Button unten
- Bestätigungs-Modals im App-Stil
- Lade-Indikatoren auf Buttons
- Semantische Toasts (✓/⚠/ℹ)
- Supabase-Verbindung fest in `js/defaults.js` (kein Setup-Bildschirm)
- Auto-Cache-Busting bei jedem Release

## Projektstruktur

```
MTG-Vault/
├── index.html                    HTML-Skelett + Datei-Referenzen
├── manifest.webmanifest          App-Name, Farben, Icons für die Installation (PWA)
├── sw.js                         Service Worker: Netz zuerst, offline aus dem Cache
├── icons/                        App-Icons (192/512, maskable, Apple, Favicon)
├── README.md                     diese Datei
├── .github/workflows/
│   ├── version-bump.yml          Auto-Versionierung + Cache-Busting
│   └── supabase-keepalive.yml    Hält das Supabase-Projekt wach (alle 3 Tage)
├── styles/
│   ├── base.css                  Variablen, Body, Hintergrund, Scrollbar
│   ├── auth.css                  Logo, Login/Registrierung, DB-Status-Bildschirm
│   ├── header.css                Header, Desktop-Nav, Mobile-Drawer, Bottom-Nav
│   ├── collection.css            Filter, Karten-Grid, Listen-Ansicht, Export-Buttons
│   ├── stats.css                 KPIs, Bar-Charts, Preis-Linechart
│   ├── decks.css                 Decks-Übersicht + Detail (incl. Karten-Grid, Edit-Mode)
│   └── modals.css                Modals + Toast + Spinner, „In Decks"-Block
└── js/
    ├── state.js                  Globale Variablen
    ├── defaults.js               Hardcoded Supabase-URL + Anon-Key
    ├── utils.js                  Hilfsfunktionen (esc, escJs, Toast, Bild-URLs, Modal)
    ├── ui.js                     confirmAction, setBusy, toast{Success,Error,Info}
    ├── settings.js               Nutzer-Einstellungen im LocalStorage
    ├── sets.js                   Scryfall-Sets-Cache
    ├── db.js                     Alle Supabase-Aufrufe
    ├── scryfall.js               Karten-Anreicherung
    ├── config.js                 Supabase-Verbindung, Screen-Wechsel, DB-Status-Bildschirm
    ├── auth.js                   Login, Registrierung, Anmeldelink per E-Mail, Logout
    ├── csv-import.js             ManaBox-CSV Parser (mit Auto-Anreicherung)
    ├── add-card.js               Karte manuell per Scryfall-Suche hinzufügen
    │                             (selbstständig: injiziert eigenes Modal, CSS + Buttons)
    ├── collection.js             Sammlung: Filter, Grid/Liste, Karten-Modal (inkl. „In Decks")
    ├── export.js                 CSV-Export + PDF-Druckansicht
    ├── deck-stats.js             Stats-Panel pro Deck
    ├── deck-validation.js        Commander-Validierung (alle 5 Regeln)
    ├── decks.js                  Decks-Übersicht, Detail, Karten-/Listen-Modus, Edit-Mode,
    │                             Tippfeld-Hinzufügen pro Kategorie, Deck-Karten-Fenster,
    │                             "fehlt"-Markierung + Fehlt-Liste
    ├── deck-list.js              Deckliste als Text: Export (3 Formate) + Import
    │                             (selbstständig: injiziert eigenes Modal + CSS)
    ├── price-tracking.js         Wöchentliche Snapshots, aktuelle Preise pro Karte (24-h-Cache)
    ├── stats.js                  Globale Statistik, Marktwert + Top-Listen, Wertverlaufs-Chart
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
7. `config.js`, `auth.js`, `csv-import.js`, `add-card.js`, `collection.js`, `export.js`, `deck-stats.js`, `deck-validation.js`, `decks.js`, `deck-list.js` (nach `decks.js`, nutzt dessen Helfer), `price-tracking.js`, `stats.js`
8. `app.js` — als Letztes, weil hier der Startup-Code läuft

Statistik (`deck-stats.js`) und Validierung (`deck-validation.js`) lösen Deck-Karten
über `resolveDeckCard` aus `decks.js` auf. Das passiert erst zur Laufzeit, daher ist
die Ladereihenfolge zwischen diesen drei Dateien egal.

## Wo ändere ich was?

| Möchtest du… | Bearbeite… |
|---|---|
| Farben, Schriften, Layout | Datei in `styles/` |
| Login-Verhalten | `js/auth.js` |
| CSV-Import-Logik | `js/csv-import.js` |
| Karte-per-Suche-hinzufügen | `js/add-card.js` |
| Karten-Anreicherung (Scryfall) | `js/scryfall.js` |
| Filter/Anzeige der Sammlung | `js/collection.js` |
| Decks-Logik, Tippfeld-Hinzufügen, Deck-Karten-Fenster, Fehlt-Liste | `js/decks.js` |
| Deckliste importieren/exportieren (Formate, Parser) | `js/deck-list.js` |
| Pro-Deck-Statistik | `js/deck-stats.js` |
| Commander-Validierung | `js/deck-validation.js` |
| Globale Statistik + Wertverlauf | `js/stats.js` |
| Preis-Snapshots, aktuelle Preise pro Karte | `js/price-tracking.js` |
| CSV/PDF-Export, Komplett-Backup | `js/export.js` |
| Bestätigungs-Modals, Toasts | `js/ui.js` |
| Texte/Buttons im HTML | `index.html` |
| Supabase-URL/Key (Projekt wechseln) | `js/defaults.js` |
| Auto-Versionierung | `.github/workflows/version-bump.yml` |
| Wachhalte-Rhythmus für Supabase | `.github/workflows/supabase-keepalive.yml` |

## Auto-Versionierung + Cache-Busting

Bei jedem Push auf `main` läuft eine GitHub Action, die:

1. Die Versionsnummer im Header (`v0.X`) auf die Anzahl der "echten" Commits setzt
2. An alle CSS- und JS-Imports einen `?v=X`-Query-Parameter anhängt

Damit lädt der Browser bei jedem Release frische Dateien — kein manuelles Strg+F5 mehr nötig.

Die Action ignoriert ihre eigenen Commits (markiert mit `[skip ci]`), damit sie keine Endlosschleife produziert.

## Supabase wachhalten

Kostenlose Supabase-Projekte werden nach 7 Tagen ohne Aktivität pausiert. Die Action
`supabase-keepalive.yml` schickt deshalb alle 3 Tage eine kleine Abfrage an die
Tabelle `cards`. URL und Anon-Key liest sie aus `js/defaults.js` — es sind keine
Secrets nötig, und ohne Login liefert die Abfrage dank RLS keine Daten.

- **Manuell starten**: GitHub → Actions → „Supabase Keep-Alive" → „Run workflow"
- **Lauf ist rot**: Projekt ist vermutlich pausiert → im Supabase-Dashboard „Restore" klicken
- **In der App**: Ist die Datenbank beim Start (oder beim Laden/Login) nicht erreichbar, zeigt
  die App statt Fehlern einen eigenen Bildschirm mit Button zum Dashboard und prüft alle
  15 Sekunden automatisch, ob sie wieder läuft (`checkDbReachable` in `js/db.js`,
  Bildschirm-Logik in `js/config.js`)
- **60-Tage-Regel**: GitHub deaktiviert Zeitplan-Actions, wenn 60 Tage lang kein Commit
  im Repo passiert. Vorher kommt eine Warn-Mail; reaktivieren per Klick auf „Enable workflow"

## Als App aufs Handy

- **Android (Chrome)**: Seite öffnen → Menü ⋮ → „App installieren" bzw. „Zum Startbildschirm hinzufügen"
- **iPhone (Safari)**: Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm"
- **PC (Chrome/Edge)**: Installations-Symbol rechts in der Adressleiste

Die App startet dann mit eigenem Icon und ohne Browserleiste. Der Service Worker
(`sw.js`) lädt jede Datei zuerst frisch aus dem Netz — Updates kommen also wie gewohnt
sofort an. Nur ohne Internet nimmt er die zuletzt geladene Kopie, damit die App trotzdem
startet und „Keine Internetverbindung" anzeigt. Datenbank- und Scryfall-Anfragen werden
nicht zwischengespeichert. Icons neu erzeugen: Bilder in `icons/` ersetzen (gleiche Namen
und Größen).

Hinweis iPhone: Eine vom Home-Bildschirm gestartete App hat eigenen Speicher, getrennt
von Safari — dort muss man sich einmal separat anmelden.

## Anmelden ohne Passwort

Auf dem Login-Bildschirm E-Mail eingeben und „✉ Anmeldelink per E-Mail schicken“ klicken.
Supabase schickt einen Link, der zurück zur App führt und das Gerät dauerhaft anmeldet
(`sendMagicLink` in `js/auth.js`). Per Link lässt sich nur ein **bestehendes** Konto
anmelden, kein neues anlegen.

Einmalig im Supabase-Dashboard einstellen:

- **Authentication → URL Configuration**: Site URL `https://cezzyl-vault.github.io/MTG-Vault/`,
  unter Redirect URLs `https://cezzyl-vault.github.io/MTG-Vault/**` und zum lokalen Testen
  `http://localhost:8000/**` eintragen. Sonst führt der Link nicht zur App zurück.
- **Empfohlen – Authentication → Sign In / Providers → Email**: „Allow new users to sign up“
  ausschalten, damit niemand sonst ein Konto anlegen kann.
- E-Mail-Adresse vergessen? Steht unter **Authentication → Users**.

Der kostenlose Supabase-Mailversand schickt nur wenige Mails pro Stunde. Kommt keine Mail,
ein paar Minuten warten (auch den Spam-Ordner prüfen). Der Link ist nur kurz gültig und
nur einmal benutzbar.

## Datenbank-Schema

Neue Spalten oder Tabellen werden im Supabase-Dashboard (SQL Editor) angelegt. Fehlen
bei Karten angereicherte Daten (Manawert, Farben, Typ …), bietet ein Banner in der
Sammlung an, sie von Scryfall nachzuladen. Aktuelle Tabellen:

```
cards          standardfelder + mana_value, colors[], type_line,
                color_identity[], legal_commander
decks          standardfelder + category_order[]
deck_cards     deck_id, card_id (nullable!), category, quantity
                + eigene Karten-Identität für nicht besessene Karten:
                card_name, scryfall_id, set_code, set_name,
                collector_number, rarity, mana_value, colors[],
                color_identity[], type_line, legal_commander
price_snapshots user_id, snapshot_date, total_value, card_count
                (unique pro user_id+snapshot_date)
```

Zum `deck_cards`-Design: Jede Zeile trägt ihre Karten-Identität selbst
(`card_name`, `scryfall_id`, …) und hat `card_id = NULL` — egal ob sie über das
Tippfeld oder über „+ Deck" in der Sammlung entstanden ist. Das Deck funktioniert
damit auch als Wunschliste, und Löschen in der Sammlung lässt Decks unberührt.
Ob eine Karte "besessen" ist, wird zur Laufzeit per Namensabgleich mit der
Sammlung ermittelt (nicht gespeichert); dabei wird bevorzugt dieselbe Druckung
(`scryfall_id`) angezeigt.

`card_id` ist eine Altlast: Früher speicherte „+ Deck" nur diesen Verweis, und
wegen `on delete cascade` verschwand die Deck-Karte mit der Sammlungskarte. Solche
Zeilen stellt die App nach dem Login einmalig um (`migrateLegacyDeckCards` in
`js/decks.js`, mit Rückfrage und vorherigem Backup).

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

**Selbst-injizierende Module**: `add-card.js` und der Erweiterungs-Block am Ende
von `decks.js` fügen ihre Modals, Styles und Buttons selbst ins DOM ein. Vorteil:
neue Features brauchen keine `index.html`-Änderung. Wer deren Aussehen ändern
will, sucht das CSS also in der jeweiligen JS-Datei (Style-Tags `#acs-styles`
in add-card.js bzw. `#dx-styles` und `#dx2-styles` in decks.js), nicht in `styles/`.
