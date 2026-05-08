// ══════════════════════════════════════════════════════════
//  STATE  ·  Globale Variablen, die sich App-weit teilen
// ══════════════════════════════════════════════════════════

// Schlüssel, unter dem die Supabase-Konfiguration im Browser-Speicher liegt
const CFG_KEY = 'mtgvault_cfg_v2';

// Supabase-Client (wird beim Start initialisiert) und aktuell eingeloggter Nutzer
let _sb = null, currentUser = null;

// Sammlung, Decks und Karten des aktuell offenen Decks
let allCards = [], allDecks = [], currentDeckCards = [];

// Aktuelle Filter-Ergebnisse und Anzeige-Modus (Grid oder Liste)
// Hinweis: `filtered` ist seit der Group-Logik unbenutzt. Die aktive Liste
// heißt jetzt `filteredGroups` und wird in collection.js verwaltet.
let filtered = [], viewMode = 'grid';

// IDs für gerade bearbeitete Karte / bearbeitetes Deck / offenes Deck
let editingCardId = null, editingDeckId = null, activeDeckId = null;

// Auth-Modus: 'login' oder 'signup'
let authMode = 'login';

// Hilfsvariable für Kategorie-Modal (aktuell ungenutzt, für künftige Erweiterungen)
let pendingCatDeckId = null;

// Deck-Detail Anzeige- und Editiermodus
// deckViewMode: 'cards' (Bilder-Grid) oder 'list' (klassische Listen-Zeilen)
// deckEditMode: zeigt Checkboxen, Lösch-Buttons pro Karte, Multi-Select-Aktionen
// deckEditSelected: Set der dc-IDs, die im Edit-Modus markiert sind
// deckCollapsedCategories: Kategorien, die der User für dieses Deck eingeklappt hat
let deckViewMode = 'cards';
let deckEditMode = false;
let deckEditSelected = new Set();
let deckCollapsedCategories = new Set();

// HINWEIS: Manche Module verwalten zusätzlichen lokalen State in ihrer eigenen Datei,
// z.B. `addCardsSelected` (Set) in decks.js für die Karten-Auswahl im Add-Modal.
// Das ist Absicht — solche kurzlebigen UI-Zustände gehören zum Modul, das sie nutzt.
