# Issue #13 QA Evidence Checklist

Ziel: 5 prüfbare Nachweise mit minimaler Last.

## Nachweis 1: Migration erfolgreich angewendet

Schritte
1. In Projektroot ausführen: npx --yes supabase db push
2. Danach in SQL Editor oder psql ausführen:
   select to_regclass('public.groups') as groups_table,
          to_regclass('public.group_memberships') as memberships_table,
          to_regclass('public.group_invites') as invites_table,
          to_regclass('public.group_props_links') as links_table;

Erwartet
1. Alle vier Spalten liefern einen Tabellennamen statt null.
2. db push endet mit einer Erfolgsmeldung.

Artefakte
1. Screenshot vom erfolgreichen db push.
2. Screenshot oder Copy der SQL-Ausgabe mit den vier Tabellen.

## Nachweis 2: Constraints greifen

Schritte
1. In SQL Editor ausführen:
   select conname, pg_get_constraintdef(c.oid) as def
   from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname in ('groups','group_memberships','group_invites','group_props_links')
   order by t.relname, conname;

Erwartet
1. FK-Constraints für Beziehungen auf profiles, groups und props_entries sind sichtbar.
2. Unique/Check-Constraints sind sichtbar, insbesondere:
   - unique group_id + user_id in group_memberships
   - unique group_id + prop_id in group_props_links
   - status und self-invite checks in group_invites
   - non-empty name check in groups

Artefakte
1. SQL-Ausgabe mit Constraint-Definitionen.
2. Screenshot der Ergebnisliste.

## Nachweis 3: cover_image_url ist optional dokumentiert

Schritte
1. In SQL Editor ausführen:
   select column_name, is_nullable
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'groups'
     and column_name = 'cover_image_url';

2. Danach ausführen:
   select col_description('public.groups'::regclass,
     (select ordinal_position
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'groups'
        and column_name = 'cover_image_url')) as column_comment;

Erwartet
1. is_nullable = YES
2. column_comment beschreibt explizit die optionale Nutzung.

Artefakte
1. SQL-Ausgabe für Nullable-Check.
2. SQL-Ausgabe für Column-Comment.

## Nachweis 4: RLS-Verhalten für Gruppenfluss

Schritte
1. Ausführen: npm run smoke:groups:mini
2. Im Terminal prüfen, dass alle 5 Checks mit PASS laufen.

Erwartet
1. PASS create group and owner bootstrap
2. PASS owner can invite, member cannot invite
3. PASS invite acceptance creates membership and is idempotent-safe
4. PASS member list visible to members, hidden from non-members
5. PASS props link unique and member-bound

Artefakte
1. Terminal-Log mit allen PASS-Zeilen.
2. Optional ein Screenshot vom Gesamtlauf.

## Nachweis 5: Follow-up RLS-Fixes wirklich aktiv

Schritte
1. In SQL Editor ausführen:
   select policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public'
     and tablename in ('groups','group_memberships')
   order by tablename, policyname;

Erwartet
1. groups_select_member enthält Bedingung für created_by = auth.uid().
2. group_memberships_select_member enthält Bedingung user_id = auth.uid().

Artefakte
1. SQL-Ausgabe aus pg_policies.
2. Screenshot der beiden relevanten Policies.

## Low-load Ausführungsreihenfolge

1. Nachweis 1
2. Nachweis 3
3. Nachweis 2
4. Nachweis 5
5. Nachweis 4

Hinweis
1. Diese Reihenfolge minimiert Schreiblast, da nur der letzte Nachweis den Smoke-Test mit Writes ausführt.
