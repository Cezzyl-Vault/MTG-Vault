// ══════════════════════════════════════════════════════════
//  STATE  ·  Globale Variablen, die sich App-weit teilen
// ══════════════════════════════════════════════════════════

// Schlüssel, unter dem die Supabase-Konfiguration im Browser-Speicher liegt
const CFG_KEY = 'mtgvault_cfg_v2';

// Supabase-Client (wird beim Start initialisiert) und aktuell eingeloggter Nutzer
let _sb = null, currentUser = null;

// Sammlung, Decks und Karten des aktuell offenen Decks
let allCards = [], allDecks = [], currentDeckCards = [];

// Anzeige-Modus der Sammlung (Grid oder Liste). Die gefilterte Liste
// heißt `filteredGroups` und wird in collection.js verwaltet.
let viewMode = 'grid';

// IDs für gerade bearbeitete Karte / bearbeitetes Deck / offenes Deck
let editingCardId = null, editingDeckId = null, activeDeckId = null;

// Auth-Modus: 'login' oder 'signup'
let authMode = 'login';

// deckViewMode: 'cards' (Bilder-Grid) oder 'list' (klassische Listen-Zeilen)
// deckEditMode: zeigt Checkboxen, Lösch-Buttons pro Karte, Multi-Select-Aktionen
// deckEditSelected: Set der dc-IDs, die im Edit-Modus markiert sind
// deckCollapsedCategories: Kategorien, die der User für dieses Deck eingeklappt hat
let deckViewMode = 'cards';
let deckEditMode = false;
let deckEditSelected = new Set();
let deckCollapsedCategories = new Set();

// HINWEIS: Manche Module verwalten zusätzlichen lokalen State in ihrer eigenen Datei,
// z.B. `movePickerDcIds` in decks.js für den Kategorie-Wähler.
// Das ist Absicht — solche kurzlebigen UI-Zustände gehören zum Modul, das sie nutzt.
