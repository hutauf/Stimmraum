# Stimmraum

Erster Prototyp einer persönlichen Sprach-Chat-PWA. Responsive Messenger-Oberfläche mit Aufnahme, Pause/Fortsetzen, Abbrechen, direktem Absenden beim Beenden, mehreren Chats, Kopieraktionen und frei editierbaren Prompt-Vorlagen.

## Windows / localhost

Die vollständige [Windows-Anleitung](WINDOWS.md) beschreibt Installation, API-Key, Start, Updates und Datensicherung. Benötigt wird **Node.js 24 LTS**. In PowerShell:

```powershell
git clone https://github.com/hutauf/Stimmraum.git
cd Stimmraum
npm.cmd ci
Copy-Item .env.local.example .env.local
notepad .env.local
```

In `.env.local` den eigenen `GEMINI_API_KEY` eintragen, speichern und weiter:

```powershell
npm.cmd run build:local
npm.cmd run start:local
```

Dann **http://localhost:3000** öffnen. Später genügt `npm.cmd run start:local`. Die lokale Variante verwendet SQLite unter `data/`, bindet nur an den eigenen PC und benötigt keinen Cloudflare- oder ChatGPT-Account. Schlüssel und Benutzerdaten sind nicht im Repository enthalten. Unter macOS/Linux funktionieren dieselben Schritte mit `npm` und `cp` anstelle der Windows-Befehle.

## Technik

React + Vinext, lokal Node.js + SQLite; alternativ private Sites-Bereitstellung mit Cloudflare Worker und D1. IndexedDB hält die Offline-Kopie sowie noch nicht transkribierte Audio-Blobs. Fertige Texte, Chats und Vorlagen werden als einzelne versionierte Datensätze synchronisiert; das jeweils neuere Änderungsdatum gewinnt. Gelöschte Vorlagen verwenden Tombstones. Aufnahmen werden vor dem Absenden lokal gespeichert. Nach einem Neustart wird ein vorhandener Aufnahmeentwurf wiederhergestellt. Die Pegelanzeige misst den tatsächlichen RMS-Mikrofonpegel in dBFS über Web Audio; bei drei Sekunden sehr leisem/fehlendem Signal zeigt sie einen Hinweis. Neue Chats erhalten lokale Zeitstempel im Format `yyyy-mm-dd hh:mm:ss`; der Name ist über den Stift neben dem Titel editierbar. Nachrichten lassen sich in jedem Zustand löschen, fertige Transkripte bearbeiten. Löschmarkierungen haben Vorrang vor verspäteten Antworten, entfernen lokales Audio sowie den serverseitig gespeicherten Transkripttext und werden zwischen Geräten synchronisiert.

Der Service Worker speichert die Anwendungshülle und lädt sie bei fehlendem Netz aus dem Cache.

## Transkriptionsdienst konfigurieren

Die geschützte Bereitstellung funktioniert bereits ohne API-Schlüssel zum Aufnehmen und Verwalten. Ein Dienst wird erst als bereit angezeigt, wenn seine serverseitigen Umgebungsvariablen vorhanden sind. Niemals einen Anbieter-Schlüssel als NEXT_PUBLIC-Variable oder im Client hinterlegen.

