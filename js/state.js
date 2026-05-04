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
let filtered = [], viewMode = 'grid';

// IDs für gerade bearbeitete Karte / bearbeitetes Deck / offenes Deck
let editingCardId = null, editingDeckId = null, activeDeckId = null;

// Auth-Modus: 'login' oder 'signup'
let authMode = 'login';

// Hilfsvariable für Kategorie-Modal (aktuell ungenutzt, für künftige Erweiterungen)
let pendingCatDeckId = null;
