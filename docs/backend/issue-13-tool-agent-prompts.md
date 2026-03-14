# Issue #13 Prompts: Tools + Agents

Diese Prompts sind auf die Routing-Regeln in `.github/copilot-instructions.md` abgestimmt.
Nutze die Prefixe am Anfang (z. B. `DB:`, `API:`, `Test:`, `Git:`), damit der passende Specialist aktiv wird.

## 1) DB-Implementierung verfeinern

```text
DB: Prüfe die Migration supabase/migrations/20260316018000_groups_domain_model_v1.sql auf Integrität und idempotentes Verhalten. 
Erwarte: Liste mit konkreten Verbesserungen (nur wenn nötig), Fokus auf FK/Unique/Check-Constraints und sinnvolle Indexe für MVP-Lesewege.
Bitte nur kleine, risikoarme Änderungen vorschlagen.
```

## 2) Security/RLS Planung für Gruppen

```text
Security: Erstelle ein minimales RLS-Konzept für groups, group_memberships, group_invites, group_props_links für MVP.
Annahmen: owner/member Rollenmodell, keine öffentliche Discovery.
Erwarte: Tabelle mit Policies pro Tabelle (select/insert/update/delete), plus Reihenfolge für sichere Einführung in separater Migration.
```

## 3) API-Vertragsplanung

```text
API: Entwirf einen MVP-Endpoint-Plan für Gruppenfunktionen (create group, invite member, accept/reject invite, list group members, link props to group).
Erwarte: request/response-Skizzen, Fehlercodes, und 5 priorisierte Integrations-Checks.
Halte die Lösung kompakt und kompatibel mit Supabase-Backend-Services.
```

## 4) Niedriglast-Smoke-Tests vorbereiten

```text
Test: Leite 4-6 low-load Smoke-Tests für Issue #13 ab (free-tier freundlich), mit Wiederverwendung vorhandener Testnutzer.
Erwarte: konkrete Kommandos/Reihenfolge, welche Assertions wirklich kritisch sind, und welcher Test optional ist falls Load gesenkt werden muss.
```

## 5) Beweisführung/QA

```text
QA: Definiere 3-5 prüfbare Nachweise für Issue #13 (DB-Migration erfolgreich, Constraints greifen, cover_image_url optional dokumentiert).
Erwarte: reproduzierbare Checkliste mit Artefakten (SQL-Ausgabe, Screenshots, Logs), ohne unnötige Lasttests.
```

## 6) Git-Flow für sauberen PR

```text
Git: Erstelle mir einen schlanken Workflow ab Branch feat/issue-13-groups-domain-model-v1 bis PR.
Erwarte: commit message Vorschlag, PR-Titel/Beschreibung, und eine kleine Review-Checkliste für Schema-Migrationen.
```

## 7) Reality-Gate vor Merge

```text
Reality: Entscheide Go/No-Go für Merge von Issue #13 nur auf Basis überprüfbarer Evidenz.
Erwarte: klare Risiko-Liste (falls No-Go), oder minimale Restaufgaben bis Go.
```

## 8) Ein Prompt für End-to-End Steuerung

```text
Backend: Führe Issue #13 end-to-end durch: 
1) Migration prüfen/ergänzen,
2) RLS-Plan für Folgeticket erstellen,
3) low-load Smoke-Tests definieren,
4) PR-Text vorbereiten.
Arbeite in kleinen Schritten und gib nach jedem Schritt die konkrete Datei/Änderung an.
```
