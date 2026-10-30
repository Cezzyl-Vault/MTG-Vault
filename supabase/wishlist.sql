-- ══════════════════════════════════════════════════════════
--  Wunschliste (js/wishlist.js)
-- ══════════════════════════════════════════════════════════
--  Einmalig im Supabase-Dashboard ausführen:
--  SQL Editor → New query → diesen Inhalt einfügen → Run.
--  Darf mehrfach ausgeführt werden (legt nichts doppelt an).

create table if not exists public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_name   text not null,
  max_price   numeric(10,2),          -- Wunschpreis in €, leer = nur beobachten
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, card_name)
);

-- Jeder Nutzer sieht und ändert nur seine eigenen Einträge
alter table public.wishlist enable row level security;

drop policy if exists "wishlist_select_own" on public.wishlist;
drop policy if exists "wishlist_insert_own" on public.wishlist;
drop policy if exists "wishlist_update_own" on public.wishlist;
drop policy if exists "wishlist_delete_own" on public.wishlist;

create policy "wishlist_select_own" on public.wishlist
  for select using (auth.uid() = user_id);
create policy "wishlist_insert_own" on public.wishlist
  for insert with check (auth.uid() = user_id);
create policy "wishlist_update_own" on public.wishlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wishlist_delete_own" on public.wishlist
  for delete using (auth.uid() = user_id);
