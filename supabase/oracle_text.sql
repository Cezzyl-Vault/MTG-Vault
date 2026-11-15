-- MTG Vault · Kartentext (Oracle-Text) für die Volltextsuche
-- Einmal im Supabase-Dashboard unter „SQL Editor“ ausführen.
-- Danach in der App auf „Jetzt anreichern“ tippen, damit der Text
-- für alle vorhandenen Karten nachgeladen wird.

alter table cards add column if not exists oracle_text text;