| Anbieter | Servervariablen |
| --- | --- |
| OpenAI | `OPENAI_API_KEY`; optional `OPENAI_TRANSCRIBE_MODEL` (Standard `gpt-4o-mini-transcribe`) |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` (Audio-kompatibles Modell des eigenen Kontos) |
| Eigener STT-Server | `STT_BASE_URL` (HTTPS-API-Basis inklusive `/v1`), `STT_MODEL`; optional `STT_API_KEY` |

Die Datei `.env.example` enthält ausschließlich die Namen und nicht geheime Standardwerte. Hosted-Variablen werden über die Sites-Umgebung verwaltet. Sie können bei einer weiteren Bereitstellung aktiviert werden. Der eigene Server muss `POST /audio/transcriptions` mit Multipart-Feldern `file`, `model`, `response_format=json` akzeptieren und `{ "text": "…" }` zurückgeben.

Die Anbieteradapter liegen in `app/api/transcribe/route.ts`, die Verfügbarkeitsprüfung in `app/api/providers/route.ts`. OpenAI verwendet die Audio Transcriptions API. Gemini verwendet die GenerateContent API mit Inline-Audio. Adapter lassen sich unabhängig von der Oberfläche erweitern.

Referenzen: https://developers.openai.com/api/docs/guides/speech-to-text und https://ai.google.dev/gemini-api/docs/audio .

## Verhalten und Grenzen des Prototyps

- Zum Installieren und Vorbereiten des Offline-Modus einmal online im Browser öffnen. Android: Browsermenü → App installieren. Der Offline-Bereitschaftsstatus steht in den Einstellungen.
- Normales Beenden einer Aufnahme erfordert keine Vorschau oder zweite Bestätigung. Nur wiederhergestellte Entwürfe und Speicherfehler zeigen weiterhin Abspielen/Absenden/Herunterladen.
- Der private Zugriff wird von Sites abgesichert; APIs prüfen zusätzlich die authentifizierte Benutzer-ID. Lokale Daten bleiben auf dem jeweiligen Browserprofil zugänglich, auch offline. Auf gemeinsam verwendeten Geräten ein eigenes Betriebssystem-/Browserprofil verwenden.
- Ausstehende Audioaufnahmen bleiben auf dem Aufnahmegerät. Die Aufnahme muss dort bei geöffneter App verarbeitet werden. Texte, Chats und Vorlagen synchronisieren zwischen Geräten. Es gibt kein serverseitiges Audioarchiv.
- Übertragung und Transkription laufen automatisch, solange die App offen ist, oder beim nächsten Öffnen. Es gibt noch keinen vom Browser unabhängigen Server-Job mit Audioarchiv. Bei abgebrochener Anfrage bleibt Audio lokal und ein weiterer Versuch ist möglich.
- Wiederholte erfolgreiche Transkriptionsanfragen werden serverseitig anhand der Nachrichten-ID beantwortet, ohne erneut den Anbieter aufzurufen. Browser-Tabs koordinieren die Warteschlange mit Web Locks. Während eines Anbieteraufrufs besteht noch keine serverseitige verteilte Auftragssperre.
- Nach drei fehlgeschlagenen automatischen Versuchen ist ein manueller neuer Versuch erforderlich. Der gewählte Anbieter wird pro Aufnahme gespeichert; über die Nachrichtenaktion kann ein anderer ausgewählt werden.
- Maximal 14 MB je Audio-Upload; Aufnahme wird vorsorglich bei rund 12 MB beendet. Lange Aufnahmen sollten aufgeteilt werden. Browser und Betriebssystem können laufende Mikrofonaufnahmen im Hintergrund unterbrechen.
- Audio wird erst gelöscht, nachdem ein erfolgreicher Transkripttext in IndexedDB gespeichert wurde. Anbieterfehler, leere Ergebnisse und Speicherfehler behalten das Audio. Rohdaten sind keine dauerhafte Datensicherung; das Löschen von Browserdaten entfernt ausstehende Aufnahmen.
- Keine Prompt-Ausführung, kein erfundener Transkripttext und keine simulierten Nachrichten.
- Für externes Hosting müssen HTTPS und Zugriffsschutz eingerichtet werden. Der lokale Node-Server ist bewusst nur über Loopback erreichbar.

## Prüfung

`npm run build:local` erstellt den Worker und die PWA-Assets plattformübergreifend. `node --test tests/local-server.test.mjs` prüft den lokalen HTTP-Server, SQLite-Transaktionen und Datenpersistenz nach einem Neustart. Die übrigen Build-Skripte sind für die Sites-Umgebung vorgesehen. `node --test tests/records.test.mjs tests/rendered-html.test.mjs tests/deletion-storage.test.mjs` prüft Textexport, Zusammenführung, SSR-Metadaten, Zugriffsschutz, Eingabeprüfung und Transkript-Wiederverwendung. Echte Mikrofonaufnahme, Android-Installation und Anbietertranskription müssen auf einem realen Gerät mit eingerichteten Servervariablen geprüft werden.

## Gemini-Testbetrieb

Gemini ist die Vorauswahl der Version 0.2. Der konfigurierte Modellname ist `gemini-2.5-flash`; der eigene API-Schlüssel wird lokal in `.env.local` oder als Secret der Hosting-Umgebung verwaltet. Es ist kein Schlüssel im Quellcode oder in ausgelieferten Browser-Assets enthalten. Quoten und Free-Tier-Verfügbarkeit werden vom Gemini-Projekt bestimmt.

## Textnachrichten (Version 0.3)

Im selben Chat können Textnachrichten über das Eingabefeld und „Senden“ erstellt werden. Enter erzeugt eine neue Zeile; Strg+Enter bzw. Cmd+Enter sendet. Texte sind sofort fertig, gehen nicht an einen Transkriptionsanbieter und synchronisieren wie Transkripte auch nach Offline-Nutzung. Sie sind als „Textnachricht“ gekennzeichnet und werden beim Chat-Kopieren sowie in Prompt-Vorlagen in der ursprünglichen Nachrichtenreihenfolge berücksichtigt. Bearbeiten und Löschen stehen wie bei Transkripten zur Verfügung. Ungesendete Textentwürfe bleiben während der geöffneten Sitzung getrennt je Chat erhalten; bei Speicherfehlern wird das Eingabefeld nicht geleert.
