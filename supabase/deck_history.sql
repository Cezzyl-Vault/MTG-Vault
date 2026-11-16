-- ══════════════════════════════════════════════════════════
--  Versionshistorie der Decks (js/deck-history.js)
-- ══════════════════════════════════════════════════════════
--  Einmalig im Supabase-Dashboard ausführen:
--  SQL Editor → New query → diesen Inhalt einfügen → Run.
--  Darf mehrfach ausgeführt werden (legt nichts doppelt an).
--
--  Jede Zeile ist ein Stand eines Decks: alle Deck-Karten als JSON.
--  Wird das Deck gelöscht, verschwindet auch sein Verlauf.

create table if not exists public.deck_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id     uuid not null references public.decks(id) on delete cascade,
  note        text,                   -- z.B. „Ausgangsstand", „Vor dem Wiederherstellen"
  cards       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists deck_history_deck_idx on public.deck_history (deck_id, created_at desc);

-- Jeder Nutzer sieht und ändert nur seinen eigenen Verlauf
alter table public.deck_history enable row level security;

drop policy if exists "deck_history_select_own" on public.deck_history;
drop policy if exists "deck_history_insert_own" on public.deck_history;
drop policy if exists "deck_history_update_own" on public.deck_history;
drop policy if exists "deck_history_delete_own" on public.deck_history;

create policy "deck_history_select_own" on public.deck_history
  for select using (auth.uid() = user_id);
create policy "deck_history_insert_own" on public.deck_history
  for insert with check (auth.uid() = user_id);
create policy "deck_history_update_own" on public.deck_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "deck_history_delete_own" on public.deck_history
  for delete using (auth.uid() = user_id);
