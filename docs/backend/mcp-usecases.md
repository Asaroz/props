# MCP Usecases fuer Props

## Kurzantwort: Automatisch oder gezielt?

MCP laeuft als lokaler Server im Hintergrund, aber die Tool-Nutzung ist nicht immer garantiert.

- Automatisch: Copilot kann MCP-Tools selbst auswaehlen, wenn es den Prompt als passend erkennt.
- Gezielt: Fuer reproduzierbare Ergebnisse solltest du das Tool im Prompt nennen (z. B. "nutze project_summary").

Empfehlung fuer dieses Projekt:
- Bei schnellen Alltagsfragen reicht oft automatisch.
- Bei wichtigen Entscheidungen (Migrationen, Smoke-Plan, Release-Risiko) immer gezielt MCP-Tools anfordern.

## Verfuegbare lokale MCP-Tools

- project_summary
- list_smoke_commands
- list_repo_docs
- read_repo_doc

## Top-Usecases fuer dein Setup

### 1) Schnell wieder im Projektkontext sein

Ziel:
- In 30 Sekunden wieder wissen, was Stack, Scripts und wichtige Befehle sind.

Prompt:
- Nutze project_summary und fasse mir die 5 wichtigsten Commands fuer heute zusammen.

### 2) Low-load Smoke-Plan erstellen (Free Tier schonen)

Ziel:
- Kleine, gezielte Tests statt teurer Vollsuite.

Prompt:
- Nutze list_smoke_commands und schlage mir die kleinste sinnvolle Testreihenfolge fuer Issue X vor.

Hinweis:
- Wenn moeglich, bestehende Test-User wiederverwenden.

### 3) Migrationen vor Aenderungen gegenchecken

Ziel:
- Keine doppelte oder widerspruechliche SQL-Migration erstellen.

Prompt:
- Nutze list_repo_docs und lese danach die letzten 2 Dateien unter supabase/migrations ueber read_repo_doc. Nenne Konflikt- und Index-Risiken.

### 4) Sicherheits-/RLS-Aenderungen vorab validieren

Ziel:
- Schnell sehen, ob bestehende Policies/Funktionen beruehrt werden.

Prompt:
- Lies relevante Migrationen via read_repo_doc und gib mir eine Checkliste fuer RLS-Auswirkungen auf friendship und profiles.

### 5) Review vorbereiten mit belegbaren Quellen

Ziel:
- Weniger Bauchgefuehl, mehr konkrete Fundstellen.

Prompt:
- Nutze read_repo_doc auf README.md und die betroffene Migration. Erstelle mir eine kurze Review-Notiz mit Risiken und offenen Fragen.

## Prompt-Pattern, das gut funktioniert

Nutze dieses Schema fuer stabile Ergebnisse:

1. Tool nennen
2. Erwartetes Format nennen
3. Scope begrenzen

Beispiel:
- Nutze read_repo_doc fuer supabase/migrations/20260315002000_friend_requests_hardening.sql. Gib mir nur: Risiken, Regressionen, empfohlene Mini-Smoke-Tests.

## Was MCP in diesem Projekt bewusst NICHT macht

- Keine direkte DB-Ausfuehrung
- Keine automatischen Codeaenderungen ohne deinen Prompt
- Kein Ersatz fuer echte Laufzeit-/Smoke-Tests

## Praktische Regel fuer den Alltag

- "Schnell": einfach fragen, Copilot entscheidet.
- "Wichtig": Tool explizit nennen und Scope begrenzen.

## OpenViking in diesem Projekt: Sinnvoll oder nicht?

Kurzfazit:
- Ja, bedingt sinnvoll.
- Fuer Props ist OpenViking vor allem als Wissens- und Kontext-Layer sinnvoll, nicht als Ersatz fuer den bestehenden lokalen MCP Server.

Warum es sinnvoll sein kann:
- Bessere semantische Suche ueber Doku, Migrationen und Service-Code.
- Wiederverwendbarer Kontext fuer wiederkehrende Aufgaben (RLS-Checks, Migrations-Reviews, Smoke-Planung).
- Schnellere Einarbeitung bei laengerer Projektlaufzeit und wachsender Codebasis.

Warum es aktuell nur bedingt sinnvoll ist:
- Das Repo ist noch relativ klein, klassisches Suchen reicht oft aus.
- Zusatzausfuehrung (Python-Service, Embedding-Konfiguration, ggf. API-Kosten).
- Zusatzaenderungen an Toolchain und Betriebsaufwand.

Empfehlung fuer Props jetzt:
- Keep existing: `props-local` MCP unveraendert als stabile Basis.
- Add optional: OpenViking als opt-in fuer tiefere, semantische Recherche.
- Kein Hard-Dependency fuer den normalen Entwicklungsablauf.

## Geeignete OpenViking Usecases fuer Props

### 1) Migration Impact Analyse

Nutzen:
- Vor neuer SQL-Migration schnell alle betroffenen Tabellen, Policies und aehnlichen Migrationsmuster finden.

Beispielfragen:
- "Zeige mir alle Stellen, die friendship-RLS beeinflussen."
- "Finde bestehende Index-Strategien fuer friend_requests."

### 2) Security/RLS Review Vorbereitung

Nutzen:
- Relevante Doku + Migrationen + Service-Methoden in einem Suchlauf verknuepfen.

Beispielfragen:
- "Welche Services verlassen sich auf profile visibility assumptions?"
- "Wo koennten sender_name/display_name in Requests inkonsistent sein?"

### 3) Smoke-Test Scope minimieren

Nutzen:
- Fuer ein konkretes Issue nur die direkt betroffenen Flows identifizieren.
- Hilft, Free-Tier Last klein zu halten.

