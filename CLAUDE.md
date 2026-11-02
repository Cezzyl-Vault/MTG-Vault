# MTG Vault – Regeln für Claude

## Sprache

Antworte immer auf Deutsch. Auch alle Texte in der App (Buttons, Hinweise,
Toasts, Fehlermeldungen) sowie Code-Kommentare und Commit-Nachrichten sind
auf Deutsch, solange nicht ausdrücklich etwas anderes gewünscht ist.

## Nur legal spielbare Druckungen

Wenn die App Karten-Druckungen von Scryfall auswählt, vergleicht oder bewertet
(z.B. günstigste Druckung, Preisalarm, Marktwert, Kartensuche), zählen nur
Druckungen, die man legal spielen darf. Ausgeschlossen sind:

- Goldrand (`border_color: "gold"`, z.B. World Championship Decks)
- Silberrand (`border_color: "silver"`, Un-Sets)
- Sammler-Sets mit `set_type: "memorabilia"` (z.B. Collectors' Edition,
  30th Anniversary Edition, Art Series)
- Token (`set_type: "token"`) und Fun-Sets (`set_type: "funny"`)
- Übergroße Karten (`oversized: true`) und reine Online-Karten (`digital: true`)

Dafür gibt es bereits `isPlayablePrint(p)` in `js/wishlist.js`. Neue Stellen,
die Druckungen auswählen, sollen diese Funktion nutzen statt eigene Regeln zu bauen.
Karten, die der Nutzer selbst besitzt, werden davon nicht gefiltert — nur die
automatische Auswahl von Druckungen.
