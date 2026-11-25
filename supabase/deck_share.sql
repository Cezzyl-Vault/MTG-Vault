-- ══════════════════════════════════════════════════════════
--  Decks teilen per Link (js/share.js)
-- ══════════════════════════════════════════════════════════
--  Einmalig im Supabase-Dashboard ausführen:
--  SQL Editor → New query → diesen Inhalt einfügen → Run.
--  Darf mehrfach ausgeführt werden (legt nichts doppelt an).
--
--  Ein Deck bekommt beim Teilen einen zufälligen Schlüssel (share_token).
--  Wer den Link …/?deck=<share_token> kennt, kann GENAU DIESES Deck lesen –
--  ohne Konto. Mehr nicht:
--    - keine Liste aller geteilten Decks, nichts zum Durchprobieren
--    - nur lesen, nichts ändern
--    - keine Kaufpreise, keine Sammlungsdaten, keine Nutzer-ID
--  „Link deaktivieren" setzt share_token auf null → der Link ist sofort tot.

alter table public.decks add column if not exists share_token uuid unique;

create or replace function public.get_shared_deck(t uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'name',           d.name,
    'format',         d.format,
    'description',    d.description,
    'category_order', d.category_order,
    'cards', coalesce((
      select json_agg(json_build_object(
        'id',               dc.id,
        'category',         dc.category,
        'quantity',         dc.quantity,
        -- Alte Zeilen (nur card_id-Verweis) bekommen die Daten der Sammlungskarte
        'card_name',        coalesce(dc.card_name, c.name),
        'scryfall_id',      coalesce(dc.scryfall_id, c.scryfall_id),
        'set_code',         coalesce(dc.set_code, c.set_code),
        'set_name',         coalesce(dc.set_name, c.set_name),
        'collector_number', coalesce(dc.collector_number, c.collector_number),
        'rarity',           coalesce(dc.rarity, c.rarity),
        'mana_value',       coalesce(dc.mana_value, c.mana_value),
        'colors',           coalesce(dc.colors, c.colors),
        'color_identity',   coalesce(dc.color_identity, c.color_identity),
        'type_line',        coalesce(dc.type_line, c.type_line)
      ))
      from public.deck_cards dc
      left join public.cards c on c.id = dc.card_id
      where dc.deck_id = d.id
    ), '[]'::json)
  )
  from public.decks d
  where t is not null and d.share_token = t;
$$;

revoke all on function public.get_shared_deck(uuid) from public;
grant execute on function public.get_shared_deck(uuid) to anon, authenticated;