Beispielfragen:
- "Welche End-to-End Schritte beruehren nur friendship reject flow?"
- "Welche smoke scripts decken display_name lookup am besten ab?"

### 4) Onboarding / Kontext-Retrieval

Nutzen:
- Neue Session: schneller Zugriff auf ADR, Environment-Strategie, Namenskonventionen und letzte Migrationslinie.

### 5) Entscheidungsnotizen mit Quellen

Nutzen:
- Architekturentscheidungen mit belegbaren Referenzen aus Doku und SQL begruenden.

## Integrationsplan (stufenweise, risikoarm)

### Phase 0 - Entscheidungskriterien festlegen (0.5 Tag)

Definition "OpenViking lohnt sich", wenn mindestens eines zutrifft:
- Kontextsuche ueber mehrere Dateitypen spart regelmaessig Zeit.
- Review-Qualitaet steigt messbar (weniger uebersehene Nebenwirkungen).
- Team will persistenten semantischen Kontext ueber mehrere Sessions.

Stop-Kriterium:
- Wenn Setup-Aufwand > Nutzen in den ersten 2 Wochen.

### Phase 1 - Isolierter Pilot ohne Repo-Aenderung (0.5-1 Tag)

Ziel:
- OpenViking lokal starten und mit diesem Repo gegenlesen, ohne die bestehende MCP-Konfiguration umzubauen.

Schritte:
1. Python venv anlegen und `openviking` installieren.
2. Lokale OpenViking Konfiguration unter User-Profil erstellen.
3. Server lokal starten (z. B. `127.0.0.1:1933`).
4. Nur Docs + Migrationen + `src/backend/services` indexieren.
5. 5 typische Fragen aus den Usecases testen.

Erfolgskriterien:
- Antworten sind schneller und praeziser als manuelle Suche bei komplexen Fragen.
- Keine Beeintraechtigung des bestehenden `props-local` Workflows.

### Phase 2 - Optionale MCP-Bruecke in Props (1 Tag)

Ziel:
- OpenViking als zusaetzliche, optionale Tools in den lokalen MCP Server aufnehmen.

Technischer Ansatz:
- In `tools/mcp/props-local-server.mjs` optionale Tools registrieren, wenn `OPENVIKING_BASE_URL` gesetzt ist.
- Neue MCP-Tools (nur read-only):
	- `openviking_search`
	- `openviking_read`
- Bei nicht erreichbarem OpenViking: klare Fehlermeldung + Hinweis auf fallback mit vorhandenen Tools.

Wichtig:
- Bestehende Tools (`project_summary`, `list_smoke_commands`, `list_repo_docs`, `read_repo_doc`) bleiben unveraendert.

### Phase 3 - Prompt-Playbook + Team-Regeln (0.5 Tag)

Ziel:
- Einheitliche Nutzung statt Tool-Wildwuchs.

Kurz-Playbook (Copy/Paste):

- Triage (Session-Start):
	- "Nutze project_summary und nenne mir nur: 1) relevante Commands heute, 2) Risiken, 3) naechsten sinnvollen Smoke-Test."

- Low-load Smoke-Plan:
	- "Nutze list_smoke_commands und schlage mir die kleinste Testreihenfolge fuer <Issue> vor. Nur mini/gezielte Tests, kein Volllauf."

- Migration/Index-Check:
	- "Nutze read_repo_doc fuer die letzte Migration unter supabase/migrations. Gib nur: Konflikte, Index-Risiken, empfohlenen Mini-Smoke-Test."

- OpenViking (Cross-File, optional):
	- "Nutze openviking_search mit Query '<Thema>' und maxResults 5. Danach openviking_read fuer die Top-2 Treffer. Antworte nur mit Fundstellen + Risiken."

- Security/RLS vor Merge:
	- "Lies relevante Migrationen (read_repo_doc oder openviking_read) und erstelle eine kurze RLS-Checkliste fuer friendship/profiles inkl. moeglicher Regressionen."

Team-Regeln:
- Alltag: zuerst lokale MCP-Tools (`project_summary`, `list_smoke_commands`, `read_repo_doc`).
- OpenViking nur fuer komplexe Cross-File-Fragen oder schnelle Kontextsuche ueber mehrere Ordner.
- Vor DB/Security-Aenderungen immer mindestens eine konkrete Datei als Quelle nennen.
- Testlast klein halten: bevorzugt `smoke:friendship:mini` oder issue-spezifische Teiltests.

### Phase 4 - Mini-Evaluation nach 2 Wochen (0.5 Tag)

Metriken:
- Zeit bis belastbare Antwort bei 3 Standardfragen.
- Anzahl gefundener relevanter Fundstellen pro Review.
- Subjektiver Nutzen (Skala 1-5) vs. Betriebsaufwand.

Entscheidung:
- Behalten, wenn klarer Mehrwert.
- Sonst bei lokalem MCP + klassischer Suche bleiben.

## Risiken und Gegenmassnahmen

- Risiko: zusaetzliche Komplexitaet.
	Gegenmassnahme: OpenViking nur optional und read-only integrieren.

- Risiko: Kosten/Rate Limits durch Embeddings.
	Gegenmassnahme: kleine Index-Scope, inkrementelle Updates, keine Voll-Reindexe bei jeder Aenderung.

- Risiko: falsches Vertrauen in semantische Treffer.
	Gegenmassnahme: bei kritischen Entscheidungen immer Quellstellen explizit pruefen.

## Klare Empfehlung fuer deinen aktuellen Stand

- Starte mit Phase 1 als kurzen Pilot.
- Wenn der Pilot klaren Mehrwert bringt, implementiere Phase 2 minimal-invasiv.
- Fuer dieses Projekt sollte OpenViking ein "Turbo fuer Analyse" sein, aber nie ein Pflichtbaustein im Kernablauf.
