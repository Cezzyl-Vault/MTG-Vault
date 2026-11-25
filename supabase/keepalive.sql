-- ══════════════════════════════════════════════════════════
--  Keep-Alive (.github/workflows/supabase-keepalive.yml)
-- ══════════════════════════════════════════════════════════
--  Einmalig im Supabase-Dashboard ausführen:
--  SQL Editor → New query → diesen Inhalt einfügen → Run.
--  Darf mehrfach ausgeführt werden (legt nichts doppelt an).
--
--  Warum: Kostenlose Projekte werden pausiert, wenn eine Woche lang zu
--  wenig Datenbank-Aktivität da ist. Eine Leseabfrage ohne Login, die
--  wegen Row Level Security nur [] liefert, hat dafür nicht gereicht.
--  Diese Funktion SCHREIBT bei jedem Aufruf eine Zeile – echte Arbeit
--  für die Datenbank.
--
--  Sicherheit: Die Tabelle enthält nur Zeitpunkt und Zähler, keine
--  Nutzerdaten. Ohne Login darf man ausschließlich diese eine Funktion
--  aufrufen; die Tabelle selbst ist für alle gesperrt (RLS ohne Policy).

create table if not exists public.keepalive (
  id         int primary key default 1 check (id = 1),   -- immer genau eine Zeile
  pinged_at  timestamptz not null default now(),
  pings      bigint not null default 0
);

alter table public.keepalive enable row level security;
-- absichtlich keine Policy: direkter Zugriff auf die Tabelle ist gesperrt

create or replace function public.keepalive_ping()
returns json
language sql
security definer
set search_path = public
as $$
  insert into public.keepalive (id, pinged_at, pings)
  values (1, now(), 1)
  on conflict (id) do update
    set pinged_at = now(), pings = public.keepalive.pings + 1
  returning json_build_object('pinged_at', pinged_at, 'pings', pings);
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
