# Issue #13 Evidence Summary

Status: Teilweise abgeschlossen (Luecke 1 mit bekanntem Tool-Blocker dokumentiert)

## Verfuegbare Artefakte

1. Migration-Status (ausgefuehrt):
   - Datei: issue-13-db-push.log
   - Ergebnis: "Remote database is up to date."

2. Low-load Integrations-Test:
   - Datei: issue-13-smoke-groups-mini.log
   - Ergebnis: alle 5 Gruppen-Checks PASS

## Offener Nachweis (SQL-Output aus Systemkatalogen)

Kontext
1. Der direkte CLI-Schema-Dump wurde lokal blockiert, weil fuer den Dump Docker/pg_dump-Container benoetigt wird und auf diesem Host kein Docker-Engine verfuegbar ist.

Auswirkung
1. Direkte SQL-Artefakte aus pg_constraint/pg_policies/col_description konnten in dieser Session nicht exportiert werden.

Reproduzierbarer Nachholschritt
1. Docker Desktop starten/installieren.
2. Dann ausfuehren:
   - npx --yes supabase db dump --linked --schema public --keep-comments -f docs/backend/evidence/issue-13-public-schema.sql
3. Im Dump verifizieren:
   - groups/group_memberships/group_invites/group_props_links vorhanden
   - cover_image_url nullable + column comment
   - Constraints und Policies fuer Issue #13

Hinweis
1. Die funktionale Evidenz (Migrationen angewendet + Smoke-Test gruen) liegt bereits vor. Der offene Teil ist rein Artefakt-Export aus Systemmetadaten.
